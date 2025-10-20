import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from app.db.database import init_db, create_default_subscription_plans
from app.routers import customers, messages, tables, settings, auth, admin, plans, workflows, pipeline, dashboard, custom_objects, google_sheets, media, prompt_library, knowledge_base
from app.metrics import metrics
from fastapi.responses import JSONResponse
import asyncio # Import asyncio
from app.services.telegram_listener import TelegramListenerManager # Import TelegramListenerManager

app = FastAPI(redirect_slashes=False)

@app.exception_handler(Exception)
async def unicorn_exception_handler(request: Request, exc: Exception):
    logger.exception(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"message": "Internal Server Error", "detail": str(exc)},
    )

# Configure CORS
origins = [
    "http://localhost:3000",  # Allow frontend origin
    "http://localhost:8000",  # Allow backend origin itself for API testing
    # Add any other origins your frontend might be hosted on
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ 全局 Telegram 监听器实例
telegram_listener_instance = None

async def ensure_telegram_listener():
    """确保 Telegram 监听器正在运行"""
    global telegram_listener_instance
    try:
        if not telegram_listener_instance:
            telegram_listener_instance = TelegramListenerManager()
        
        # 检查监听器状态
        if len(telegram_listener_instance._clients) == 0 and len(telegram_listener_instance._tasks) == 0:
            logger.info("🔄 Telegram listener not running, starting...")
            await telegram_listener_instance.start_listening_all_users()
            logger.info("✅ Telegram listener started successfully")
        else:
            logger.info(f"✅ Telegram listener already running: {len(telegram_listener_instance._clients)} clients, {len(telegram_listener_instance._tasks)} tasks")
    except Exception as e:
        logger.error(f"❌ Failed to ensure Telegram listener: {e}")

# 🔧 新增：后台任务定期检查监听器状态
async def periodic_telegram_health_check():
    """定期检查 Telegram 监听器健康状态"""
    while True:
        try:
            await asyncio.sleep(300)  # 每5分钟检查一次
            logger.info("🔍 Performing periodic Telegram listener health check...")
            await ensure_telegram_listener()
        except asyncio.CancelledError:
            logger.info("Periodic health check task cancelled")
            break
        except Exception as e:
            logger.error(f"Error in periodic health check: {e}")
            await asyncio.sleep(60)  # 出错时等待1分钟再继续

# 全局任务引用
health_check_task = None

# ✅ 启动时创建表和启动 Telegram 监听器
@app.on_event("startup")
async def on_startup(): # Make it async
    global health_check_task
    init_db()
    create_default_subscription_plans()
    await ensure_telegram_listener()
    
    # 启动定期健康检查任务
    health_check_task = asyncio.create_task(periodic_telegram_health_check())
    logger.info("✅ Periodic Telegram health check task started")

@app.on_event("shutdown")
async def on_shutdown(): # Add shutdown event
    global telegram_listener_instance, health_check_task
    
    # 停止健康检查任务
    if health_check_task:
        health_check_task.cancel()
        try:
            await health_check_task
        except asyncio.CancelledError:
            pass
        logger.info("✅ Periodic health check task stopped")
    
    # 停止Telegram监听器
    if telegram_listener_instance:
        await telegram_listener_instance.stop_listening_all_users()
        logger.info("✅ Telegram listener stopped successfully")

# ✅ 健康检查端点，可以用来手动触发监听器恢复
@app.get("/health/telegram")
async def telegram_health_check():
    """Telegram 监听器健康检查和自动恢复"""
    global telegram_listener_instance
    try:
        await ensure_telegram_listener()
        
        if telegram_listener_instance:
            clients_count = len(telegram_listener_instance._clients)
            tasks_count = len(telegram_listener_instance._tasks)
            
            return {
                "status": "healthy" if (clients_count > 0 or tasks_count > 0) else "inactive",
                "clients": clients_count,
                "tasks": tasks_count,
                "message": "Telegram listener is running" if (clients_count > 0 or tasks_count > 0) else "Telegram listener was restarted"
            }
        else:
            return {"status": "error", "message": "Failed to initialize Telegram listener"}
    except Exception as e:
        logger.error(f"Telegram health check failed: {e}")
        return {"status": "error", "message": str(e)}

app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(settings.router, prefix="/settings", tags=["settings"])

# More specific API routes
app.include_router(prompt_library.router, prefix="/api/prompt-library", tags=["prompt-library"])
app.include_router(knowledge_base.router, prefix="/api", tags=["knowledge-base"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(custom_objects.router, prefix="/api", tags=["custom-objects"])

# General /api routes
app.include_router(customers.router)
app.include_router(messages.router, prefix="/api")
app.include_router(tables.router, prefix="/api")
app.include_router(google_sheets.router, prefix="/api")
app.include_router(media.router, prefix="/api", tags=["media"])
app.include_router(plans.router, prefix="/api", tags=["plans"])
app.include_router(workflows.router, prefix="/api", tags=["workflows"])
from app.routers import telegram as telegram_router
app.include_router(telegram_router.router, prefix="/api", tags=["telegram"])


@app.get('/metrics')
def get_metrics():
    return metrics.get_metrics()

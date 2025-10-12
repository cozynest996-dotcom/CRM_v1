import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.db.database import init_db, create_default_subscription_plans
from app.routers import customers, messages, tables, settings, auth, admin, plans, workflows, pipeline, dashboard, custom_objects, google_sheets
from app.metrics import metrics

app = FastAPI()

# Allow CORS from frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ 启动时创建表
@app.on_event("startup")
def on_startup():
    init_db()
    create_default_subscription_plans() # 调用以确保默认订阅计划存在

app.include_router(customers.router, prefix="/api")
app.include_router(messages.router, prefix="/api")
app.include_router(tables.router, prefix="/api")
app.include_router(settings.router, prefix="/settings", tags=["settings"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(admin.router, prefix="/admin", tags=["admin"])
app.include_router(plans.router, prefix="/api", tags=["plans"])
app.include_router(workflows.router, prefix="/api", tags=["workflows"])
# Telegram router
from app.routers import telegram as telegram_router
app.include_router(telegram_router.router, prefix="/api", tags=["telegram"])
app.include_router(pipeline.router, prefix="/api/pipeline", tags=["pipeline"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(custom_objects.router, prefix="/api", tags=["custom-objects"])
app.include_router(google_sheets.router, prefix="/api")


@app.get('/metrics')
def get_metrics():
    return metrics.get_metrics()

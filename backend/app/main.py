import logging

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from app.db.database import init_db, create_default_subscription_plans
from app.routers import customers, messages, tables, settings, auth, admin, plans, workflows, pipeline, dashboard, custom_objects, google_sheets, media, prompt_library, knowledge_base
from app.metrics import metrics
from fastapi.responses import JSONResponse

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

# ✅ 启动时创建表
@app.on_event("startup")
def on_startup():
    init_db()
    create_default_subscription_plans()


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

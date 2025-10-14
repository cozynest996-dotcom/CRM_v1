from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

# 根据数据库类型选择不同的连接参数
if settings.db_url.startswith("sqlite"):
    # SQLite 配置
    engine = create_engine(
        settings.db_url, 
        connect_args={"check_same_thread": False}
    )
else:
    # PostgreSQL 配置
    engine = create_engine(
        settings.db_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20
    )
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create a single Base instance that all models will use
Base = declarative_base()

# ✅ 自动建表
def init_db():
    # Import all model modules to register them with Base
    from app.db import models
    from app.models import custom_objects
    
    print("INFO: Attempting to create database tables...")
    # Create all tables
    try:
        Base.metadata.create_all(bind=engine)
        print("INFO: Database tables checked/created successfully.")
    except Exception as e:
        print(f"ERROR: Failed to create database tables: {e}")
        raise # Re-raise the exception to make it visible

def create_default_subscription_plans():
    from app.db.models import SubscriptionPlan # 导入模型
    db = SessionLocal()
    try:
        # 检查是否存在名为 'free' 的订阅计划
        free_plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.name == "free").first()
        if not free_plan:
            # 如果不存在，则创建它
            free_plan = SubscriptionPlan(
                name="free",
                display_name="Free Plan",
                price=0.0,
                max_customers=50,
                max_messages_per_month=1000,
                is_active=True
            )
            db.add(free_plan)
            db.commit()
            db.refresh(free_plan)
            print("INFO: Created default 'free' subscription plan.")
    except Exception as e:
        db.rollback()
        print(f"ERROR: Failed to create default subscription plan: {e}")
        raise # Re-raise to make it visible
    finally:
        db.close()


# ✅ 数据库依赖注入
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
from pydantic_settings import BaseSettings  # v2 需要单独引入

class Settings(BaseSettings):
    # 数据库配置 - 支持 PostgreSQL
    DATABASE_URL: str  # PostgreSQL 连接字符串，现在是必需的
    
    @property
    def db_url(self) -> str:
        # 如果 DATABASE_URL 未设置，Pydantic 会在初始化时抛出错误，
        # 所以这里可以直接返回 DATABASE_URL。
        # 实际上，如果 DATABASE_URL 缺失，应用程序根本不会启动到这里。
        return self.DATABASE_URL
    
    # WhatsApp 和 AI 配置
    WHATSAPP_GATEWAY_URL: str = "http://whatsapp_gateway:3002"
    OPENAI_API_KEY: str = ""

    # Telegram 配置
    # TELEGRAM_API_ID: int = 0  # 你的 Telegram API ID
    # TELEGRAM_API_HASH: str = "" # 你的 Telegram API Hash
    TELEGRAM_GATEWAY_URL: str = "http://telegram_gateway:3003" # 用于 Telegram Bot API
    BACKEND_PORT: int = 8000 # 后端服务端口，用于 webhook 回调
    
    # JWT 配置
    jwt_secret_key: str = "your-super-secret-jwt-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 168  # 7 days

    # 文件上传配置
    media_upload_dir: str = "./media_uploads"

    # Supabase 配置
    SUPABASE_URL: str
    SUPABASE_SERVICE_KEY: str
    SUPABASE_ANON_KEY: str = ""
    SUPABASE_BUCKET: str = "media"

    # 管理员配置
    admin_emails: str = "mingkun1999@gmail.com"  # 逗号分隔多个管理员邮箱

    class Config:
        env_file = ".env"

settings = Settings()

def get_settings():
    return settings

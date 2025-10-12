"""Gateway configuration"""
import os
from dotenv import load_dotenv

# 加载 .env 文件（如果存在）
load_dotenv()

# 基础配置（可以通过环境变量覆盖）
BACKEND_URL = os.getenv('BACKEND_URL', 'http://localhost:8000')
BACKEND_WEBHOOK = os.getenv('BACKEND_WEBHOOK_URL', f'{BACKEND_URL}/api/telegram/webhook')
BACKEND_INTERNAL_SESSIONS = os.getenv('BACKEND_INTERNAL_SESSIONS', f'{BACKEND_URL}/settings/internal/telegram/sessions')

# Gateway secret（用于验证，建议修改）
GATEWAY_SECRET = os.getenv('GATEWAY_SECRET', 'your-gateway-secret-change-me')

# 单客户端回退模式配置（可选）
API_ID = os.getenv('API_ID', '0')
API_HASH = os.getenv('API_HASH', '')
SESSION_NAME = os.getenv('TG_SESSION', 'tg_gateway')

# 日志配置
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'standard': {
            'format': '%(asctime)s [%(levelname)s] %(message)s'
        },
    },
    'handlers': {
        'default': {
            'level': 'INFO',
            'formatter': 'standard',
            'class': 'logging.StreamHandler',
        },
        'file': {
            'level': 'INFO',
            'formatter': 'standard',
            'class': 'logging.FileHandler',
            'filename': 'telegram_gateway.log',
            'mode': 'a',
        }
    },
    'loggers': {
        '': {
            'handlers': ['default', 'file'],
            'level': 'INFO',
            'propagate': True
        }
    }
}

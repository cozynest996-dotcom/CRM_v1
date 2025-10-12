from pydantic import BaseModel, validator
from typing import Optional

class OpenAIKeyRequest(BaseModel):
    api_key: str
    
    @validator('api_key')
    def validate_api_key(cls, v):
        if not v or not isinstance(v, str):
            raise ValueError('API key is required')
        if not v.startswith('sk-'):
            raise ValueError('Invalid OpenAI API key format')
        return v

class TelegramBotTokenRequest(BaseModel):
    bot_token: str

class IntegrationSettingsResponse(BaseModel):
    openai_api_key: str  # 将返回掩码版本
    telegram_bot_token: Optional[str] = None
    
    class Config:
        from_attributes = True

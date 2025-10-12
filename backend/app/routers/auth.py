from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.services.settings import SettingsService
from app.services.auth import AuthService
from app.middleware.auth import get_current_user
from app.db.models import User
import json
import requests
import logging
import os
from urllib.parse import urlencode, parse_qs, urlparse

logger = logging.getLogger(__name__)
router = APIRouter()

# Google OAuth 配置 - 从 client_secret.json 读取
try:
    # 尝试从当前目录读取
    with open('client_secret.json', 'r') as f:
        google_config = json.load(f)['web']
except FileNotFoundError:
    # 如果失败，尝试从项目根目录读取
    import pathlib
    project_root = pathlib.Path(__file__).parent.parent.parent
    config_path = project_root / 'backend' / 'client_secret.json'
    with open(config_path, 'r') as f:
        google_config = json.load(f)['web']

GOOGLE_CLIENT_ID = google_config['client_id']
GOOGLE_CLIENT_SECRET = google_config['client_secret']
GOOGLE_REDIRECT_URI = google_config['redirect_uris'][0]  # http://localhost:8000/auth/google/callback

@router.get("/google/login")
async def google_login(redirect_to: str = "/"): # Add redirect_to parameter
    """启动 Google OAuth 登录流程"""
    try:
        # Google OAuth 参数
        auth_params = {
            'client_id': GOOGLE_CLIENT_ID,
            'redirect_uri': GOOGLE_REDIRECT_URI,
            'scope': 'openid email profile https://www.googleapis.com/auth/spreadsheets', # 请求基本权限和Google Sheets读写权限
            'response_type': 'code',
            'access_type': 'offline',
            'prompt': 'consent',
            'state': f'redirect_to={redirect_to}' # 将redirect_to作为state的一部分
        }
        
        auth_url = f"https://accounts.google.com/o/oauth2/auth?{urlencode(auth_params)}"
        
        logger.info(f"Redirecting to Google OAuth: {auth_url}")
        return RedirectResponse(url=auth_url)
        
    except Exception as e:
        logger.error(f"Failed to start Google OAuth: {e}")
        raise HTTPException(status_code=500, detail="Failed to start Google authentication")

@router.get("/google/callback")
async def google_callback(request: Request, db: Session = Depends(get_db)):
    """处理 Google OAuth 回调"""
    try:
        # 获取授权码
        code = request.query_params.get('code')
        error = request.query_params.get('error')
        state = request.query_params.get('state')
        
        if error:
            logger.error(f"Google OAuth error: {error}")
            return RedirectResponse(url=f"http://localhost:3000/settings?error={error}&tab=google-sheets")
        
        if not code:
            logger.error("No authorization code received")
            return RedirectResponse(url="http://localhost:3000/settings?error=no_code&tab=google-sheets")
        
        # 交换授权码为访问令牌
        token_data = {
            'client_id': GOOGLE_CLIENT_ID,
            'client_secret': GOOGLE_CLIENT_SECRET,
            'code': code,
            'grant_type': 'authorization_code',
            'redirect_uri': GOOGLE_REDIRECT_URI
        }
        
        logger.info("Exchanging code for tokens...")
        token_response = requests.post('https://oauth2.googleapis.com/token', data=token_data)
        token_response.raise_for_status()
        token_info = token_response.json()

        settings_service = SettingsService(db) # Initialize SettingsService

        # 获取用户信息
        access_token = token_info.get('access_token')
        refresh_token = token_info.get('refresh_token')
        expires_in = token_info.get('expires_in')

        if access_token:
            user_info_response = requests.get(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                headers={'Authorization': f'Bearer {access_token}'}
            )
            user_info = user_info_response.json() if user_info_response.ok else {}
            logger.info(f"User info: {user_info.get('email', 'unknown')}")
        
        # 创建或获取应用用户
        auth_service = AuthService(db)
        app_user = None
        if user_info.get('email'):
            app_user = auth_service.get_or_create_user(user_info)
            
            # 确保为用户创建加密密钥
            settings_service.get_or_create_user_encryption_key(app_user.id)

            # Save Google Sheets tokens for the user
            if app_user:
                if access_token:
                    settings_service.save_setting_for_user("google_sheets_access_token", access_token, app_user.id)
                if refresh_token:
                    settings_service.save_setting_for_user("google_sheets_refresh_token", refresh_token, app_user.id)
                if expires_in:
                    settings_service.save_setting_for_user("google_sheets_token_expires_in", str(expires_in), app_user.id)
                if user_info.get('email'):
                    settings_service.save_setting_for_user("google_user_email", user_info['email'], app_user.id)

        logger.info("Google OAuth login successful")
        
        # 生成JWT令牌
        jwt_token = auth_service.create_access_token(app_user)
        
        # 根据state参数决定重定向目标
        state = request.query_params.get('state', '')
        # 解析 state 参数以获取原始的 redirect_to
        parsed_state = parse_qs(state)
        original_redirect_to = parsed_state.get('redirect_to', ['/'])[0]

        # 构建最终的重定向 URL
        # 如果 original_redirect_to 已经包含查询参数，我们应该追加而不是覆盖
        redirect_url_parts = urlparse(original_redirect_to)
        query_params = parse_qs(redirect_url_parts.query)
        query_params['token'] = [jwt_token]
        query_params['success'] = ['google_connected']
        # Rebuild query string
        new_query = urlencode(query_params, doseq=True)

        final_redirect_url = redirect_url_parts._replace(query=new_query).geturl()
        logger.info(f"Redirecting to: {final_redirect_url}")
        return RedirectResponse(url=f"http://localhost:3000{final_redirect_url}")
        
    except requests.RequestException as e:
        logger.error(f"Failed to exchange OAuth code: {e}")
        return RedirectResponse(url="http://localhost:3000/settings?error=token_exchange_failed&tab=google-sheets")
    except Exception as e:
        logger.error(f"Failed to handle Google OAuth callback: {e}")
        return RedirectResponse(url="http://localhost:3000/settings?error=callback_failed&tab=google-sheets")

@router.get("/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """获取当前登录用户信息"""
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "avatar_url": current_user.avatar_url,
        "subscription_plan": current_user.subscription_plan.name if current_user.subscription_plan else None,
        "subscription_status": current_user.subscription_status
    }

@router.post("/google/disconnect")
async def google_disconnect(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """断开 Google 连接"""
    try:
        settings_service = SettingsService(db)
        
        # 删除所有 Google 相关的令牌
        keys_to_delete = [
            "google_sheets_access_token",
            "google_sheets_refresh_token", 
            "google_sheets_token_expires_in", # Corrected key name
            "google_user_email"
        ]
        
        for key in keys_to_delete:
            settings_service.delete_setting_for_user(key, current_user.id)
        
        logger.info("Google OAuth tokens deleted successfully")
        
        return {"message": "Google account disconnected successfully"}
        
    except Exception as e:
        logger.error(f"Failed to disconnect Google account: {e}")
        raise HTTPException(status_code=500, detail="Failed to disconnect Google account")

@router.get("/google-sheets/settings")
async def get_google_sheets_settings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """获取当前用户的 Google Sheets 相关设置"""
    try:
        settings_service = SettingsService(db)
        access_token = settings_service.get_setting_for_user("google_sheets_access_token", current_user.id)
        refresh_token = settings_service.get_setting_for_user("google_sheets_refresh_token", current_user.id)
        expires_in = settings_service.get_setting_for_user("google_sheets_token_expires_in", current_user.id)
        google_user_email = settings_service.get_setting_for_user("google_user_email", current_user.id)

        return {
            "google_sheets_access_token": access_token,
            "google_sheets_refresh_token": refresh_token,
            "google_sheets_token_expires_in": expires_in,
            "google_user_email": google_user_email,
            "is_connected": access_token is not None and access_token != "" # 简单判断是否连接
        }
    except Exception as e:
        logger.error(f"Failed to retrieve Google Sheets settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve Google Sheets settings")

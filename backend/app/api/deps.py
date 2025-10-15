import logging
from typing import Generator
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from pydantic import ValidationError
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

from app.db.database import SessionLocal
from app.db.models import User
from app.core.config import settings
from app.schemas.token import TokenData

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_db() -> Generator:
    try:
        db = SessionLocal()
        yield db
    finally:
        db.close()

async def get_current_user(
    db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)
) -> User:
    logger.debug(f"Attempting to decode token: {token}")
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        logger.debug(f"Decoded JWT payload: {payload}")
        username: str = payload.get("email")
        if username is None:
            logger.warning("Username (email) not found in JWT payload.")
            raise credentials_exception
        token_data = TokenData(username=username)
        logger.debug(f"TokenData created: {token_data}")
    except (JWTError, ValidationError) as e:
        logger.error(f"JWT decoding or validation error: {e}")
        raise credentials_exception
    user = db.query(User).filter(User.email == token_data.username).first()
    if user is None:
        logger.warning(f"User not found in DB for email: {token_data.username}")
        raise credentials_exception
    logger.debug(f"User found: {user.email}")
    return user

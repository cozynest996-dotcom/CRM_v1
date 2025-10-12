from app.db.database import SessionLocal
from app.db.models import User
from app.services.auth import AuthService
import sys

def generate_token_for(user_id: int):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            print(f"User id={user_id} not found")
            return
        auth_service = AuthService(db)
        token = auth_service.create_access_token(user)
        print(token)
    finally:
        db.close()

if __name__ == '__main__':
    uid = 1
    if len(sys.argv) > 1:
        try:
            uid = int(sys.argv[1])
        except Exception:
            pass
    generate_token_for(uid)



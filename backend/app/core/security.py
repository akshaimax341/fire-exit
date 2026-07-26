from datetime import datetime, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from app.config import settings

security = HTTPBearer(auto_error=False)

# Demo users for offline / competition demo mode
DEMO_USERS = {
    "admin": {
        "username": "admin",
        "email": "admin@fireexit.io",
        "password": "admin123",
        "role": "admin",
        "full_name": "System Administrator",
    },
    "operator": {
        "username": "operator",
        "email": "operator@fireexit.io",
        "password": "operator123",
        "role": "operator",
        "full_name": "Simulation Operator",
    },
    "viewer": {
        "username": "viewer",
        "email": "viewer@fireexit.io",
        "password": "viewer123",
        "role": "viewer",
        "full_name": "Facility Viewer",
    },
}


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    full_name: str


class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[str] = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    username: str
    email: str
    role: str
    full_name: str


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def authenticate_user(username: str, password: str) -> Optional[dict]:
    user = DEMO_USERS.get(username)
    if not user or user["password"] != password:
        return None
    return {k: v for k, v in user.items() if k != "password"}


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    try:
        payload = jwt.decode(
            credentials.credentials, settings.SECRET_KEY, algorithms=[settings.ALGORITHM]
        )
        username: str = payload.get("sub")
        role: str = payload.get("role")
        if username is None:
            raise HTTPException(status_code=401, detail="Invalid token")
        user = DEMO_USERS.get(username)
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return {
            "username": user["username"],
            "email": user["email"],
            "role": role or user["role"],
            "full_name": user["full_name"],
        }
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_role(*roles: str):
    async def checker(user: dict = Depends(get_current_user)):
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Insufficient permissions")
        return user

    return checker

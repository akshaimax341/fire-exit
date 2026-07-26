from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import (
    Token,
    UserLogin,
    UserOut,
    authenticate_user,
    create_access_token,
    get_current_user,
)

router = APIRouter()


@router.post("/login", response_model=Token)
async def login(body: UserLogin):
    user = authenticate_user(body.username, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": user["username"], "role": user["role"]})
    return Token(
        access_token=token,
        role=user["role"],
        username=user["username"],
        full_name=user["full_name"],
    )


@router.get("/me", response_model=UserOut)
async def me(user: dict = Depends(get_current_user)):
    return UserOut(
        username=user["username"],
        email=user["email"],
        role=user["role"],
        full_name=user["full_name"],
    )


@router.get("/demo-accounts")
async def demo_accounts():
    return {
        "accounts": [
            {"username": "admin", "password": "admin123", "role": "admin"},
            {"username": "operator", "password": "operator123", "role": "operator"},
            {"username": "viewer", "password": "viewer123", "role": "viewer"},
        ]
    }

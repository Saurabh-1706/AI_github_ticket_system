"""
Authentication models and schemas.
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List, Dict
from datetime import datetime


class OAuthProvider(BaseModel):
    """OAuth provider information."""
    provider: str  # 'google', 'github'
    provider_user_id: str
    email: Optional[str] = None
    username: Optional[str] = None
    access_token: Optional[str] = None
    refresh_token: Optional[str] = None
    linked_at: datetime = Field(default_factory=datetime.utcnow)


class User(BaseModel):
    """User model stored in database."""
    id: Optional[str] = None
    email: EmailStr
    password_hash: Optional[str] = None  # None for OAuth-only users
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    oauth_providers: List[OAuthProvider] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = True
    is_verified: bool = False


class UserCreate(BaseModel):
    """User registration request."""
    email: EmailStr
    password: str = Field(..., min_length=8)
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    """User login request."""
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    """User response (without sensitive data)."""
    id: str
    email: EmailStr
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None
    oauth_providers: List[str] = []  # Just provider names
    created_at: datetime
    is_verified: bool


class TokenResponse(BaseModel):
    """JWT token response."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class OAuthCallbackData(BaseModel):
    """OAuth callback data."""
    code: str
    state: str

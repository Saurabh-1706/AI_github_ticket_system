"""
Authentication service for user management and JWT tokens.
"""

import os
import secrets
from datetime import datetime, timedelta
from typing import Optional, Dict
from passlib.context import CryptContext
from jose import JWTError, jwt
from app.auth.models import User, UserCreate, UserLogin, UserResponse, TokenResponse
from app.db.mongo import get_database


# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", secrets.token_urlsafe(32))
ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRATION_MINUTES", "60"))


class AuthService:
    """Authentication service for user management."""
    
    def __init__(self):
        self.db = get_database()
        self.users_collection = self.db["users"]
        self._ensure_indexes()
    
    def _ensure_indexes(self):
        """Create database indexes."""
        self.users_collection.create_index("email", unique=True)
        self.users_collection.create_index("oauth_providers.provider_user_id")
    
    def hash_password(self, password: str) -> str:
        """Hash a password."""
        return pwd_context.hash(password)
    
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify a password against a hash."""
        return pwd_context.verify(plain_password, hashed_password)
    
    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Create a JWT access token."""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        
        to_encode.update({"exp": expire, "iat": datetime.utcnow()})
        encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
        return encoded_jwt
    
    def verify_token(self, token: str) -> Optional[Dict]:
        """Verify and decode a JWT token."""
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            return payload
        except JWTError:
            return None
    
    def register_user(self, user_data: UserCreate) -> User:
        """Register a new user with email/password."""
        # Check if user already exists
        existing_user = self.users_collection.find_one({"email": user_data.email})
        if existing_user:
            raise ValueError("User with this email already exists")
        
        # Create user
        user = User(
            email=user_data.email,
            password_hash=self.hash_password(user_data.password),
            full_name=user_data.full_name,
            is_verified=False  # TODO: Implement email verification
        )
        
        # Insert into database
        result = self.users_collection.insert_one(user.dict(by_alias=True))
        user.id = str(result.inserted_id)
        
        return user
    
    def authenticate_user(self, login_data: UserLogin) -> Optional[User]:
        """Authenticate a user with email/password."""
        user_doc = self.users_collection.find_one({"email": login_data.email})
        if not user_doc:
            return None
        
        user = User(**user_doc)
        
        # Check if user has a password (not OAuth-only)
        if not user.password_hash:
            raise ValueError("This account uses OAuth login. Please sign in with Google or GitHub.")
        
        # Verify password
        if not self.verify_password(login_data.password, user.password_hash):
            return None
        
        user.id = str(user_doc["_id"])
        return user
    
    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email."""
        user_doc = self.users_collection.find_one({"email": email})
        if not user_doc:
            return None
        
        user = User(**user_doc)
        user.id = str(user_doc["_id"])
        return user
    
    def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID."""
        from bson import ObjectId
        try:
            user_doc = self.users_collection.find_one({"_id": ObjectId(user_id)})
            if not user_doc:
                return None
            
            user = User(**user_doc)
            user.id = str(user_doc["_id"])
            return user
        except:
            return None
    
    def create_token_response(self, user: User) -> TokenResponse:
        """Create a token response for a user."""
        access_token = self.create_access_token(
            data={"sub": user.id, "email": user.email}
        )
        
        user_response = UserResponse(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            avatar_url=user.avatar_url,
            oauth_providers=[p.provider for p in user.oauth_providers],
            created_at=user.created_at,
            is_verified=user.is_verified
        )
        
        return TokenResponse(
            access_token=access_token,
            token_type="bearer",
            expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            user=user_response
        )


# Singleton instance
auth_service = AuthService()

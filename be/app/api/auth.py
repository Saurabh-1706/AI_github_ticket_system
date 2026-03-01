"""
Authentication API endpoints.
"""

from fastapi import APIRouter, HTTPException, Depends, Response, Request
from fastapi.responses import RedirectResponse
from typing import Optional
from app.auth.auth_service import auth_service
from app.auth.oauth_providers import oauth_providers
from app.auth.models import UserCreate, UserLogin, TokenResponse, UserResponse

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

# Store OAuth states temporarily (in production, use Redis)
oauth_states = {}


# ============================================================================
# Email/Password Authentication
# ============================================================================

@router.post("/register", response_model=TokenResponse)
def register(user_data: UserCreate):
    """Register a new user with email and password."""
    try:
        user = auth_service.register_user(user_data)
        return auth_service.create_token_response(user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Registration failed")


@router.post("/login", response_model=TokenResponse)
def login(login_data: UserLogin):
    """Login with email and password."""
    try:
        user = auth_service.authenticate_user(login_data)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        
        return auth_service.create_token_response(user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail="Login failed")


@router.post("/logout")
def logout(response: Response):
    """Logout user (client should delete token)."""
    # In a more advanced implementation, you would invalidate the token
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
def get_current_user(request: Request):
    """Get current user information."""
    # Extract token from Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = auth_header.split(" ")[1]
    payload = auth_service.verify_token(token)
    
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user = auth_service.get_user_by_id(payload.get("sub"))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        oauth_providers=[p.provider for p in user.oauth_providers],
        created_at=user.created_at,
        is_verified=user.is_verified
    )


# ============================================================================
# Google OAuth
# ============================================================================

@router.get("/google")
def google_login():
    """Initiate Google OAuth flow."""
    state = oauth_providers.generate_oauth_state()
    oauth_states[state] = {"provider": "google"}
    
    auth_url = oauth_providers.get_google_auth_url(state)
    return {"auth_url": auth_url, "state": state}


@router.get("/google/callback")
def google_callback(code: str, state: str):
    """Google OAuth callback - redirects to frontend."""
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
    # Redirect to frontend with code and state for token exchange
    return RedirectResponse(
        url=f"{frontend_url}/auth/google/callback?code={code}&state={state}"
    )

@router.post("/google/exchange")
def google_exchange_token(code: str, state: str):
    """Exchange Google OAuth code for JWT token."""
    # Verify state
    if state not in oauth_states:
        raise HTTPException(status_code=400, detail="Invalid or expired state parameter")
    
    try:
        # Exchange code for tokens
        tokens = oauth_providers.exchange_google_code(code)
        access_token = tokens.get("access_token")
        
        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to get access token from Google")
        
        # Get user info from Google
        user_info = oauth_providers.get_google_user_info(access_token)
        
        # Find or create user - match the actual function signature
        user = oauth_providers.find_or_create_oauth_user(
            provider="google",
            provider_user_id=user_info["id"],
            email=user_info["email"],
            user_info=user_info  # Pass the full user_info dict
        )
        
        # Create JWT token
        token_response = auth_service.create_token_response(user)
        
        # Clean up state
        oauth_states.pop(state, None)
        
        # Return token as JSON
        return token_response
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Google OAuth failed: {str(e)}")



# ============================================================================
# GitHub OAuth (for login)
# ============================================================================

@router.get("/github")
def github_login():
    """Initiate GitHub OAuth flow for login."""
    state = oauth_providers.generate_oauth_state()
    oauth_states[state] = {"provider": "github"}
    
    auth_url = oauth_providers.get_github_auth_url(state)
    return {"auth_url": auth_url, "state": state}


@router.get("/github/callback")
def github_callback(code: str, state: str):
    """Handle GitHub OAuth callback for login."""
    # Verify state
    if state not in oauth_states:
        raise HTTPException(status_code=400, detail="Invalid state parameter")
    
    try:
        # Exchange code for tokens
        tokens = oauth_providers.exchange_github_code(code)
        access_token = tokens.get("access_token")
        
        # Get user info
        user_info = oauth_providers.get_github_user_info(access_token)
        
        # Get primary email
        email = user_info.get("email")
        if not email:
            # Fetch emails separately if not public
            import requests
            headers = {"Authorization": f"Bearer {access_token}"}
            emails_response = requests.get("https://api.github.com/user/emails", headers=headers)
            emails = emails_response.json()
            primary_email = next((e for e in emails if e.get("primary")), None)
            email = primary_email["email"] if primary_email else f"{user_info['login']}@github.local"
        
        # Find or create user
        user = oauth_providers.find_or_create_oauth_user(
            provider="github",
            provider_user_id=str(user_info["id"]),
            email=email,
            user_info=user_info
        )
        
        # Save GitHub token for write operations (posting comments, closing issues, etc.)
        from app.db.mongo import db as _db
        from bson import ObjectId
        import datetime as _dt
        _now = _dt.datetime.utcnow()
        # 1) Save to user_tokens keyed by user_id + github_username
        _db["user_tokens"].update_one(
            {"github_username": user_info["login"]},
            {"$set": {
                "github_username": user_info["login"],
                "github_user_id": str(user_info["id"]),
                "user_id": user.id,
                "access_token": access_token,
                "updated_at": _now,
            }, "$setOnInsert": {"created_at": _now}},
            upsert=True
        )
        # 2) Also store on user's oauth_providers sub-document for direct lookup
        try:
            _db["users"].update_one(
                {
                    "_id": ObjectId(user.id),
                    "oauth_providers.provider": "github",
                    "oauth_providers.provider_user_id": str(user_info["id"]),
                },
                {"$set": {
                    "oauth_providers.$.access_token": access_token,
                    "oauth_providers.$.username": user_info["login"],
                }}
            )
        except Exception:
            pass  # non-critical
        
        # Create JWT token
        token_response = auth_service.create_token_response(user)
        
        # Clean up state
        del oauth_states[state]
        
        # Redirect to frontend with token as query parameter
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        return RedirectResponse(
            url=f"{frontend_url}/auth/github/callback?token={token_response.access_token}"
        )
        
    except Exception as e:
        # Redirect to frontend with error
        frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
        return RedirectResponse(
            url=f"{frontend_url}/auth/github/callback?error={str(e)}"
        )


@router.post("/github/exchange")
def github_exchange_token(code: str, state: str):
    """Exchange GitHub OAuth code for JWT token (JSON endpoint)."""
    # Verify state
    if state not in oauth_states:
        raise HTTPException(status_code=400, detail="Invalid or expired state parameter")
    
    try:
        # Exchange code for tokens
        tokens = oauth_providers.exchange_github_code(code)
        access_token = tokens.get("access_token")
        
        if not access_token:
            raise HTTPException(status_code=400, detail="Failed to get access token from GitHub")
        
        # Get user info
        user_info = oauth_providers.get_github_user_info(access_token)
        
        # Get primary email
        email = user_info.get("email")
        if not email:
            # Fetch emails separately if not public
            import requests
            headers = {"Authorization": f"Bearer {access_token}"}
            emails_response = requests.get("https://api.github.com/user/emails", headers=headers)
            emails = emails_response.json()
            primary_email = next((e for e in emails if e.get("primary")), None)
            email = primary_email["email"] if primary_email else f"{user_info['login']}@github.local"
        
        # Find or create user
        user = oauth_providers.find_or_create_oauth_user(
            provider="github",
            provider_user_id=str(user_info["id"]),
            email=email,
            user_info=user_info
        )
        
        # Save GitHub token for write operations (posting comments, closing issues, etc.)
        from app.db.mongo import db as _db
        from bson import ObjectId
        import datetime as _dt
        _now = _dt.datetime.utcnow()
        # 1) Save to user_tokens keyed by user_id + github_username
        _db["user_tokens"].update_one(
            {"github_username": user_info["login"]},
            {"$set": {
                "github_username": user_info["login"],
                "github_user_id": str(user_info["id"]),
                "user_id": user.id,
                "access_token": access_token,
                "updated_at": _now,
            }, "$setOnInsert": {"created_at": _now}},
            upsert=True
        )
        # 2) Also store on user's oauth_providers sub-document for direct lookup
        try:
            _db["users"].update_one(
                {
                    "_id": ObjectId(user.id),
                    "oauth_providers.provider": "github",
                    "oauth_providers.provider_user_id": str(user_info["id"]),
                },
                {"$set": {
                    "oauth_providers.$.access_token": access_token,
                    "oauth_providers.$.username": user_info["login"],
                }}
            )
        except Exception:
            pass  # non-critical
        
        # Create JWT token
        token_response = auth_service.create_token_response(user)
        
        # Clean up state
        del oauth_states[state]
        
        # Return token as JSON
        return token_response
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"GitHub OAuth failed: {str(e)}")


import os

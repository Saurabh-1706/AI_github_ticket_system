from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import RedirectResponse
import os
import requests
from datetime import datetime
from app.db.mongo import db

router = APIRouter(prefix="/api/oauth", tags=["OAuth"])

# GitHub OAuth Configuration
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

# MongoDB collection for user tokens
user_tokens_collection = db["user_tokens"]


@router.get("/authorize")
def authorize(redirect_uri: str = None):
    """
    Redirect user to GitHub OAuth authorization page.
    
    Query params:
        redirect_uri: Optional frontend URL to redirect back to after OAuth
    """
    if not GITHUB_CLIENT_ID:
        raise HTTPException(status_code=500, detail="GitHub OAuth not configured")
    
    # Store redirect_uri in state parameter (in production, use encrypted state)
    state = redirect_uri or FRONTEND_URL
    
    github_auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={GITHUB_CLIENT_ID}"
        f"&scope=repo,read:user"
        f"&state={state}"
    )
    
    return RedirectResponse(url=github_auth_url)


@router.get("/callback")
async def callback(code: str, state: str = None):
    """
    Handle GitHub OAuth callback.
    
    Query params:
        code: Authorization code from GitHub
        state: Redirect URI to return to
    """
    if not code:
        raise HTTPException(status_code=400, detail="No authorization code provided")
    
    # Exchange code for access token
    token_url = "https://github.com/login/oauth/access_token"
    token_data = {
        "client_id": GITHUB_CLIENT_ID,
        "client_secret": GITHUB_CLIENT_SECRET,
        "code": code,
    }
    
    headers = {"Accept": "application/json"}
    response = requests.post(token_url, data=token_data, headers=headers)
    
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to get access token")
    
    token_response = response.json()
    access_token = token_response.get("access_token")
    
    if not access_token:
        raise HTTPException(status_code=400, detail="No access token in response")
    
    # Get user info from GitHub
    user_response = requests.get(
        "https://api.github.com/user",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    
    if user_response.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to get user info")
    
    user_data = user_response.json()
    github_user_id = user_data.get("id")
    github_username = user_data.get("login")
    
    # Store token in database
    user_tokens_collection.update_one(
        {"github_user_id": github_user_id},
        {
            "$set": {
                "github_user_id": github_user_id,
                "github_username": github_username,
                "access_token": access_token,
                "updated_at": datetime.utcnow(),
            },
            "$setOnInsert": {
                "created_at": datetime.utcnow(),
            }
        },
        upsert=True
    )
    
    # Redirect back to frontend with success
    redirect_url = state or FRONTEND_URL
    return RedirectResponse(url=f"{redirect_url}?oauth=success&username={github_username}")


@router.get("/status/{github_username}")
def get_oauth_status(github_username: str):
    """
    Check if user has authorized the app.
    
    Returns:
        {
            "authorized": bool,
            "username": str,
            "authorized_at": datetime
        }
    """
    user_token = user_tokens_collection.find_one(
        {"github_username": github_username},
        {"_id": 0, "access_token": 0}  # Don't return the actual token
    )
    
    if user_token:
        return {
            "authorized": True,
            "username": user_token.get("github_username"),
            "authorized_at": user_token.get("updated_at")
        }
    else:
        return {
            "authorized": False,
            "username": None,
            "authorized_at": None
        }


@router.get("/token/{github_username}")
def get_user_token(github_username: str):
    """
    Get user's OAuth token (internal use only - should be protected in production).
    
    Returns the access token for making GitHub API calls on behalf of the user.
    """
    user_token = user_tokens_collection.find_one(
        {"github_username": github_username}
    )
    
    if not user_token:
        raise HTTPException(status_code=404, detail="User not authorized")
    
    return {
        "access_token": user_token.get("access_token"),
        "username": user_token.get("github_username")
    }


@router.delete("/revoke/{github_username}")
def revoke_access(github_username: str):
    """
    Revoke user's OAuth access by deleting their token.
    """
    result = user_tokens_collection.delete_one({"github_username": github_username})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {"message": "Access revoked successfully"}

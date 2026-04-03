"""
OAuth provider integrations (Google and GitHub).
Uses httpx.Client (sync) — these methods are called from sync auth routes
that FastAPI dispatches on a thread pool, so blocking I/O is acceptable here.
"""

import os
import secrets
from datetime import datetime
from typing import Dict, Optional, Tuple

import httpx

from app.auth.models import OAuthProvider, User
from app.db.mongo import get_database


class OAuthProviders:
    """OAuth provider integrations."""

    def __init__(self):
        self.db = get_database()
        self.users_collection = self.db["users"]

        # Shared sync httpx client
        self._http = httpx.Client(timeout=15)

        # Google OAuth configuration
        self.google_client_id = os.getenv("GOOGLE_CLIENT_ID")
        self.google_client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
        self.google_redirect_uri = os.getenv(
            "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"
        )

        # GitHub OAuth configuration
        self.github_client_id = os.getenv("GITHUB_CLIENT_ID")
        self.github_client_secret = os.getenv("GITHUB_CLIENT_SECRET")
        self.github_redirect_uri = (
            os.getenv("FRONTEND_URL", "http://localhost:3000") + "/auth/github/callback"
        )

    # ── OAuth state ────────────────────────────────────────────────────────────

    def generate_oauth_state(self) -> str:
        """Generate a random state token for OAuth CSRF protection."""
        return secrets.token_urlsafe(32)

    # ── Google ─────────────────────────────────────────────────────────────────

    def get_google_auth_url(self, state: str) -> str:
        """Build the Google OAuth authorization URL."""
        params = {
            "client_id": self.google_client_id,
            "redirect_uri": self.google_redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "access_type": "offline",
            "prompt": "consent",
        }
        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"https://accounts.google.com/o/oauth2/v2/auth?{query_string}"

    def exchange_google_code(self, code: str) -> Dict:
        """Exchange Google authorization code for tokens."""
        response = self._http.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": self.google_client_id,
                "client_secret": self.google_client_secret,
                "redirect_uri": self.google_redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        response.raise_for_status()
        return response.json()

    def get_google_user_info(self, access_token: str) -> Dict:
        """Fetch Google user profile."""
        response = self._http.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        response.raise_for_status()
        return response.json()

    # ── GitHub ─────────────────────────────────────────────────────────────────

    def get_github_auth_url(self, state: str) -> str:
        """Build the GitHub OAuth authorization URL."""
        params = {
            "client_id": self.github_client_id,
            "redirect_uri": self.github_redirect_uri,
            "scope": "public_repo user:email",  # public_repo needed for posting comments
            "state": state,
        }
        query_string = "&".join([f"{k}={v}" for k, v in params.items()])
        return f"https://github.com/login/oauth/authorize?{query_string}"

    def exchange_github_code(self, code: str) -> Dict:
        """Exchange GitHub authorization code for tokens."""
        response = self._http.post(
            "https://github.com/login/oauth/access_token",
            data={
                "client_id": self.github_client_id,
                "client_secret": self.github_client_secret,
                "code": code,
                "redirect_uri": self.github_redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        return response.json()

    def get_github_user_info(self, access_token: str) -> Dict:
        """Fetch GitHub user profile."""
        response = self._http.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
        )
        response.raise_for_status()
        return response.json()

    # ── User management ────────────────────────────────────────────────────────

    def find_or_create_oauth_user(
        self,
        provider: str,
        provider_user_id: str,
        email: str,
        user_info: Dict,
    ) -> User:
        """Find existing user or create a new user from OAuth data."""
        # Try to find user by OAuth provider ID
        user_doc = self.users_collection.find_one(
            {
                "oauth_providers.provider": provider,
                "oauth_providers.provider_user_id": provider_user_id,
            }
        )
        if user_doc:
            user = User(**user_doc)
            user.id = str(user_doc["_id"])
            return user

        # Try to find user by email
        user_doc = self.users_collection.find_one({"email": email})
        if user_doc:
            # Link this OAuth provider to the existing account
            oauth_provider = OAuthProvider(
                provider=provider,
                provider_user_id=provider_user_id,
                email=email,
                username=user_info.get("login") or user_info.get("name"),
                linked_at=datetime.utcnow(),
            )
            self.users_collection.update_one(
                {"_id": user_doc["_id"]},
                {"$push": {"oauth_providers": oauth_provider.dict()}},
            )
            user = User(**user_doc)
            user.id = str(user_doc["_id"])
            user.oauth_providers.append(oauth_provider)
            return user

        # Create new user
        oauth_provider = OAuthProvider(
            provider=provider,
            provider_user_id=provider_user_id,
            email=email,
            username=user_info.get("login") or user_info.get("name"),
            linked_at=datetime.utcnow(),
        )
        user = User(
            email=email,
            full_name=user_info.get("name"),
            avatar_url=user_info.get("avatar_url") or user_info.get("picture"),
            oauth_providers=[oauth_provider],
            is_verified=True,  # OAuth emails are pre-verified
        )
        result = self.users_collection.insert_one(user.dict(by_alias=True))
        user.id = str(result.inserted_id)
        return user


# Singleton instance
oauth_providers = OAuthProviders()

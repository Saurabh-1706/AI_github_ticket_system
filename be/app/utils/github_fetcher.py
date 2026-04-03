"""
GitHub API helper — wraps common GitHub REST API calls.
Uses httpx.Client (sync) so it is safe to call from both regular (def) routes
and from thread-pool workers spawned by FastAPI for sync endpoints.
"""

import os
from functools import lru_cache

import httpx


class GitHubFetcher:
    """Encapsulates GitHub API access with optional per-request user tokens."""

    def __init__(self):
        self.token = os.getenv("GITHUB_TOKEN")
        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github.v3+json",
        }
        # Shared sync client — reuse connections across requests
        self._client = httpx.Client(timeout=30)

    # ── Public API ─────────────────────────────────────────────────────────────

    @lru_cache(maxsize=100)
    def get_repo(self, owner: str, repo: str, user_token: str | None = None) -> dict:
        """
        Fetch repository details. Optionally use user's OAuth token for private repos.
        Results are LRU-cached (max 100 entries) to avoid repeated API calls.

        Args:
            owner: Repository owner
            repo: Repository name
            user_token: Optional user OAuth token for private repos

        Returns:
            Repository data dict from GitHub API
        """
        headers = self._build_headers(user_token)
        url = f"{self.base_url}/repos/{owner}/{repo}"
        res = self._client.get(url, headers=headers)
        res.raise_for_status()
        return res.json()

    def check_repo_visibility(
        self, owner: str, repo: str, user_token: str | None = None
    ) -> dict:
        """
        Check if a repository is public or private and whether we have access.

        Returns:
            {
                "is_private": bool,
                "has_access": bool,
                "requires_auth": bool,
                "repo_exists": bool
            }
        """
        headers = self._build_headers(user_token)
        url = f"{self.base_url}/repos/{owner}/{repo}"
        res = self._client.get(url, headers=headers)

        if res.status_code == 404:
            # Could be private without access, or simply non-existent.
            # Try with the server token to differentiate.
            res_default = self._client.get(url, headers=self.headers)
            return {
                "is_private": True,
                "has_access": False,
                "requires_auth": True,
                "repo_exists": res_default.status_code != 404,
            }

        if res.status_code == 200:
            data = res.json()
            return {
                "is_private": data.get("private", False),
                "has_access": True,
                "requires_auth": False,
                "repo_exists": True,
            }

        return {
            "is_private": False,
            "has_access": False,
            "requires_auth": True,
            "repo_exists": False,
        }

    def get_issues(
        self,
        owner: str,
        repo: str,
        user_token: str | None = None,
        page: int = 1,
        per_page: int = 30,
    ) -> dict:
        """
        Get repository issues with pagination support.

        Args:
            owner: Repository owner
            repo: Repository name
            user_token: Optional user OAuth token for private repos
            page: Page number (1-indexed, default: 1)
            per_page: Issues per page (max 100, default: 30)

        Returns:
            Dict with ``issues`` list and ``pagination`` metadata
        """
        headers = self._build_headers(user_token)
        url = f"{self.base_url}/repos/{owner}/{repo}/issues"
        params = {
            "state": "all",
            "page": page,
            "per_page": min(per_page, 100),  # GitHub API cap is 100
        }

        res = self._client.get(url, headers=headers, params=params)
        res.raise_for_status()
        issues = res.json()

        # Parse Link header for pagination info
        link_header = res.headers.get("link", "")
        has_next = 'rel="next"' in link_header
        has_prev = 'rel="prev"' in link_header

        return {
            "issues": issues,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "has_next": has_next,
                "has_prev": has_prev,
                "count": len(issues),
            },
        }

    # ── Private helpers ────────────────────────────────────────────────────────

    def _build_headers(self, user_token: str | None = None) -> dict:
        """Return request headers, overriding Authorization when a user token is supplied."""
        h = self.headers.copy()
        if user_token:
            h["Authorization"] = f"Bearer {user_token}"
        return h


github_fetcher = GitHubFetcher()

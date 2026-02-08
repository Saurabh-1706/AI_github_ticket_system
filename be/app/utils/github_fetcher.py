import os
import requests
from functools import lru_cache


class GitHubFetcher:
    def __init__(self):
        self.token = os.getenv("GITHUB_TOKEN")
        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github.v3+json",
        }

    @lru_cache(maxsize=100)
    def get_repo(self, owner: str, repo: str, user_token: str = None):
        """
        Fetch repository details. Optionally use user's OAuth token for private repos.
        
        Args:
            owner: Repository owner
            repo: Repository name
            user_token: Optional user OAuth token for private repos
            
        Returns:
            Repository data
        """
        headers = self.headers.copy()
        if user_token:
            headers["Authorization"] = f"Bearer {user_token}"
            
        url = f"{self.base_url}/repos/{owner}/{repo}"
        res = requests.get(url, headers=headers)
        res.raise_for_status()
        return res.json()

    def check_repo_visibility(self, owner: str, repo: str, user_token: str = None):
        """
        Check if repository is public or private and if we have access.
        
        Returns:
            {
                "is_private": bool,
                "has_access": bool,
                "requires_auth": bool,
                "repo_exists": bool
            }
        """
        # Use user token if provided, otherwise use default token
        headers = self.headers.copy()
        if user_token:
            headers["Authorization"] = f"Bearer {user_token}"
        
        url = f"{self.base_url}/repos/{owner}/{repo}"
        res = requests.get(url, headers=headers)
        
        if res.status_code == 404:
            # Could be private without access or doesn't exist
            # Try with default token to differentiate
            res_default = requests.get(url, headers=self.headers)
            return {
                "is_private": True,
                "has_access": False,
                "requires_auth": True,
                "repo_exists": res_default.status_code != 404
            }
        elif res.status_code == 200:
            data = res.json()
            return {
                "is_private": data.get("private", False),
                "has_access": True,
                "requires_auth": False,
                "repo_exists": True
            }
        else:
            # Other errors
            return {
                "is_private": False,
                "has_access": False,
                "requires_auth": True,
                "repo_exists": False
            }

    def get_repo(self, owner: str, repo: str, user_token: str = None):
        """Get repository details. Optionally use user's OAuth token for private repos."""
        headers = self.headers.copy()
        if user_token:
            headers["Authorization"] = f"Bearer {user_token}"
            
        url = f"{self.base_url}/repos/{owner}/{repo}"
        res = requests.get(url, headers=headers)
        res.raise_for_status()
        return res.json()

    def get_issues(self, owner: str, repo: str, user_token: str = None, page: int = 1, per_page: int = 30):
        """
        Get repository issues with pagination support.
        
        Args:
            owner: Repository owner
            repo: Repository name
            user_token: Optional user OAuth token for private repos
            page: Page number (1-indexed, default: 1)
            per_page: Issues per page (max 100, default: 30)
            
        Returns:
            Dictionary with issues and pagination metadata
        """
        headers = self.headers.copy()
        if user_token:
            headers["Authorization"] = f"Bearer {user_token}"
        
        url = f"{self.base_url}/repos/{owner}/{repo}/issues"
        params = {
            "state": "all",
            "page": page,
            "per_page": min(per_page, 100)  # GitHub API max is 100
        }
        
        res = requests.get(url, headers=headers, params=params)
        res.raise_for_status()
        
        issues = res.json()
        
        # Parse Link header for pagination info
        link_header = res.headers.get("Link", "")
        has_next = 'rel="next"' in link_header
        has_prev = 'rel="prev"' in link_header
        
        return {
            "issues": issues,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "has_next": has_next,
                "has_prev": has_prev,
                "count": len(issues)
            }
        }


github_fetcher = GitHubFetcher()

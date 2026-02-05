import os
import requests
from functools import lru_cache

@lru_cache(maxsize=128)
def get_repo(self, owner: str, repo: str):
    ...

@lru_cache(maxsize=128)
def get_issues(self, owner: str, repo: str, max_issues: int = 50):
    ...

class GitHubFetcher:
    def __init__(self):
        token = os.getenv("GITHUB_TOKEN")
        if not token:
            raise RuntimeError("❌ GITHUB_TOKEN is not set")

        self.base_url = "https://api.github.com"
        self.headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json",
        }


    def get_repo(self, owner: str, repo: str):
        url = f"{self.base_url}/repos/{owner}/{repo}"
        res = requests.get(url, headers=self.headers)
        res.raise_for_status()
        return res.json()

    def get_issues(self, owner: str, repo: str, max_issues: int = 50):
        issues = []
        page = 1

        while len(issues) < max_issues:
            res = requests.get(
                f"{self.base_url}/repos/{owner}/{repo}/issues",
                headers=self.headers,
                params={
                    "state": "all",
                    "per_page": 50,
                    "page": page,
                },
            )

            res.raise_for_status()
            data = res.json()

            if not data:
                break

            issues.extend(data)
            page += 1

        return issues[:max_issues]



github_fetcher = GitHubFetcher()

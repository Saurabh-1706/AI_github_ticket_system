import requests
from typing import Dict, List
import os

GITHUB_API = "https://api.github.com"


class GitHubFetcher:
    def __init__(self):
        self.token = os.getenv("GITHUB_TOKEN")
        self.headers = {
            "Accept": "application/vnd.github+json"
        }
        if self.token:
            self.headers["Authorization"] = f"Bearer {self.token}"

    def get_repo(self, owner: str, repo: str) -> Dict:
        url = f"{GITHUB_API}/repos/{owner}/{repo}"
        res = requests.get(url, headers=self.headers)
        res.raise_for_status()
        return res.json()

    def get_issues(self, owner: str, repo: str) -> List[Dict]:
        url = f"{GITHUB_API}/repos/{owner}/{repo}/issues"
        params = {
            "state": "all",
            "per_page": 100
        }
        res = requests.get(url, headers=self.headers, params=params)
        res.raise_for_status()
        return res.json()


github_fetcher = GitHubFetcher()

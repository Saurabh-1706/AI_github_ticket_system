<<<<<<< HEAD
import os
import requests

class GitHubFetcher:
    def __init__(self):
        self.base_url = "https://api.github.com"
        self.headers = {
            "Accept": "application/vnd.github+json",
        }

        token = os.getenv("GITHUB_TOKEN")
        if token:
            self.headers["Authorization"] = f"Bearer {token}"

    def get_repo(self, owner: str, repo: str):
        url = f"{self.base_url}/repos/{owner}/{repo}"
=======
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
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822
        res = requests.get(url, headers=self.headers)
        res.raise_for_status()
        return res.json()

<<<<<<< HEAD
    def get_issues(self, owner: str, repo: str):
        all_issues = []
        page = 1

        while True:
            url = f"{self.base_url}/repos/{owner}/{repo}/issues"
            params = {
                "state": "all",
                "per_page": 100,
                "page": page,
            }

            res = requests.get(url, headers=self.headers, params=params)

            if res.status_code != 200:
                break

            data = res.json()

            if not data:
                break

            all_issues.extend(data)
            page += 1

        return all_issues
=======
    def get_issues(self, owner: str, repo: str) -> List[Dict]:
        url = f"{GITHUB_API}/repos/{owner}/{repo}/issues"
        params = {
            "state": "all",
            "per_page": 100
        }
        res = requests.get(url, headers=self.headers, params=params)
        res.raise_for_status()
        return res.json()
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822


github_fetcher = GitHubFetcher()

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
        res = requests.get(url, headers=self.headers)
        res.raise_for_status()
        return res.json()

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


github_fetcher = GitHubFetcher()

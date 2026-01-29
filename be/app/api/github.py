from fastapi import APIRouter, HTTPException
from app.utils.github_fetcher import github_fetcher
from app.vector.chroma_client import chroma

router = APIRouter(tags=["GitHub"])

@router.get("/repo/{owner}/{repo}")
def fetch_repository(owner: str, repo: str):
    try:
        data = github_fetcher.get_repo(owner, repo)

        return {
            "id": data["id"],
            "name": data["name"],
            "full_name": data["full_name"],
            "description": data["description"],
            "language": data["language"],
            "stars": data["stargazers_count"],
            "forks": data["forks_count"],
            "open_issues": data["open_issues_count"],
        }

    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/issues/{owner}/{repo}")
def fetch_issues(owner: str, repo: str):
    try:
        issues = github_fetcher.get_issues(owner, repo)
        cleaned = []

        for issue in issues:
            if "pull_request" in issue:
                continue

            text = f"{issue['title']}\n{issue.get('body', '')}"
            issue_id = f"{owner}/{repo}#{issue['number']}"

            # ✅ Store in Chroma
            chroma.add_issue(
                issue_id=issue_id,
                text=text,
                metadata={
                    "owner": owner,
                    "repo": repo,
                    "number": issue["number"],
                    "title": issue["title"],
                },
            )

            cleaned.append({
                "id": issue["id"],
                "number": issue["number"],
                "title": issue["title"],
                "body": issue.get("body", ""),
                "state": issue["state"],
                "created_at": issue["created_at"],
                "updated_at": issue["updated_at"],
            })

        return {
            "total": len(cleaned),
            "issues": cleaned,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

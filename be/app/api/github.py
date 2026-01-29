from fastapi import APIRouter, HTTPException
from app.utils.github_fetcher import github_fetcher
<<<<<<< HEAD
from app.vector.chroma_client import chroma

router = APIRouter(tags=["GitHub"])
=======

router = APIRouter(prefix="/api/github", tags=["GitHub"])

>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822

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
<<<<<<< HEAD
            "open_issues": data["open_issues_count"],
=======
            "open_issues": data["open_issues_count"]
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822
        }

    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/issues/{owner}/{repo}")
def fetch_issues(owner: str, repo: str):
    try:
        issues = github_fetcher.get_issues(owner, repo)
<<<<<<< HEAD
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

=======

        cleaned = []
        for issue in issues:
            # Skip PRs
            if "pull_request" in issue:
                continue

>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822
            cleaned.append({
                "id": issue["id"],
                "number": issue["number"],
                "title": issue["title"],
                "body": issue.get("body", ""),
                "state": issue["state"],
                "created_at": issue["created_at"],
                "updated_at": issue["updated_at"],
<<<<<<< HEAD
=======
                "labels": [l["name"] for l in issue.get("labels", [])]
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822
            })

        return {
            "total": len(cleaned),
<<<<<<< HEAD
            "issues": cleaned,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
=======
            "issues": cleaned
        }

    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822

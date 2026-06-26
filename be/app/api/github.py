"""
GitHub API router — issue fetching, repository management, PR stats,
comments, linked PRs, full-text search, and comment posting.
"""

import asyncio
import logging
import os
import traceback
from datetime import datetime

import httpx
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel

from app.ai.categorizer import categorizer
from app.auth.auth_service import auth_service
from app.db.mongo import db as _mongo_db
from app.db.mongo import repos_collection, cached_repositories, cached_issues
from app.utils.github_fetcher import github_fetcher
from app.vector.chroma_client import chroma
from app.vector.embeddings import EmbeddingService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/github", tags=["GitHub"])

embedder = EmbeddingService()

_GH_HEADERS_BASE = {
    "Accept": "application/vnd.github.v3+json",
}


def _gh_headers(user_token: str | None = None) -> dict:
    """Build GitHub API request headers, optionally injecting a user token."""
    h = github_fetcher.headers.copy()
    if user_token:
        h["Authorization"] = f"Bearer {user_token}"
    return h


# ── Helpers ───────────────────────────────────────────────────────────────────

def cosine_similarity(a, b) -> float:
    a = np.array(a)
    b = np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def analyze_single_issue(owner: str, repo: str, issue: dict) -> dict:
    """
    Run semantic similarity analysis for a single issue against the ChromaDB index.

    Returns a dict with ``ai_analysis`` and ``duplicate_info`` keys.
    """
    try:
        title = issue.get("title", "")
        body = issue.get("body", "")

        # Categorize
        category_info = categorizer.categorize(title, body)
        primary_category = category_info["primary_category"]

        # Embed with category prefix
        embedding = embedder.embed_issue_with_category(title, body, primary_category)

        count = chroma.count(owner, repo)
        if count <= 1:  # Only the current issue exists — no peers to compare
            return {
                "ai_analysis": {"type": primary_category, "criticality": "low", "confidence": 0, "similar_issues": []},
                "duplicate_info": {"classification": "new", "similarity": 0, "reuse_type": "minimal"},
            }

        results = chroma.query(
            owner=owner,
            repo=repo,
            embedding=embedding,
            limit=min(10, count),
        )

        # Single pass: compute similarity, skip self-match, collect similar issues
        max_similarity = 0.0
        similar_issues = []

        if results["embeddings"] and results["embeddings"][0]:
            for i, sim_embedding in enumerate(results["embeddings"][0]):
                metadata = results["metadatas"][0][i]
                if metadata.get("title") == title:
                    continue  # self-match — skip
                if sim_embedding is None:
                    continue

                similarity = cosine_similarity(embedding, sim_embedding)
                max_similarity = max(max_similarity, similarity)

                if similarity >= 0.5:
                    similar_issues.append({
                        "id": results["ids"][0][i],
                        "number": metadata.get("number"),
                        "title": metadata.get("title"),
                        "similarity": round(similarity, 3),
                    })

        similar_issues.sort(key=lambda x: x["similarity"], reverse=True)
        similar_issues = similar_issues[:5]

        criticality = "high" if max_similarity >= 0.85 else "medium" if max_similarity >= 0.7 else "low"
        classification = "duplicate" if max_similarity >= 0.85 else "related" if max_similarity >= 0.7 else "new"
        reuse_type = (
            "direct" if max_similarity >= 0.9
            else "adapt" if max_similarity >= 0.8
            else "reference" if max_similarity >= 0.7
            else "minimal"
        )

        return {
            "ai_analysis": {
                "type": primary_category,
                "criticality": criticality,
                "confidence": round(max_similarity, 2),
                "similar_issues": similar_issues,
            },
            "duplicate_info": {
                "classification": classification,
                "similarity": round(max_similarity, 2),
                "reuse_type": reuse_type,
            },
        }

    except Exception as e:
        logger.error(f"Error in analyze_single_issue: {e}")
        logger.error(traceback.format_exc())
        return {
            "ai_analysis": {"type": "unknown", "criticality": "unknown", "confidence": 0, "similar_issues": []},
            "duplicate_info": {"classification": "unknown", "similarity": 0, "reuse_type": "minimal"},
        }


# ── Issue Fetching ─────────────────────────────────────────────────────────────

@router.get("/issues/{owner}/{repo}")
def fetch_issues(owner: str, repo: str, user_token: str = None, page: int = 1, per_page: int = 30):
    """
    Fetch issues with pagination, ensuring exactly ``per_page`` issues (PRs excluded).
    May fetch multiple GitHub pages to satisfy the requested count.
    """
    try:
        cleaned = []
        current_github_page = page
        total_items_fetched = 0
        pages_fetched = 0
        has_more = True

        while len(cleaned) < per_page and has_more:
            result = github_fetcher.get_issues(owner, repo, user_token, current_github_page, per_page)
            issues = result["issues"]
            pagination_info = result["pagination"]

            if not issues:
                has_more = False
                break

            total_items_fetched += len(issues)
            pages_fetched += 1

            for issue in issues:
                if "pull_request" in issue:
                    continue

                title = issue.get("title", "")
                body = issue.get("body", "") or ""
                issue_id = str(issue["id"])

                category_info = categorizer.categorize(title, body)
                primary_category = category_info["primary_category"]
                categories = category_info["categories"]
                confidence = category_info["confidence"]

                if not chroma.issue_exists(owner, repo, issue_id):
                    embedding = embedder.embed_issue_with_category(title, body, primary_category)
                    chroma.add_issue(
                        owner=owner,
                        repo=repo,
                        issue_id=issue_id,
                        embedding=embedding,
                        metadata={
                            "number": issue["number"],
                            "title": title,
                            "body": body,
                            "repo": f"{owner}/{repo}",
                            "category": primary_category,
                            "categories": ",".join(categories),
                            "category_confidence": confidence,
                        },
                    )

                analysis_result = analyze_single_issue(owner, repo, {
                    "id": issue["id"],
                    "title": title,
                    "body": body,
                })

                cleaned.append({
                    "id": issue["id"],
                    "number": issue["number"],
                    "title": title,
                    "body": body,
                    "state": issue["state"],
                    "created_at": issue["created_at"],
                    "updated_at": issue["updated_at"],
                    "labels": [label["name"] for label in issue.get("labels", [])],
                    "category": primary_category,
                    "ai_analysis": analysis_result["ai_analysis"],
                    "duplicate_info": analysis_result["duplicate_info"],
                })

                if len(cleaned) >= per_page:
                    break

            has_more = pagination_info.get("has_next", False)
            current_github_page += 1

        logger.info(
            f"Chroma count for {owner}/{repo}: {chroma.count(owner, repo)} | "
            f"fetched {total_items_fetched} items across {pages_fetched} page(s) → {len(cleaned)} issues"
        )

        has_next_page = has_more or len(cleaned) == per_page

        return {
            "total": len(cleaned),
            "issues": cleaned,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "has_next": has_next_page,
                "has_prev": page > 1,
                "count": len(cleaned),
                "total_fetched": total_items_fetched,
                "pages_fetched": pages_fetched,
            },
        }

    except Exception:
        logger.error("Route-level error in fetch_issues")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Internal error")


# ── Repository Endpoints ───────────────────────────────────────────────────────

@router.get("/check-access/{owner}/{repo}")
def check_repo_access(owner: str, repo: str, user_token: str = None):
    """
    Check if a repository is accessible and whether it is public or private.

    Query params:
        user_token: Optional OAuth token for private repo access
    """
    try:
        return github_fetcher.check_repo_visibility(owner, repo, user_token)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repo/{owner}/{repo}")
def fetch_repo(owner: str, repo: str, request: Request):
    """Fetch repository details and associate with the current authenticated user."""

    user_id = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            token = auth_header.split(" ")[1]
            payload = auth_service.verify_token(token)
            if payload:
                user_id = payload.get("sub")
        except Exception:
            pass

    data = github_fetcher.get_repo(owner, repo)

    repo_doc = {
        "owner": owner,
        "repo": repo,
        "full_name": data["full_name"],
        "description": data["description"],
        "language": data["language"],
        "stars": data["stargazers_count"],
        "forks": data["forks_count"],
        "open_issues": data["open_issues_count"],
        "last_analyzed_at": datetime.utcnow(),
        "user_id": user_id,
    }

    repos_collection.update_one(
        {"full_name": data["full_name"], "user_id": user_id},
        {
            "$set": repo_doc,
            "$setOnInsert": {"created_at": datetime.utcnow()},
        },
        upsert=True,
    )

    return repo_doc


@router.get("/rate-limit")
async def rate_limit():
    """Return the current GitHub API rate-limit status."""
    async with httpx.AsyncClient() as client:
        res = await client.get(
            "https://api.github.com/rate_limit",
            headers=_gh_headers(),
            timeout=10,
        )

    if res.status_code != 200:
        raise HTTPException(status_code=res.status_code, detail=res.text)

    return res.json()


@router.get("/repos")
def get_saved_repos(request: Request):
    """Get repositories analyzed by the current user."""

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return []

    try:
        token = auth_header.split(" ")[1]
        payload = auth_service.verify_token(token)
        if not payload:
            return []

        user_id = payload.get("sub")
        repos = list(
            repos_collection.find({"user_id": user_id}, {"_id": 0})
            .sort("last_analyzed_at", -1)
        )
        return repos
    except Exception:
        return []


# ── PR Stats ──────────────────────────────────────────────────────────────────

@router.get("/pr-stats/{owner}/{repo}")
async def get_pr_stats(owner: str, repo: str, user_token: str = None):
    """Get open and closed PR counts for a repository via the GitHub Search API."""
    search_url = "https://api.github.com/search/issues"
    headers = _gh_headers(user_token)

    try:
        async with httpx.AsyncClient() as client:
            open_res, closed_res = await asyncio.gather(
                client.get(search_url, headers=headers,
                           params={"q": f"repo:{owner}/{repo} is:pr is:open", "per_page": 1}, timeout=15),
                client.get(search_url, headers=headers,
                           params={"q": f"repo:{owner}/{repo} is:pr is:closed", "per_page": 1}, timeout=15),
            )

        open_count = open_res.json().get("total_count", 0) if open_res.status_code == 200 else 0
        closed_count = closed_res.json().get("total_count", 0) if closed_res.status_code == 200 else 0

        return {
            "open_prs": open_count,
            "closed_prs": closed_count,
            "total_prs": open_count + closed_count,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Issue Comments ─────────────────────────────────────────────────────────────

@router.get("/comments/{owner}/{repo}/{issue_number}")
async def get_issue_comments(owner: str, repo: str, issue_number: int, user_token: str = None):
    """Get comments for a specific issue."""
    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}/comments"

    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(url, headers=_gh_headers(user_token), params={"per_page": 50}, timeout=15)
        res.raise_for_status()

        comments = [
            {
                "id": c["id"],
                "author": c["user"]["login"],
                "avatar_url": c["user"]["avatar_url"],
                "body": c["body"],
                "created_at": c["created_at"],
                "updated_at": c["updated_at"],
            }
            for c in res.json()
        ]
        return {"comments": comments, "count": len(comments)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Linked PRs ─────────────────────────────────────────────────────────────────

@router.get("/linked-prs/{owner}/{repo}/{issue_number}")
async def get_linked_prs(owner: str, repo: str, issue_number: int, user_token: str = None):
    """Get PRs linked to a specific issue via timeline cross-reference events."""
    timeline_headers = _gh_headers(user_token)
    timeline_headers["Accept"] = "application/vnd.github.mockingbird-preview+json"
    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}/timeline"

    try:
        async with httpx.AsyncClient() as client:
            res = await client.get(url, headers=timeline_headers, params={"per_page": 100}, timeout=15)
        res.raise_for_status()

        linked_prs = []
        seen_prs: set = set()

        for event in res.json():
            if event.get("event") != "cross-referenced":
                continue
            source = event.get("source", {})
            issue_ref = source.get("issue", {})
            if not issue_ref.get("pull_request"):
                continue
            pr_number = issue_ref.get("number")
            if pr_number in seen_prs:
                continue
            seen_prs.add(pr_number)

            pr = issue_ref.get("pull_request", {})
            state = issue_ref.get("state", "unknown")
            if pr.get("merged_at"):
                state = "merged"

            linked_prs.append({
                "pr_number": pr_number,
                "title": issue_ref.get("title", ""),
                "state": state,
                "url": issue_ref.get("html_url", ""),
                "created_at": issue_ref.get("created_at"),
            })

        return {"linked_prs": linked_prs, "count": len(linked_prs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Full-text Search ───────────────────────────────────────────────────────────

@router.get("/search")
async def search_issues(
    q: str = Query(..., description="Search keyword"),
    owner: str = Query(None, description="Filter by owner"),
    repo: str = Query(None, description="Filter by repo name"),
    limit: int = Query(20, le=100),
):
    """
    Full-text search across cached issues.
    Scopes to owner/repo when provided, otherwise searches all cached repos.
    Uses MongoDB $text index; falls back to $regex if index is absent.
    """
    try:
        match_filter: dict = {}

        if owner and repo:
            repo_doc = await cached_repositories.find_one({"owner": owner, "name": repo})
            if repo_doc:
                match_filter["repository_id"] = repo_doc["_id"]

        results = []
        try:
            text_filter = {**match_filter, "$text": {"$search": q}}
            cursor = cached_issues.find(
                text_filter,
                {"score": {"$meta": "textScore"}, "number": 1, "title": 1, "body": 1,
                 "state": 1, "ai_analysis": 1, "repository_id": 1},
            ).sort([("score", {"$meta": "textScore"})]).limit(limit)
            async for doc in cursor:
                results.append(doc)
        except Exception:
            # Fallback to $regex when no text index exists
            regex = {"$regex": q, "$options": "i"}
            regex_filter = {**match_filter, "$or": [{"title": regex}, {"body": regex}]}
            cursor = cached_issues.find(
                regex_filter,
                {"number": 1, "title": 1, "body": 1, "state": 1, "ai_analysis": 1, "repository_id": 1},
            ).limit(limit)
            async for doc in cursor:
                results.append(doc)

        repo_cache: dict = {}
        enriched = []
        for doc in results:
            rid = doc.get("repository_id")
            if rid and str(rid) not in repo_cache:
                r = await cached_repositories.find_one({"_id": rid})
                repo_cache[str(rid)] = r
            r = repo_cache.get(str(rid), {}) if rid else {}

            body = doc.get("body") or ""
            idx = body.lower().find(q.lower())
            snippet = body[max(0, idx - 60): idx + 140].strip() if idx >= 0 else body[:200]

            enriched.append({
                "number": doc.get("number"),
                "title": doc.get("title"),
                "state": doc.get("state"),
                "snippet": snippet,
                "owner": r.get("owner", owner or ""),
                "repo": r.get("name", repo or ""),
                "type": (doc.get("ai_analysis") or {}).get("type"),
                "criticality": (doc.get("ai_analysis") or {}).get("criticality"),
            })

        return {"results": enriched, "count": len(enriched), "query": q}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Post Comment ───────────────────────────────────────────────────────────────

class PostCommentRequest(BaseModel):
    body: str


def _resolve_github_token(request: Request) -> str:
    """
    Decode the app JWT from the Authorization header and look up the user's
    raw GitHub OAuth token using three fallback paths:
      1. user_tokens collection keyed by user_id
      2. user_tokens collection keyed by github_username
      3. users.oauth_providers[].access_token
    Falls back to the server GITHUB_TOKEN env var as a last resort.
    Raises HTTPException on any failure.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated. Please sign in to post comments.")

    jwt_token = auth_header.split(" ", 1)[1]
    payload = auth_service.verify_token(jwt_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Session expired. Please sign out and sign back in.")

    user_id = payload.get("sub")

    # Path 1: user_tokens keyed by user_id
    token_doc = _mongo_db["user_tokens"].find_one({"user_id": user_id})
    if token_doc and token_doc.get("access_token"):
        return token_doc["access_token"]

    # Path 2 & 3: look up user doc
    try:
        user_doc = _mongo_db["users"].find_one({"_id": ObjectId(user_id)})
    except Exception:
        user_doc = None

    if user_doc:
        # Path 3: access_token stored directly on oauth_providers
        for provider in user_doc.get("oauth_providers", []):
            if provider.get("provider") == "github" and provider.get("access_token"):
                return provider["access_token"]

        # Path 2: look up user_tokens by github_username
        github_username = next(
            (p.get("username") for p in user_doc.get("oauth_providers", []) if p.get("provider") == "github"),
            None,
        )
        if github_username:
            token_doc = _mongo_db["user_tokens"].find_one({"github_username": github_username})
            if token_doc and token_doc.get("access_token"):
                # Back-fill user_id for faster future lookups
                _mongo_db["user_tokens"].update_one(
                    {"github_username": github_username},
                    {"$set": {"user_id": user_id}},
                )
                return token_doc["access_token"]

    # Final fallback: server GITHUB_TOKEN env var (works for developer's own repos)
    server_token = os.getenv("GITHUB_TOKEN")
    if server_token:
        return server_token

    raise HTTPException(
        status_code=403,
        detail="No GitHub token found. Please sign out and sign back in with GitHub to enable commenting.",
    )


@router.post("/comment/{owner}/{repo}/{issue_number}")
async def post_issue_comment(
    owner: str,
    repo: str,
    issue_number: int,
    payload: PostCommentRequest,
    request: Request,
):
    """
    Post a comment on a GitHub issue on behalf of the authenticated user.
    Reads the app JWT from Authorization header and resolves the GitHub OAuth
    token server-side — no raw GitHub token is ever exposed to the frontend.
    """
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Comment body cannot be empty")

    github_token = _resolve_github_token(request)

    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}/comments"
    gh_headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json",
    }

    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(url, headers=gh_headers, json={"body": payload.body}, timeout=15)

        if res.status_code == 401:
            raise HTTPException(status_code=401, detail="GitHub token is invalid or expired — please sign in again")
        if res.status_code == 403:
            raise HTTPException(status_code=403, detail="Token lacks permission to comment on this repository")
        if res.status_code == 404:
            raise HTTPException(status_code=404, detail="Issue or repository not found")
        res.raise_for_status()

        data = res.json()
        return {
            "id": data["id"],
            "author": data["user"]["login"],
            "avatar_url": data["user"]["avatar_url"],
            "body": data["body"],
            "created_at": data["created_at"],
            "updated_at": data["updated_at"],
            "url": data["html_url"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to post comment: {e}")



"""
Streaming API endpoint for progressive issue loading.
Issues are streamed directly from GitHub as they arrive — no blocking analysis.
AI analysis + MongoDB storage runs in the background via cache_service.
"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import json
import asyncio
import os
import requests as http_requests

router = APIRouter()


async def _stream_issues_from_github(owner: str, repo: str, user_token: str | None):
    """
    Async generator: yields raw issues from GitHub page by page.
    Each yield is a newline-delimited JSON string.
    """
    token = user_token or os.getenv("GITHUB_TOKEN", "")
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"

    base_url = f"https://api.github.com/repos/{owner}/{repo}/issues"

    # ── metadata frame ───────────────────────────────────────────────────────
    yield json.dumps({"type": "start"}) + "\n"

    page = 1
    total_sent = 0

    while True:
        params = {"state": "all", "per_page": 100, "page": page,
                  "sort": "updated", "direction": "desc"}

        try:
            resp = http_requests.get(base_url, headers=headers, params=params, timeout=30)

            if resp.status_code == 403:
                yield json.dumps({"type": "error", "error": "GitHub rate limit hit"}) + "\n"
                break

            resp.raise_for_status()
            raw_issues = resp.json()

        except Exception as exc:
            yield json.dumps({"type": "error", "error": str(exc)}) + "\n"
            break

        if not raw_issues:
            break

        has_more = len(raw_issues) >= 100

        for issue in raw_issues:
            if "pull_request" in issue:
                continue  # skip PRs

            # Minimal categorization (fast, pure Python — no embeddings)
            try:
                from app.ai.categorizer import categorizer as _cat
                cat_info = _cat.categorize(issue.get("title", ""), issue.get("body", "") or "")
                category = cat_info.get("primary_category", "general")
            except Exception:
                category = "general"

            yield json.dumps({
                "type": "issue",
                "data": {
                    "number":     issue["number"],
                    "title":      issue.get("title", ""),
                    "body":       issue.get("body", "") or "",
                    "state":      issue["state"],
                    "created_at": issue.get("created_at", ""),
                    "updated_at": issue.get("updated_at", ""),
                    "labels":     [lb["name"] for lb in issue.get("labels", [])],
                    "user":       issue.get("user") or {},
                    "category":   category,
                    # Placeholder AI fields — filled in once background sync completes
                    "ai_analysis": {
                        "type":          category,
                        "criticality":   "low",
                        "confidence":    0,
                        "similar_issues": [],
                    },
                    "duplicate_info": {
                        "classification": "new",
                        "similarity":     0,
                    },
                }
            }) + "\n"
            total_sent += 1

        yield json.dumps({"type": "progress", "fetched": total_sent, "page": page}) + "\n"

        # Let the event loop breathe
        await asyncio.sleep(0)

        if not has_more:
            break
        page += 1

    yield json.dumps({"type": "complete", "total": total_sent}) + "\n"


@router.get("/issues/{owner}/{repo}/stream")
async def stream_issues_endpoint(
    owner: str,
    repo: str,
    user_token: str = None,
):
    """
    Stream issues from GitHub directly to the browser as NDJSON.
    Each line is a JSON object with type: 'start' | 'issue' | 'progress' | 'complete' | 'error'.

    After all issues are streamed, background sync (AI analysis + MongoDB) is kicked off
    automatically so subsequent page loads serve from the fast DB cache.
    """

    async def generate():
        all_issues = []

        async for chunk in _stream_issues_from_github(owner, repo, user_token):
            yield chunk
            # Collect issue data so we can trigger background sync after streaming
            try:
                msg = json.loads(chunk)
                if msg.get("type") == "issue":
                    all_issues.append(msg["data"]["number"])
            except Exception:
                pass

        # Kick off background DB sync (non-blocking)
        asyncio.create_task(_background_sync(owner, repo, user_token))

    return StreamingResponse(generate(), media_type="application/x-ndjson")


async def _background_sync(owner: str, repo: str, user_token: str | None):
    """Background task: run full sync_repository so DB is populated for next visit."""
    try:
        from app.services.cache_service import CacheService
        svc = CacheService()
        await svc.sync_repository(owner, repo, force_full_sync=False, user_token=user_token)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).warning(f"Background sync failed for {owner}/{repo}: {exc}")

"""
Webhook API — receives GitHub issue events and auto-updates the cache + embeddings.

Setup:
  1. Add GITHUB_WEBHOOK_SECRET to your .env
  2. On GitHub repo → Settings → Webhooks → Add webhook
     Payload URL : http://your-server/api/github/webhook
     Content type: application/json
     Secret      : same value as GITHUB_WEBHOOK_SECRET
     Events      : Issues (select "Issues" only)
"""

import os
import hmac
import hashlib
import logging
from datetime import datetime
from fastapi import APIRouter, Request, HTTPException, Header
from typing import Optional

from app.db.mongo import cached_repositories, cached_issues
from app.services.cache_service import CacheService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/github", tags=["Webhook"])

WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "")
GITHUB_API = "https://api.github.com"
cache_service = CacheService()


def _verify_signature(body: bytes, signature: str) -> bool:
    """Verify GitHub HMAC-SHA256 webhook signature."""
    if not WEBHOOK_SECRET:
        logger.warning("GITHUB_WEBHOOK_SECRET not set — skipping signature check")
        return True
    mac = hmac.new(WEBHOOK_SECRET.encode(), body, hashlib.sha256)
    expected = "sha256=" + mac.hexdigest()
    return hmac.compare_digest(expected, signature or "")



def _embed_and_store(owner: str, repo: str, issue_data: dict):
    """Embed a new/updated issue into ChromaDB (synchronous — call from thread)."""
    try:
        from app.core.embedder import embedder
        from app.core.chroma_manager import chroma_manager
        embedding = embedder.embed_issue(
            issue_data.get("title", ""),
            issue_data.get("body", "") or "",
        )
        chroma_manager.add_issue(
            repo_name=f"{owner}/{repo}",
            issue_number=issue_data["number"],
            title=issue_data.get("title", ""),
            body=issue_data.get("body", "") or "",
            embedding=embedding,
            metadata={"state": issue_data.get("state", "open")},
        )
        logger.info(f"🧠 Embedded issue #{issue_data['number']} into ChromaDB via webhook")
    except Exception as e:
        logger.warning(f"ChromaDB embed failed for webhook issue #{issue_data.get('number')}: {e}")


# ─────────────────────────────────────────
# POST /api/github/webhook
# ─────────────────────────────────────────

@router.post("/webhook")
async def github_webhook(
    request: Request,
    x_hub_signature_256: Optional[str] = Header(None),
    x_github_event: Optional[str] = Header(None),
):
    """
    Receive GitHub webhook events for issue changes.
    Handles: opened, edited, closed, reopened, labeled, unlabeled.
    Instantly syncs the affected issue to MongoDB + ChromaDB vector store.
    """
    body = await request.body()

    # Verify signature
    if not _verify_signature(body, x_hub_signature_256 or ""):
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    if x_github_event != "issues":
        return {"status": "ignored", "event": x_github_event}

    payload = await request.json()
    action = payload.get("action", "")
    issue_data = payload.get("issue", {})
    repo_data = payload.get("repository", {})

    if not issue_data or not repo_data:
        return {"status": "ignored", "reason": "missing issue or repo data"}

    owner = repo_data.get("owner", {}).get("login", "")
    repo_name = repo_data.get("name", "")

    logger.info(f"🔔 Webhook: {action} issue #{issue_data.get('number')} in {owner}/{repo_name}")

    try:
        # Find repository in cache
        repo_doc = await cached_repositories.find_one({"owner": owner, "name": repo_name})
        if not repo_doc:
            return {"status": "ignored", "reason": "repository not in cache"}

        if action == "deleted":
            await cached_issues.delete_one({
                "repository_id": repo_doc["_id"],
                "number": issue_data.get("number")
            })
            # Best-effort ChromaDB cleanup
            try:
                from app.core.chroma_manager import chroma_manager
                chroma_manager.delete_issue(
                    repo_name=f"{owner}/{repo_name}",
                    issue_number=issue_data.get("number"),
                )
            except Exception:
                pass
            return {"status": "deleted", "issue": issue_data.get("number")}

        # For open/edit/close/label — upsert with fresh AI analysis
        analysis = await cache_service._analyze_issue(owner, repo_name, {
            "number": issue_data["number"],
            "title": issue_data.get("title", ""),
            "body": issue_data.get("body", "") or "",
        })

        issue_doc = {
            "repository_id": repo_doc["_id"],
            "number": issue_data["number"],
            "title": issue_data.get("title", ""),
            "body": issue_data.get("body", "") or "",
            "state": issue_data.get("state", "open"),
            "labels": [l["name"] for l in issue_data.get("labels", [])],
            "user": issue_data.get("user", {}),
            "created_at": datetime.fromisoformat(
                issue_data["created_at"].replace("Z", "+00:00")
            ) if issue_data.get("created_at") else datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "category": analysis.get("category"),
            "ai_analysis": analysis.get("ai_analysis"),
            "duplicate_info": analysis.get("duplicate_info"),
            "synced_at": datetime.utcnow(),
        }

        await cached_issues.update_one(
            {"repository_id": repo_doc["_id"], "number": issue_data["number"]},
            {"$set": issue_doc},
            upsert=True
        )

        # Embed into ChromaDB so similarity search stays current
        import asyncio
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, _embed_and_store, owner, repo_name, issue_data)

        logger.info(f"✅ Webhook synced issue #{issue_data['number']} ({action})")
        return {"status": "synced", "action": action, "issue": issue_data["number"]}

    except Exception as e:
        logger.error(f"❌ Webhook processing failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────
# POST /api/github/webhook/register/{owner}/{repo}
# ─────────────────────────────────────────

@router.post("/webhook/register/{owner}/{repo}")
async def register_webhook(owner: str, repo: str):
    """
    Auto-register a GitHub webhook on the given repo via the GitHub API.
    Requires GITHUB_TOKEN with admin:repo_hook (or write:repo_hook) scope.
    Skips creation if a webhook pointing to our backend already exists.
    """
    import requests as _req

    token = os.getenv("GITHUB_TOKEN", "")
    backend_url = os.getenv("BACKEND_URL", "").rstrip("/")

    if not token:
        raise HTTPException(status_code=400, detail="GITHUB_TOKEN not set in backend .env")
    if not backend_url:
        raise HTTPException(status_code=400, detail="BACKEND_URL not set in backend .env")

    webhook_url = f"{backend_url}/api/github/webhook"
    hooks_api = f"https://api.github.com/repos/{owner}/{repo}/hooks"
    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
    }

    # Check for existing hook to avoid duplicates
    try:
        existing = _req.get(hooks_api, headers=headers, timeout=10)
        if existing.status_code == 403:
            raise HTTPException(
                status_code=403,
                detail="Token lacks admin:repo_hook permission. Re-generate your GitHub token with that scope."
            )
        if existing.status_code == 404:
            raise HTTPException(
                status_code=404,
                detail=f"Cannot register webhook on {owner}/{repo} — you must be the owner or an admin of this repo. Webhooks can only be created on repos you control."
            )
        existing.raise_for_status()
        for hook in existing.json():
            if webhook_url in hook.get("config", {}).get("url", ""):
                return {"status": "already_exists", "webhook_url": webhook_url}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not list hooks: {e}")

    # Create new webhook
    payload = {
        "name": "web",
        "active": True,
        "events": ["issues"],
        "config": {
            "url": webhook_url,
            "content_type": "json",
            "secret": WEBHOOK_SECRET or "",
            "insecure_ssl": "0",
        },
    }
    try:
        resp = _req.post(hooks_api, headers=headers, json=payload, timeout=10)
        if resp.status_code == 422:
            # Already exists (race condition)
            return {"status": "already_exists", "webhook_url": webhook_url}
        if resp.status_code == 403:
            raise HTTPException(
                status_code=403,
                detail="Token lacks admin:repo_hook permission. Re-generate your GitHub token with that scope."
            )
        resp.raise_for_status()
        hook = resp.json()
        logger.info(f"✅ Webhook registered for {owner}/{repo}: {webhook_url}")
        return {"status": "created", "webhook_url": webhook_url, "hook_id": hook.get("id")}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create webhook: {e}")


# ─────────────────────────────────────────
# GET /api/github/webhook-status/{owner}/{repo}
# ─────────────────────────────────────────

@router.get("/webhook-status/{owner}/{repo}")
async def get_webhook_status(owner: str, repo: str):
    """
    Check whether a webhook is registered on this repo pointing to our server.
    Returns {active: bool, webhook_url: str, setup_url: str}.
    """
    import requests as _req
    token = os.getenv("GITHUB_TOKEN", "")
    backend_url = os.getenv("BACKEND_URL", "")
    setup_url = f"https://github.com/{owner}/{repo}/settings/hooks"

    if not token:
        # Can't check without a token — just tell the user the setup URL
        return {
            "active": False,
            "checked": False,
            "reason": "GITHUB_TOKEN not set — cannot check webhook status",
            "setup_url": setup_url,
            "webhook_url": f"{backend_url}/api/github/webhook" if backend_url else "",
        }

    try:
        resp = _req.get(
            f"https://api.github.com/repos/{owner}/{repo}/hooks",
            headers={"Authorization": f"token {token}", "Accept": "application/vnd.github.v3+json"},
            timeout=10,
        )
        if resp.status_code == 403:
            return {"active": False, "checked": False, "reason": "Insufficient token permissions", "setup_url": setup_url}
        resp.raise_for_status()
        hooks = resp.json()
        active = any(
            backend_url and backend_url in h.get("config", {}).get("url", "")
            for h in hooks
        )
        return {
            "active": active,
            "checked": True,
            "setup_url": setup_url,
            "webhook_url": f"{backend_url}/api/github/webhook" if backend_url else "",
        }
    except Exception as e:
        return {"active": False, "checked": False, "reason": str(e), "setup_url": setup_url}


"""
Cache API endpoints for MongoDB-backed issue caching
"""
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel
from typing import Optional, List
import logging

from app.db.mongo import cached_repositories, cached_issues
from app.services.cache_service import CacheService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cache", tags=["cache"])
cache_service = CacheService()


class SyncRequest(BaseModel):
    owner: str
    repo: str
    force_full_sync: bool = False


@router.get("/issues")
async def get_cached_issues(
    request: Request,
    owner: str = Query(..., description="Repository owner"),
    repo: str = Query(..., description="Repository name"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(30, ge=1, le=100, description="Items per page"),
    state: Optional[str] = Query(None, description="Filter by state (open/closed)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    type: Optional[str] = Query(None, description="Filter by type (unique/duplicate/potential)"),
    criticality: Optional[str] = Query(None, description="Filter by criticality"),
    min_similarity: Optional[float] = Query(None, ge=0, le=100, description="Minimum similarity score"),
    user_token: Optional[str] = Query(None, description="GitHub user token")
):
    """
    Get cached issues with optional filters and pagination.
    If the caller is authenticated (JWT in Authorization header) and the repo
    has no synced_by_user_id yet, stamp it now so it appears in the user's list.
    """
    try:
        logger.info(f"Fetching cached issues for {owner}/{repo} (page {page}, per_page {per_page})")

        # Resolve user_id from JWT if present, then backfill repo attribution
        user_id: Optional[str] = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            from app.auth.auth_service import auth_service
            payload = auth_service.verify_token(auth_header.split(" ", 1)[1])
            if payload:
                user_id = payload.get("sub")

        if user_id:
            # Add this user to the user_ids array (idempotent — addToSet never duplicates)
            await cached_repositories.update_one(
                {"owner": owner, "name": repo},
                {"$addToSet": {"user_ids": user_id}}
            )

        # Build filters
        filters = {}
        if state:
            filters["state"] = state
        if category:
            filters["category"] = category
        if type:
            filters["type"] = type
        if criticality:
            filters["criticality"] = criticality
        if min_similarity is not None:
            filters["min_similarity"] = min_similarity

        result = await cache_service.get_cached_issues(
            owner=owner,
            repo=repo,
            page=page,
            per_page=per_page,
            filters=filters,
            user_token=user_token
        )

        return result

    except Exception as e:
        logger.error(f"Error fetching cached issues: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/sync")
async def sync_repository(request: Request, body: SyncRequest):
    """
    Sync repository issues from GitHub to cache.
    Stamps the synced_by_user_id so the repo only appears for this user.
    """
    try:
        logger.info(f"Syncing repository {body.owner}/{body.repo} (force={body.force_full_sync})")
        
        # Resolve user_id from JWT if provided
        user_id: Optional[str] = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            from app.auth.auth_service import auth_service
            payload = auth_service.verify_token(auth_header.split(" ", 1)[1])
            if payload:
                user_id = payload.get("sub")
        
        result = await cache_service.sync_repository(
            owner=body.owner,
            repo=body.repo,
            force_full_sync=body.force_full_sync,
            user_id=user_id,
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Error syncing repository: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def get_cache_status(
    owner: str = Query(..., description="Repository owner"),
    repo: str = Query(..., description="Repository name")
):
    """
    Get cache status for a repository
    """
    try:
        # Find repository in cache
        repo_doc = await cached_repositories.find_one({
            "owner": owner,
            "name": repo
        })
        
        if not repo_doc:
            return {
                "cached": False,
                "last_synced": None,
                "total_issues": 0,
                "is_fresh": False
            }
        
        # Count issues
        issue_count = await cached_issues.count_documents({
            "repository_id": repo_doc["_id"]
        })
        
        return {
            "cached": True,
            "last_synced": repo_doc.get("last_synced"),
            "total_issues": issue_count,
            "is_fresh": repo_doc.get("is_fresh", False)
        }
        
    except Exception as e:
        logger.error(f"Error getting cache status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repositories")
async def list_repositories(request: Request):
    """List repositories — scoped to the current user when a JWT is provided."""
    logger.info("Listing repositories")

    # Resolve user_id from JWT if present
    user_id: Optional[str] = None
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        from app.auth.auth_service import auth_service
        payload = auth_service.verify_token(auth_header.split(" ", 1)[1])
        if payload:
            user_id = payload.get("sub")

    try:
        service = CacheService()
        repositories = await service.list_repositories(user_id=user_id)
        return {"repositories": repositories}
    except Exception as e:
        logger.error(f"Error listing repositories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/repositories/{owner}/{repo}")
async def delete_repository(owner: str, repo: str):
    """Delete a repository from cache (MongoDB + ChromaDB)"""
    logger.info(f"Deleting repository {owner}/{repo}")
    
    try:
        service = CacheService()
        result = await service.delete_repository(owner, repo)
        return result
    except Exception as e:
        logger.error(f"Error deleting repository: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/issues/{owner}/{repo}/{issue_number}")
async def get_single_cached_issue(owner: str, repo: str, issue_number: int):
    """
    Fetch a single cached issue by number for inline preview.
    Returns the full issue document including body and ai_analysis.
    """
    try:
        repo_doc = await cached_repositories.find_one({"owner": owner, "name": repo})
        if not repo_doc:
            raise HTTPException(status_code=404, detail="Repository not found in cache")

        issue = await cached_issues.find_one(
            {"repository_id": repo_doc["_id"], "number": issue_number},
        )
        if not issue:
            raise HTTPException(status_code=404, detail="Issue not found in cache")

        issue["_id"] = str(issue["_id"])
        issue["repository_id"] = str(issue["repository_id"])
        return issue
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching single issue: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


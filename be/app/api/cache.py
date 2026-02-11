"""
Cache API endpoints for MongoDB-backed issue caching
"""
from fastapi import APIRouter, HTTPException, Query
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
    Get cached issues with optional filters and pagination
    """
    try:
        logger.info(f"Fetching cached issues for {owner}/{repo} (page {page}, per_page {per_page})")
        
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
        
        # Get cached issues
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
async def sync_repository(request: SyncRequest):
    """
    Sync repository issues from GitHub to cache
    """
    try:
        logger.info(f"Syncing repository {request.owner}/{request.repo} (force={request.force_full_sync})")
        
        result = await cache_service.sync_repository(
            owner=request.owner,
            repo=request.repo,
            force_full_sync=request.force_full_sync
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
async def list_repositories():
    """List all analyzed repositories"""
    logger.info("Listing all repositories")
    
    try:
        service = CacheService()
        repositories = await service.list_repositories()
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

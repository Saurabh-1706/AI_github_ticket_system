"""
Cache service for MongoDB-backed issue caching with AI analysis
"""
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from bson import ObjectId
import requests

from app.db.mongo import cached_repositories, cached_issues

logger = logging.getLogger(__name__)


class CacheService:
    """Service for managing cached GitHub issues"""
    
    def __init__(self):
        self.github_api_base = "https://api.github.com"
    
    async def get_cached_issues(
        self,
        owner: str,
        repo: str,
        page: int = 1,
        per_page: int = 30,
        filters: Optional[Dict[str, Any]] = None,
        user_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get cached issues with pagination and filters
        """
        # Find repository
        repo_doc = await cached_repositories.find_one({
            "owner": owner,
            "name": repo
        })
        
        if not repo_doc:
            logger.info(f"Repository {owner}/{repo} not in cache, triggering sync")
            # Trigger sync and return empty result for now
            await self.sync_repository(owner, repo, user_token=user_token)
            return {
                "issues": [],
                "pagination": {
                    "page": page,
                    "per_page": per_page,
                    "total": 0,
                    "total_pages": 0
                },
                "cache_info": {
                    "last_synced": None,
                    "total_cached": 0,
                    "is_fresh": False
                }
            }
        
        # Build query
        query = {"repository_id": repo_doc["_id"]}
        
        if filters:
            if filters.get("state"):
                query["state"] = filters["state"]
            if filters.get("category"):
                query["category"] = filters["category"]
            if filters.get("type"):
                query["duplicate_info.classification"] = filters["type"]
            if filters.get("criticality"):
                query["ai_analysis.criticality"] = filters["criticality"]
            if filters.get("min_similarity") is not None:
                query["duplicate_info.similarity"] = {"$gte": filters["min_similarity"] / 100}
        
        # Count total
        total = await cached_issues.count_documents(query)
        
        # Get paginated issues
        skip = (page - 1) * per_page
        cursor = cached_issues.find(query).sort("number", -1).skip(skip).limit(per_page)
        issues = await cursor.to_list(length=per_page)
        
        # Convert ObjectId to string
        for issue in issues:
            issue["_id"] = str(issue["_id"])
            issue["repository_id"] = str(issue["repository_id"])
        
        return {
            "issues": issues,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "total": total,
                "total_pages": (total + per_page - 1) // per_page
            },
            "cache_info": {
                "last_synced": repo_doc.get("last_synced"),
                "total_cached": await cached_issues.count_documents({"repository_id": repo_doc["_id"]}),
                "is_fresh": self._is_cache_fresh(repo_doc.get("last_synced"))
            }
        }
    
    async def sync_repository(
        self,
        owner: str,
        repo: str,
        force_full_sync: bool = False,
        user_token: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Sync repository issues from GitHub
        """
        logger.info(f"Starting sync for {owner}/{repo}")
        
        # Find or create repository document
        repo_doc = await cached_repositories.find_one({"owner": owner, "name": repo})
        
        if not repo_doc:
            repo_doc = {
                "owner": owner,
                "name": repo,
                "last_synced": None,
                "created_at": datetime.utcnow()
            }
            result = await cached_repositories.insert_one(repo_doc)
            repo_doc["_id"] = result.inserted_id
        
        # Determine since parameter
        since = None
        if not force_full_sync and repo_doc.get("last_synced"):
            since = repo_doc["last_synced"].isoformat() + "Z"
        
        # Fetch issues from GitHub
        issues = await self._fetch_github_issues(owner, repo, since, user_token)
        
        logger.info(f"Fetched {len(issues)} issues from GitHub")
        
        # Store issues with AI analysis
        stored_count = 0
        failed_count = 0
        for issue_data in issues:
            try:
                issue_number = issue_data.get("number", "unknown")
                
                # Generate and store embedding FIRST (before analysis needs it)
                try:
                    from app.core.embedder import embedder
                    from app.core.chroma_manager import chroma_manager
                    
                    # Generate embedding
                    embedding = embedder.embed_issue(
                        issue_data["title"],
                        issue_data.get("body", "")
                    )
                    
                    # Store in ChromaDB BEFORE analysis (so similarity search works)
                    chroma_manager.add_issue(
                        repo_name=f"{owner}/{repo}",
                        issue_number=issue_data["number"],
                        title=issue_data["title"],
                        body=issue_data.get("body", ""),
                        embedding=embedding,
                        metadata={
                            "state": issue_data["state"]
                        }
                    )
                except Exception as e:
                    logger.error(f"Failed to add issue #{issue_data['number']} to ChromaDB: {e}")
                
                # NOW perform AI analysis (which queries ChromaDB for similar issues)
                analysis = await self._analyze_issue(owner, repo, issue_data)
                
                # Prepare issue document
                issue_doc = {
                    "repository_id": repo_doc["_id"],
                    "number": issue_data["number"],
                    "title": issue_data["title"],
                    "body": issue_data.get("body") or "",  # Handle None
                    "state": issue_data["state"],
                    "created_at": datetime.fromisoformat(issue_data["created_at"].replace("Z", "+00:00")),
                    "updated_at": datetime.fromisoformat(issue_data["updated_at"].replace("Z", "+00:00")),
                    "user": issue_data.get("user") or {},  # Handle None
                    "labels": issue_data.get("labels") or [],  # Handle None
                    "category": analysis.get("category"),
                    "ai_analysis": analysis.get("ai_analysis"),
                    "duplicate_info": analysis.get("duplicate_info"),
                    "synced_at": datetime.utcnow()
                }
                
                # Upsert issue to MongoDB
                await cached_issues.update_one(
                    {"repository_id": repo_doc["_id"], "number": issue_data["number"]},
                    {"$set": issue_doc},
                    upsert=True
                )
                
                stored_count += 1
                if stored_count % 50 == 0:
                    logger.info(f"Progress: stored {stored_count}/{len(issues)} issues")
                
            except Exception as e:
                failed_count += 1
                logger.error(f"Error processing issue #{issue_number}: {type(e).__name__}: {e}")
                if failed_count <= 3:  # Log first 3 full tracebacks
                    logger.error(f"Full traceback:", exc_info=True)
        
        # Update repository sync time
        await cached_repositories.update_one(
            {"_id": repo_doc["_id"]},
            {"$set": {"last_synced": datetime.utcnow()}}
        )
        
        logger.info(f"Sync complete: stored {stored_count}/{len(issues)} issues, failed: {failed_count}")
        
        return {
            "synced": stored_count,
            "total_fetched": len(issues),
            "last_synced": datetime.utcnow().isoformat()
        }
    
    async def _fetch_github_issues(
        self,
        owner: str,
        repo: str,
        since: Optional[str] = None,
        user_token: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Fetch issues from GitHub API"""
        headers = {"Accept": "application/vnd.github.v3+json"}
        if user_token:
            headers["Authorization"] = f"token {user_token}"
        
        issues = []
        page = 1
        max_pages = 10  # Limit to prevent excessive API calls
        
        while page <= max_pages:
            url = f"{self.github_api_base}/repos/{owner}/{repo}/issues"
            params = {
                "state": "all",
                "per_page": 100,
                "page": page,
                "sort": "updated",
                "direction": "desc"
            }
            if since:
                params["since"] = since
            
            try:
                response = requests.get(url, headers=headers, params=params, timeout=30)
                response.raise_for_status()
                
                page_issues = response.json()
                if not page_issues:
                    break
                
                # Check pagination before filtering
                has_more_pages = len(page_issues) >= 100
                
                # Filter out pull requests
                page_issues = [i for i in page_issues if "pull_request" not in i]
                issues.extend(page_issues)
                
                # Break if no more pages
                if not has_more_pages:
                    break
                
                page += 1
                
            except requests.exceptions.HTTPError as e:
                if e.response.status_code == 422:
                    logger.warning(f"GitHub API pagination limit reached at page {page}")
                    break
                raise
        
        return issues
    
    async def _analyze_issue(self, owner: str, repo: str, issue_data: Dict[str, Any]) -> Dict[str, Any]:
        """Perform AI analysis with ChromaDB semantic similarity"""
        title = issue_data["title"]
        body = issue_data.get("body", "")

        # ── STEP 1: Categorize (pure Python — never fails silently) ────────
        try:
            from app.ai.categorizer import categorizer
            category_info = categorizer.categorize(title, body)
            issue_type = category_info["primary_category"]
            category = issue_type
        except Exception as e:
            logger.error(f"Categorizer failed for issue #{issue_data.get('number')}: {e}")
            issue_type = "general"
            category = "general"

        # ── STEP 2: Embedding + ChromaDB similarity (graceful fallback) ────
        similar_issues = []
        max_similarity = 0.0
        try:
            from app.core.embedder import embedder
            from app.core.chroma_manager import chroma_manager

            embedding = embedder.embed_issue(title, body)
            repo_name = f"{owner}/{repo}"
            similar_issues = chroma_manager.find_similar_issues(
                repo_name=repo_name,
                embedding=embedding,
                top_k=3,
                exclude_issue=issue_data["number"]
            )
            if similar_issues:
                max_similarity = max(issue['similarity'] for issue in similar_issues)
        except Exception as e:
            logger.warning(f"Similarity search failed for issue #{issue_data.get('number')}: {e} — using defaults")

        # ── STEP 3: Build result ────────────────────────────────────────────
        criticality = "high" if max_similarity >= 0.85 else "medium" if max_similarity >= 0.7 else "low"

        if max_similarity >= 0.85:
            classification = "duplicate"
        elif max_similarity >= 0.6:
            classification = "related"
        else:
            classification = "new"

        return {
            "category": category,
            "ai_analysis": {
                "type": issue_type,
                "criticality": criticality,
                "confidence": round(max_similarity, 2),
                "similar_issues": similar_issues
            },
            "duplicate_info": {
                "classification": classification,
                "similarity": round(max_similarity, 3),
                "similar_issues": similar_issues
            }
        }

    
    def _is_cache_fresh(self, last_synced: Optional[datetime]) -> bool:
        """Check if cache is fresh (synced within last hour)"""
        if not last_synced:
            return False
        return datetime.utcnow() - last_synced < timedelta(hours=1)
    
    async def list_repositories(self) -> List[Dict[str, Any]]:
        """List all analyzed repositories with stats"""
        try:
            # Get all repositories
            repos = await cached_repositories.find().sort("last_synced", -1).to_list(length=None)
            
            result = []
            for repo in repos:
                # Count issues for this repo
                issue_count = await cached_issues.count_documents({
                    "repository_id": repo["_id"]
                })
                
                result.append({
                    "owner": repo.get("owner"),
                    "name": repo.get("name"),
                    "full_name": f"{repo.get('owner')}/{repo.get('name')}",
                    "issue_count": issue_count,
                    "last_synced": repo.get("last_synced"),
                    "created_at": repo.get("created_at", repo.get("last_synced"))
                })
            
            return result
            
        except Exception as e:
            logger.error(f"Error listing repositories: {e}", exc_info=True)
            raise
    
    async def delete_repository(self, owner: str, repo: str) -> Dict[str, Any]:
        """Delete a repository from MongoDB and ChromaDB"""
        try:
            # Validate inputs
            if not owner or not repo or repo == "null" or repo == "None":
                raise ValueError(f"Invalid repository name: {owner}/{repo}")
            
            # Find repository
            repo_doc = await cached_repositories.find_one({
                "owner": owner,
                "name": repo
            })
            
            if not repo_doc:
                # Try to find by owner only (in case of data inconsistency)
                logger.warning(f"Repository {owner}/{repo} not found, searching by owner only")
                repo_doc = await cached_repositories.find_one({
                    "owner": owner,
                    "$or": [
                        {"name": repo},
                        {"name": None}
                    ]
                })
                
                if not repo_doc:
                    raise ValueError(f"Repository {owner}/{repo} not found in cache")
            
            # Delete all issues for this repository
            issues_result = await cached_issues.delete_many({
                "repository_id": repo_doc["_id"]
            })
            
            # Delete repository document
            await cached_repositories.delete_one({"_id": repo_doc["_id"]})
            
            # Delete from ChromaDB
            try:
                from app.core.chroma_manager import chroma_manager
                chroma_manager.reset_collection(f"{owner}/{repo}")
                logger.info(f"Deleted ChromaDB collection for {owner}/{repo}")
            except Exception as e:
                logger.warning(f"Failed to delete ChromaDB collection: {e}")
            
            logger.info(f"Deleted repository {owner}/{repo}: {issues_result.deleted_count} issues")
            
            return {
                "success": True,
                "message": f"Deleted repository {owner}/{repo}",
                "issues_deleted": issues_result.deleted_count
            }
            
        except Exception as e:
            logger.error(f"Error deleting repository: {e}", exc_info=True)
            raise

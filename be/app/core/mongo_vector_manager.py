"""
be/app/core/mongo_vector_manager.py

Drop-in replacement for chroma_manager.py.
Exposes the same 4-method interface:
  - add_issue()
  - find_similar_issues()
  - delete_issue()
  - reset_collection()

Uses MongoDB Atlas Vector Search on the `issue_vectors` collection.
"""
import logging
from typing import Any, Dict, List, Optional

from app.db.mongo import issue_vectors

logger = logging.getLogger(__name__)

VECTOR_INDEX_NAME = "vector_index"


class MongoVectorManager:

    # ──────────────────────────────────────────────────────────────────────────
    # Public API  (matches chroma_manager interface exactly)
    # ──────────────────────────────────────────────────────────────────────────

    async def add_issue(
        self,
        repo_name: str,
        issue_number: int,
        title: str,
        body: str,
        embedding: List[float],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Upsert a single issue's embedding into MongoDB.
        Replaces: chroma_manager.add_issue()
        """
        doc = {
            "repo":         repo_name,
            "issue_number": issue_number,
            "title":        title,
            "body":         (body or "")[:2000],   # cap to avoid huge docs
            "embedding":    embedding,
            "state":        (metadata or {}).get("state", "open"),
        }
        try:
            await issue_vectors.update_one(
                {"repo": repo_name, "issue_number": issue_number},
                {"$set": doc},
                upsert=True,
            )
            logger.debug(f"Upserted vector for {repo_name}#{issue_number}")
        except Exception as e:
            logger.error(f"MongoVectorManager.add_issue failed for {repo_name}#{issue_number}: {e}")
            raise

    async def find_similar_issues(
        self,
        repo_name: str,
        embedding: List[float],
        top_k: int = 5,
        exclude_issue: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Return up to top_k similar issues within the same repo.
        Each result: {"number": int, "title": str, "similarity": float, "state": str}
        Replaces: chroma_manager.find_similar_issues()
        """
        # Fetch extra so we can drop the excluded issue after
        num_candidates = max(top_k * 10, 50)
        fetch_limit    = top_k + (1 if exclude_issue is not None else 0)

        pipeline = [
            {
                "$vectorSearch": {
                    "index":         VECTOR_INDEX_NAME,
                    "path":          "embedding",
                    "queryVector":   embedding,
                    "numCandidates": num_candidates,
                    "limit":         fetch_limit,
                    "filter": {
                        "repo": {"$eq": repo_name}
                    },
                }
            },
            {
                "$project": {
                    "issue_number": 1,
                    "title":        1,
                    "state":        1,
                    "similarity":   {"$meta": "vectorSearchScore"},
                    "_id":          0,
                }
            },
        ]

        try:
            cursor  = issue_vectors.aggregate(pipeline)
            results = []
            async for doc in cursor:
                if exclude_issue is not None and doc["issue_number"] == exclude_issue:
                    continue
                results.append({
                    "number":     doc["issue_number"],
                    "title":      doc.get("title", ""),
                    "similarity": round(doc.get("similarity", 0.0), 4),
                    "state":      doc.get("state", "open"),
                })
                if len(results) >= top_k:
                    break
            return results
        except Exception as e:
            logger.error(f"MongoVectorManager.find_similar_issues failed for {repo_name}: {e}")
            return []   # graceful fallback — same behaviour as original

    async def delete_issue(self, repo_name: str, issue_number: int) -> None:
        """
        Remove a single issue's vector (best-effort).
        Replaces: chroma_manager.delete_issue()
        """
        try:
            await issue_vectors.delete_one(
                {"repo": repo_name, "issue_number": issue_number}
            )
        except Exception as e:
            logger.warning(f"MongoVectorManager.delete_issue failed for {repo_name}#{issue_number}: {e}")

    async def reset_collection(self, repo_name: str) -> None:
        """
        Delete all vectors for a repo (called when user deletes a repo).
        Replaces: chroma_manager.reset_collection()
        """
        try:
            result = await issue_vectors.delete_many({"repo": repo_name})
            logger.info(f"Deleted {result.deleted_count} vectors for {repo_name}")
        except Exception as e:
            logger.warning(f"MongoVectorManager.reset_collection failed for {repo_name}: {e}")

    async def find_similar_by_issue_number(
        self,
        repo_name: str,
        issue_number: int,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Look up an issue by its number, retrieve its embedding, and find similar issues.
        """
        target = await issue_vectors.find_one(
            {"repo": repo_name, "issue_number": issue_number},
            {"embedding": 1, "_id": 0}
        )
        if not target or "embedding" not in target:
            logger.warning(f"No embedding found for target issue {repo_name}#{issue_number}")
            return []
            
        return await self.find_similar_issues(
            repo_name=repo_name,
            embedding=target["embedding"],
            top_k=top_k,
            exclude_issue=issue_number
        )


# Singleton — same pattern as chroma_manager.py
mongo_vector_manager = MongoVectorManager()

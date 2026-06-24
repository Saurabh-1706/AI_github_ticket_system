"""
be/app/vector/mongo_chroma_client.py

Drop-in replacement for chroma_client.py (ChromaStore / chroma singleton).
Used by: api/github.py, api/solution.py

Exposes the same methods:
  - add_issue(owner, repo, issue_id, embedding, metadata)
  - query(owner, repo, embedding, limit)
  - issue_exists(owner, repo, issue_id)
  - count(owner, repo)
  - query_similar(owner, repo, text, limit)
"""
import asyncio
import logging
from typing import Dict, List

from app.db.mongo import issue_vectors, async_db

logger = logging.getLogger(__name__)

VECTOR_INDEX_NAME = "vector_index"


class MongoChromaStore:
    """
    Mimics the ChromaStore interface used in github.py and solution.py.
    Note: github.py and solution.py call these synchronously from sync endpoints,
    so we run the async motor calls via asyncio.run() or a helper below.
    """

    def _repo_name(self, owner: str, repo: str) -> str:
        return f"{owner}/{repo}"

    # ── async internals ──────────────────────────────────────────────────────

    async def _add_issue_async(self, owner, repo, issue_id, embedding, metadata):
        doc = {
            "repo":         self._repo_name(owner, repo),
            "issue_number": int(issue_id),
            "title":        metadata.get("title", ""),
            "body":         (metadata.get("body", "") or "")[:2000],
            "embedding":    embedding,
            "state":        metadata.get("state", "open"),
            "category":     metadata.get("category", ""),
            "number":       metadata.get("number"),
        }
        await issue_vectors.update_one(
            {"repo": self._repo_name(owner, repo), "issue_number": int(issue_id)},
            {"$set": doc},
            upsert=True,
        )

    async def _query_async(self, owner, repo, embedding, limit):
        pipeline = [
            {
                "$vectorSearch": {
                    "index":         VECTOR_INDEX_NAME,
                    "path":          "embedding",
                    "queryVector":   embedding,
                    "numCandidates": limit * 10,
                    "limit":         limit,
                    "filter":        {"repo": {"$eq": self._repo_name(owner, repo)}},
                }
            },
            {
                "$project": {
                    "issue_number": 1,
                    "title":        1,
                    "body":         1,
                    "number":       1,
                    "category":     1,
                    "embedding":    1,
                    "state":        1,
                    "similarity":   {"$meta": "vectorSearchScore"},
                    "_id":          0,
                }
            },
        ]
        ids, metadatas, embeddings = [], [], []
        async for doc in issue_vectors.aggregate(pipeline):
            ids.append(str(doc.get("issue_number", "")))
            metadatas.append({
                "title":    doc.get("title", ""),
                "number":   doc.get("number"),
                "state":    doc.get("state", "open"),
                "category": doc.get("category", ""),
                "body":     doc.get("body", ""),
            })
            embeddings.append(doc.get("embedding", []))
        # Return in ChromaDB result format so github.py needs zero changes
        return {
            "ids":        [ids],
            "metadatas":  [metadatas],
            "embeddings": [embeddings],
        }

    async def _count_async(self, owner, repo):
        return await issue_vectors.count_documents(
            {"repo": self._repo_name(owner, repo)}
        )

    async def _exists_async(self, owner, repo, issue_id):
        doc = await issue_vectors.find_one(
            {"repo": self._repo_name(owner, repo), "issue_number": int(issue_id)}
        )
        return doc is not None

    # ── sync public API (matches chroma_client.ChromaStore) ─────────────────

    def _run(self, coro):
        """Run async coroutine from sync context."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Already inside an async context (FastAPI) — create a task
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(asyncio.run, coro)
                    return future.result()
            else:
                return loop.run_until_complete(coro)
        except RuntimeError:
            return asyncio.run(coro)

    def add_issue(self, owner: str, repo: str, issue_id: str, embedding: List[float], metadata: Dict):
        self._run(self._add_issue_async(owner, repo, issue_id, embedding, metadata))

    def query(self, owner: str, repo: str, embedding: List[float], limit: int = 6):
        return self._run(self._query_async(owner, repo, embedding, limit))

    def issue_exists(self, owner: str, repo: str, issue_id: str) -> bool:
        return self._run(self._exists_async(owner, repo, issue_id))

    def count(self, owner: str, repo: str) -> int:
        return self._run(self._count_async(owner, repo))

    def query_similar(self, owner: str, repo: str, text: str, limit: int = 5):
        from app.vector.embeddings import EmbeddingService
        embedding = EmbeddingService().embed_text(text)
        return self.query(owner, repo, embedding, limit)

    def query_similar_by_issue_id(self, owner: str, repo: str, issue_id: str, limit: int = 5):
        """
        Query similar issues using an existing issue number/ID.
        """
        target = self._run(issue_vectors.find_one(
            {"repo": self._repo_name(owner, repo), "issue_number": int(issue_id)},
            {"embedding": 1, "_id": 0}
        ))
        if not target or "embedding" not in target:
            return {"ids": [[]], "metadatas": [[]], "embeddings": [[]]}
        return self.query(owner, repo, target["embedding"], limit)


# Singleton — same name as chroma_client.py so imports work unchanged
chroma = MongoChromaStore()

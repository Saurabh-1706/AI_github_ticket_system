"""
app/core/chroma_manager.py
Thin wrapper around app.vector.chroma_client.ChromaStore that provides the
API expected by cache_service and other modules:

  chroma_manager.add_issue(repo_name, issue_number, title, body, embedding, metadata)
  chroma_manager.find_similar_issues(repo_name, embedding, top_k, exclude_issue)
  chroma_manager.delete_issue(repo_name, issue_number)
  chroma_manager.reset_collection(repo_name)

`repo_name` is always "owner/repo" (e.g. "facebook/react").
"""
import logging
from typing import List, Dict, Any, Optional

import chromadb
from chromadb.config import Settings
import os

logger = logging.getLogger(__name__)

CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_db")


class ChromaManager:
    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = chromadb.PersistentClient(path=CHROMA_PATH)
        return self._client

    def _collection_name(self, repo_name: str) -> str:
        """Convert 'owner/repo' → safe ChromaDB collection name."""
        safe = repo_name.lower().replace("/", "_").replace("-", "_").replace(".", "_")
        # ChromaDB collection names must be 3–63 chars, alphanumeric + underscore
        return f"repo_{safe}"[:63]

    def _get_collection(self, repo_name: str):
        client = self._get_client()
        name = self._collection_name(repo_name)
        return client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )

    # ──────────────────────────────────────────────────────────────────────────
    # Public API
    # ──────────────────────────────────────────────────────────────────────────

    def add_issue(
        self,
        repo_name: str,
        issue_number: int,
        title: str,
        body: str,
        embedding: List[float],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Upsert a single issue into the repo's ChromaDB collection."""
        collection = self._get_collection(repo_name)
        doc_id = str(issue_number)
        meta = metadata or {}
        meta.update({"title": title, "number": issue_number})
        collection.upsert(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[f"{title}\n{body or ''}"],
            metadatas=[meta],
        )

    def find_similar_issues(
        self,
        repo_name: str,
        embedding: List[float],
        top_k: int = 5,
        exclude_issue: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Return up to top_k similar issues (excluding exclude_issue).
        Each result: {"number": int, "title": str, "similarity": float, "state": str}
        """
        collection = self._get_collection(repo_name)
        if collection.count() == 0:
            return []

        # Fetch a few extra so we can drop the excluded one
        n = min(top_k + 1, collection.count())
        results = collection.query(
            query_embeddings=[embedding],
            n_results=n,
            include=["metadatas", "distances"],
        )

        similar = []
        ids = results.get("ids", [[]])[0]
        metadatas = results.get("metadatas", [[]])[0]
        distances = results.get("distances", [[]])[0]

        for doc_id, meta, dist in zip(ids, metadatas, distances):
            number = int(doc_id)
            if exclude_issue is not None and number == exclude_issue:
                continue
            # cosine distance → similarity  (distance 0 = identical)
            similarity = round(max(0.0, 1.0 - dist), 4)
            similar.append({
                "number": number,
                "title": meta.get("title", ""),
                "similarity": similarity,
                "state": meta.get("state", "open"),
            })
            if len(similar) >= top_k:
                break

        return similar

    def delete_issue(self, repo_name: str, issue_number: int) -> None:
        """Remove a single issue from the collection (best-effort)."""
        try:
            collection = self._get_collection(repo_name)
            collection.delete(ids=[str(issue_number)])
        except Exception as e:
            logger.warning(f"ChromaDB delete_issue failed for {repo_name}#{issue_number}: {e}")

    def reset_collection(self, repo_name: str) -> None:
        """Delete and recreate the collection for a repo (used when deleting a repo)."""
        try:
            client = self._get_client()
            name = self._collection_name(repo_name)
            client.delete_collection(name)
            logger.info(f"Deleted ChromaDB collection: {name}")
        except Exception as e:
            logger.warning(f"ChromaDB reset_collection failed for {repo_name}: {e}")


# Singleton instance
chroma_manager = ChromaManager()

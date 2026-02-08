# app/vector/chroma_client.py

import chromadb
from chromadb.config import Settings
from typing import Dict, List


class ChromaStore:
    def __init__(self):
        self.client = chromadb.Client(
            Settings(
                persist_directory="./chroma",
                anonymized_telemetry=False,
            )
        )

    def _get_collection_name(self, owner: str, repo: str) -> str:
        """
        Generate a unique collection name for a repository.
        Format: repo_owner_reponame (sanitized)
        """
        # Sanitize to create valid collection name
        collection_name = f"repo_{owner}_{repo}".lower()
        # Replace any invalid characters
        collection_name = collection_name.replace("/", "_").replace("-", "_").replace(".", "_")
        return collection_name

    def get_repo_collection(self, owner: str, repo: str):
        """
        Get or create a collection for a specific repository.
        Each repository has its own isolated collection.
        """
        collection_name = self._get_collection_name(owner, repo)
        return self.client.get_or_create_collection(name=collection_name)

    def add_issue(self, owner: str, repo: str, issue_id: str, embedding: List[float], metadata: Dict):
        """
        Add an issue to the repository-specific collection.
        
        Args:
            owner: Repository owner
            repo: Repository name
            issue_id: Unique issue identifier
            embedding: Vector embedding
            metadata: Issue metadata (title, body, number, etc.)
        """
        collection = self.get_repo_collection(owner, repo)
        collection.upsert(
            ids=[issue_id],
            embeddings=[embedding],
            metadatas=[metadata],
            documents=[f"{metadata.get('title', '')}\n{metadata.get('body', '')}"],
        )

    def query(self, owner: str, repo: str, embedding: List[float], limit: int = 6):
        """
        Query similar issues within the same repository only.
        
        Args:
            owner: Repository owner
            repo: Repository name
            embedding: Query vector
            limit: Maximum number of results
        """
        collection = self.get_repo_collection(owner, repo)
        return collection.query(
            query_embeddings=[embedding],
            n_results=limit,
            include=["embeddings", "metadatas"],
        )

    def issue_exists(self, owner: str, repo: str, issue_id: str) -> bool:
        """
        Check if an issue exists in the repository collection.
        """
        try:
            collection = self.get_repo_collection(owner, repo)
            res = collection.get(ids=[issue_id])
            return len(res["ids"]) > 0
        except Exception:
            return False

    def count(self, owner: str, repo: str) -> int:
        """
        Count issues in a specific repository collection.
        """
        collection = self.get_repo_collection(owner, repo)
        return collection.count()

    def query_similar(self, owner: str, repo: str, text: str, limit: int = 5):
        """
        Query similar issues by text within the same repository.
        """
        from app.vector.embeddings import EmbeddingService
        embedding_service = EmbeddingService()
        embedding = embedding_service.embed_text(text)
        return self.query(owner, repo, embedding, limit)

    def list_collections(self) -> List[str]:
        """
        List all repository collections.
        Useful for debugging and migration.
        """
        collections = self.client.list_collections()
        return [col.name for col in collections]


# ✅ SINGLE shared instance (this is what everyone imports)
chroma = ChromaStore()

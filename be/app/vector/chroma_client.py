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

        self.collection = self.client.get_or_create_collection(
            name="github_issues"
        )

    def add_issue(self, issue_id: str, embedding: List[float], metadata: Dict):
        self.collection.upsert(
            ids=[issue_id],
            embeddings=[embedding],
            metadatas=[metadata],
            documents=[f"{metadata.get('title', '')}\n{metadata.get('body', '')}"],
        )

    def query(self, embedding: List[float], limit: int = 6):
        return self.collection.query(
            query_embeddings=[embedding],
            n_results=limit,
            include=["embeddings", "metadatas"],
        )

    def issue_exists(self, issue_id: str) -> bool:
        try:
            res = self.collection.get(ids=[issue_id])
            return len(res["ids"]) > 0
        except Exception:
            return False

    def count(self):
        return self.collection.count()

    def query_similar(self, text: str, limit: int = 5):
        from app.vector.embeddings import EmbeddingService
        embedding_service = EmbeddingService()
        embedding = embedding_service.embed_text(text)
        return self.query(embedding, limit)

# ✅ SINGLE shared instance (this is what everyone imports)
chroma = ChromaStore()

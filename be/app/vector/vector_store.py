from typing import Dict, Any, List
from app.vector.chroma_client import chroma


def store(
    issue_id: str,
    embedding: List[float],
    document: str,
    metadata: Dict[str, Any],
):
    """
    Store or update an issue in Chroma
    """
    chroma.collection.upsert(
        ids=[issue_id],
        embeddings=[embedding],
        documents=[document],
        metadatas=[metadata],
    )


def search(
    embedding: List[float],
    limit: int = 5,
):
    """
    Search similar issues in Chroma using cosine similarity
    """
    return chroma.collection.query(
        query_embeddings=[embedding],
        n_results=limit,
    )

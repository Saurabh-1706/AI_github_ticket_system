<<<<<<< HEAD
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
=======
from app.vector.chroma_client import collection

def store(issue_id, embedding, document, metadata):
    collection.upsert(
        ids=[str(issue_id)],
        embeddings=[embedding],
        documents=[document],
        metadatas=[metadata]
    )

def search(embedding, limit=5):
    return collection.query(query_embeddings=[embedding], n_results=limit)
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822

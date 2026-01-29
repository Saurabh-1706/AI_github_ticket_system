from fastapi import APIRouter
from app.vector.chroma_client import chroma_client

router = APIRouter(prefix="/api/vector", tags=["Vector"])


@router.get("/debug")
def vector_debug():
    collection = chroma_client.collection

    sample = collection.get(limit=1)

    return {
        "status": "ok",
        "total_vectors": collection.count(),
        "embedding_dim": chroma_client.embedding_dim,
        "collection_name": collection.name,
        "sample_metadata": sample["metadatas"][0] if sample["metadatas"] else None
    }

from fastapi import APIRouter
<<<<<<< HEAD
from app.vector.chroma_client import chroma

router = APIRouter(tags=["Vector"])

@router.post("/search")
def vector_search(payload: dict):
    text = payload.get("text", "")
    results = chroma.query_similar(text, limit=5)
    return results
=======
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
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822

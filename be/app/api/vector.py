from fastapi import APIRouter
from app.vector.chroma_client import chroma

router = APIRouter(tags=["Vector"])

@router.post("/search")
def vector_search(payload: dict):
    text = payload.get("text", "")
    results = chroma.query_similar(text, limit=5)
    return results

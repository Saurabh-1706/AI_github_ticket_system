from fastapi import APIRouter
from app.core.similarity import cosine

router = APIRouter()

@router.post("/")
def check(vectors: dict):
    return {"similarity": cosine(vectors["v1"], vectors["v2"])}

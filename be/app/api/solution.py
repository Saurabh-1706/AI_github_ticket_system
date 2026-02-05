from fastapi import APIRouter
from app.core.solution_reuse_advisor import suggest_solution_reuse

router = APIRouter()

@router.post("/reuse")
def reuse_solution(payload: dict):
    similar_issue = payload.get("similar_issue")
    if not similar_issue:
        return {"error": "No similar issue provided"}

    return suggest_solution_reuse(similar_issue)

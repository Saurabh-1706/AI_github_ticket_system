from fastapi import APIRouter
from app.core.solution_generator import generate

router = APIRouter()

@router.post("/")
def solve(issue: dict):
    return generate(issue)

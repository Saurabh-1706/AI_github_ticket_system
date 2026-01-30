from fastapi import APIRouter
from app.core.issue_analyzer import analyze

router = APIRouter()

@router.post("/")
def analyze_issue(issue: dict):
    return analyze(issue["title"], issue.get("body",""))

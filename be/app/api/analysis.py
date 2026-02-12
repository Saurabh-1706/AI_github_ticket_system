from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(tags=["Analysis"])


from typing import Optional, Union

class AnalysisRequest(BaseModel):
    id: Union[int, str]  # Accept both int and str since GitHub IDs can be either
    title: str
    body: Optional[str] = ""  # Make body optional with default empty string
    owner: str  # Repository owner
    repo: str   # Repository name


@router.post("/analyze")
def analyze_issue(req: AnalysisRequest):
    """
    Analyze a single issue and find similar issues within the same repository.
    
    Args:
        req: Issue data including owner, repo, id, title, and body
    """
    from app.api.github import analyze_single_issue

    result = analyze_single_issue(
        owner=req.owner,
        repo=req.repo,
        issue={
            "id": req.id,
            "title": req.title,
            "body": req.body
        }
    )
    
    return result

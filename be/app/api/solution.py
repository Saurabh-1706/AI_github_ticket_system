"""
Solution API router.
POST /api/solution/generate — Generate (or retrieve cached) GPT-4o-mini solution for an issue.
POST /api/solution/reuse   — Suggest solution reuse (existing).
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.ai.gpt_solution_generator import generate_with_gpt
from app.db.mongo import solutions
from app.core.solution_reuse_advisor import suggest_solution_reuse

logger = logging.getLogger(__name__)
router = APIRouter()


# ─────────────────────────────────────────
# Request / Response models
# ─────────────────────────────────────────

class GenerateSolutionRequest(BaseModel):
    issue_id: str
    title: str
    body: str
    owner: str
    repo: str


# ─────────────────────────────────────────
# POST /api/solution/generate
# ─────────────────────────────────────────

@router.post("/generate")
async def generate_solution(payload: GenerateSolutionRequest):
    """
    Generate an AI solution for a GitHub issue using GPT-4o-mini.
    Returns a cached result if one already exists for this issue_id.
    Saves the result to MongoDB for future reuse / recommendation.
    """
    try:
        # ── 1. Check MongoDB cache ──────────────────────────────────────────
        existing = await solutions.find_one(
            {"issue_id": payload.issue_id},
            {"_id": 0}
        )
        if existing:
            logger.info(f"✅ Returning cached solution for issue {payload.issue_id}")
            return {"cached": True, "solution": existing}

        # ── 2. Generate via GPT-4o-mini ─────────────────────────────────────
        logger.info(f"🤖 Generating GPT solution for issue {payload.issue_id}...")
        solution = generate_with_gpt(
            issue_id=payload.issue_id,
            title=payload.title,
            body=payload.body,
            owner=payload.owner,
            repo=payload.repo,
        )

        # ── 3. Enrich with metadata and persist ─────────────────────────────
        solution["owner"] = payload.owner
        solution["repo"] = payload.repo
        solution["issue_title"] = payload.title
        solution["created_at"] = datetime.now(timezone.utc).isoformat()

        await solutions.insert_one({**solution})

        logger.info(f"✅ Solution saved to MongoDB for issue {payload.issue_id}")
        return {"cached": False, "solution": solution}

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"❌ Solution generation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Solution generation failed: {str(e)}")


# ─────────────────────────────────────────
# POST /api/solution/reuse (existing)
# ─────────────────────────────────────────

@router.post("/reuse")
def reuse_solution(payload: dict):
    similar_issue = payload.get("similar_issue")
    if not similar_issue:
        return {"error": "No similar issue provided"}
    return suggest_solution_reuse(similar_issue)

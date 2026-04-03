"""
Solution API router.
POST /api/solution/generate — Generate (or retrieve cached) GPT-4o-mini solution for an issue.
                              Automatically fetches relevant source code from GitHub for context.
GET  /api/solution/check/{issue_id} — Return cached solution (full data).
POST /api/solution/reuse   — Suggest solution reuse (existing).
"""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.ai.gpt_solution_generator import generate_with_gpt, generate_with_code_context
from app.db.mongo import solutions
from app.core.solution_reuse_advisor import suggest_solution_reuse

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _solution_fields(doc: dict) -> dict:
    """Extract the solution fields we expose via API."""
    return {
        "summary": doc.get("summary"),
        "is_code_fix": doc.get("is_code_fix", False),
        "steps": doc.get("steps", []),
        # New precise-diff fields
        "file_path": doc.get("file_path", ""),
        "code_before": doc.get("code_before", ""),
        "code_after": doc.get("code_after", ""),
        # Whether file_path was confirmed from real indexed source files
        "path_confirmed": doc.get("path_confirmed", False),
        # Legacy / fallback
        "code": doc.get("code", ""),
        "code_language": doc.get("code_language", ""),
        "code_explanation": doc.get("code_explanation", ""),
    }


# ─────────────────────────────────────────
# GET /api/solution/check/{issue_id}
# ─────────────────────────────────────────

@router.get("/check/{issue_id}")
async def check_solution_exists(issue_id: str):
    """
    Check whether a cached solution exists for this issue_id.
    Returns the full solution data if found, so the frontend can display it immediately.
    """
    existing = await solutions.find_one({"issue_id": issue_id}, {"_id": 0})
    if existing:
        return {
            "exists": True,
            "issue_id": issue_id,
            "solution": _solution_fields(existing),
        }
    return {"exists": False, "issue_id": issue_id, "solution": None}


# ─────────────────────────────────────────
# Request / Response models
# ─────────────────────────────────────────

class GenerateSolutionRequest(BaseModel):
    issue_id: str
    title: str
    body: str
    owner: str
    repo: str
    user_token: str | None = None   # optional GitHub OAuth token for private repos


# ─────────────────────────────────────────
# POST /api/solution/generate
# ─────────────────────────────────────────

@router.post("/generate")
async def generate_solution(payload: GenerateSolutionRequest):
    """
    Generate an AI solution for a GitHub issue using GPT-4o-mini.
    1. Returns a cached result if one already exists.
    2. Otherwise: searches the repo for relevant source files, feeds them to GPT,
       and saves the result (with file_path / code_before / code_after) to MongoDB.
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

        # ── 2. Fetch relevant source-code context ───────────────────────────
        code_chunks: list[dict] = []
        try:
            # Priority 1: Semantic vector search over the code index (fastest + most accurate)
            from app.services.code_indexer import search_code, is_indexed
            if is_indexed(payload.owner, payload.repo):
                query = f"{payload.title}\n{(payload.body or '')[:400]}"
                raw_chunks = search_code(payload.owner, payload.repo, query, top_k=3)
                code_chunks = [{"path": c["path"], "content": c["content"]} for c in raw_chunks]
                if code_chunks:
                    logger.info(
                        f"🔎 Vector code search: {[c['path'] for c in code_chunks]} "
                        f"for issue {payload.issue_id}"
                    )

            # Priority 2: GitHub keyword search (fallback when no index exists)
            if not code_chunks:
                from app.services.github_code_search import get_code_context
                code_chunks = get_code_context(
                    owner=payload.owner,
                    repo=payload.repo,
                    issue_title=payload.title,
                    issue_body=payload.body or "",
                    token=payload.user_token,
                )
                if code_chunks:
                    logger.info(
                        f"📂 Keyword code search fallback: {[c['path'] for c in code_chunks]} "
                        f"for issue {payload.issue_id}"
                    )
        except Exception as e:
            logger.warning(f"Code context fetch failed (proceeding without): {e}")


        # ── 3. Generate via GPT-4o-mini ─────────────────────────────────────
        logger.info(f"🤖 Generating GPT solution for issue {payload.issue_id}...")
        solution = generate_with_code_context(
            issue_id=payload.issue_id,
            title=payload.title,
            body=payload.body,
            owner=payload.owner,
            repo=payload.repo,
            code_chunks=code_chunks,
        )

        # ── 4. Enrich with metadata and persist ─────────────────────────────
        solution["owner"] = payload.owner
        solution["repo"] = payload.repo
        solution["issue_title"] = payload.title
        solution["created_at"] = datetime.now(timezone.utc).isoformat()
        solution["had_code_context"] = bool(code_chunks)

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
async def reuse_solution(payload: dict):
    """Suggest solution reuse based on a similar issue."""
    similar_issue = payload.get("similar_issue")
    if not similar_issue:
        return {"error": "No similar issue provided"}
    return suggest_solution_reuse(similar_issue)



# ─────────────────────────────────────────
# DELETE /api/solution/{issue_id}
# ─────────────────────────────────────────

@router.delete("/{issue_id}")
async def delete_solution(issue_id: str):
    """
    Delete the cached GPT solution for an issue so it can be regenerated
    with fresh code context. Called by the frontend 'Regenerate' button.
    """
    result = await solutions.delete_one({"issue_id": issue_id})
    if result.deleted_count == 0:
        return {"deleted": False, "message": "No cached solution found for this issue"}
    logger.info(f"🗑️  Deleted cached solution for issue {issue_id}")
    return {"deleted": True, "issue_id": issue_id}

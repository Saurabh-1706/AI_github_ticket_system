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
from app.ai.gpt_solution_generator import (
    generate_with_gpt,
    generate_with_code_context,
    generate_with_rag_context,
)
from app.db.mongo import solutions
from app.core.solution_reuse_advisor import suggest_solution_reuse

logger = logging.getLogger(__name__)
router = APIRouter()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _solution_fields(doc: dict) -> dict:
    """Extract the solution fields we expose via API."""
    return {
        "summary": doc.get("summary"),
        "similar_issues_summary": doc.get("similar_issues_summary", ""),
        "is_code_fix": doc.get("is_code_fix", False),
        "steps": doc.get("steps", []),
        # New precise-diff fields
        "file_path": doc.get("file_path", ""),
        "code_before": doc.get("code_before", ""),
        "code_after": doc.get("code_after", ""),
        # Whether file_path was confirmed from real indexed source files
        "path_confirmed": doc.get("path_confirmed", False),
        # RAG metadata
        "rag_used": doc.get("rag_used", False),
        "similar_issues_count": doc.get("similar_issues_count", 0),
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
# RAG helper — Step 7
# ─────────────────────────────────────────

async def _fetch_similar_issues_with_solutions(
    owner: str,
    repo: str,
    title: str,
    body: str,
    exclude_issue_id: str,
    limit: int = 4,
) -> list[dict]:
    """
    RAG retrieval step:
    1. Embed the current issue and query Chroma for semantically similar issues
       within the same repository.
    2. For each similar issue found, look up its stored GPT solution in MongoDB.
    3. Return a list ready to be injected into the RAG prompt.
    """
    similar: list[dict] = []
    try:
        import math
        from app.vector.embeddings import EmbeddingService
        from app.vector.chroma_client import chroma

        embedding_service = EmbeddingService()
        query_text = f"{title}\n{(body or '')[:500]}"
        embedding = embedding_service.embed_text(query_text)

        results = chroma.query(owner, repo, embedding, limit=limit + 1)  # +1 to allow self-filter

        ids: list[str] = results.get("ids", [[]])[0]
        metadatas: list[dict] = results.get("metadatas", [[]])[0]
        embeddings_list = results.get("embeddings", [[]])[0]

        def magnitude(v):
            return math.sqrt(sum(x * x for x in v))

        def dot_product(v1, v2):
            return sum(x * y for x, y in zip(v1, v2))

        query_norm = magnitude(embedding)

        for i, (issue_id, meta) in enumerate(zip(ids, metadatas)):
            if issue_id == exclude_issue_id:
                continue  # skip self

            # Cosine similarity in pure Python
            sim_vec = embeddings_list[i]
            sim_norm = magnitude(sim_vec)
            if query_norm > 0 and sim_norm > 0:
                cos_sim = dot_product(embedding, sim_vec) / (query_norm * sim_norm + 1e-9)
            else:
                cos_sim = 0.0

            if cos_sim < 0.55:  # discard low-relevance results
                continue

            # Look up cached GPT solution for this similar issue
            past_solution = await solutions.find_one(
                {"issue_id": issue_id},
                {"summary": 1, "steps": 1, "_id": 0}
            )

            similar.append({
                "number": meta.get("number"),
                "title": meta.get("title", ""),
                "body": meta.get("body", ""),
                "similarity": round(cos_sim, 4),
                "solution_summary": past_solution.get("summary", "") if past_solution else "",
                "solution_steps": past_solution.get("steps", []) if past_solution else [],
            })

            if len(similar) >= limit:
                break

    except Exception as e:
        logger.warning(f"RAG retrieval failed (will proceed without): {e}")

    return similar


# ─────────────────────────────────────────
# POST /api/solution/generate
# ─────────────────────────────────────────

@router.post("/generate")
async def generate_solution(payload: GenerateSolutionRequest):
    """
    Generate an AI solution for a GitHub issue using GPT-4o-mini with full RAG.

    Pipeline:
      1. Return cached solution if one already exists.
      2. Fetch relevant source-code context (vector index → keyword fallback).
      3. RAG Step 7: retrieve semantically similar issues from Chroma and look
         up their past solutions from MongoDB.
      4. Call GPT with: current issue + similar issues + their solutions + source code.
      5. Persist the enriched solution to MongoDB.
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

        # ── 3. RAG Step 7: retrieve similar issues + their past solutions ────
        similar_issues = await _fetch_similar_issues_with_solutions(
            owner=payload.owner,
            repo=payload.repo,
            title=payload.title,
            body=payload.body or "",
            exclude_issue_id=payload.issue_id,
        )
        if similar_issues:
            logger.info(
                f"🧠 RAG: {len(similar_issues)} similar issue(s) retrieved "
                f"for issue {payload.issue_id}"
            )

        # ── 4. Generate via GPT with full RAG context ───────────────────────
        logger.info(f"🤖 Generating RAG solution for issue {payload.issue_id}...")
        solution = generate_with_rag_context(
            issue_id=payload.issue_id,
            title=payload.title,
            body=payload.body,
            owner=payload.owner,
            repo=payload.repo,
            similar_issues=similar_issues,
            code_chunks=code_chunks,
        )

        # ── 5. Enrich with metadata and persist ─────────────────────────────
        solution["owner"] = payload.owner
        solution["repo"] = payload.repo
        solution["issue_title"] = payload.title
        solution["created_at"] = datetime.now(timezone.utc).isoformat()
        solution["had_code_context"] = bool(code_chunks)

        await solutions.insert_one({**solution})

        logger.info(f"✅ RAG solution saved to MongoDB for issue {payload.issue_id}")
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

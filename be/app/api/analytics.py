"""
Analytics API — aggregates issue data from MongoDB for dashboard charts.

GET /api/analytics/summary?owner=&repo=
GET /api/analytics/global
"""

import logging
from typing import Optional

from fastapi import APIRouter, Query, HTTPException
from app.db.mongo import cached_repositories, cached_issues

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


@router.get("/summary")
async def get_analytics_summary(
    owner: str = Query(..., description="Repository owner"),
    repo: str = Query(..., description="Repository name"),
):
    """
    Return aggregated analytics for a repository:
      - Issue breakdown by type (bug, feature, docs, etc.)
      - Issues opened per week (last 12 weeks)
      - Duplicate rate
      - Criticality distribution
    """
    try:
        # Find repository
        repo_doc = await cached_repositories.find_one({"owner": owner, "name": repo})
        if not repo_doc:
            raise HTTPException(status_code=404, detail="Repository not found in cache")

        repo_id = repo_doc["_id"]

        # ── 1. Type breakdown ────────────────────────────────────────────────
        type_pipeline = [
            {"$match": {"repository_id": repo_id}},
            {"$group": {"_id": "$ai_analysis.type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        type_cursor = cached_issues.aggregate(type_pipeline)
        by_type = {
            (doc["_id"] or "unknown"): doc["count"]
            async for doc in type_cursor
        }

        # ── 2. Issues opened per week (last 12 weeks) ────────────────────────
        week_pipeline = [
            {"$match": {"repository_id": repo_id, "created_at": {"$exists": True}}},
            {
                "$group": {
                    "_id": {
                        "year": {"$isoWeekYear": "$created_at"},
                        "week": {"$isoWeek": "$created_at"},
                    },
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"_id.year": 1, "_id.week": 1}},
            {"$limit": 12}
        ]
        week_cursor = cached_issues.aggregate(week_pipeline)
        by_week = [
            {
                "label": f"W{doc['_id']['week']}/{doc['_id']['year']}",
                "count": doc["count"]
            }
            async for doc in week_cursor
        ]

        # ── 3. Criticality distribution ──────────────────────────────────────
        crit_pipeline = [
            {"$match": {"repository_id": repo_id}},
            {"$group": {"_id": "$ai_analysis.criticality", "count": {"$sum": 1}}},
        ]
        crit_cursor = cached_issues.aggregate(crit_pipeline)
        by_criticality = {
            (doc["_id"] or "unknown"): doc["count"]
            async for doc in crit_cursor
        }

        # ── 4. Duplicate rate ────────────────────────────────────────────────
        total = await cached_issues.count_documents({"repository_id": repo_id})
        duplicate_count = await cached_issues.count_documents({
            "repository_id": repo_id,
            "duplicate_info.classification": "duplicate"
        })
        duplicate_rate = round(duplicate_count / total * 100, 1) if total > 0 else 0

        # ── 5. State breakdown (open / closed) ──────────────────────────────
        open_count = await cached_issues.count_documents({"repository_id": repo_id, "state": "open"})
        closed_count = await cached_issues.count_documents({"repository_id": repo_id, "state": "closed"})

        return {
            "total_issues": total,
            "by_type": by_type,
            "by_week": by_week,
            "by_criticality": by_criticality,
            "duplicate_rate": duplicate_rate,
            "state": {"open": open_count, "closed": closed_count}
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Analytics error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/global")
async def get_global_analytics(
    state: Optional[str] = None,
    issue_type: Optional[str] = None,
    criticality: Optional[str] = None,
    limit: int = 50,
):
    """
    Aggregate issue counts and a sampled feed across ALL cached repositories.
    Uses a single $lookup aggregation to avoid N+1 repo queries.
    Optional filters: state, type, criticality.
    """
    try:
        match: dict = {}
        if state:
            match["state"] = state
        if issue_type:
            match["ai_analysis.type"] = issue_type
        if criticality:
            match["ai_analysis.criticality"] = criticality

        total = await cached_issues.count_documents(match)

        # Per-repo counts + enrichment via $lookup (single aggregation — no N+1)
        repo_pipeline = [
            {"$match": match},
            {"$group": {"_id": "$repository_id", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {
                "$lookup": {
                    "from": "cached_repositories",
                    "localField": "_id",
                    "foreignField": "_id",
                    "as": "repo_info",
                }
            },
            {"$unwind": {"path": "$repo_info", "preserveNullAndEmptyArrays": True}},
        ]
        repo_counts = []
        async for entry in cached_issues.aggregate(repo_pipeline):
            ri = entry.get("repo_info") or {}
            repo_counts.append({
                "owner": ri.get("owner", ""),
                "repo": ri.get("name", ""),
                "full_name": ri.get("full_name", ""),
                "count": entry["count"],
            })

        # Recent issues feed — also enriched via $lookup (no N+1)
        feed_pipeline = [
            {"$match": match},
            {"$sort": {"created_at": -1}},
            {"$limit": limit},
            {
                "$lookup": {
                    "from": "cached_repositories",
                    "localField": "repository_id",
                    "foreignField": "_id",
                    "as": "repo_info",
                }
            },
            {"$unwind": {"path": "$repo_info", "preserveNullAndEmptyArrays": True}},
            {
                "$project": {
                    "number": 1, "title": 1, "state": 1,
                    "ai_analysis": 1, "created_at": 1,
                    "owner": "$repo_info.owner",
                    "repo": "$repo_info.name",
                }
            },
        ]
        issues = [
            {
                "number": doc.get("number"),
                "title": doc.get("title"),
                "state": doc.get("state"),
                "owner": doc.get("owner", ""),
                "repo": doc.get("repo", ""),
                "type": (doc.get("ai_analysis") or {}).get("type"),
                "criticality": (doc.get("ai_analysis") or {}).get("criticality"),
                "created_at": doc.get("created_at"),
            }
            async for doc in cached_issues.aggregate(feed_pipeline)
        ]

        # Global type breakdown
        type_pipeline = [
            {"$match": match},
            {"$group": {"_id": "$ai_analysis.type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
        ]
        by_type = {
            (doc["_id"] or "unknown"): doc["count"]
            async for doc in cached_issues.aggregate(type_pipeline)
        }

        return {
            "total": total,
            "by_repo": repo_counts,
            "by_type": by_type,
            "issues": issues,
        }

    except Exception as e:
        logger.error(f"Global analytics error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

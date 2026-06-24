"""
AI Features API — label suggestions, priority scoring, release notes, assignee suggestions,
risk assessment reports, and similar-issue lookup.

Routes:
  POST /api/ai/suggest-labels
  GET  /api/ai/priority-score/{owner}/{repo}/{issue_number}
  GET  /api/ai/similar-issues/{owner}/{repo}/{issue_number}
  GET  /api/ai/milestones/{owner}/{repo}
  POST /api/ai/release-notes
  GET  /api/ai/suggest-assignees/{owner}/{repo}/{issue_number}
  GET  /api/ai/risk-report/{owner}/{repo}
"""

import json
import logging
import os
import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException, Query
from openai import AsyncOpenAI
from pydantic import BaseModel

from app.db.mongo import cached_repositories, cached_issues
from app.utils.github_fetcher import github_fetcher

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ai", tags=["AI Features"])

client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ── Label keyword rules (free, no API call) ───────────────────────────────────
LABEL_RULES: dict[str, list[str]] = {
    "bug": ["bug", "error", "crash", "fail", "broken", "exception", "traceback", "regression"],
    "enhancement": ["feature", "enhancement", "improve", "add support", "implement", "proposal"],
    "documentation": ["docs", "documentation", "readme", "guide", "tutorial", "typo", "comment"],
    "security": ["security", "vulnerability", "exploit", "xss", "csrf", "cve", "injection", "auth"],
    "performance": ["performance", "slow", "speed", "memory", "cpu", "latency", "optimize"],
    "question": ["question", "how to", "how do i", "is it possible", "clarification"],
    "good first issue": ["good first issue", "beginner", "easy", "starter"],
    "help wanted": ["help wanted", "need help", "assistance", "contribution"],
    "duplicate": ["duplicate", "already reported", "same issue", "related to #"],
    "wontfix": ["wont fix", "won't fix", "by design", "expected behavior"],
}

# ── Priority scoring weights ──────────────────────────────────────────────────
CRITICALITY_SCORE: dict[str, int] = {"critical": 40, "high": 25, "medium": 10, "low": 5}
TYPE_BONUS: dict[str, int] = {"security": 20, "bug": 10, "performance": 8, "feature": 4, "question": 1}
PRIORITY_LABELS = [
    (80, "P0 Critical", "🔴"),
    (55, "P1 High",     "🟠"),
    (30, "P2 Medium",   "🟡"),
    (0,  "P3 Low",      "🟢"),
]

# ── Common stop-words for keyword extraction ──────────────────────────────────
_STOP = {
    "the", "a", "an", "is", "in", "on", "at", "to", "for", "of", "and", "or", "but", "with",
    "this", "that", "it", "be", "as", "by", "from", "not", "are", "was", "were", "has",
    "have", "had", "when", "if", "can", "will", "does", "do", "how", "what", "which", "fix",
    "fixes", "error", "issue", "bug", "crash", "add", "use", "using", "make", "get",
    "set", "update", "remove", "change", "should", "need", "needs", "would",
}

# ── GPT system prompts ────────────────────────────────────────────────────────
RELEASE_NOTES_PROMPT = """You are a senior developer writing a GitHub release.
Given a list of closed issues from a milestone, produce structured release notes.

Categorize each issue into ONE of: Bug Fixes, Features, Improvements, Other.
Use the issue title to determine the category. Keep entries concise.

OUTPUT FORMAT — strict JSON, no extra text:
{
  "version": "<milestone title>",
  "summary": "One sentence summarizing the release.",
  "sections": {
    "Bug Fixes":    ["#12 Fixed crash on login", ...],
    "Features":     ["#34 Added dark mode", ...],
    "Improvements": ["#45 Faster load time", ...],
    "Other":        [...]
  },
  "raw_markdown": "Full markdown string ready to paste into a GitHub release"
}

Rules:
- Only include categories that have at least 1 entry (omit empty ones).
- raw_markdown must be a valid GitHub release body (## headings, - bullets, #number links).
- If no issues, set summary to "No closed issues in this milestone." and all sections empty.
"""

RISK_REPORT_PROMPT = """You are a senior engineering manager writing a Risk Assessment Report for a software project.
You have been given aggregated GitHub issue statistics for a repository.

Based on the data, produce a risk assessment report in strict JSON:
{
  "risk_score": <integer 0-100, overall project risk>,
  "risk_level": "Low" | "Medium" | "High" | "Critical",
  "executive_summary": "2-3 sentence plain-English summary of the project's health and risks.",
  "top_risks": [
    {
      "title": "Short risk title",
      "severity": "Low" | "Medium" | "High" | "Critical",
      "description": "What the risk is and why it matters",
      "mitigation": "Concrete action to mitigate this risk"
    }
  ],
  "recommendations": [
    "Actionable recommendation 1",
    "Actionable recommendation 2"
  ],
  "risk_areas": {
    "code_quality": <0-100>,
    "security": <0-100>,
    "technical_debt": <0-100>,
    "team_velocity": <0-100>,
    "reliability": <0-100>
  }
}

Rules:
- top_risks: include 3-5 most significant risks only.
- recommendations: 3-5 actionable items a team can act on immediately.
- risk_areas scores: 0 = no risk, 100 = extreme risk.
- Base everything strictly on the provided data — do not invent facts.
- Return ONLY valid JSON, no explanation, no markdown fences.
"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def rule_based_labels(title: str, body: str) -> list[str]:
    """Return up to 5 labels matched by keyword rules (no API call)."""
    text = (title + " " + body).lower()
    matched = []
    for label, keywords in LABEL_RULES.items():
        if any(kw in text for kw in keywords):
            matched.append(label)
    return matched[:5]


def _keywords(title: str, body: str, n: int = 4) -> list[str]:
    """Extract meaningful keywords from issue title + first 200 chars of body."""
    text = (title + " " + (body or "")[:200]).lower()
    words = [w.strip(".,!?:;\"'()[]{}") for w in text.split()]
    seen: set[str] = set()
    kws: list[str] = []
    for w in words:
        if len(w) > 3 and w not in _STOP and w not in seen and w.isalpha():
            kws.append(w)
            seen.add(w)
        if len(kws) >= n:
            break
    return kws


def _gh_headers(user_token: str | None = None) -> dict:
    """Build GitHub API headers, optionally injecting a user OAuth token."""
    h = github_fetcher.headers.copy()
    if user_token:
        h["Authorization"] = f"Bearer {user_token}"
    return h


# ── Label Suggestion ──────────────────────────────────────────────────────────

class LabelRequest(BaseModel):
    owner: str
    repo: str
    issue_number: int
    title: str
    body: Optional[str] = ""


@router.post("/suggest-labels")
async def suggest_labels(req: LabelRequest):
    """
    Suggest GitHub labels for an issue using:
    1. Rule-based keyword matching (instant, free)
    2. OpenAI refinement if OPENAI_API_KEY is set
    """
    rule_labels = rule_based_labels(req.title, req.body or "")

    ai_labels: list[str] = []
    if os.getenv("OPENAI_API_KEY"):
        try:
            prompt = (
                "You are a GitHub project maintainer. Given the following issue, "
                "suggest up to 5 appropriate GitHub labels. Respond ONLY with a "
                "comma-separated list of label names, no explanation.\n\n"
                f"Title: {req.title}\n"
                f"Body: {(req.body or '')[:600]}"
            )
            resp = await client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=60,
                temperature=0.3,
            )
            raw = resp.choices[0].message.content or ""
            ai_labels = [lbl.strip().lower() for lbl in raw.split(",") if lbl.strip()][:5]
        except Exception as e:
            logger.warning(f"OpenAI label suggestion failed: {e}")

    merged: list[str] = []
    seen: set[str] = set()
    for lbl in ai_labels + rule_labels:
        if lbl and lbl not in seen:
            merged.append(lbl)
            seen.add(lbl)
        if len(merged) >= 5:
            break

    return {"suggested_labels": merged, "source": "ai+rules" if ai_labels else "rules"}


# ── Similar Issues ────────────────────────────────────────────────────────────

@router.get("/similar-issues/{owner}/{repo}/{issue_number}")
async def get_similar_issues(owner: str, repo: str, issue_number: int):
    """
    Return similar issues for a given issue.
    Tries stored ai_analysis / duplicate_info first, then falls back to a live ChromaDB query.
    """
    repo_doc = await cached_repositories.find_one({"owner": owner, "name": repo})
    if not repo_doc:
        raise HTTPException(status_code=404, detail="Repository not found in cache")

    issue = await cached_issues.find_one({"repository_id": repo_doc["_id"], "number": issue_number})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found in cache")

    raw_similar = (
        issue.get("ai_analysis", {}).get("similar_issues")
        or issue.get("duplicate_info", {}).get("similar_issues")
        or []
    )

    if not raw_similar:
        try:
            from app.core.embedder import embedder
            from app.core.chroma_manager import chroma_manager
            embedding = embedder.embed_issue(issue.get("title", ""), issue.get("body", "") or "")
            raw_similar = await chroma_manager.find_similar_issues(
                repo_name=f"{owner}/{repo}",
                embedding=embedding,
                top_k=5,
                exclude_issue=issue_number,
            )
        except Exception as e:
            logger.warning(f"Live similarity fallback failed for #{issue_number}: {e}")
            raw_similar = []

    enriched = []
    for s in raw_similar:
        num = s.get("number") or s.get("issue_number")
        if num is None:
            continue
        try:
            num = int(num)
        except (TypeError, ValueError):
            continue
        full = await cached_issues.find_one({"repository_id": repo_doc["_id"], "number": num})
        enriched.append({
            "number": num,
            "title": (full or {}).get("title") or s.get("title", f"Issue #{num}"),
            "state": (full or {}).get("state", "open"),
            "similarity": round(float(s.get("similarity", 0)), 3),
        })

    enriched.sort(key=lambda x: x["similarity"], reverse=True)
    return {"similar_issues": enriched, "count": len(enriched)}


# ── Priority Score ─────────────────────────────────────────────────────────────

@router.get("/priority-score/{owner}/{repo}/{issue_number}")
async def get_priority_score(owner: str, repo: str, issue_number: int):
    """Return a 0-100 priority score based on criticality, type, reactions, comments, and age."""
    repo_doc = await cached_repositories.find_one({"owner": owner, "name": repo})
    if not repo_doc:
        raise HTTPException(status_code=404, detail="Repository not found in cache")

    issue = await cached_issues.find_one({"repository_id": repo_doc["_id"], "number": issue_number})
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found in cache")

    analysis = issue.get("ai_analysis", {})
    score = 0

    criticality = (analysis.get("criticality") or "low").lower()
    score += CRITICALITY_SCORE.get(criticality, 5)

    issue_type = (analysis.get("type") or "unknown").lower()
    score += TYPE_BONUS.get(issue_type, 0)

    reactions = issue.get("reactions", {})
    if isinstance(reactions, dict):
        reaction_total = sum(
            v for k, v in reactions.items() if k not in ("+1", "url") and isinstance(v, int)
        ) + reactions.get("+1", 0)
        score += min(reaction_total * 2, 20)

    comments = issue.get("comments", 0)
    score += min(comments, 15)

    if issue.get("state") == "open":
        created = issue.get("created_at")
        if created:
            now = datetime.utcnow()
            if hasattr(created, "tzinfo") and created.tzinfo is not None:
                created = created.replace(tzinfo=None)
            age_days = (now - created).days
            score += min(age_days // 3, 10)

    score = min(score, 100)

    label, emoji = "P3 Low", "🟢"
    for threshold, lbl, emj in PRIORITY_LABELS:
        if score >= threshold:
            label, emoji = lbl, emj
            break

    return {
        "score": score,
        "label": label,
        "emoji": emoji,
        "breakdown": {
            "criticality": CRITICALITY_SCORE.get(criticality, 5),
            "type_bonus": TYPE_BONUS.get(issue_type, 0),
            "reactions": min(reactions.get("+1", 0) * 2 if isinstance(reactions, dict) else 0, 20),
            "comments": min(comments, 15),
        },
    }


# ── Milestones ─────────────────────────────────────────────────────────────────

@router.get("/milestones/{owner}/{repo}")
async def get_milestones(owner: str, repo: str, user_token: Optional[str] = None):
    """Return all milestones (open and closed) for a GitHub repository."""
    url = f"https://api.github.com/repos/{owner}/{repo}/milestones"
    try:
        async with httpx.AsyncClient() as http:
            res = await http.get(url, headers=_gh_headers(user_token), params={"state": "all", "per_page": 50}, timeout=15)
        if res.status_code == 404:
            raise HTTPException(status_code=404, detail="Repository not found or no milestones")
        res.raise_for_status()
        milestones = [
            {
                "number": m["number"],
                "title": m["title"],
                "description": m.get("description") or "",
                "state": m["state"],
                "open_issues": m["open_issues"],
                "closed_issues": m["closed_issues"],
                "due_on": m.get("due_on"),
            }
            for m in res.json()
        ]
        return {"milestones": milestones, "count": len(milestones)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Release Notes ──────────────────────────────────────────────────────────────

class ReleaseNotesRequest(BaseModel):
    owner: str
    repo: str
    milestone_number: int
    user_token: Optional[str] = None


@router.post("/release-notes")
async def generate_release_notes(req: ReleaseNotesRequest):
    """
    Fetch all closed issues for a milestone and generate structured release notes via GPT.
    """
    async with httpx.AsyncClient() as http:
        # 1. Fetch milestone title
        ms_url = f"https://api.github.com/repos/{req.owner}/{req.repo}/milestones/{req.milestone_number}"
        ms_res = await http.get(ms_url, headers=_gh_headers(req.user_token), timeout=15)
        if ms_res.status_code != 200:
            raise HTTPException(status_code=404, detail="Milestone not found")
        milestone_title = ms_res.json().get("title", f"v{req.milestone_number}")

        # 2. Fetch closed issues in this milestone (paginated)
        issues: list[dict] = []
        page = 1
        while True:
            res = await http.get(
                f"https://api.github.com/repos/{req.owner}/{req.repo}/issues",
                headers=_gh_headers(req.user_token),
                params={"milestone": req.milestone_number, "state": "closed", "per_page": 100, "page": page},
                timeout=15,
            )
            if res.status_code != 200:
                break
            batch_raw = res.json()
            batch = [i for i in batch_raw if "pull_request" not in i]
            issues.extend(batch)
            if len(batch_raw) < 100:
                break
            page += 1

    if not issues:
        return {
            "version": milestone_title,
            "summary": "No closed issues in this milestone.",
            "sections": {},
            "raw_markdown": f"## {milestone_title}\n\nNo closed issues.",
        }

    issue_lines = "\n".join(
        f"#{i['number']}: {i['title']} [labels: {', '.join(lb['name'] for lb in i.get('labels', []))}]"
        for i in issues[:80]
    )
    user_msg = f"Milestone: {milestone_title}\n\nClosed issues:\n{issue_lines}"

    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": RELEASE_NOTES_PROMPT},
                {"role": "user",   "content": user_msg},
            ],
            temperature=0.3,
            max_tokens=1800,
            response_format={"type": "json_object"},
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        logger.error(f"Release notes GPT failed: {e}")
        raise HTTPException(status_code=500, detail=f"GPT generation failed: {e}")


# ── Suggest Assignees ──────────────────────────────────────────────────────────

@router.get("/suggest-assignees/{owner}/{repo}/{issue_number}")
async def suggest_assignees(owner: str, repo: str, issue_number: int, user_token: Optional[str] = None):
    """
    Suggest up to 3 GitHub users to assign to an issue based on who has committed
    to the files most closely related to the issue's keywords.
    """
    # 1. Read issue from cache if available
    repo_doc = await cached_repositories.find_one({"owner": owner, "name": repo})
    issue_doc = None
    if repo_doc:
        issue_doc = await cached_issues.find_one({"repository_id": repo_doc["_id"], "number": issue_number})

    async with httpx.AsyncClient() as http:
        if issue_doc:
            title = issue_doc.get("title", "")
            body  = issue_doc.get("body", "") or ""
        else:
            r = await http.get(
                f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}",
                headers=_gh_headers(user_token),
                timeout=15,
            )
            if r.status_code != 200:
                raise HTTPException(status_code=404, detail="Issue not found")
            d = r.json()
            title, body = d.get("title", ""), d.get("body", "") or ""

        keywords = _keywords(title, body)
        if not keywords:
            return {"assignees": [], "source": "no_keywords"}

        # 2. Search relevant files
        query = "+".join(keywords[:3]) + f"+repo:{owner}/{repo}"
        search_res = await http.get(
            "https://api.github.com/search/code",
            headers={**_gh_headers(user_token), "Accept": "application/vnd.github.v3+json"},
            params={"q": query, "per_page": 5},
            timeout=15,
        )

        file_paths: list[str] = []
        if search_res.status_code == 200:
            for item in search_res.json().get("items", []):
                fp = item.get("path", "")
                if fp:
                    file_paths.append(fp)

        if not file_paths:
            return {"assignees": [], "source": "no_relevant_files"}

        # 3. Fetch commit authors for each file
        author_counts: dict[str, dict] = {}
        for path in file_paths[:4]:
            commits_res = await http.get(
                f"https://api.github.com/repos/{owner}/{repo}/commits",
                headers=_gh_headers(user_token),
                params={"path": path, "per_page": 10},
                timeout=15,
            )
            if commits_res.status_code != 200:
                continue
            for c in commits_res.json():
                author = c.get("author")
                if not author:
                    continue
                login = author.get("login")
                if not login:
                    continue
                if login not in author_counts:
                    author_counts[login] = {
                        "login": login,
                        "avatar_url": author.get("avatar_url", ""),
                        "profile_url": f"https://github.com/{login}",
                        "commit_count": 0,
                    }
                author_counts[login]["commit_count"] += 1

    top = sorted(author_counts.values(), key=lambda x: x["commit_count"], reverse=True)[:3]
    return {"assignees": top, "source": "commit_history", "keywords": keywords}


# ── Risk Assessment Report ─────────────────────────────────────────────────────

@router.get("/risk-report/{owner}/{repo}")
async def get_risk_report(owner: str, repo: str):
    """
    Generate a comprehensive risk assessment report for a repository
    based on aggregated issue analytics interpreted by GPT.
    """
    repo_doc = await cached_repositories.find_one({"owner": owner, "name": repo})
    if not repo_doc:
        raise HTTPException(status_code=404, detail="Repository not found in cache. Please analyze the repository first.")

    repo_id = repo_doc["_id"]

    total = await cached_issues.count_documents({"repository_id": repo_id})
    if total == 0:
        raise HTTPException(status_code=404, detail="No issues found in cache for this repository.")

    open_count  = await cached_issues.count_documents({"repository_id": repo_id, "state": "open"})
    closed_count = total - open_count

    # Type breakdown
    type_cur = cached_issues.aggregate([
        {"$match": {"repository_id": repo_id}},
        {"$group": {"_id": "$ai_analysis.type", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ])
    by_type = {(d["_id"] or "unknown"): d["count"] async for d in type_cur}

    # Criticality breakdown
    crit_cur = cached_issues.aggregate([
        {"$match": {"repository_id": repo_id}},
        {"$group": {"_id": "$ai_analysis.criticality", "count": {"$sum": 1}}},
    ])
    by_criticality = {(d["_id"] or "unknown"): d["count"] async for d in crit_cur}

    # Stale open issues
    cutoff_30 = datetime.utcnow() - timedelta(days=30)
    cutoff_60 = datetime.utcnow() - timedelta(days=60)
    cutoff_90 = datetime.utcnow() - timedelta(days=90)
    stale_30 = await cached_issues.count_documents({"repository_id": repo_id, "state": "open", "created_at": {"$lt": cutoff_30}})
    stale_60 = await cached_issues.count_documents({"repository_id": repo_id, "state": "open", "created_at": {"$lt": cutoff_60}})
    stale_90 = await cached_issues.count_documents({"repository_id": repo_id, "state": "open", "created_at": {"$lt": cutoff_90}})

    # Duplicate rate
    dup_count = await cached_issues.count_documents({"repository_id": repo_id, "duplicate_info.classification": "duplicate"})
    dup_rate  = round(dup_count / total * 100, 1) if total > 0 else 0

    security_count = by_type.get("security", 0)

    # Top keywords from open issue titles
    title_cur = cached_issues.find({"repository_id": repo_id, "state": "open"}, {"title": 1})
    word_freq: Counter = Counter()
    async for doc in title_cur:
        words = re.findall(r"[a-zA-Z]{4,}", doc.get("title", "").lower())
        word_freq.update(w for w in words if w not in _STOP)
    top_keywords = [w for w, _ in word_freq.most_common(10)]

    # Issues per month (last 6 months)
    month_cur = cached_issues.aggregate([
        {"$match": {"repository_id": repo_id, "created_at": {"$exists": True}}},
        {"$group": {
            "_id": {"year": {"$year": "$created_at"}, "month": {"$month": "$created_at"}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id.year": 1, "_id.month": 1}},
        {"$limit": 6},
    ])
    by_month = [
        {"label": f"{d['_id']['year']}-{d['_id']['month']:02d}", "count": d["count"]}
        async for d in month_cur
    ]

    stats_summary = f"""Repository: {owner}/{repo}
Total cached issues: {total}
Open: {open_count} | Closed: {closed_count}
Close rate: {round(closed_count / total * 100, 1) if total else 0}%

Issue type breakdown: {by_type}
Criticality breakdown: {by_criticality}

Stale open issues (>30 days): {stale_30}
Stale open issues (>60 days): {stale_60}
Stale open issues (>90 days): {stale_90}

Duplicate/similar rate: {dup_rate}%
Security-type issues: {security_count}

Top recurring keywords in open issues: {', '.join(top_keywords)}
Monthly issue volume (recent): {by_month}"""

    try:
        resp = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": RISK_REPORT_PROMPT},
                {"role": "user",   "content": stats_summary},
            ],
            temperature=0.3,
            max_tokens=1500,
            response_format={"type": "json_object"},
        )
        gpt_data = json.loads(resp.choices[0].message.content)
    except Exception as e:
        logger.error(f"Risk report GPT failed: {e}")
        raise HTTPException(status_code=500, detail=f"GPT generation failed: {e}")

    return {
        "stats": {
            "total": total,
            "open": open_count,
            "closed": closed_count,
            "close_rate": round(closed_count / total * 100, 1) if total else 0,
            "by_type": by_type,
            "by_criticality": by_criticality,
            "stale": {"30d": stale_30, "60d": stale_60, "90d": stale_90},
            "duplicate_rate": dup_rate,
            "security_count": security_count,
            "top_keywords": top_keywords,
            "by_month": by_month,
        },
        **gpt_data,
    }

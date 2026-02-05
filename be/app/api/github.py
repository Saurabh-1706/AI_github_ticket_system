from fastapi import APIRouter, HTTPException
import requests
from app.utils.github_fetcher import github_fetcher
from app.vector.embeddings import EmbeddingService
from app.vector.chroma_client import chroma
import numpy as np
from datetime import datetime
from app.db.mongo import repos_collection



router = APIRouter(prefix="/api/github", tags=["GitHub"])

embedder = EmbeddingService()

def cosine_similarity(a, b):
    a = np.array(a)
    b = np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

def analyze_single_issue(issue):
    try:
        title = issue.get("title", "")
        body = issue.get("body", "")
        issue_id = str(issue.get("id", ""))
        
        embedding = embedder.embed_issue(title, body)
        count = chroma.collection.count()
        
        if count <= 1:  # Only current issue exists
            return {
                "ai_analysis": {"type": "new", "criticality": "low", "confidence": 0, "similar_issues": []},
                "duplicate_info": {"classification": "new", "similarity": 0, "reuse_type": "minimal"}
            }
        
        results = chroma.collection.query(
            query_embeddings=[embedding],
            n_results=min(10, count),  # Get more results to filter
            include=["embeddings", "metadatas"]
        )
        
        max_similarity = 0.0
        if results["embeddings"] and len(results["embeddings"][0]) > 0:
            for i in range(len(results["embeddings"][0])):
                # Skip if this is the same issue (self-match)
                if results["metadatas"][0][i].get("title") == title:
                    continue
                    
                sim_embedding = results["embeddings"][0][i]
                if sim_embedding is not None:
                    similarity = cosine_similarity(embedding, sim_embedding)
                    max_similarity = max(max_similarity, similarity)
        
        issue_type = "bug" if "bug" in title.lower() else "feature" if "feature" in title.lower() else "task"
        criticality = "high" if max_similarity >= 0.85 else "medium" if max_similarity >= 0.7 else "low"
        
        # Determine classification and reuse type
        classification = "duplicate" if max_similarity >= 0.85 else "related" if max_similarity >= 0.7 else "new"
        reuse_type = "direct" if max_similarity >= 0.9 else "adapt" if max_similarity >= 0.8 else "reference" if max_similarity >= 0.7 else "minimal"
        
        return {
            "ai_analysis": {
                "type": issue_type,
                "criticality": criticality,
                "confidence": round(max_similarity, 2),
                "similar_issues": []
            },
            "duplicate_info": {
                "classification": classification,
                "similarity": round(max_similarity, 2),
                "reuse_type": reuse_type
            }
        }
    except:
        return {
            "ai_analysis": {"type": "unknown", "criticality": "unknown", "confidence": 0, "similar_issues": []},
            "duplicate_info": {"classification": "unknown", "similarity": 0, "reuse_type": "minimal"}
        }


import traceback

@router.get("/issues/{owner}/{repo}")
def fetch_issues(owner: str, repo: str):
    try:
        issues = github_fetcher.get_issues(owner, repo)
        cleaned = []
        for issue in issues:
            if "pull_request" in issue:
                continue

            title = issue.get("title", "")
            body = issue.get("body", "") or ""
            issue_id = str(issue["id"])

            # Store in ChromaDB if not exists
            if not chroma.issue_exists(issue_id):
                embedding = embedder.embed_issue(title, body)
                chroma.add_issue(
                    issue_id=issue_id,
                    embedding=embedding,
                    metadata={
                        "number": issue["number"],
                        "title": title,
                        "body": body,
                        "repo": f"{owner}/{repo}",
                    },
                )

            # Analyze each issue
            analysis_result = analyze_single_issue({
                "id": issue["id"],
                "title": title,
                "body": body
            })

            cleaned.append({
                "id": issue["id"],
                "number": issue["number"],
                "title": title,
                "body": body,
                "state": issue["state"],
                "created_at": issue["created_at"],
                "updated_at": issue["updated_at"],
                "labels": [l["name"] for l in issue.get("labels", [])],
                "ai_analysis": analysis_result["ai_analysis"],
                "duplicate_info": analysis_result["duplicate_info"]
            })

        print("📦 Chroma issue count:", chroma.count())
        return {"total": len(cleaned), "issues": cleaned}

    except Exception:
        print("❌ ROUTE LEVEL ERROR:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal error")


@router.get("/repo/{owner}/{repo}")
def fetch_repo(owner: str, repo: str):
    data = github_fetcher.get_repo(owner, repo)

    repo_doc = {
        "owner": owner,
        "repo": repo,
        "full_name": data["full_name"],
        "description": data["description"],
        "language": data["language"],
        "stars": data["stargazers_count"],
        "forks": data["forks_count"],
        "open_issues": data["open_issues_count"],
        "last_analyzed_at": datetime.utcnow(),
    }

    # ✅ UPSERT (insert if not exists)
    repos_collection.update_one(
        {"full_name": data["full_name"]},
        {
            "$set": repo_doc,
            "$setOnInsert": {"created_at": datetime.utcnow()},
        },
        upsert=True,
    )

    return repo_doc



@router.get("/rate-limit")
def rate_limit():
    res = requests.get(
        "https://api.github.com/rate_limit",
        headers=github_fetcher._headers(),
    )

    if res.status_code != 200:
        raise HTTPException(
            status_code=res.status_code,
            detail=res.text
        )

    return res.json()


@router.get("/repos")
def get_saved_repos():
    repos = list(
        repos_collection.find({}, {"_id": 0})
        .sort("last_analyzed_at", -1)
    )
    return repos

from fastapi import APIRouter, HTTPException, Request
import requests
from app.utils.github_fetcher import github_fetcher
from app.vector.embeddings import EmbeddingService
from app.vector.chroma_client import chroma
from app.ai.categorizer import categorizer
import numpy as np
from datetime import datetime
from app.db.mongo import repos_collection



router = APIRouter(prefix="/api/github", tags=["GitHub"])

embedder = EmbeddingService()

def cosine_similarity(a, b):
    a = np.array(a)
    b = np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

def analyze_single_issue(owner, repo, issue):
    try:
        title = issue.get("title", "")
        body = issue.get("body", "")
        issue_id = str(issue.get("id", ""))
        
        # Categorize the issue
        category_info = categorizer.categorize(title, body)
        primary_category = category_info["primary_category"]
        
        # Create embedding with category
        embedding = embedder.embed_issue_with_category(title, body, primary_category)
        # Get count for this specific repository
        count = chroma.count(owner, repo)
        
        if count <= 1:  # Only current issue exists in this repo
            return {
                "ai_analysis": {"type": primary_category, "criticality": "low", "confidence": 0, "similar_issues": []},
                "duplicate_info": {"classification": "new", "similarity": 0, "reuse_type": "minimal"}
            }
        
        results = chroma.query(
            owner=owner,
            repo=repo,
            embedding=embedding,
            limit=min(10, count)  # Get more results to filter
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
        
        
        # Extract similar issues from query results
        similar_issues = []
        if results["embeddings"] and len(results["embeddings"][0]) > 0:
            for i in range(len(results["embeddings"][0])):
                metadata = results["metadatas"][0][i]
                
                # Skip if this is the same issue (self-match)
                if metadata.get("title") == title:
                    continue
                
                sim_embedding = results["embeddings"][0][i]
                if sim_embedding is not None:
                    similarity = cosine_similarity(embedding, sim_embedding)
                    
                    # Only include issues with meaningful similarity (>= 50%)
                    if similarity >= 0.5:
                        similar_issues.append({
                            "id": results["ids"][0][i],
                            "number": metadata.get("number"),
                            "title": metadata.get("title"),
                            "similarity": round(similarity, 3)
                        })
        
        # Sort by similarity (highest first) and take top 5
        similar_issues.sort(key=lambda x: x["similarity"], reverse=True)
        similar_issues = similar_issues[:5]
        
        # Use the categorizer result instead of simple keyword matching
        issue_type = primary_category  # Already calculated from categorizer on line 30
        criticality = "high" if max_similarity >= 0.85 else "medium" if max_similarity >= 0.7 else "low"
        
        # Determine classification and reuse type
        classification = "duplicate" if max_similarity >= 0.85 else "related" if max_similarity >= 0.7 else "new"
        reuse_type = "direct" if max_similarity >= 0.9 else "adapt" if max_similarity >= 0.8 else "reference" if max_similarity >= 0.7 else "minimal"
        
        return {
            "ai_analysis": {
                "type": issue_type,  # Now uses categorizer result (bug, feature, documentation, etc.)
                "criticality": criticality,
                "confidence": round(max_similarity, 2),
                "similar_issues": similar_issues  # Now populated with actual similar issues
            },
            "duplicate_info": {
                "classification": classification,
                "similarity": round(max_similarity, 2),
                "reuse_type": reuse_type
            }
        }
    except Exception as e:
        print(f"❌ ERROR in analyze_single_issue: {str(e)}")
        traceback.print_exc()
        return {
            "ai_analysis": {"type": "unknown", "criticality": "unknown", "confidence": 0, "similar_issues": []},
            "duplicate_info": {"classification": "unknown", "similarity": 0, "reuse_type": "minimal"}
        }


import traceback

@router.get("/issues/{owner}/{repo}")
def fetch_issues(owner: str, repo: str, user_token: str = None, page: int = 1, per_page: int = 30):
    """
    Fetch issues with pagination, ensuring we return exactly per_page issues (excluding PRs).
    May need to fetch multiple GitHub pages to achieve this.
    """
    try:
        cleaned = []
        current_github_page = page
        total_items_fetched = 0
        pages_fetched = 0
        has_more = True
        
        # Keep fetching until we have enough issues or run out of pages
        while len(cleaned) < per_page and has_more:
            result = github_fetcher.get_issues(owner, repo, user_token, current_github_page, per_page)
            issues = result["issues"]
            pagination_info = result["pagination"]
            
            if not issues:
                has_more = False
                break
            
            total_items_fetched += len(issues)
            pages_fetched += 1
            
            for issue in issues:
                if "pull_request" in issue:
                    continue  # Skip pull requests

                title = issue.get("title", "")
                body = issue.get("body", "") or ""
                issue_id = str(issue["id"])

                # Categorize the issue
                category_info = categorizer.categorize(title, body)
                primary_category = category_info["primary_category"]
                categories = category_info["categories"]
                confidence = category_info["confidence"]

                # Store in ChromaDB if not exists
                if not chroma.issue_exists(owner, repo, issue_id):
                    embedding = embedder.embed_issue_with_category(title, body, primary_category)
                    chroma.add_issue(
                        owner=owner,
                        repo=repo,
                        issue_id=issue_id,
                        embedding=embedding,
                        metadata={
                            "number": issue["number"],
                            "title": title,
                            "body": body,
                            "repo": f"{owner}/{repo}",
                            "category": primary_category,
                            "categories": ",".join(categories),
                            "category_confidence": confidence,
                        },
                    )

                # Analyze each issue
                analysis_result = analyze_single_issue(owner, repo, {
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
                    "category": primary_category,
                    "ai_analysis": analysis_result["ai_analysis"],
                    "duplicate_info": analysis_result["duplicate_info"]
                })
                
                # Stop if we have enough issues
                if len(cleaned) >= per_page:
                    break
            
            # Check if there are more pages
            has_more = pagination_info.get("has_next", False)
            current_github_page += 1

        print(f"📦 Chroma issue count for {owner}/{repo}:", chroma.count(owner, repo))
        print(f"📊 Fetched {total_items_fetched} items from {pages_fetched} GitHub page(s), filtered to {len(cleaned)} issues")
        
        # Calculate if there are more issues available
        has_next_page = has_more or len(cleaned) == per_page
        
        return {
            "total": len(cleaned),
            "issues": cleaned,
            "pagination": {
                "page": page,
                "per_page": per_page,
                "has_next": has_next_page,
                "has_prev": page > 1,
                "count": len(cleaned),
                "total_fetched": total_items_fetched,
                "pages_fetched": pages_fetched
            }
        }

    except Exception:
        print("❌ ROUTE LEVEL ERROR:")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Internal error")


@router.get("/check-access/{owner}/{repo}")
def check_repo_access(owner: str, repo: str, user_token: str = None):
    """
    Check if repository is accessible and whether it's public or private.
    
    Query params:
        user_token: Optional OAuth token for private repo access
    """
    try:
        visibility = github_fetcher.check_repo_visibility(owner, repo, user_token)
        return visibility
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repo/{owner}/{repo}")
def fetch_repo(owner: str, repo: str, request: Request):
    """Fetch repository details and associate with current user."""
    from app.auth.auth_service import auth_service
    
    # Extract user_id from auth token if available
    user_id = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        try:
            token = auth_header.split(" ")[1]
            payload = auth_service.verify_token(token)
            if payload:
                user_id = payload.get("sub")
        except:
            pass  # Continue without user_id
    
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
        "user_id": user_id,  # Add user_id
    }

    # ✅ UPSERT (insert if not exists) - unique per user
    repos_collection.update_one(
        {"full_name": data["full_name"], "user_id": user_id},
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
def get_saved_repos(request: Request):
    """Get repositories analyzed by the current user."""
    from app.auth.auth_service import auth_service
    
    # Extract token from Authorization header
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        # Return empty list if not authenticated (don't require auth for backward compatibility)
        return []
    
    try:
        token = auth_header.split(" ")[1]
        payload = auth_service.verify_token(token)
        
        if not payload:
            return []
        
        user_id = payload.get("sub")
        
        # Filter repos by user_id
        repos = list(
            repos_collection.find({"user_id": user_id}, {"_id": 0})
            .sort("last_analyzed_at", -1)
        )
        return repos
    except:
        # If token verification fails, return empty list
        return []


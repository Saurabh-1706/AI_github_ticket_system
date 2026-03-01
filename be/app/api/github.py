from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
import requests
from app.utils.github_fetcher import github_fetcher
from app.vector.embeddings import EmbeddingService
from app.vector.chroma_client import chroma
from app.ai.categorizer import categorizer
import numpy as np
from datetime import datetime
from app.db.mongo import repos_collection, cached_repositories, cached_issues



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


# ──────────────────────────────────────────────────────────────────────
# Feature 1: PR Stats
# ──────────────────────────────────────────────────────────────────────

@router.get("/pr-stats/{owner}/{repo}")
def get_pr_stats(owner: str, repo: str, user_token: str = None):
    """
    Get open and closed PR counts for a repository.
    """
    headers = github_fetcher.headers.copy()
    if user_token:
        headers["Authorization"] = f"Bearer {user_token}"

    base = f"https://api.github.com/repos/{owner}/{repo}/pulls"

    try:
        # Fetch 1 item per state — we just need the count from the Link header
        # GitHub doesn't return total counts directly; use search API instead
        search_url = "https://api.github.com/search/issues"

        open_res = requests.get(
            search_url,
            headers=headers,
            params={"q": f"repo:{owner}/{repo} is:pr is:open", "per_page": 1}
        )
        closed_res = requests.get(
            search_url,
            headers=headers,
            params={"q": f"repo:{owner}/{repo} is:pr is:closed", "per_page": 1}
        )

        open_count = open_res.json().get("total_count", 0) if open_res.status_code == 200 else 0
        closed_count = closed_res.json().get("total_count", 0) if closed_res.status_code == 200 else 0

        return {
            "open_prs": open_count,
            "closed_prs": closed_count,
            "total_prs": open_count + closed_count
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────────────
# Feature 2: Issue Comments
# ──────────────────────────────────────────────────────────────────────

@router.get("/comments/{owner}/{repo}/{issue_number}")
def get_issue_comments(owner: str, repo: str, issue_number: int, user_token: str = None):
    """
    Get comments for a specific issue.
    """
    headers = github_fetcher.headers.copy()
    if user_token:
        headers["Authorization"] = f"Bearer {user_token}"

    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}/comments"

    try:
        res = requests.get(url, headers=headers, params={"per_page": 50})
        res.raise_for_status()

        comments = [
            {
                "id": c["id"],
                "author": c["user"]["login"],
                "avatar_url": c["user"]["avatar_url"],
                "body": c["body"],
                "created_at": c["created_at"],
                "updated_at": c["updated_at"],
            }
            for c in res.json()
        ]
        return {"comments": comments, "count": len(comments)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ──────────────────────────────────────────────────────────────────────
# Feature 3: Linked PRs (via timeline events)
# ──────────────────────────────────────────────────────────────────────

@router.get("/linked-prs/{owner}/{repo}/{issue_number}")
def get_linked_prs(owner: str, repo: str, issue_number: int, user_token: str = None):
    """
    Get PRs linked to a specific issue via timeline cross-reference events.
    """
    headers = github_fetcher.headers.copy()
    headers["Accept"] = "application/vnd.github.mockingbird-preview+json"
    if user_token:
        headers["Authorization"] = f"Bearer {user_token}"

    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}/timeline"

    try:
        res = requests.get(url, headers=headers, params={"per_page": 100})
        res.raise_for_status()

        linked_prs = []
        seen_prs = set()

        for event in res.json():
            if event.get("event") != "cross-referenced":
                continue
            source = event.get("source", {})
            issue_ref = source.get("issue", {})
            # Check if source is a pull request
            if not issue_ref.get("pull_request"):
                continue
            pr_number = issue_ref.get("number")
            if pr_number in seen_prs:
                continue
            seen_prs.add(pr_number)

            pr = issue_ref.get("pull_request", {})
            state = issue_ref.get("state", "unknown")
            # merged state
            if pr.get("merged_at"):
                state = "merged"

            linked_prs.append({
                "pr_number": pr_number,
                "title": issue_ref.get("title", ""),
                "state": state,
                "url": issue_ref.get("html_url", ""),
                "created_at": issue_ref.get("created_at"),
            })

        return {"linked_prs": linked_prs, "count": len(linked_prs)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Full-text search ─────────────────────────────────────────────────────────
@router.get("/search")
async def search_issues(
    q: str = Query(..., description="Search keyword"),
    owner: str = Query(None, description="Filter by owner"),
    repo: str = Query(None, description="Filter by repo name"),
    limit: int = Query(20, le=100),
):
    """
    Full-text search across cached issues.
    Scopes to owner/repo when provided, otherwise searches all cached repos.
    Uses MongoDB $text index; falls back to $regex if index is absent.
    """
    try:
        match_filter = {}

        # Scope by repo if provided
        if owner and repo:
            repo_doc = await cached_repositories.find_one({"owner": owner, "name": repo})
            if repo_doc:
                match_filter["repository_id"] = repo_doc["_id"]

        # Try $text search first (fastest)
        results = []
        try:
            text_filter = {**match_filter, "$text": {"$search": q}}
            cursor = cached_issues.find(
                text_filter,
                {"score": {"$meta": "textScore"},
                 "number": 1, "title": 1, "body": 1, "state": 1,
                 "ai_analysis": 1, "repository_id": 1}
            ).sort([("score", {"$meta": "textScore"})]).limit(limit)
            async for doc in cursor:
                results.append(doc)
        except Exception:
            # Fallback to $regex
            regex = {"$regex": q, "$options": "i"}
            regex_filter = {**match_filter, "$or": [{"title": regex}, {"body": regex}]}
            cursor = cached_issues.find(
                regex_filter,
                {"number": 1, "title": 1, "body": 1, "state": 1,
                 "ai_analysis": 1, "repository_id": 1}
            ).limit(limit)
            async for doc in cursor:
                results.append(doc)

        # Enrich with owner/repo info
        repo_cache: dict = {}
        enriched = []
        for doc in results:
            rid = doc.get("repository_id")
            if rid and str(rid) not in repo_cache:
                r = await cached_repositories.find_one({"_id": rid})
                repo_cache[str(rid)] = r
            r = repo_cache.get(str(rid), {}) if rid else {}

            # Snippet: first 200 chars of body around keyword
            body = doc.get("body") or ""
            idx = body.lower().find(q.lower())
            snippet = body[max(0, idx - 60): idx + 140].strip() if idx >= 0 else body[:200]

            enriched.append({
                "number": doc.get("number"),
                "title": doc.get("title"),
                "state": doc.get("state"),
                "snippet": snippet,
                "owner": r.get("owner", owner or ""),
                "repo": r.get("name", repo or ""),
                "type": (doc.get("ai_analysis") or {}).get("type"),
                "criticality": (doc.get("ai_analysis") or {}).get("criticality"),
            })

        return {"results": enriched, "count": len(enriched), "query": q}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




# ──────────────────────────────────────────────────────────────────────
# Post / Reply comment on a GitHub issue
# ──────────────────────────────────────────────────────────────────────

class PostCommentRequest(BaseModel):
    body: str


def _resolve_github_token(request) -> str:
    """
    Extract the app JWT from the Authorization header, decode it,
    and look up the user's raw GitHub OAuth token.

    Lookup order:
      1. user_tokens collection keyed by user_id  (populated after our fix)
      2. user_tokens collection keyed by github_username (old oauth.py flow)
      3. users.oauth_providers[].access_token       (if stored there)
    Raises HTTPException on any failure.
    """
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Not authenticated. Please sign in to post comments."
        )

    from app.auth.auth_service import auth_service
    from app.db.mongo import db as _db
    from bson import ObjectId

    jwt_token = auth_header.split(" ", 1)[1]
    payload = auth_service.verify_token(jwt_token)
    if not payload:
        raise HTTPException(
            status_code=401,
            detail="Session expired. Please sign out and sign back in."
        )

    user_id = payload.get("sub")

    # Path 1: user_tokens keyed by user_id (set during login after our fix)
    token_doc = _db["user_tokens"].find_one({"user_id": user_id})
    if token_doc and token_doc.get("access_token"):
        return token_doc["access_token"]

    # Path 2: look up the user doc, get their GitHub username, then query user_tokens by username
    try:
        user_doc = _db["users"].find_one({"_id": ObjectId(user_id)})
    except Exception:
        user_doc = None

    if user_doc:
        # Check oauth_providers for a stored access_token (Path 3)
        for provider in user_doc.get("oauth_providers", []):
            if provider.get("provider") == "github" and provider.get("access_token"):
                return provider["access_token"]

        # Path 2 continued: look up by github_username
        github_username = None
        for provider in user_doc.get("oauth_providers", []):
            if provider.get("provider") == "github":
                github_username = provider.get("username")
                break
        if github_username:
            token_doc = _db["user_tokens"].find_one({"github_username": github_username})
            if token_doc and token_doc.get("access_token"):
                # Back-fill user_id for next time
                _db["user_tokens"].update_one(
                    {"github_username": github_username},
                    {"$set": {"user_id": user_id}}
                )
                return token_doc["access_token"]

    # Final fallback: use the server GITHUB_TOKEN env var.
    # This works if the server token has write access to the target repo
    # (e.g., developer's own repos during local development).
    import os
    server_token = os.getenv("GITHUB_TOKEN")
    if server_token:
        return server_token

    raise HTTPException(
        status_code=403,
        detail=(
            "No GitHub token found. "
            "Please sign out and sign back in with GitHub to enable commenting."
        )
    )


@router.post("/comment/{owner}/{repo}/{issue_number}")
def post_issue_comment(
    owner: str,
    repo: str,
    issue_number: int,
    payload: PostCommentRequest,
    request: Request,
):
    """
    Post a comment on a GitHub issue on behalf of the authenticated user.
    Reads the app JWT from Authorization header and resolves the GitHub
    OAuth token server-side - no raw GitHub token ever exposed to the frontend.
    """
    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Comment body cannot be empty")

    github_token = _resolve_github_token(request)

    url = f"https://api.github.com/repos/{owner}/{repo}/issues/{issue_number}/comments"
    gh_headers = {
        "Authorization": f"token {github_token}",
        "Accept": "application/vnd.github.v3+json",
    }

    try:
        res = requests.post(url, headers=gh_headers, json={"body": payload.body}, timeout=15)
        if res.status_code == 401:
            raise HTTPException(status_code=401, detail="GitHub token is invalid or expired - please sign in again")
        if res.status_code == 403:
            raise HTTPException(status_code=403, detail="Token lacks permission to comment on this repository")
        if res.status_code == 404:
            raise HTTPException(status_code=404, detail="Issue or repository not found")
        res.raise_for_status()
        data = res.json()
        return {
            "id": data["id"],
            "author": data["user"]["login"],
            "avatar_url": data["user"]["avatar_url"],
            "body": data["body"],
            "created_at": data["created_at"],
            "updated_at": data["updated_at"],
            "url": data["html_url"],
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to post comment: {e}")

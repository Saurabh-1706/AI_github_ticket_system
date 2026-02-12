"""
Streaming API endpoint for progressive issue loading.
"""

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import json
import asyncio
from app.utils.github_fetcher import github_fetcher
from app.ai.categorizer import IssueCategori
from app.vector.embeddings import EmbeddingService
from app.vector.chroma_client import ChromaStore

router = APIRouter()

# Initialize services
categorizer = IssueCategori()
embedder = EmbeddingService()
chroma = ChromaStore()


def analyze_issue_inline(owner: str, repo: str, issue_data: dict, primary_category: str = "general"):
    """
    Analyze a single issue for duplicates and similarity.
    Inline version to avoid circular imports.
    
    Args:
        owner: Repository owner
        repo: Repository name
        issue_data: Issue data dict with id, title, body
        primary_category: Categorized issue type from categorizer
    """
    issue_id = str(issue_data["id"])
    title = issue_data["title"]
    body = issue_data["body"]
    
    # Check if issue exists in ChromaDB
    if not chroma.issue_exists(owner, repo, issue_id):
        return {
            "ai_analysis": {
                "type": primary_category,  # Use categorized type instead of "unknown"
                "criticality": "low",
                "confidence": 0.0,
                "similar_issues": []
            },
            "duplicate_info": {
                "classification": "new",
                "similarity": 0.0,
                "reuse_type": "minimal"
            }
        }
    
    # Query for similar issues
    query_embedding = embedder.embed_text(f"{title}\n{body}")
    results = chroma.query(owner, repo, query_embedding, top_k=5)
    
    similar_issues = []
    max_similarity = 0.0
    
    if results and len(results["ids"]) > 0:
        for i, result_id in enumerate(results["ids"][0]):
            if result_id == issue_id:
                continue
            
            similarity = 1 - results["distances"][0][i]
            max_similarity = max(max_similarity, similarity)
            
            metadata = results["metadatas"][0][i]
            similar_issues.append({
                "number": metadata.get("number"),
                "title": metadata.get("title"),
                "similarity": round(similarity, 3)
            })
    
    # Classify based on similarity
    if max_similarity > 0.85:
        classification = "duplicate"
        reuse_type = "direct"
        criticality = "high"
    elif max_similarity > 0.7:
        classification = "related"
        reuse_type = "adapt"
        criticality = "medium"
    else:
        classification = "new"
        reuse_type = "minimal"
        criticality = "low"
    
    return {
        "ai_analysis": {
            "type": primary_category,  # Use categorized type instead of hardcoded "issue"
            "criticality": criticality,
            "confidence": round(max_similarity, 3),
            "similar_issues": similar_issues[:3]
        },
        "duplicate_info": {
            "classification": classification,
            "similarity": round(max_similarity, 3),
            "reuse_type": reuse_type
        }
    }


async def stream_issues(owner: str, repo: str, user_token: str = None, page: int = 1, per_page: int = 30):
    """
    Stream issues as they are fetched and processed from GitHub.
    Yields JSON objects for each issue as it's ready.
    """
    try:
        current_github_page = page
        total_items_fetched = 0
        pages_fetched = 0
        issues_sent = 0
        has_more = True
        
        # Send initial metadata
        yield json.dumps({
            "type": "start",
            "page": page,
            "per_page": per_page
        }) + "\n"
        
        # Keep fetching until we have enough issues or run out of pages
        while issues_sent < per_page and has_more:
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
                analysis_result = analyze_issue_inline(owner, repo, {
                    "id": issue["id"],
                    "title": title,
                    "body": body
                }, primary_category)  # Pass the categorized type

                # Send the issue immediately
                issue_data = {
                    "type": "issue",
                    "data": {
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
                    }
                }
                
                yield json.dumps(issue_data) + "\n"
                issues_sent += 1
                
                # Stop if we have enough issues
                if issues_sent >= per_page:
                    break
            
            # Check if there are more pages
            has_more = pagination_info.get("has_next", False)
            current_github_page += 1
            
            # Small delay to prevent overwhelming the client
            await asyncio.sleep(0.01)
        
        # Send completion metadata
        has_next_page = has_more or issues_sent == per_page
        
        yield json.dumps({
            "type": "complete",
            "pagination": {
                "page": page,
                "per_page": per_page,
                "has_next": has_next_page,
                "has_prev": page > 1,
                "count": issues_sent,
                "total_fetched": total_items_fetched,
                "pages_fetched": pages_fetched
            }
        }) + "\n"
        
    except Exception as e:
        yield json.dumps({
            "type": "error",
            "error": str(e)
        }) + "\n"


@router.get("/issues/{owner}/{repo}/stream")
async def stream_issues_endpoint(owner: str, repo: str, user_token: str = None, page: int = 1, per_page: int = 30):
    """
    Stream issues progressively as they are fetched from GitHub.
    """
    return StreamingResponse(
        stream_issues(owner, repo, user_token, page, per_page),
        media_type="application/x-ndjson"
    )

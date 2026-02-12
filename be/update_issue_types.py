"""
Re-analyze existing cached issues with the new type logic
WITHOUT re-fetching from GitHub (just updates the analysis)
"""
import asyncio
from app.db.mongo import cached_repositories, cached_issues
from app.ai.categorizer import categorizer

async def update_issue_types(owner: str, repo: str):
    """Update ai_analysis.type for existing cached issues"""
    
    # Find repository
    repo_doc = await cached_repositories.find_one({
        "owner": owner,
        "name": repo
    })
    
    if not repo_doc:
        print(f"❌ Repository {owner}/{repo} not found in cache")
        return
    
    # Get all issues for this repository
    issues = await cached_issues.find({
        "repository_id": repo_doc["_id"]
    }).to_list(length=None)
    
    print(f"📊 Found {len(issues)} issues to update")
    print(f"🔄 Re-analyzing types using categorizer...\n")
    
    updated = 0
    for issue in issues:
        title = issue.get("title", "")
        body = issue.get("body", "")
        
        # Run categorizer
        category_info = categorizer.categorize(title, body)
        primary_category = category_info["primary_category"]
        
        # Update ai_analysis.type
        ai_analysis = issue.get("ai_analysis", {})
        old_type = ai_analysis.get("type", "N/A")
        ai_analysis["type"] = primary_category
        
        # Update in database
        await cached_issues.update_one(
            {"_id": issue["_id"]},
            {"$set": {
                "ai_analysis.type": primary_category,
                "category": primary_category
            }}
        )
        
        updated += 1
        if updated % 50 == 0:
            print(f"  ✓ Updated {updated}/{len(issues)} issues...")
    
    print(f"\n✅ Successfully updated {updated} issues!")
    print(f"   Types are now based on categorizer analysis")

if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Usage: python update_issue_types.py <owner> <repo>")
        print("Example: python update_issue_types.py facebook react")
        sys.exit(1)
    
    owner = sys.argv[1]
    repo = sys.argv[2]
    
    asyncio.run(update_issue_types(owner, repo))

"""
Check if issues have been updated with the new type analysis logic
"""
import asyncio
from app.db.mongo import cached_issues

async def check_issues():
    # Get a few issues to check
    issues = await cached_issues.find(
        {"repository_id": {"$exists": True}},
        limit=10
    ).to_list(length=10)
    
    print("Checking AI Analysis in cached issues:\n" + "="*80)
    
    for issue in issues:
        print(f"\nIssue #{issue.get('number')}: {issue.get('title', 'N/A')[:60]}")
        
        ai_analysis = issue.get('ai_analysis', {})
        print(f"  Type: {ai_analysis.get('type', 'N/A')}")
        print(f"  Criticality: {ai_analysis.get('criticality', 'N/A')}")
        print(f"  Confidence: {ai_analysis.get('confidence', 'N/A')}")
        print(f"  Similar Issues Count: {len(ai_analysis.get('similar_issues', []))}")
        print("-" * 80)

asyncio.run(check_issues())

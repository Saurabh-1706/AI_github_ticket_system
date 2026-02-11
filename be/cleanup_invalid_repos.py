"""
Clean up invalid repository entries with null names
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

async def cleanup_invalid_repos():
    # Connect to MongoDB
    client = AsyncIOMotorClient(os.getenv('MONGO_URI', 'mongodb://localhost:27017'))
    db = client['git_intellisolve']
    cached_repositories = db['cached_repositories']
    cached_issues = db['cached_issues']
    
    print("Finding invalid repositories...")
    print("="*60)
    
    # Find repos with null or missing name
    invalid_repos = await cached_repositories.find({
        "$or": [
            {"name": None},
            {"name": {"$exists": False}}
        ]
    }).to_list(length=None)
    
    print(f"Found {len(invalid_repos)} invalid repositories")
    
    for repo in invalid_repos:
        print(f"\nInvalid repo: {repo.get('owner')}/{repo.get('name')}")
        print(f"  ID: {repo['_id']}")
        
        # Count issues
        issue_count = await cached_issues.count_documents({
            "repository_id": repo["_id"]
        })
        print(f"  Issues: {issue_count}")
        
        # Delete issues
        if issue_count > 0:
            await cached_issues.delete_many({"repository_id": repo["_id"]})
            print(f"  ✅ Deleted {issue_count} issues")
        
        # Delete repository
        await cached_repositories.delete_one({"_id": repo["_id"]})
        print(f"  ✅ Deleted repository")
    
    print("\n" + "="*60)
    print(f"✅ Cleaned up {len(invalid_repos)} invalid repositories")

if __name__ == "__main__":
    asyncio.run(cleanup_invalid_repos())

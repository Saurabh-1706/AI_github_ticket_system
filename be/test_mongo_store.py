import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from datetime import datetime
from bson import ObjectId
import os
from dotenv import load_dotenv

load_dotenv()

async def test_store_issue():
    # Connect to MongoDB
    client = AsyncIOMotorClient(os.getenv('MONGO_URI', 'mongodb://localhost:27017'))
    db = client['git_intellisolve']
    cached_repositories = db['cached_repositories']
    cached_issues = db['cached_issues']
    
    # Find facebook/react repo
    repo_doc = await cached_repositories.find_one({'owner': 'facebook', 'name': 'react'})
    print(f"Repo doc: {repo_doc}")
    
    if not repo_doc:
        print("Creating repo doc...")
        result = await cached_repositories.insert_one({
            'owner': 'facebook',
            'name': 'react',
            'last_synced': None,
            'created_at': datetime.utcnow()
        })
        repo_doc = {'_id': result.inserted_id}
    
    # Try to store a test issue
    test_issue = {
        "repository_id": repo_doc["_id"],
        "number": 99999,
        "title": "Test Issue",
        "body": "Test body",
        "state": "open",
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
        "user": {"login": "test"},
        "labels": [],
        "category": "bug",
        "ai_analysis": {"criticality": "medium"},
        "duplicate_info": {"classification": "unique", "similarity": 0, "similar_issues": []},
        "synced_at": datetime.utcnow()
    }
    
    try:
        result = await cached_issues.update_one(
            {"repository_id": repo_doc["_id"], "number": 99999},
            {"$set": test_issue},
            upsert=True
        )
        print(f"✅ Successfully stored test issue: {result.upserted_id or result.modified_count}")
        
        # Verify it was stored
        stored = await cached_issues.find_one({"number": 99999})
        print(f"✅ Verified: {stored.get('title') if stored else 'NOT FOUND'}")
        
    except Exception as e:
        print(f"❌ Failed to store: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()

asyncio.run(test_store_issue())

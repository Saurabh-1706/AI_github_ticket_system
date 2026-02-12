"""
Re-categorize all existing issues in MongoDB and ChromaDB using the improved categorizer.
This script updates issues that have "unknown" or "general" categories.
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
import sys

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.ai.categorizer import categorizer
from app.core.chroma_manager import chroma_manager

load_dotenv()


async def recategorize_mongodb_issues():
    """Update categories in MongoDB cached_issues collection"""
    print("=" * 80)
    print("RE-CATEGORIZING MONGODB ISSUES")
    print("=" * 80)
    
    # Connect to MongoDB
    client = AsyncIOMotorClient(os.getenv('MONGO_URI', 'mongodb://localhost:27017'))
    db = client['git_intellisolve']
    cached_issues = db['cached_issues']
    
    # Find issues with unknown or general categories
    query = {"category": {"$in": ["unknown", "general"]}}
    issues_to_update = await cached_issues.find(query).to_list(length=None)
    
    print(f"\nFound {len(issues_to_update)} issues with 'unknown' or 'general' categories")
    
    if len(issues_to_update) == 0:
        print("✅ No issues to update!")
        return
    
    updated_count = 0
    category_stats = {}
    
    for issue in issues_to_update:
        title = issue.get('title', '')
        body = issue.get('body', '')
        
        # Re-categorize using improved categorizer
        category_info = categorizer.categorize(title, body)
        new_category = category_info['primary_category']
        
        # Update in MongoDB
        await cached_issues.update_one(
            {"_id": issue["_id"]},
            {"$set": {"category": new_category}}
        )
        
        updated_count += 1
        category_stats[new_category] = category_stats.get(new_category, 0) + 1
        
        if updated_count % 10 == 0:
            print(f"  Processed {updated_count}/{len(issues_to_update)} issues...")
    
    print(f"\n✅ Updated {updated_count} issues in MongoDB")
    print("\nNew category distribution:")
    for category, count in sorted(category_stats.items(), key=lambda x: x[1], reverse=True):
        print(f"  {category}: {count}")
    
    # Verify
    print("\n" + "=" * 80)
    print("VERIFICATION")
    print("=" * 80)
    
    remaining_unknown = await cached_issues.count_documents({"category": "unknown"})
    remaining_general = await cached_issues.count_documents({"category": "general"})
    
    print(f"Remaining 'unknown': {remaining_unknown}")
    print(f"Remaining 'general': {remaining_general}")
    
    if remaining_unknown == 0 and remaining_general == 0:
        print("\n✅ All issues successfully re-categorized!")
    else:
        print(f"\n⚠️ Warning: {remaining_unknown + remaining_general} issues still need categorization")


def recategorize_chromadb_issues():
    """Update categories in ChromaDB collections"""
    print("\n" + "=" * 80)
    print("RE-CATEGORIZING CHROMADB ISSUES")
    print("=" * 80)
    
    # Get all collections
    collections = chroma_manager.client.list_collections()
    
    if not collections:
        print("No ChromaDB collections found")
        return
    
    print(f"\nFound {len(collections)} repository collections")
    
    total_updated = 0
    
    for collection in collections:
        repo_name = collection.metadata.get('repo', 'unknown')
        print(f"\nProcessing: {repo_name}")
        
        # Get all issues in collection
        results = collection.get(include=['metadatas', 'documents'])
        
        if not results or not results['ids']:
            print(f"  No issues found")
            continue
        
        updated_in_collection = 0
        
        for i, doc_id in enumerate(results['ids']):
            metadata = results['metadatas'][i]
            
            # Check if category is unknown or general
            current_category = metadata.get('category', 'unknown')
            
            if current_category in ['unknown', 'general']:
                title = metadata.get('title', '')
                body = metadata.get('body', '')
                
                # Re-categorize
                category_info = categorizer.categorize(title, body)
                new_category = category_info['primary_category']
                
                # Update metadata
                metadata['category'] = new_category
                
                # Update in ChromaDB
                collection.update(
                    ids=[doc_id],
                    metadatas=[metadata]
                )
                
                updated_in_collection += 1
        
        if updated_in_collection > 0:
            print(f"  ✅ Updated {updated_in_collection} issues")
            total_updated += updated_in_collection
        else:
            print(f"  No updates needed")
    
    print(f"\n✅ Total ChromaDB issues updated: {total_updated}")


async def main():
    print("\n🚀 STARTING ISSUE RE-CATEGORIZATION")
    print("This will update all issues with 'unknown' or 'general' categories\n")
    
    # Update MongoDB
    await recategorize_mongodb_issues()
    
    # Update ChromaDB
    recategorize_chromadb_issues()
    
    print("\n" + "=" * 80)
    print("✅ RE-CATEGORIZATION COMPLETE!")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())

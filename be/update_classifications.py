"""
Update existing MongoDB issues to rename classification types:
- potential_duplicate -> related
- unique -> new
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

async def update_classifications():
    # Connect to MongoDB
    client = AsyncIOMotorClient(os.getenv('MONGO_URI', 'mongodb://localhost:27017'))
    db = client['git_intellisolve']
    cached_issues = db['cached_issues']
    
    print("Updating classification labels...")
    print("="*60)
    
    # Update potential_duplicate -> related
    result1 = await cached_issues.update_many(
        {"duplicate_info.classification": "potential_duplicate"},
        {"$set": {"duplicate_info.classification": "related"}}
    )
    print(f"✅ Updated {result1.modified_count} issues: potential_duplicate -> related")
    
    # Update unique -> new
    result2 = await cached_issues.update_many(
        {"duplicate_info.classification": "unique"},
        {"$set": {"duplicate_info.classification": "new"}}
    )
    print(f"✅ Updated {result2.modified_count} issues: unique -> new")
    
    # Verify the changes
    print("\n" + "="*60)
    print("Verification:")
    new_count = await cached_issues.count_documents({"duplicate_info.classification": "new"})
    related_count = await cached_issues.count_documents({"duplicate_info.classification": "related"})
    duplicate_count = await cached_issues.count_documents({"duplicate_info.classification": "duplicate"})
    
    print(f"  New: {new_count}")
    print(f"  Related: {related_count}")
    print(f"  Duplicate: {duplicate_count}")
    print(f"  Total: {new_count + related_count + duplicate_count}")
    
    # Check for any old labels remaining
    old_unique = await cached_issues.count_documents({"duplicate_info.classification": "unique"})
    old_potential = await cached_issues.count_documents({"duplicate_info.classification": "potential_duplicate"})
    
    if old_unique == 0 and old_potential == 0:
        print("\n✅ All classifications updated successfully!")
    else:
        print(f"\n⚠️ Warning: {old_unique} 'unique' and {old_potential} 'potential_duplicate' still remain")

if __name__ == "__main__":
    asyncio.run(update_classifications())

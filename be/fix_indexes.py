from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()

client = MongoClient(os.getenv('MONGO_URI', 'mongodb://localhost:27017'))
db = client['git_intellisolve']

# Check indexes on cached_issues
print("Indexes on cached_issues:")
for index in db.cached_issues.list_indexes():
    print(f"  {index}")

print("\n" + "="*50 + "\n")

# Drop all indexes except _id
print("Dropping problematic indexes...")
try:
    db.cached_issues.drop_indexes()
    print("✅ Dropped all indexes")
except Exception as e:
    print(f"Error: {e}")

# Create correct index
print("\nCreating correct index...")
try:
    db.cached_issues.create_index([("repository_id", 1), ("number", 1)], unique=True)
    print("✅ Created index on (repository_id, number)")
except Exception as e:
    print(f"Error: {e}")

print("\nNew indexes:")
for index in db.cached_issues.list_indexes():
    print(f"  {index}")

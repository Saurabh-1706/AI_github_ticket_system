import os
from pymongo import MongoClient
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

# Synchronous client for existing collections
client = MongoClient(MONGO_URI)
db = client["git_intellisolve"]
repos_collection = db["repositories"]
# ✅ Collection for learned solutions
solution_memory = db["solution_memory"]

# Async client for cache collections
async_client = AsyncIOMotorClient(MONGO_URI)
async_db = async_client["git_intellisolve"]

# ✅ Cache collections for MongoDB-backed issue caching (async)
cached_repositories = async_db["cached_repositories"]
cached_issues = async_db["cached_issues"]


def get_database():
    """Get the MongoDB database instance."""
    return db


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
# Sync vector collections for code indexer & vector cache fallback
issue_vectors_sync = db["issue_vectors"]
code_vectors_sync = db["code_vectors"]

# Async client for cache collections
async_client = AsyncIOMotorClient(MONGO_URI)
async_db = async_client["git_intellisolve"]

# ✅ Cache collections for MongoDB-backed issue caching (async)
cached_repositories = async_db["cached_repositories"]
cached_issues = async_db["cached_issues"]
# ✅ Collection for GPT-generated solutions
solutions = async_db["solutions"]
# ✅ Tracks which repos have been source-code indexed (and last commit SHA)
code_file_index = async_db["code_file_index"]

# Async vector collections
issue_vectors = async_db["issue_vectors"]
code_vectors = async_db["code_vectors"]



def get_database():
    """Get the MongoDB database instance."""
    return db


async def init_indexes():
    """Create MongoDB indexes for caching collections to improve query performance."""
    import logging
    logger = logging.getLogger(__name__)
    try:
        logger.info("Initializing MongoDB indexes...")
        
        # Index on cached_repositories: owner + name (compound index for lookups)
        await cached_repositories.create_index([("owner", 1), ("name", 1)])
        # Index on cached_repositories: user_ids array (for user scoping)
        await cached_repositories.create_index("user_ids")
        # Index on cached_repositories: synced_by_user_id (for legacy scoping)
        await cached_repositories.create_index("synced_by_user_id")

        # Index on cached_issues: repository_id (crucial for joining and grouping issues)
        await cached_issues.create_index("repository_id")
        # Compound index on cached_issues: repository_id + number
        await cached_issues.create_index([("repository_id", 1), ("number", -1)])
        
        # Performance indexes for filters on issues
        await cached_issues.create_index("state")
        await cached_issues.create_index("category")
        await cached_issues.create_index("ai_analysis.criticality")
        await cached_issues.create_index("duplicate_info.classification")
        
        logger.info("✅ MongoDB indexes initialized successfully.")
    except Exception as e:
        logger.error(f"Failed to initialize MongoDB indexes: {e}", exc_info=True)


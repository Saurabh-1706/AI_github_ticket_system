import os
from pymongo import MongoClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

client = MongoClient(MONGO_URI)
db = client["git_intellisolve"]
repos_collection = db["repositories"]
# ✅ Collection for learned solutions
solution_memory = db["solution_memory"]


def get_database():
    """Get the MongoDB database instance."""
    return db


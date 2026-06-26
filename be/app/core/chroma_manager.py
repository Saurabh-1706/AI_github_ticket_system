"""
be/app/core/chroma_manager.py

Redirect client pointing to MongoVectorManager to avoid importing chromadb.
"""
from app.core.mongo_vector_manager import mongo_vector_manager as chroma_manager

"""
be/app/vector/chroma_client.py

Redirect client pointing to MongoChromaStore to avoid importing chromadb.
"""
from app.vector.mongo_chroma_client import MongoChromaStore
chroma = MongoChromaStore()

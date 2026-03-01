"""
app/core/embedder.py
Thin wrapper around app.vector.embeddings.EmbeddingService.
Provides a singleton `embedder` used by cache_service and other modules.
"""
from app.vector.embeddings import EmbeddingService

# Singleton instance
embedder = EmbeddingService()

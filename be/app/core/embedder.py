"""
Embedding service using sentence-transformers for semantic similarity
"""
from sentence_transformers import SentenceTransformer
import logging
from typing import List, Union
import numpy as np

logger = logging.getLogger(__name__)


class Embedder:
    """Service for generating text embeddings"""
    
    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        Initialize embedder with sentence-transformer model
        
        Args:
            model_name: Name of the sentence-transformer model
                       Default: all-MiniLM-L6-v2 (384 dimensions, fast, good quality)
        """
        self.model_name = model_name
        self._model = None
        logger.info(f"Embedder initialized with model: {model_name}")
    
    @property
    def model(self):
        """Lazy load the model"""
        if self._model is None:
            logger.info(f"Loading sentence-transformer model: {self.model_name}")
            self._model = SentenceTransformer(self.model_name)
            logger.info("Model loaded successfully")
        return self._model
    
    def embed(self, text: str) -> List[float]:
        """
        Generate embedding for a single text
        
        Args:
            text: Text to embed
            
        Returns:
            List of floats representing the embedding
        """
        if not text or not text.strip():
            # Return zero vector for empty text
            return [0.0] * 384
        
        embedding = self.model.encode(text, convert_to_numpy=True)
        return embedding.tolist()
    
    def embed_batch(self, texts: List[str], batch_size: int = 32) -> List[List[float]]:
        """
        Generate embeddings for multiple texts (more efficient)
        
        Args:
            texts: List of texts to embed
            batch_size: Batch size for processing
            
        Returns:
            List of embeddings
        """
        if not texts:
            return []
        
        # Replace empty texts with space to avoid errors
        texts = [text if text and text.strip() else " " for text in texts]
        
        embeddings = self.model.encode(
            texts,
            batch_size=batch_size,
            convert_to_numpy=True,
            show_progress_bar=len(texts) > 50
        )
        
        return embeddings.tolist()
    
    def embed_issue(self, title: str, body: str = "") -> List[float]:
        """
        Generate embedding for an issue (title + body)
        Title is weighted more heavily
        
        Args:
            title: Issue title
            body: Issue body (optional)
            
        Returns:
            Embedding vector
        """
        # Combine title and body with title repeated for higher weight
        # Title appears 3 times, body appears 1 time (3:1 ratio)
        combined_text = f"{title} {title} {title} {body if body else ''}"
        return self.embed(combined_text)


# Global embedder instance
embedder = Embedder()

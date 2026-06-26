import os
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

class EmbeddingService:
    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            api_key = os.getenv("OPENAI_API_KEY")
            self._client = OpenAI(api_key=api_key)
        return self._client

    def _get_embedding(self, text: str) -> list[float]:
        try:
            response = self.client.embeddings.create(
                model="text-embedding-3-small",
                input=text,
                dimensions=384
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Error generating embedding via OpenAI: {e}")
            raise e

    def embed_issue(self, title: str, body: str):
        text = f"{title}\n{(body or '')}"
        return self._get_embedding(text)
    
    def embed_issue_with_category(self, title: str, body: str, category: str):
        """
        Embed issue with category prefix for improved similarity matching.
        
        Args:
            title: Issue title
            body: Issue body
            category: Issue category (e.g., 'bug', 'feature')
            
        Returns:
            Embedding vector as list
        """
        prefix = f"[{category.upper()}]"
        text = f"{prefix} {title}\n{(body or '')}"
        return self._get_embedding(text)

    def embed_text(self, text: str):
        return self._get_embedding(text)

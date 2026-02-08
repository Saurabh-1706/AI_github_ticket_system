import os
from sentence_transformers import SentenceTransformer

class EmbeddingService:
    def __init__(self):
        self.model = None

    def _load_model(self):
        if self.model is None:
            BASE_DIR = os.path.dirname(
                os.path.dirname(os.path.dirname(__file__))
            )
            MODEL_PATH = os.path.join(
                BASE_DIR, "models", "all-MiniLM-L6-v2"
            )

            print("✅ Loading SentenceTransformer from:", MODEL_PATH)

            self.model = SentenceTransformer(
                MODEL_PATH,
                local_files_only=True
            )

        return self.model

    def embed_issue(self, title: str, body: str):
        text = f"{title}\n{body}"
        model = self._load_model()
        return model.encode(text).tolist()
    
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
        # Prepend category to improve categorization-aware similarity
        prefix = f"[{category.upper()}]"
        text = f"{prefix} {title}\n{body}"
        model = self._load_model()
        return model.encode(text).tolist()

    def embed_text(self, text: str):
        model = self._load_model()
        return model.encode(text).tolist()

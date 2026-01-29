from sentence_transformers import SentenceTransformer
import numpy as np

class EmbeddingService:
    def __init__(self):
        self.model = SentenceTransformer("all-MiniLM-L6-v2")

    def embed_issue(self, title: str, body: str = "") -> list[float]:
        text = f"{title}. {body}"
        embedding = self.model.encode(text)
        return embedding.astype(float).tolist()

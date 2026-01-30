from sentence_transformers import SentenceTransformer
<<<<<<< HEAD
import numpy as np

class EmbeddingService:
    def __init__(self):
        self.model = SentenceTransformer("all-MiniLM-L6-v2")

    def embed_issue(self, title: str, body: str = "") -> list[float]:
        text = f"{title}. {body}"
        embedding = self.model.encode(text)
        return embedding.astype(float).tolist()
=======

_model = SentenceTransformer("all-MiniLM-L6-v2")

def embed(text: str):
    return _model.encode(text).tolist()
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822

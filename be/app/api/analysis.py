from fastapi import APIRouter
from app.vector.embeddings import EmbeddingService
from app.vector.chroma_client import chroma
import numpy as np

router = APIRouter()
embedder = EmbeddingService()

def cosine_similarity(a, b):
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

@router.post("/analyze")
def analyze_issue(issue: dict):
    embedding = embedder.embed_issue(
        issue["title"],
        issue.get("body", "")
    )

    results = chroma.search(embedding)

    similar = []
    for i in range(len(results["ids"][0])):
        sim_emb = results["embeddings"][0][i]
        similarity = cosine_similarity(embedding, sim_emb)

        similar.append({
            "id": results["ids"][0][i],
            "title": results["metadatas"][0][i]["title"],
            "number": results["metadatas"][0][i]["number"],
            "similarity": round(similarity, 2),
            "classification": (
                "duplicate" if similarity >= 0.85
                else "related" if similarity >= 0.7
                else "new"
            )
        })

    return {
        "similar_issues": similar[:5]
    }

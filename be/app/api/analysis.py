from fastapi import APIRouter
import numpy as np

from app.vector.embeddings import EmbeddingService
from app.vector.chroma_client import chroma  # ✅ shared instance

router = APIRouter(tags=["Analysis"])

embedder = EmbeddingService()


def cosine_similarity(a, b):
    a = np.array(a)
    b = np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


@router.post("/analyze")
def analyze_issue(issue: dict):
    try:
        print("📥 Incoming issue:", issue)

        title = issue.get("title")
        body = issue.get("body", "")

        if not title:
            raise ValueError("Issue title is missing")

        embedding = embedder.embed_issue(title, body)
        print("✅ Embedding created, length:", len(embedding))

        count = chroma.collection.count()
        print("📦 Chroma count:", count)

        if count == 0:
            return {
                "type": "unknown",
                "criticality": "unknown",
                "confidence": 0,
                "similar_issues": [],
                "debug": "No data in ChromaDB"
            }

        # Test direct collection query
        test_query = chroma.collection.query(
            query_embeddings=[embedding],
            n_results=1,
            include=["embeddings", "metadatas"]
        )
        print("🧪 Test query result:", {
            "has_embeddings": bool(test_query.get("embeddings")),
            "embedding_is_none": test_query.get("embeddings", [[None]])[0][0] is None if test_query.get("embeddings") else True
        })

        results = chroma.collection.query(
            query_embeddings=[embedding],
            n_results=min(6, count),
            include=["embeddings", "metadatas", "documents"],
        )

        print("🔍 Chroma results:", {
            "embeddings_count": len(results["embeddings"][0]) if results["embeddings"] and len(results["embeddings"][0]) > 0 else 0
        })

        similar = []
        max_similarity = 0.0

        if results["embeddings"] and len(results["embeddings"][0]) > 0:
            for i in range(len(results["embeddings"][0])):
                sim_embedding = results["embeddings"][0][i]

                if sim_embedding is None:
                    print(f"⚠️ Embedding {i} is None")
                    continue

                similarity = cosine_similarity(embedding, sim_embedding)
                max_similarity = max(max_similarity, similarity)

                similar.append({
                    "id": i,  # Use index since we don't have IDs
                    "number": results["metadatas"][0][i].get("number"),
                    "title": results["metadatas"][0][i].get("title"),
                    "similarity": round(similarity, 3),
                    "classification": (
                        "duplicate" if similarity >= 0.85
                        else "related" if similarity >= 0.7
                        else "new"
                    ),
                    "reuse_type": (
                        "direct" if similarity >= 0.9
                        else "adapt" if similarity >= 0.8
                        else "reference" if similarity >= 0.7
                        else "minimal"
                    ),
                })
        else:
            print("⚠️ No embeddings returned from ChromaDB")

        issue_type = (
            "bug" if "bug" in title.lower()
            else "feature" if "feature" in title.lower()
            else "task"
        )

        criticality = (
            "high" if max_similarity >= 0.85
            else "medium" if max_similarity >= 0.7
            else "low"
        )

        return {
            "type": issue_type,
            "criticality": criticality,
            "confidence": round(max_similarity, 2),
            "similar_issues": sorted(
                similar, key=lambda x: x["similarity"], reverse=True
            )[:5],
        }

    except Exception as e:
        print("❌ ANALYSIS ERROR:", str(e))
        import traceback
        traceback.print_exc()
        return {
            "type": "unknown",
            "criticality": "unknown",
            "confidence": 0,
            "similar_issues": [],
        }

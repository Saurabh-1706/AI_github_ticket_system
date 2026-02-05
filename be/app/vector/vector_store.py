from app.vector.chroma_client import chroma

def store(issue_id, embedding, document, metadata):
    chroma.collection.upsert(
        ids=[str(issue_id)],
        embeddings=[embedding],
        documents=[document],
        metadatas=[metadata]
    )

def search(embedding, limit=5):
    return chroma.collection.query(query_embeddings=[embedding], n_results=limit)

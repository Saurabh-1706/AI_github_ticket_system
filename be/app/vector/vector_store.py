from app.vector.chroma_client import collection

def store(issue_id, embedding, document, metadata):
    collection.upsert(
        ids=[str(issue_id)],
        embeddings=[embedding],
        documents=[document],
        metadatas=[metadata]
    )

def search(embedding, limit=5):
    return collection.query(query_embeddings=[embedding], n_results=limit)

from app.core.similarity import cosine

def is_duplicate(v1, v2, threshold=0.85):
    return cosine(v1,v2) >= threshold

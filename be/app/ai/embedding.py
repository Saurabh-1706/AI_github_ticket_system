from sentence_transformers import SentenceTransformer

model = None

def load_model():
    global model
    if model is None:
        model = SentenceTransformer("models/all-MiniLM-L6-v2")
    return model

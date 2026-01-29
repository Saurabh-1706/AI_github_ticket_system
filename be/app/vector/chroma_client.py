import chromadb
from chromadb.config import Settings


class ChromaClient:
    def __init__(self):
        self.client = chromadb.Client(
            Settings(persist_directory="./chroma_db")
        )
        self.embedding_dim = 384

        self.collection = self.client.get_or_create_collection(
            name="github_issues"
        )


chroma_client = ChromaClient()

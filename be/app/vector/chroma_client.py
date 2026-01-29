import chromadb
from chromadb.config import Settings
from typing import List, Dict

class ChromaClient:
    def __init__(self):
        self.client = chromadb.Client(
            Settings(persist_directory="./chroma_db")
        )

        self.collection = self.client.get_or_create_collection(
            name="github_issues"
        )

    def add_issue(self, issue_id: str, text: str, metadata: Dict):
        self.collection.add(
            ids=[issue_id],
            documents=[text],
            metadatas=[metadata],
        )

    def query_similar(self, text: str, limit: int = 5):
        return self.collection.query(
            query_texts=[text],
            n_results=limit,
        )


# ✅ SINGLE shared instance (IMPORTANT)
chroma = ChromaClient()

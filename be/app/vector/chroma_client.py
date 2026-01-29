import chromadb
from chromadb.config import Settings
<<<<<<< HEAD
from typing import List, Dict
=======

>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822

class ChromaClient:
    def __init__(self):
        self.client = chromadb.Client(
            Settings(persist_directory="./chroma_db")
        )
<<<<<<< HEAD
=======
        self.embedding_dim = 384
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822

        self.collection = self.client.get_or_create_collection(
            name="github_issues"
        )

<<<<<<< HEAD
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
=======

chroma_client = ChromaClient()
>>>>>>> 9cd19b606496d8e72f9b6fc53e64231b02bfe822

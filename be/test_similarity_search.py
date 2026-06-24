import os
import sys
import asyncio
from dotenv import load_dotenv

# Load env file in the backend root directory (be/.env)
dotenv_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
load_dotenv(dotenv_path)

# Add backend directory to path
sys.path.append(os.path.join(os.path.dirname(__file__), "..", "be"))

async def test_issue_similarity():
    print("\n--- Testing Issue Similarity Search ---")
    try:
        from app.core.mongo_vector_manager import mongo_vector_manager
        from app.vector.embeddings import EmbeddingService
        
        embedder = EmbeddingService()
        repo = "test/repo"
        
        # 1. Insert a sample issue
        print(f"1. Inserting sample issues into '{repo}'...")
        test_issues = [
            (101, "Login page fails with 500 error", "When clicking login button, the app returns a server error."),
            (102, "Profile photo update issue", "Users cannot change their profile photo in the settings page."),
            (103, "Authentication throws 500 internal error", "Login fails completely with status code 500.")
        ]
        
        for num, title, body in test_issues:
            emb = embedder.embed_issue(title, body)
            await mongo_vector_manager.add_issue(
                repo_name=repo,
                issue_number=num,
                title=title,
                body=body,
                embedding=emb,
                metadata={"state": "open"}
            )
        
        print("[OK] Sample issues inserted.")
        print("Waiting 10 seconds for Atlas to index the documents...")
        await asyncio.sleep(10)
        
        # 2. Query similarity
        query_title = "500 internal error on login page"
        print(f"2. Querying similar issues for: '{query_title}'...")
        query_emb = embedder.embed_issue(query_title, "")
        
        results = await mongo_vector_manager.find_similar_issues(
            repo_name=repo,
            embedding=query_emb,
            top_k=2,
            exclude_issue=None
        )
        
        print(f"Found {len(results)} matches:")
        for r in results:
            print(f" - Issue #{r['number']}: {r['title']} (Similarity: {r['similarity']}, State: {r['state']})")
            
        # 3. Clean up
        print("3. Cleaning up test data...")
        await mongo_vector_manager.reset_collection(repo)
        print("[OK] Cleanup complete.")
        
    except Exception as e:
        print(f"[ERROR] Error during issue similarity test: {e}")
        print("Make sure you created the 'issue_embedding_index' on your 'issue_vectors' collection in Atlas.")

def test_code_similarity():
    print("\n--- Testing Code Chunk Similarity Search ---")
    try:
        from app.db.mongo import code_vectors_sync
        from app.vector.embeddings import EmbeddingService
        
        embedder = EmbeddingService()
        repo = "test/repo"
        
        # Clear existing test data
        code_vectors_sync.delete_many({"repo": repo})
        
        # 1. Insert sample code chunks
        print(f"1. Inserting sample code chunks into '{repo}'...")
        chunks = [
            ("auth.py::0", "auth.py", "def authenticate_user(username, password):\n    user = db.users.find_one({'username': username})\n    if bcrypt.checkpw(password, user.password):\n        return generate_jwt(user)"),
            ("db.py::0", "db.py", "def connect_database():\n    client = MongoClient(MONGO_URI)\n    return client['production_database']")
        ]
        
        docs = []
        for chunk_id, path, content in chunks:
            emb = embedder.embed_text(content)
            docs.append({
                "repo": repo,
                "chunk_id": chunk_id,
                "path": path,
                "content": content,
                "chunk_index": 0,
                "embedding": emb
            })
        
        code_vectors_sync.insert_many(docs)
        print("[OK] Sample code chunks inserted.")
        import time
        print("Waiting 10 seconds for Atlas to index the documents...")
        time.sleep(10)
        
        # 2. Query code search (synchronous)
        from app.services.code_indexer import search_code
        query = "authenticate a user and check password"
        print(f"2. Performing semantic code search for: '{query}'...")
        results = search_code(owner="test", repo="repo", query_text=query, top_k=2)
        
        print(f"Found {len(results)} matches:")
        for r in results:
            print(f" - Path: {r['path']} (Score: {r['score']})")
            print(f"   Snippet:\n{r['content']}\n")
            
        # 3. Clean up
        print("3. Cleaning up test data...")
        code_vectors_sync.delete_many({"repo": repo})
        print("[OK] Cleanup complete.")
        
    except Exception as e:
        print(f"[ERROR] Error during code similarity test: {e}")
        print("Make sure you created the 'code_embedding_index' on your 'code_vectors' collection in Atlas.")

async def main():
    print("Starting MongoDB Atlas Vector Search validation...")
    await test_issue_similarity()
    test_code_similarity()
    print("\nValidation finished.")

if __name__ == "__main__":
    asyncio.run(main())

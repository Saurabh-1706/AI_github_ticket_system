"""
Test ChromaDB and embedder integration
"""
import asyncio
from app.core.embedder import embedder
from app.core.chroma_manager import chroma_manager

async def test_chromadb():
    print("Testing ChromaDB Integration...")
    print("="*50)
    
    # Test 1: Generate embeddings
    print("\n1. Testing embedding generation...")
    title1 = "App crashes on startup"
    body1 = "When I launch the app, it immediately crashes with a null pointer exception"
    
    embedding1 = embedder.embed_issue(title1, body1)
    print(f"✅ Generated embedding for issue 1: {len(embedding1)} dimensions")
    print(f"   First 5 values: {embedding1[:5]}")
    
    # Test 2: Add issues to ChromaDB
    print("\n2. Testing ChromaDB storage...")
    repo_name = "test/repo"
    
    chroma_manager.add_issue(
        repo_name=repo_name,
        issue_number=1,
        title=title1,
        body=body1,
        embedding=embedding1
    )
    print(f"✅ Added issue #1 to ChromaDB")
    
    # Add a similar issue
    title2 = "Application fails to launch"
    body2 = "The application won't start and shows an error"
    embedding2 = embedder.embed_issue(title2, body2)
    
    chroma_manager.add_issue(
        repo_name=repo_name,
        issue_number=2,
        title=title2,
        body=body2,
        embedding=embedding2
    )
    print(f"✅ Added issue #2 to ChromaDB")
    
    # Add a different issue
    title3 = "Add dark mode support"
    body3 = "It would be great to have a dark theme option"
    embedding3 = embedder.embed_issue(title3, body3)
    
    chroma_manager.add_issue(
        repo_name=repo_name,
        issue_number=3,
        title=title3,
        body=body3,
        embedding=embedding3
    )
    print(f"✅ Added issue #3 to ChromaDB")
    
    # Test 3: Find similar issues
    print("\n3. Testing similarity search...")
    similar = chroma_manager.find_similar_issues(
        repo_name=repo_name,
        embedding=embedding1,
        top_k=2,
        exclude_issue=1
    )
    
    print(f"✅ Found {len(similar)} similar issues to '{title1}':")
    for issue in similar:
        print(f"   - Issue #{issue['number']}: {issue['title']}")
        print(f"     Similarity: {issue['similarity']:.3f}")
    
    # Test 4: Count issues
    print("\n4. Testing collection count...")
    count = chroma_manager.count_issues(repo_name)
    print(f"✅ Collection has {count} issues")
    
    print("\n" + "="*50)
    print("✅ All tests passed!")

if __name__ == "__main__":
    asyncio.run(test_chromadb())

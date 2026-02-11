from app.core.chroma_manager import chroma_manager

# Check ChromaDB collection
repo_name = "facebook/react"
count = chroma_manager.count_issues(repo_name)
print(f"ChromaDB collection '{repo_name}' has {count} issues")

# Test similarity search with a real issue
from app.core.embedder import embedder

# Test with a crash-related issue
test_title = "Application crashes when clicking button"
test_body = "The app crashes with a null pointer exception when I click the submit button"

embedding = embedder.embed_issue(test_title, test_body)
similar = chroma_manager.find_similar_issues(
    repo_name=repo_name,
    embedding=embedding,
    top_k=5
)

print(f"\nTop 5 similar issues to: '{test_title}'")
print("="*60)
for issue in similar:
    print(f"Issue #{issue['number']}: {issue['title'][:60]}...")
    print(f"  Similarity: {issue['similarity']:.1%}")
    print()

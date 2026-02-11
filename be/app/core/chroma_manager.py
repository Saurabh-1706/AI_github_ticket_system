"""
ChromaDB manager for vector storage and similarity search
"""
import chromadb
from chromadb.config import Settings
import logging
from typing import List, Dict, Any, Optional
import os

logger = logging.getLogger(__name__)


class ChromaManager:
    """Manager for ChromaDB vector database"""
    
    def __init__(self, persist_directory: str = "./chroma_db"):
        """
        Initialize ChromaDB client
        
        Args:
            persist_directory: Directory to persist ChromaDB data
        """
        self.persist_directory = persist_directory
        
        # Create directory if it doesn't exist
        os.makedirs(persist_directory, exist_ok=True)
        
        # Initialize ChromaDB client with persistence
        self.client = chromadb.PersistentClient(
            path=persist_directory,
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
            )
        )
        
        logger.info(f"ChromaDB initialized with persist directory: {persist_directory}")
    
    def get_collection(self, repo_name: str):
        """
        Get or create a collection for a repository
        
        Args:
            repo_name: Repository name (e.g., "facebook/react")
            
        Returns:
            ChromaDB collection
        """
        # Sanitize collection name (ChromaDB has naming restrictions)
        collection_name = repo_name.replace("/", "_").replace("-", "_").lower()
        
        try:
            collection = self.client.get_or_create_collection(
                name=collection_name,
                metadata={"repo": repo_name}
            )
            return collection
        except Exception as e:
            logger.error(f"Error getting collection for {repo_name}: {e}")
            raise
    
    def add_issue(
        self,
        repo_name: str,
        issue_number: int,
        title: str,
        body: str,
        embedding: List[float],
        metadata: Optional[Dict[str, Any]] = None
    ):
        """
        Add or update an issue in ChromaDB
        
        Args:
            repo_name: Repository name
            issue_number: Issue number
            title: Issue title
            body: Issue body
            embedding: Embedding vector
            metadata: Additional metadata
        """
        collection = self.get_collection(repo_name)
        
        # Create document ID
        doc_id = f"issue_{issue_number}"
        
        # Prepare metadata
        meta = {
            "issue_number": issue_number,
            "title": title,
            "repo": repo_name
        }
        if metadata:
            meta.update(metadata)
        
        # Prepare document (title + body snippet for display)
        document = f"{title}\n{body[:500] if body else ''}"
        
        try:
            # Upsert (add or update)
            collection.upsert(
                ids=[doc_id],
                embeddings=[embedding],
                documents=[document],
                metadatas=[meta]
            )
        except Exception as e:
            logger.error(f"Error adding issue #{issue_number} to ChromaDB: {e}")
            raise
    
    def find_similar_issues(
        self,
        repo_name: str,
        embedding: List[float],
        top_k: int = 3,
        exclude_issue: Optional[int] = None
    ) -> List[Dict[str, Any]]:
        """
        Find similar issues using vector similarity
        
        Args:
            repo_name: Repository name
            embedding: Query embedding vector
            top_k: Number of similar issues to return
            exclude_issue: Issue number to exclude from results
            
        Returns:
            List of similar issues with similarity scores
        """
        collection = self.get_collection(repo_name)
        
        try:
            # Query ChromaDB
            results = collection.query(
                query_embeddings=[embedding],
                n_results=top_k + 1 if exclude_issue else top_k  # Get extra in case we need to exclude
            )
            
            if not results or not results['ids'] or not results['ids'][0]:
                return []
            
            # Parse results
            similar_issues = []
            for i, doc_id in enumerate(results['ids'][0]):
                issue_number = results['metadatas'][0][i]['issue_number']
                
                # Skip excluded issue
                if exclude_issue and issue_number == exclude_issue:
                    continue
                
                # Calculate similarity (ChromaDB returns distance, convert to similarity)
                # Distance is L2 distance, convert to cosine similarity approximation
                distance = results['distances'][0][i]
                similarity = 1 / (1 + distance)  # Convert distance to similarity (0-1 range)
                
                similar_issues.append({
                    'number': issue_number,
                    'title': results['metadatas'][0][i]['title'],
                    'similarity': round(similarity, 3)
                })
                
                if len(similar_issues) >= top_k:
                    break
            
            return similar_issues
            
        except Exception as e:
            logger.error(f"Error finding similar issues: {e}")
            return []
    
    def delete_issue(self, repo_name: str, issue_number: int):
        """Delete an issue from ChromaDB"""
        collection = self.get_collection(repo_name)
        doc_id = f"issue_{issue_number}"
        
        try:
            collection.delete(ids=[doc_id])
        except Exception as e:
            logger.error(f"Error deleting issue #{issue_number}: {e}")
    
    def count_issues(self, repo_name: str) -> int:
        """Count number of issues in collection"""
        collection = self.get_collection(repo_name)
        return collection.count()
    
    def reset_collection(self, repo_name: str):
        """Delete and recreate a collection"""
        collection_name = repo_name.replace("/", "_").replace("-", "_").lower()
        
        try:
            self.client.delete_collection(name=collection_name)
            logger.info(f"Deleted collection: {collection_name}")
        except Exception as e:
            logger.warning(f"Could not delete collection {collection_name}: {e}")


# Global ChromaDB manager instance
chroma_manager = ChromaManager()

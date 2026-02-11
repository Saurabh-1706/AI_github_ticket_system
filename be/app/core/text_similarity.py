"""
Simple text similarity utilities for duplicate detection
"""
from typing import List, Set
import re
from collections import Counter
import math


def tokenize(text: str) -> List[str]:
    """Tokenize text into words"""
    # Convert to lowercase and split on non-alphanumeric
    text = text.lower()
    words = re.findall(r'\b\w+\b', text)
    # Remove common stop words
    stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how'}
    return [w for w in words if w not in stop_words and len(w) > 2]


def jaccard_similarity(text1: str, text2: str) -> float:
    """Calculate Jaccard similarity between two texts"""
    tokens1 = set(tokenize(text1))
    tokens2 = set(tokenize(text2))
    
    if not tokens1 or not tokens2:
        return 0.0
    
    intersection = tokens1.intersection(tokens2)
    union = tokens1.union(tokens2)
    
    return len(intersection) / len(union) if union else 0.0


def cosine_similarity(text1: str, text2: str) -> float:
    """Calculate cosine similarity between two texts using TF"""
    tokens1 = tokenize(text1)
    tokens2 = tokenize(text2)
    
    if not tokens1 or not tokens2:
        return 0.0
    
    # Create term frequency vectors
    vec1 = Counter(tokens1)
    vec2 = Counter(tokens2)
    
    # Get all unique terms
    all_terms = set(vec1.keys()).union(set(vec2.keys()))
    
    # Calculate dot product and magnitudes
    dot_product = sum(vec1.get(term, 0) * vec2.get(term, 0) for term in all_terms)
    magnitude1 = math.sqrt(sum(count ** 2 for count in vec1.values()))
    magnitude2 = math.sqrt(sum(count ** 2 for count in vec2.values()))
    
    if magnitude1 == 0 or magnitude2 == 0:
        return 0.0
    
    return dot_product / (magnitude1 * magnitude2)


def calculate_similarity(title1: str, body1: str, title2: str, body2: str) -> float:
    """
    Calculate overall similarity between two issues
    Title has higher weight than body
    """
    # Title similarity (weight: 0.7)
    title_sim = cosine_similarity(title1, title2)
    
    # Body similarity (weight: 0.3)
    body_sim = cosine_similarity(body1 or "", body2 or "")
    
    # Weighted average
    overall_sim = (title_sim * 0.7) + (body_sim * 0.3)
    
    return overall_sim


def find_similar_issues(
    target_title: str,
    target_body: str,
    issues: List[dict],
    top_k: int = 3,
    min_similarity: float = 0.3
) -> List[dict]:
    """
    Find similar issues to the target issue
    
    Args:
        target_title: Title of the target issue
        target_body: Body of the target issue
        issues: List of issue dicts with 'number', 'title', 'body'
        top_k: Number of top similar issues to return
        min_similarity: Minimum similarity threshold
    
    Returns:
        List of similar issues with similarity scores
    """
    similarities = []
    
    for issue in issues:
        sim = calculate_similarity(
            target_title,
            target_body,
            issue.get('title', ''),
            issue.get('body', '')
        )
        
        if sim >= min_similarity:
            similarities.append({
                'number': issue.get('number'),
                'title': issue.get('title'),
                'similarity': sim
            })
    
    # Sort by similarity descending
    similarities.sort(key=lambda x: x['similarity'], reverse=True)
    
    # Return top k
    return similarities[:top_k]

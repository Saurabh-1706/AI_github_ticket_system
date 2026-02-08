"""
Issue Categorizer - Rule-based classification for GitHub issues.

Categorizes issues into types to improve similarity matching by prepending
category information to embeddings.
"""

import re
from typing import Dict, List, Tuple


class IssueCategori:
    """
    Categorizes GitHub issues based on title and body content.
    """
    
    # Category keywords with weights
    CATEGORY_PATTERNS = {
        "bug": {
            "keywords": [
                "bug", "error", "issue", "problem", "broken", "crash", "fail",
                "exception", "not working", "doesn't work", "incorrect", "wrong",
                "unexpected", "regression", "defect", "fault"
            ],
            "weight": 1.0
        },
        "feature": {
            "keywords": [
                "feature", "enhancement", "add", "implement", "support", "new",
                "request", "proposal", "improvement", "would like", "could we",
                "ability to", "allow", "enable"
            ],
            "weight": 1.0
        },
        "documentation": {
            "keywords": [
                "docs", "documentation", "readme", "guide", "tutorial", "example",
                "comment", "typo", "spelling", "grammar", "clarify", "explain"
            ],
            "weight": 0.9
        },
        "security": {
            "keywords": [
                "security", "vulnerability", "exploit", "xss", "sql injection",
                "csrf", "authentication", "authorization", "cve", "sensitive",
                "leak", "exposure", "unsafe"
            ],
            "weight": 1.2  # Higher weight for security issues
        },
        "performance": {
            "keywords": [
                "performance", "slow", "speed", "optimize", "memory", "cpu",
                "lag", "latency", "bottleneck", "efficiency", "faster", "cache"
            ],
            "weight": 1.0
        },
        "question": {
            "keywords": [
                "question", "how to", "how do i", "help", "what is", "why",
                "when", "where", "which", "clarification", "confused", "understand"
            ],
            "weight": 0.8
        },
        "dependency": {
            "keywords": [
                "dependency", "dependencies", "package", "npm", "pip", "yarn",
                "upgrade", "update", "version", "outdated", "deprecat"
            ],
            "weight": 0.9
        },
        "testing": {
            "keywords": [
                "test", "testing", "unit test", "integration test", "e2e",
                "coverage", "mock", "fixture", "assertion", "spec"
            ],
            "weight": 0.9
        },
        "refactor": {
            "keywords": [
                "refactor", "cleanup", "clean up", "reorganize", "restructure",
                "simplify", "improve code", "code quality", "technical debt"
            ],
            "weight": 0.8
        }
    }
    
    def __init__(self):
        # Compile regex patterns for efficiency
        self.compiled_patterns = {}
        for category, data in self.CATEGORY_PATTERNS.items():
            # Create regex pattern that matches whole words
            pattern = r'\b(' + '|'.join(re.escape(kw) for kw in data["keywords"]) + r')\b'
            self.compiled_patterns[category] = {
                "pattern": re.compile(pattern, re.IGNORECASE),
                "weight": data["weight"]
            }
    
    def categorize(self, title: str, body: str = "") -> Dict[str, any]:
        """
        Categorize an issue based on its title and body.
        
        Args:
            title: Issue title
            body: Issue body/description
            
        Returns:
            {
                "primary_category": str,
                "categories": List[str],
                "confidence": float,
                "scores": Dict[str, float]
            }
        """
        text = f"{title} {body}".lower()
        
        # Calculate scores for each category
        scores = {}
        for category, data in self.compiled_patterns.items():
            matches = data["pattern"].findall(text)
            # Score = (number of matches * weight)
            score = len(matches) * data["weight"]
            if score > 0:
                scores[category] = score
        
        # If no matches, default to "general"
        if not scores:
            return {
                "primary_category": "general",
                "categories": ["general"],
                "confidence": 0.5,
                "scores": {}
            }
        
        # Sort by score
        sorted_categories = sorted(scores.items(), key=lambda x: x[1], reverse=True)
        primary_category = sorted_categories[0][0]
        primary_score = sorted_categories[0][1]
        
        # Get all categories with significant scores (>30% of primary)
        threshold = primary_score * 0.3
        significant_categories = [cat for cat, score in sorted_categories if score >= threshold]
        
        # Calculate confidence (0-1 scale)
        total_score = sum(scores.values())
        confidence = min(primary_score / (total_score + 1), 1.0)
        
        return {
            "primary_category": primary_category,
            "categories": significant_categories,
            "confidence": round(confidence, 2),
            "scores": {k: round(v, 2) for k, v in scores.items()}
        }
    
    def get_category_prefix(self, category: str) -> str:
        """
        Get a prefix string for embedding enhancement.
        
        Args:
            category: Category name
            
        Returns:
            Prefix string to prepend to issue text before embedding
        """
        return f"[{category.upper()}]"
    
    def enhance_text_for_embedding(self, title: str, body: str, category: str) -> str:
        """
        Enhance issue text with category information for better embeddings.
        
        Args:
            title: Issue title
            body: Issue body
            category: Primary category
            
        Returns:
            Enhanced text with category prefix
        """
        prefix = self.get_category_prefix(category)
        return f"{prefix} {title}\n{body}"


# Singleton instance
categorizer = IssueCategori()

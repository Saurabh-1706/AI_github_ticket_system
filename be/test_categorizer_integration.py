"""
Test the intelligent categorizer integration
"""
import asyncio
from app.ai.categorizer import categorizer

# Test cases
test_issues = [
    {
        "title": "Application crashes when clicking submit button",
        "body": "Steps to reproduce:\n1. Open the form\n2. Fill in data\n3. Click submit\n4. App crashes with error"
    },
    {
        "title": "Add dark mode support",
        "body": "It would be great to have a dark mode option for better user experience"
    },
    {
        "title": "Update README with installation instructions",
        "body": "The README is missing clear installation steps. Need to add npm install instructions."
    },
    {
        "title": "How do I configure the API endpoint?",
        "body": "I'm trying to set up the project but can't figure out how to configure the API endpoint. Can someone help?"
    },
    {
        "title": "Improve performance of data fetching",
        "body": "The data fetching is very slow. We should implement caching to improve performance."
    }
]

print("Testing Intelligent Categorizer\n" + "="*60)

for issue in test_issues:
    result = categorizer.categorize(issue["title"], issue["body"])
    print(f"\nTitle: {issue['title']}")
    print(f"Primary Category: {result['primary_category']}")
    print(f"Confidence: {result['confidence']}")
    print(f"All Categories: {result['categories']}")
    print(f"Scores: {result['scores']}")
    print("-" * 60)

"""
Test script to debug issue categorization
"""
from app.ai.categorizer import categorizer

# Test cases - real GitHub issue examples
test_issues = [
    {
        "title": "Application crashes when clicking submit button",
        "body": "When I click the submit button, the app crashes immediately"
    },
    {
        "title": "Add dark mode support",
        "body": "It would be great to have a dark mode option for the UI"
    },
    {
        "title": "Fix typo in README",
        "body": "There's a spelling mistake in the installation guide"
    },
    {
        "title": "Slow performance on large datasets",
        "body": "The application becomes very slow when processing files over 100MB"
    },
    {
        "title": "Update dependencies to latest versions",
        "body": "Several npm packages are outdated and need updating"
    },
    {
        "title": "How do I configure authentication?",
        "body": "I'm trying to set up OAuth but can't find the configuration docs"
    },
    {
        "title": "Login form not working",
        "body": "Users cannot log in, getting 500 error"
    },
    {
        "title": "Implement user profile page",
        "body": "We need a page where users can edit their profile information"
    }
]

print("=" * 80)
print("CATEGORIZATION TEST RESULTS")
print("=" * 80)

for i, issue in enumerate(test_issues, 1):
    result = categorizer.categorize(issue["title"], issue["body"])
    
    print(f"\n{i}. Title: {issue['title']}")
    print(f"   Category: {result['primary_category']}")
    print(f"   Confidence: {result['confidence']}")
    print(f"   All categories: {result['categories']}")
    print(f"   Scores: {result['scores']}")

print("\n" + "=" * 80)

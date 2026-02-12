import sys
sys.path.insert(0, 'D:\\Project\\github-ai-ticket-solver\\be')

from app.ai.categorizer import categorizer

# Comprehensive test cases
tests = [
    ("Application crashes when clicking submit", "The app crashes", "bug"),
    ("Add dark mode support", "Would like dark mode", "feature"),
    ("Fix typo in README", "Spelling mistake", "documentation"),
    ("Slow performance on large files", "Very slow", "performance"),
    ("Update npm dependencies", "Packages are outdated", "dependency"),
    ("How do I configure OAuth?", "Can't find docs", "question"),
    ("Login not working", "Users cannot log in", "bug"),
    ("Implement user profiles", "Need profile page", "feature"),
    ("Memory leak in background process", "High memory usage", "bug"),
    ("Add unit tests for API", "Need test coverage", "testing"),
]

print("=" * 80)
print("CATEGORIZATION TEST RESULTS")
print("=" * 80)

correct = 0
total = len(tests)

for title, body, expected in tests:
    result = categorizer.categorize(title, body)
    actual = result['primary_category']
    status = "✅" if actual == expected else "❌"
    
    if actual == expected:
        correct += 1
    
    print(f"\n{status} Title: {title}")
    print(f"   Expected: {expected} | Got: {actual}")
    if result['scores']:
        print(f"   Scores: {result['scores']}")

print("\n" + "=" * 80)
print(f"ACCURACY: {correct}/{total} ({100*correct/total:.1f}%)")
print("=" * 80)

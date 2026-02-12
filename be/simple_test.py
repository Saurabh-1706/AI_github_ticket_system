import sys
sys.path.insert(0, 'D:\\Project\\github-ai-ticket-solver\\be')

from app.ai.categorizer import categorizer

# Test 1: Bug issue
result1 = categorizer.categorize("Application crashes", "The app crashes when I click submit")
print(f"Test 1 - Bug issue:")
print(f"  Category: {result1['primary_category']}")
print(f"  Scores: {result1['scores']}\n")

# Test 2: Feature request
result2 = categorizer.categorize("Add dark mode", "Would like to have dark mode support")
print(f"Test 2 - Feature request:")
print(f"  Category: {result2['primary_category']}")
print(f"  Scores: {result2['scores']}\n")

# Test 3: Generic issue (should be 'general')
result3 = categorizer.categorize("Some random title", "Some random description")
print(f"Test 3 - Generic issue:")
print(f"  Category: {result3['primary_category']}")
print(f"  Scores: {result3['scores']}\n")

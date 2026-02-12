import sys
sys.path.insert(0, 'D:\\Project\\github-ai-ticket-solver\\be')

from app.ai.categorizer import categorizer
import re

# Check the regex pattern for "bug"
bug_pattern = categorizer.compiled_patterns['bug']['pattern']
print(f"Bug pattern: {bug_pattern.pattern}\n")

# Test text
text = "application crashes when clicking submit".lower()
print(f"Test text: '{text}'")
print(f"Matches: {bug_pattern.findall(text)}")
print(f"Number of matches: {len(bug_pattern.findall(text))}\n")

# Full categorization
result = categorizer.categorize("Application crashes", "when clicking submit")
print(f"Category: {result['primary_category']}")
print(f"Scores: {result['scores']}")

import requests
from datetime import datetime

# Fetch one issue from GitHub API
response = requests.get('https://api.github.com/repos/facebook/react/issues/34142')
issue = response.json()

print("Issue data structure:")
print(f"Number: {issue.get('number')}")
print(f"Title: {issue.get('title')}")
print(f"Body type: {type(issue.get('body'))}")
print(f"Body is None: {issue.get('body') is None}")
print(f"User type: {type(issue.get('user'))}")
print(f"User is None: {issue.get('user') is None}")
print(f"Labels type: {type(issue.get('labels'))}")
print(f"Labels is None: {issue.get('labels') is None}")
print(f"Created at: {issue.get('created_at')}")
print(f"Updated at: {issue.get('updated_at')}")

# Try parsing dates
try:
    created = datetime.fromisoformat(issue["created_at"].replace("Z", "+00:00"))
    print(f"✅ Created date parsed: {created}")
except Exception as e:
    print(f"❌ Created date failed: {e}")

try:
    updated = datetime.fromisoformat(issue["updated_at"].replace("Z", "+00:00"))
    print(f"✅ Updated date parsed: {updated}")
except Exception as e:
    print(f"❌ Updated date failed: {e}")

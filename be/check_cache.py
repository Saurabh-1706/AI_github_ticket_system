from pymongo import MongoClient
import os
from dotenv import load_dotenv

load_dotenv()

client = MongoClient(os.getenv('MONGO_URI', 'mongodb://localhost:27017'))
db = client['git_intellisolve']

print(f'Total cached issues: {db.cached_issues.count_documents({})}')

repos = list(db.cached_repositories.find())
print(f'Cached repos: {len(repos)}')

for r in repos:
    issue_count = db.cached_issues.count_documents({'repository_id': r['_id']})
    print(f"  - {r.get('owner')}/{r.get('name')}: {issue_count} issues")
    print(f"    Last synced: {r.get('last_synced')}")
    
    # Show first few issues
    issues = list(db.cached_issues.find({'repository_id': r['_id']}).limit(5))
    print(f"    Sample issues: {[i.get('number') for i in issues]}")

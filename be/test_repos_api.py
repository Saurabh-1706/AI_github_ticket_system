import requests

r = requests.get('http://localhost:8000/api/cache/repositories')
print('Status:', r.status_code)
repos = r.json()['repositories']
print(f'Repositories: {len(repos)}')
for repo in repos:
    print(f"  - {repo['full_name']} ({repo['issue_count']} issues)")

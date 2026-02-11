import requests
import json

# Trigger a manual sync
response = requests.post(
    'http://localhost:8000/api/cache/sync',
    json={
        'owner': 'facebook',
        'repo': 'react',
        'force_full_sync': True
    }
)

print(f"Status: {response.status_code}")
print(f"Response: {json.dumps(response.json(), indent=2)}")

"""
Force re-sync repository to populate Type field in AI analysis

This script will force a full re-sync of a repository to update all cached issues
with the new AI analysis structure including the 'type' field.

Usage:
    python force_resync.py <owner> <repo>
    
Example:
    python force_resync.py facebook react
"""

import asyncio
import sys
from app.services.cache_service import CacheService

async def force_resync(owner: str, repo: str):
    """Force a full re-sync of the repository"""
    print(f"🔄 Starting force re-sync for {owner}/{repo}")
    
    cache_service = CacheService()
    
    try:
        # Force full sync (force_full_sync=True)
        result = await cache_service.sync_repository(
            owner=owner,
            repo=repo,
            force_full_sync=True,  # This forces re-analysis of all issues
            user_token=None
        )
        
        print(f"✅ Sync complete!")
        print(f"   - Synced: {result['synced']} issues")
        print(f"   - Total fetched: {result['total_fetched']} issues")
        print(f"   - Last synced: {result['last_synced']}")
        
        print(f"\n🎉 All issues now have complete AI analysis with Type field!")
        
    except Exception as e:
        print(f"❌ Error during sync: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python force_resync.py <owner> <repo>")
        print("Example: python force_resync.py facebook react")
        sys.exit(1)
    
    owner = sys.argv[1]
    repo = sys.argv[2]
    
    asyncio.run(force_resync(owner, repo))

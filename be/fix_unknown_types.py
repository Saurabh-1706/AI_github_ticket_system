"""
fix_unknown_types.py
────────────────────
Finds all cached issues where ai_analysis is null OR ai_analysis.type is
missing/null/empty/"unknown" and re-runs the categorizer on title+body.

Run from be/ directory:
    python fix_unknown_types.py
"""

import os
import asyncio
from dotenv import load_dotenv
load_dotenv()

from motor.motor_asyncio import AsyncIOMotorClient
from app.ai.categorizer import categorizer

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

DEFAULT_ANALYSIS = {
    "type": "general",
    "criticality": "low",
    "confidence": 0.0,
    "similar_issues": []
}


async def fix_unknown_types():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client["git_intellisolve"]
    cached_issues = db["cached_issues"]

    # Match issues where ai_analysis is null OR type is unknown/missing
    query = {
        "$or": [
            {"ai_analysis": None},
            {"ai_analysis": {"$exists": False}},
            {"ai_analysis.type": {"$exists": False}},
            {"ai_analysis.type": None},
            {"ai_analysis.type": ""},
            {"ai_analysis.type": "unknown"},
        ]
    }

    total = await cached_issues.count_documents(query)
    print(f"Found {total} issues to fix...")

    if total == 0:
        print("✅ Nothing to fix!")
        client.close()
        return

    fixed = 0
    failed = 0

    async for issue in cached_issues.find(query, {"_id": 1, "title": 1, "body": 1, "number": 1, "ai_analysis": 1}):
        try:
            title = issue.get("title", "") or ""
            body = issue.get("body", "") or ""

            # Determine correct type via categorizer
            category_info = categorizer.categorize(title, body)
            issue_type = category_info["primary_category"]

            existing_analysis = issue.get("ai_analysis")

            if existing_analysis is None:
                # ai_analysis is null → replace entire object with defaults + correct type
                new_analysis = {**DEFAULT_ANALYSIS, "type": issue_type}
                await cached_issues.update_one(
                    {"_id": issue["_id"]},
                    {"$set": {
                        "ai_analysis": new_analysis,
                        "category": issue_type,
                    }}
                )
            else:
                # ai_analysis exists but type is wrong → only update type field
                await cached_issues.update_one(
                    {"_id": issue["_id"]},
                    {"$set": {
                        "ai_analysis.type": issue_type,
                        "category": issue_type,
                    }}
                )

            fixed += 1
            if fixed % 30 == 0:
                print(f"  Progress: {fixed}/{total}...")

        except Exception as e:
            failed += 1
            print(f"  ⚠️  Failed issue #{issue.get('number', '?')}: {e}")

    print(f"\n✅ Done! Fixed: {fixed}  |  Failed: {failed}  |  Total: {total}")
    client.close()


if __name__ == "__main__":
    asyncio.run(fix_unknown_types())

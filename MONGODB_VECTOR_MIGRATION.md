# MongoDB Vector Search Migration Plan
### Git IntelliSolve — Replace ChromaDB with MongoDB Atlas

---

## What We're Replacing and Where

After reading every file in your codebase, ChromaDB is touched in **6 files** across two separate client patterns:

### Pattern A — `chroma_manager` (the active one, used by main pipeline)
| File | What it does |
|---|---|
| `be/app/services/cache_service.py` | `add_issue()` on sync, `find_similar_issues()` in analysis, `reset_collection()` on repo delete |
| `be/app/api/ai_features.py` | `find_similar_issues()` as live fallback when stored analysis is empty |
| `be/app/api/webhook.py` | `add_issue()` on new webhook event, `delete_issue()` on issue deleted event |

### Pattern B — `chroma` (the older client, used by github.py and solution.py)
| File | What it does |
|---|---|
| `be/app/api/github.py` | `chroma.count()`, `chroma.query()`, `chroma.issue_exists()`, `chroma.add_issue()` |
| `be/app/api/solution.py` | `chroma.query()` for RAG solution retrieval |

Both patterns get replaced. One new MongoDB vector manager replaces both.

---

## Step 0 — Atlas Setup (Do This First, Before Any Code)

### 0a. Enable Vector Search on your Atlas cluster

1. Go to [cloud.mongodb.com](https://cloud.mongodb.com)
2. Open your cluster → **Atlas Search** tab → **Create Search Index**
3. Choose **JSON Editor**, select database `git_intellisolve`, collection `issue_vectors`
4. Paste this config:

```json
{
  "mappings": {
    "dynamic": false,
    "fields": {
      "embedding": {
        "type": "knnVector",
        "dimensions": 384,
        "similarity": "cosine"
      },
      "repo": {
        "type": "token"
      },
      "state": {
        "type": "token"
      }
    }
  }
}
```

5. Name the index: `issue_embedding_index`
6. Click **Create** — takes 1–2 minutes to become active

> `dimensions: 384` matches `all-MiniLM-L6-v2` output exactly. Don't change this.

### 0b. Add a regular index for fast repo filtering

In Atlas → **Collections** → `issue_vectors` → **Indexes** → **Create Index**:

```json
{ "repo": 1, "issue_number": 1 }
```

This makes `delete_issue` and `reset_collection` fast.

---

## Step 1 — Add `issue_vectors` collection to `mongo.py`

**File:** `be/app/db/mongo.py`

Add one line to the existing async collections:

```python
# be/app/db/mongo.py

import os
from pymongo import MongoClient
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")

# Synchronous client
client = MongoClient(MONGO_URI)
db = client["git_intellisolve"]
repos_collection = db["repositories"]
solution_memory = db["solution_memory"]

# Async client
async_client = AsyncIOMotorClient(MONGO_URI)
async_db = async_client["git_intellisolve"]

cached_repositories = async_db["cached_repositories"]
cached_issues       = async_db["cached_issues"]
solutions           = async_db["solutions"]
code_file_index     = async_db["code_file_index"]

# ✅ NEW — vector store replacing ChromaDB
issue_vectors = async_db["issue_vectors"]


def get_database():
    return db
```

---

## Step 2 — Create `mongo_vector_manager.py`

This is the direct drop-in replacement for `chroma_manager.py`. It exposes the **exact same 4 methods** so every call site works without changes.

**Create file:** `be/app/core/mongo_vector_manager.py`

```python
"""
be/app/core/mongo_vector_manager.py

Drop-in replacement for chroma_manager.py.
Exposes the same 4-method interface:
  - add_issue()
  - find_similar_issues()
  - delete_issue()
  - reset_collection()

Uses MongoDB Atlas Vector Search on the `issue_vectors` collection.
"""
import logging
from typing import Any, Dict, List, Optional

from app.db.mongo import issue_vectors

logger = logging.getLogger(__name__)

VECTOR_INDEX_NAME = "issue_embedding_index"


class MongoVectorManager:

    # ──────────────────────────────────────────────────────────────────────────
    # Public API  (matches chroma_manager interface exactly)
    # ──────────────────────────────────────────────────────────────────────────

    async def add_issue(
        self,
        repo_name: str,
        issue_number: int,
        title: str,
        body: str,
        embedding: List[float],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """
        Upsert a single issue's embedding into MongoDB.
        Replaces: chroma_manager.add_issue()
        """
        doc = {
            "repo":         repo_name,
            "issue_number": issue_number,
            "title":        title,
            "body":         (body or "")[:2000],   # cap to avoid huge docs
            "embedding":    embedding,
            "state":        (metadata or {}).get("state", "open"),
        }
        try:
            await issue_vectors.update_one(
                {"repo": repo_name, "issue_number": issue_number},
                {"$set": doc},
                upsert=True,
            )
            logger.debug(f"Upserted vector for {repo_name}#{issue_number}")
        except Exception as e:
            logger.error(f"MongoVectorManager.add_issue failed for {repo_name}#{issue_number}: {e}")
            raise

    async def find_similar_issues(
        self,
        repo_name: str,
        embedding: List[float],
        top_k: int = 5,
        exclude_issue: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Return up to top_k similar issues within the same repo.
        Each result: {"number": int, "title": str, "similarity": float, "state": str}
        Replaces: chroma_manager.find_similar_issues()
        """
        # Fetch extra so we can drop the excluded issue after
        num_candidates = max(top_k * 10, 50)
        fetch_limit    = top_k + (1 if exclude_issue is not None else 0)

        pipeline = [
            {
                "$vectorSearch": {
                    "index":         VECTOR_INDEX_NAME,
                    "path":          "embedding",
                    "queryVector":   embedding,
                    "numCandidates": num_candidates,
                    "limit":         fetch_limit,
                    "filter": {
                        "repo": {"$eq": repo_name}
                    },
                }
            },
            {
                "$project": {
                    "issue_number": 1,
                    "title":        1,
                    "state":        1,
                    "similarity":   {"$meta": "vectorSearchScore"},
                    "_id":          0,
                }
            },
        ]

        try:
            cursor  = issue_vectors.aggregate(pipeline)
            results = []
            async for doc in cursor:
                if exclude_issue is not None and doc["issue_number"] == exclude_issue:
                    continue
                results.append({
                    "number":     doc["issue_number"],
                    "title":      doc.get("title", ""),
                    "similarity": round(doc.get("similarity", 0.0), 4),
                    "state":      doc.get("state", "open"),
                })
                if len(results) >= top_k:
                    break
            return results
        except Exception as e:
            logger.error(f"MongoVectorManager.find_similar_issues failed for {repo_name}: {e}")
            return []   # graceful fallback — same behaviour as original

    async def delete_issue(self, repo_name: str, issue_number: int) -> None:
        """
        Remove a single issue's vector (best-effort).
        Replaces: chroma_manager.delete_issue()
        """
        try:
            await issue_vectors.delete_one(
                {"repo": repo_name, "issue_number": issue_number}
            )
        except Exception as e:
            logger.warning(f"MongoVectorManager.delete_issue failed for {repo_name}#{issue_number}: {e}")

    async def reset_collection(self, repo_name: str) -> None:
        """
        Delete all vectors for a repo (called when user deletes a repo).
        Replaces: chroma_manager.reset_collection()
        """
        try:
            result = await issue_vectors.delete_many({"repo": repo_name})
            logger.info(f"Deleted {result.deleted_count} vectors for {repo_name}")
        except Exception as e:
            logger.warning(f"MongoVectorManager.reset_collection failed for {repo_name}: {e}")


# Singleton — same pattern as chroma_manager.py
mongo_vector_manager = MongoVectorManager()
```

---

## Step 3 — Create `mongo_chroma_client.py`

This replaces the **older** `chroma_client.py` used by `github.py` and `solution.py`. Same interface, MongoDB backend.

**Create file:** `be/app/vector/mongo_chroma_client.py`

```python
"""
be/app/vector/mongo_chroma_client.py

Drop-in replacement for chroma_client.py (ChromaStore / chroma singleton).
Used by: api/github.py, api/solution.py

Exposes the same methods:
  - add_issue(owner, repo, issue_id, embedding, metadata)
  - query(owner, repo, embedding, limit)
  - issue_exists(owner, repo, issue_id)
  - count(owner, repo)
  - query_similar(owner, repo, text, limit)
"""
import asyncio
import logging
from typing import Dict, List

from app.db.mongo import issue_vectors, async_db

logger = logging.getLogger(__name__)

VECTOR_INDEX_NAME = "issue_embedding_index"


class MongoChromaStore:
    """
    Mimics the ChromaStore interface used in github.py and solution.py.
    Note: github.py and solution.py call these synchronously from sync endpoints,
    so we run the async motor calls via asyncio.run() or a helper below.
    """

    def _repo_name(self, owner: str, repo: str) -> str:
        return f"{owner}/{repo}"

    # ── async internals ──────────────────────────────────────────────────────

    async def _add_issue_async(self, owner, repo, issue_id, embedding, metadata):
        doc = {
            "repo":         self._repo_name(owner, repo),
            "issue_number": int(issue_id),
            "title":        metadata.get("title", ""),
            "body":         (metadata.get("body", "") or "")[:2000],
            "embedding":    embedding,
            "state":        metadata.get("state", "open"),
            "category":     metadata.get("category", ""),
            "number":       metadata.get("number"),
        }
        await issue_vectors.update_one(
            {"repo": self._repo_name(owner, repo), "issue_number": int(issue_id)},
            {"$set": doc},
            upsert=True,
        )

    async def _query_async(self, owner, repo, embedding, limit):
        pipeline = [
            {
                "$vectorSearch": {
                    "index":         VECTOR_INDEX_NAME,
                    "path":          "embedding",
                    "queryVector":   embedding,
                    "numCandidates": limit * 10,
                    "limit":         limit,
                    "filter":        {"repo": {"$eq": self._repo_name(owner, repo)}},
                }
            },
            {
                "$project": {
                    "issue_number": 1,
                    "title":        1,
                    "body":         1,
                    "number":       1,
                    "category":     1,
                    "embedding":    1,
                    "state":        1,
                    "similarity":   {"$meta": "vectorSearchScore"},
                    "_id":          0,
                }
            },
        ]
        ids, metadatas, embeddings = [], [], []
        async for doc in issue_vectors.aggregate(pipeline):
            ids.append(str(doc.get("issue_number", "")))
            metadatas.append({
                "title":    doc.get("title", ""),
                "number":   doc.get("number"),
                "state":    doc.get("state", "open"),
                "category": doc.get("category", ""),
                "body":     doc.get("body", ""),
            })
            embeddings.append(doc.get("embedding", []))
        # Return in ChromaDB result format so github.py needs zero changes
        return {
            "ids":        [ids],
            "metadatas":  [metadatas],
            "embeddings": [embeddings],
        }

    async def _count_async(self, owner, repo):
        return await issue_vectors.count_documents(
            {"repo": self._repo_name(owner, repo)}
        )

    async def _exists_async(self, owner, repo, issue_id):
        doc = await issue_vectors.find_one(
            {"repo": self._repo_name(owner, repo), "issue_number": int(issue_id)}
        )
        return doc is not None

    # ── sync public API (matches chroma_client.ChromaStore) ─────────────────

    def _run(self, coro):
        """Run async coroutine from sync context."""
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                # Already inside an async context (FastAPI) — create a task
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    future = pool.submit(asyncio.run, coro)
                    return future.result()
            else:
                return loop.run_until_complete(coro)
        except RuntimeError:
            return asyncio.run(coro)

    def add_issue(self, owner: str, repo: str, issue_id: str, embedding: List[float], metadata: Dict):
        self._run(self._add_issue_async(owner, repo, issue_id, embedding, metadata))

    def query(self, owner: str, repo: str, embedding: List[float], limit: int = 6):
        return self._run(self._query_async(owner, repo, embedding, limit))

    def issue_exists(self, owner: str, repo: str, issue_id: str) -> bool:
        return self._run(self._exists_async(owner, repo, issue_id))

    def count(self, owner: str, repo: str) -> int:
        return self._run(self._count_async(owner, repo))

    def query_similar(self, owner: str, repo: str, text: str, limit: int = 5):
        from app.vector.embeddings import EmbeddingService
        embedding = EmbeddingService().embed_text(text)
        return self.query(owner, repo, embedding, limit)


# Singleton — same name as chroma_client.py so imports work unchanged
chroma = MongoChromaStore()
```

---

## Step 4 — Update All Import Lines (6 changes, no logic changes)

### 4a. `be/app/core/chroma_manager.py`

Replace the entire singleton at the bottom:

```python
# OLD (bottom of chroma_manager.py)
chroma_manager = ChromaManager()

# NEW — replace with:
from app.core.mongo_vector_manager import mongo_vector_manager as chroma_manager
```

> The rest of `chroma_manager.py` can stay. The singleton name `chroma_manager` is now just an alias pointing to the new class. Every file that does `from app.core.chroma_manager import chroma_manager` gets the MongoDB implementation automatically.

---

### 4b. `be/app/vector/chroma_client.py`

Replace the singleton at the bottom:

```python
# OLD (bottom of chroma_client.py)
chroma = ChromaStore()

# NEW — replace with:
from app.vector.mongo_chroma_client import MongoChromaStore
chroma = MongoChromaStore()
```

---

### 4c. `be/app/services/cache_service.py`

Three places. All use `chroma_manager` — **no changes needed** since Step 4a already rewires the singleton. Just make sure the `await` keywords are present since the new methods are async:

```python
# Line ~185 — add_issue call
# OLD:
chroma_manager.add_issue(...)
# NEW:
await chroma_manager.add_issue(...)

# Line ~375 — find_similar_issues call  
# OLD:
similar_issues = chroma_manager.find_similar_issues(...)
# NEW:
similar_issues = await chroma_manager.find_similar_issues(...)

# Line ~499 — reset_collection call
# OLD:
chroma_manager.reset_collection(...)
# NEW:
await chroma_manager.reset_collection(...)
```

---

### 4d. `be/app/api/ai_features.py`

One place, line ~247:

```python
# OLD:
raw_similar = chroma_manager.find_similar_issues(...)
# NEW:
raw_similar = await chroma_manager.find_similar_issues(...)
```

---

### 4e. `be/app/api/webhook.py`

Two places:

```python
# Line ~55 — inside _embed_and_store() function
# OLD:
chroma_manager.add_issue(...)
# NEW:
await chroma_manager.add_issue(...)

# Line ~119 — delete on issue deleted event
# OLD:
chroma_manager.delete_issue(...)
# NEW:
await chroma_manager.delete_issue(...)
```

Note: `_embed_and_store` is a sync function called from a thread. Change it to `async def _embed_and_store()` and update the caller to `await _embed_and_store(...)`.

---

### 4f. `be/app/api/github.py` and `be/app/api/solution.py`

No import changes needed — they import `from app.vector.chroma_client import chroma`, and Step 4b already makes that return a `MongoChromaStore` instance. Zero changes to these files.

---

## Step 5 — Update `requirements.txt`

```diff
# be/requirements.txt

  fastapi
  uvicorn
  httpx
  python-dotenv
- chromadb==0.4.22
  sentence-transformers==2.2.2
  numpy
  pymongo
  motor
  pydantic
  PyJWT
  passlib[bcrypt]
  python-jose[cryptography]
  bcrypt
  openai
```

Remove `chromadb==0.4.22`. Everything else stays.

---

## Step 6 — Fix the Local Model for Deployment

Your model weights are at `be/models/all-MiniLM-L6-v2/` and committed to git (~90 MB). This works locally but is bad practice. Fix it so Railway downloads the model automatically on first boot.

**Update `be/app/vector/embeddings.py`:**

```python
import os
from sentence_transformers import SentenceTransformer


class EmbeddingService:
    def __init__(self):
        self.model = None

    def _load_model(self):
        if self.model is None:
            BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
            local_path = os.path.join(BASE_DIR, "models", "all-MiniLM-L6-v2")

            if os.path.exists(local_path):
                print(f"✅ Loading model from local: {local_path}")
                self.model = SentenceTransformer(local_path, local_files_only=True)
            else:
                print("⬇️  Local model not found — downloading from HuggingFace (one-time ~90MB)...")
                self.model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")

        return self.model

    def embed_issue(self, title: str, body: str) -> list:
        text = f"{title}\n{body or ''}"
        return self._load_model().encode(text).tolist()

    def embed_issue_with_category(self, title: str, body: str, category: str) -> list:
        text = f"[{category.upper()}] {title}\n{body or ''}"
        return self._load_model().encode(text).tolist()

    def embed_text(self, text: str) -> list:
        return self._load_model().encode(text).tolist()
```

**Add to `.gitignore`:**

```
be/models/
be/chroma_db/
be/chroma/
```

---

## Step 7 — Environment Variables

### Railway / Render — what you need

```bash
# Already have these:
MONGO_URI=mongodb+srv://your-user:your-pass@cluster.mongodb.net/git_intellisolve
GITHUB_TOKEN=ghp_...
OPENAI_API_KEY=sk-...
ALLOWED_ORIGINS=https://your-app.vercel.app

# Add this (tells backend which db name to use — optional, already defaults correctly):
# MONGO_DB_NAME=git_intellisolve

# Remove these (no longer needed after migration):
# CHROMA_PATH=./chroma_db   ← delete this env var
```

### Vercel — no changes needed

Frontend calls your Railway backend URL. Nothing Chroma-related lives on Vercel.

---

## Step 8 — Update `.gitignore`

```gitignore
# Python
__pycache__/
*.pyc
*.pyo
.env
.venv/
venv/

# Local vector store (no longer needed in production)
be/chroma_db/
be/chroma/

# Local model weights (downloaded at runtime in production)
be/models/

# Next.js
fe/.next/
fe/node_modules/
```

The `.next/` build cache and `node_modules` are also in your repo right now — remove those too.

---

## Complete File Change Summary

| File | Action | Notes |
|---|---|---|
| `be/app/db/mongo.py` | Add 1 line | `issue_vectors = async_db["issue_vectors"]` |
| `be/app/core/mongo_vector_manager.py` | **Create new** | Full async MongoDB vector manager |
| `be/app/vector/mongo_chroma_client.py` | **Create new** | Drop-in for chroma_client.py |
| `be/app/core/chroma_manager.py` | Change 1 line | Swap singleton to `mongo_vector_manager` |
| `be/app/vector/chroma_client.py` | Change 1 line | Swap singleton to `MongoChromaStore` |
| `be/app/services/cache_service.py` | Add `await` ×3 | All `chroma_manager` calls |
| `be/app/api/ai_features.py` | Add `await` ×1 | `find_similar_issues` call |
| `be/app/api/webhook.py` | Add `await` ×2 | `add_issue` + `delete_issue` |
| `be/app/api/github.py` | No changes | Picks up new `chroma` singleton automatically |
| `be/app/api/solution.py` | No changes | Picks up new `chroma` singleton automatically |
| `be/app/vector/embeddings.py` | Update `_load_model` | HuggingFace fallback |
| `be/requirements.txt` | Remove 1 line | Delete `chromadb==0.4.22` |
| `.gitignore` | Add 3 lines | `be/models/`, `be/chroma_db/`, `fe/.next/` |

**Total: 2 new files, 11 existing files touched, ~40 lines changed.**

---

## Deployment Order

```
1. Run Step 0 in Atlas UI (create vector index)          ← 5 minutes
2. Make all code changes (Steps 1–8)                      ← 1–2 hours
3. Test locally:
     cd be && uvicorn app.main:app --reload
     Sync one repo → check Atlas Collections → issue_vectors should have docs
     Query a similar issue → should return results
4. Push to git
5. Railway auto-deploys → first boot downloads model (~15s) → ready
6. Test on production URL
```

---

## What Happens to Existing ChromaDB Data

Your local `be/chroma_db/` has whatever you synced during development. It does **not** migrate to MongoDB automatically. On first deploy:

- `issue_vectors` collection starts empty
- First time a user syncs a repo, it re-embeds and populates MongoDB
- `find_similar_issues` returns empty until at least a few issues are synced — this is fine because the fallback path already handles empty results gracefully (it just marks issues as "new")

If you want to pre-populate from your local Chroma data before deploying, that's optional and probably not worth the effort for a portfolio project.

---

## After Migration — Final Stack

```
Frontend   Vercel              Next.js
Backend    Railway / Render    FastAPI + Python
Database   MongoDB Atlas       Issues, repos, solutions, auth
Vectors    MongoDB Atlas       issue_vectors collection (same cluster)
Model      HuggingFace CDN     Downloaded once on cold start
```

Zero new services. Zero new bills.

---

*Migration plan v1.0 — written against the actual codebase.*

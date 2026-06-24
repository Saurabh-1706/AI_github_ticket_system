"""
Source-code indexer for GitHub repositories.

At repo-sync time, walks the entire file tree via the Git Trees API,
fetches each source file, chunks it into ~600-char blocks, embeds each
chunk, and stores them in a dedicated ChromaDB collection
(separate from the issues collection).

At solution-generate time, `search_code()` performs a semantic vector search
over the index to find the most relevant code chunks to feed to GPT.
"""

import base64
import logging
import os
import re
import httpx
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

GITHUB_API = "https://api.github.com"

# ── Tunable constants ─────────────────────────────────────────────────────────
CHUNK_SIZE = 600          # chars per chunk
MAX_FILE_SIZE = 80_000    # bytes — skip very large files (generated code, etc.)
MAX_FILES_PER_REPO = 400  # don't index more than this many files at once

CODE_EXTENSIONS = {
    ".py", ".js", ".ts", ".tsx", ".jsx",
    ".java", ".go", ".rb", ".rs", ".cs",
    ".cpp", ".c", ".h", ".php", ".swift",
    ".kt", ".scala", ".r", ".ex", ".exs",
}

SKIP_DIRS = {
    "node_modules", ".git", "dist", "build", "__pycache__",
    ".next", "coverage", "vendor", "venv", ".venv", "migrations",
    "static", "public", "assets",
}


def _headers(token: Optional[str] = None) -> dict:
    tok = token or os.getenv("GITHUB_TOKEN")
    h = {"Accept": "application/vnd.github.v3+json"}
    if tok:
        h["Authorization"] = f"token {tok}"
    return h


def _is_code_file(path: str) -> bool:
    ext = os.path.splitext(path)[1].lower()
    parts = path.split("/")
    if any(p in SKIP_DIRS for p in parts[:-1]):
        return False
    return ext in CODE_EXTENSIONS


def _chunk_text(text: str, path: str, chunk_size: int = CHUNK_SIZE) -> list[dict]:
    """Split file text into overlapping chunks with metadata."""
    # Try to split at double newlines (class/function boundaries)
    blocks = re.split(r"\n{2,}", text)
    chunks = []
    current = ""
    chunk_idx = 0
    for block in blocks:
        if len(current) + len(block) > chunk_size and current:
            chunks.append({
                "chunk_id": f"{path}::{chunk_idx}",
                "path": path,
                "content": current.strip(),
                "chunk_index": chunk_idx,
            })
            chunk_idx += 1
            current = block
        else:
            current = (current + "\n\n" + block).strip()
    if current:
        chunks.append({
            "chunk_id": f"{path}::{chunk_idx}",
            "path": path,
            "content": current.strip(),
            "chunk_index": chunk_idx,
        })
    return chunks


def _get_default_branch(owner: str, repo: str, token: Optional[str]) -> Optional[str]:
    url = f"{GITHUB_API}/repos/{owner}/{repo}"
    try:
        r = httpx.get(url, headers=_headers(token), timeout=15)
        r.raise_for_status()
        return r.json().get("default_branch", "main")
    except Exception as e:
        logger.warning(f"Could not get default branch for {owner}/{repo}: {e}")
        return "main"


def _list_tree_files(owner: str, repo: str, branch: str, token: Optional[str]) -> list[str]:
    """Use the Git Trees API (recursive) to list all file paths."""
    url = f"{GITHUB_API}/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
    try:
        r = httpx.get(url, headers=_headers(token), timeout=30)
        r.raise_for_status()
        tree = r.json().get("tree", [])
        return [
            item["path"]
            for item in tree
            if item.get("type") == "blob" and _is_code_file(item["path"])
        ][:MAX_FILES_PER_REPO]
    except Exception as e:
        logger.warning(f"Tree listing failed for {owner}/{repo}@{branch}: {e}")
        return []


def _fetch_file(owner: str, repo: str, path: str, token: Optional[str]) -> Optional[str]:
    """Fetch a single file's text content from GitHub."""
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}"
    try:
        r = httpx.get(url, headers=_headers(token), timeout=15)
        if r.status_code == 404:
            return None
        r.raise_for_status()
        data = r.json()
        if data.get("size", 0) > MAX_FILE_SIZE:
            return None  # Skip huge files
        encoded = data.get("content", "")
        return base64.b64decode(encoded).decode("utf-8", errors="replace")
    except Exception as e:
        logger.debug(f"Failed to fetch {path}: {e}")
        return None


# ── Public API ────────────────────────────────────────────────────────────────

def index_repository(
    owner: str,
    repo: str,
    token: Optional[str] = None,
    force: bool = False,
) -> dict:
    """
    Walk the repo file tree, embed all code chunks, store in MongoDB code_vectors.
    Returns {indexed_files, total_chunks, skipped_files}.

    Safe to run multiple times — previous chunks for the repo are cleared first.
    """
    try:
        from app.vector.embeddings import EmbeddingService
        from app.db.mongo import code_vectors_sync

        embedder_svc = EmbeddingService()
        repo_name = f"{owner}/{repo}"
        # Clear existing index for this repository first
        code_vectors_sync.delete_many({"repo": repo_name})
    except Exception as e:
        logger.error(f"Cannot initialise MongoDB for code indexing: {e}")
        return {"indexed_files": 0, "total_chunks": 0, "error": str(e)}

    branch = _get_default_branch(owner, repo, token)
    paths = _list_tree_files(owner, repo, branch, token)
    logger.info(f"📂 Code indexer: {len(paths)} code files found in {owner}/{repo}@{branch}")

    indexed_files = 0
    total_chunks = 0
    skipped = 0

    for path in paths:
        content = _fetch_file(owner, repo, path, token)
        if not content:
            skipped += 1
            continue

        chunks = _chunk_text(content, path)
        if not chunks:
            skipped += 1
            continue

        # Embed all chunks for this file
        try:
            ids = [c["chunk_id"] for c in chunks]
            texts = [c["content"] for c in chunks]
            embeddings = [embedder_svc.embed_text(t) for t in texts]
            
            docs = []
            for chunk_id, text, emb, c in zip(ids, texts, embeddings, chunks):
                docs.append({
                    "repo": repo_name,
                    "chunk_id": chunk_id,
                    "path": c["path"],
                    "content": text,
                    "chunk_index": c["chunk_index"],
                    "embedding": emb,
                })
            
            if docs:
                code_vectors_sync.insert_many(docs)
                
            indexed_files += 1
            total_chunks += len(chunks)
        except Exception as e:
            logger.warning(f"Failed to index {path}: {e}")
            skipped += 1

    logger.info(
        f"✅ Code index done for {owner}/{repo}: "
        f"{indexed_files} files / {total_chunks} chunks / {skipped} skipped"
    )
    return {"indexed_files": indexed_files, "total_chunks": total_chunks, "skipped_files": skipped}


def search_code(
    owner: str,
    repo: str,
    query_text: str,
    top_k: int = 3,
) -> list[dict]:
    """
    Semantic vector search over the indexed code chunks in MongoDB Atlas.
    Returns list of {path, snippet, score} sorted by relevance.
    """
    try:
        from app.vector.embeddings import EmbeddingService
        from app.db.mongo import code_vectors_sync

        embedder_svc = EmbeddingService()
        repo_name = f"{owner}/{repo}"

        if not is_indexed(owner, repo):
            logger.info(f"No code index yet for {repo_name} — will use keyword search")
            return []

        query_embedding = embedder_svc.embed_text(query_text)
        
        pipeline = [
            {
                "$vectorSearch": {
                    "index": "vector_index",
                    "path": "embedding",
                    "queryVector": query_embedding,
                    "numCandidates": top_k * 10,
                    "limit": top_k,
                    "filter": {"repo": {"$eq": repo_name}},
                }
            },
            {
                "$project": {
                    "path": 1,
                    "content": 1,
                    "score": {"$meta": "vectorSearchScore"},
                    "_id": 0,
                }
            },
        ]

        results = code_vectors_sync.aggregate(pipeline)

        chunks = []
        for doc in results:
            score = round(doc.get("score", 0.0), 3)
            if score < 0.3:
                continue  # Discard low-relevance results
            chunks.append({
                "path": doc.get("path", ""),
                "content": doc.get("content", ""),
                "score": score,
            })

        # Deduplicate by path — keep highest-score chunk per file
        seen: dict[str, dict] = {}
        for c in chunks:
            p = c["path"]
            if p not in seen or c["score"] > seen[p]["score"]:
                seen[p] = c
        return list(seen.values())[:top_k]

    except Exception as e:
        logger.warning(f"Code search failed for {owner}/{repo}: {e}")
        return []


def is_indexed(owner: str, repo: str) -> bool:
    """Quick check: has this repo been code-indexed?"""
    try:
        from app.db.mongo import code_vectors_sync
        doc = code_vectors_sync.find_one({"repo": f"{owner}/{repo}"})
        return doc is not None
    except Exception:
        return False

"""
GitHub Code Search service.
Searches a repo's source code for files relevant to an issue,
then fetches their content so GPT can produce precise file-level fixes.
"""

import base64
import logging
import os
import re
import requests

logger = logging.getLogger(__name__)

# ── Rate-limit-friendly defaults ──────────────────────────────────────────────
_STOP_WORDS = {
    "a", "an", "the", "and", "or", "is", "it", "in", "on", "at", "to",
    "for", "of", "with", "when", "this", "that", "not", "are", "was",
    "be", "by", "as", "if", "but", "i", "my", "we", "us", "do", "does",
    "error", "issue", "bug", "fix", "problem", "fail", "fails", "cannot",
    "cant", "doesnt", "doesn", "wont", "getting", "gives", "give", "get",
    "not", "no", "will", "have", "has", "need", "please", "help", "how",
}

# Extensions we care about (code files only, skip images/docs)
_CODE_EXTENSIONS = (
    ".py", ".js", ".ts", ".tsx", ".jsx", ".java", ".go",
    ".rb", ".rs", ".cs", ".cpp", ".c", ".h", ".php", ".swift",
)

GITHUB_API = "https://api.github.com"


def _get_headers(token: str | None = None) -> dict:
    token = token or os.getenv("GITHUB_TOKEN")
    h = {"Accept": "application/vnd.github.v3+json"}
    if token:
        h["Authorization"] = f"token {token}"
    return h


def _extract_keywords(text: str, max_keywords: int = 6) -> str:
    """Extract key technical terms from issue title/body for code search."""
    # Keep only word characters, split
    words = re.findall(r"[a-zA-Z_][a-zA-Z0-9_]{2,}", text)
    seen = set()
    keywords = []
    for w in words:
        lw = w.lower()
        if lw not in _STOP_WORDS and lw not in seen:
            seen.add(lw)
            keywords.append(w)
        if len(keywords) >= max_keywords:
            break
    return " ".join(keywords)


def search_code_files(
    owner: str,
    repo: str,
    issue_title: str,
    issue_body: str = "",
    token: str | None = None,
    max_files: int = 3,
) -> list[dict]:
    """
    Search the repo for source files relevant to the issue.
    Returns a list of {path, html_url} dicts (up to max_files).
    """
    # Build a focused query from issue title (title is most signal-dense)
    query_text = issue_title + " " + (issue_body or "")[:300]
    keywords = _extract_keywords(query_text)

    if not keywords:
        logger.info("No keywords extracted — skipping code search.")
        return []

    q = f"{keywords} repo:{owner}/{repo}"
    url = f"{GITHUB_API}/search/code"
    params = {"q": q, "per_page": 10}

    try:
        resp = requests.get(url, headers=_get_headers(token), params=params, timeout=15)
        if resp.status_code == 403:
            logger.warning("GitHub Code Search rate-limited (403) — no code context.")
            return []
        resp.raise_for_status()
        items = resp.json().get("items", [])
    except Exception as e:
        logger.warning(f"GitHub Code Search failed: {e}")
        return []

    # Filter to code files only, deduplicate paths
    seen_paths: set[str] = set()
    results = []
    for item in items:
        path: str = item.get("path", "")
        if not any(path.endswith(ext) for ext in _CODE_EXTENSIONS):
            continue
        if path in seen_paths:
            continue
        seen_paths.add(path)
        results.append({"path": path, "html_url": item.get("html_url", "")})
        if len(results) >= max_files:
            break

    logger.info(f"Code search for '{keywords}' → {len(results)} files")
    return results


def fetch_file_content(
    owner: str,
    repo: str,
    path: str,
    token: str | None = None,
    max_chars: int = 3000,
) -> str:
    """
    Fetch the text content of a file from GitHub.
    Returns at most max_chars characters (truncated with ellipsis).
    Returns empty string on failure.
    """
    url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}"
    try:
        resp = requests.get(url, headers=_get_headers(token), timeout=15)
        resp.raise_for_status()
        data = resp.json()
        encoded = data.get("content", "")
        raw = base64.b64decode(encoded).decode("utf-8", errors="replace")
        if len(raw) > max_chars:
            raw = raw[:max_chars] + "\n\n... (truncated)"
        return raw
    except Exception as e:
        logger.warning(f"Failed to fetch {owner}/{repo}/{path}: {e}")
        return ""


def get_code_context(
    owner: str,
    repo: str,
    issue_title: str,
    issue_body: str = "",
    token: str | None = None,
) -> list[dict]:
    """
    High-level helper: search + fetch top relevant files.
    Returns list of {path, content} dicts ready to embed in a GPT prompt.
    """
    files = search_code_files(owner, repo, issue_title, issue_body, token)
    chunks = []
    for f in files:
        content = fetch_file_content(owner, repo, f["path"], token)
        if content:
            chunks.append({"path": f["path"], "content": content})
    return chunks

"""
GPT-4o-mini powered solution generator for GitHub issues.
Generates structured, actionable solutions with steps and optional code.
Supports optional source-code context for precise file-level fixes.
"""

import os
import json
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# ─── Base system prompt (no code context) ────────────────────────────────────

BASE_SYSTEM_PROMPT = """You are an expert software engineer and technical support specialist.
Your task is to analyze a GitHub issue and provide a clear, structured solution.

RULES:
1. First determine if the issue requires CODE CHANGES (bug fixes, feature implementation, config changes) or NOT (documentation, questions, process/workflow issues, environment setup).
2. For CODE issues: Provide steps AND a small focused code snippet showing exactly what to change or implement.
3. For NON-CODE issues: Provide steps and a clear description only — NO code blocks.
4. Keep code snippets minimal and targeted — only the essential lines needed to fix the issue, not an entire file.
5. Steps must be numbered, clear, and actionable — a developer should be able to follow them immediately.
6. Your response MUST be valid JSON only — no extra text, no markdown fences.
7. IMPORTANT: Leave "file_path" as an empty string "" if you are not 100% certain of the exact file path. Do NOT guess or make up a path.

OUTPUT FORMAT (strict JSON):
{
  "summary": "One-sentence description of the root cause and fix",
  "is_code_fix": true or false,
  "steps": [
    "Step 1: ...",
    "Step 2: ...",
    "Step 3: ..."
  ],
  "code": "The exact code snippet to add/change (only if is_code_fix is true, else empty string)",
  "code_language": "python/javascript/typescript/bash/etc (only if is_code_fix is true, else empty string)",
  "code_explanation": "Brief explanation of what the code does and where to put it (only if is_code_fix is true, else empty string)",
  "file_path": "relative/path/to/file.py ONLY if you are 100% certain, else empty string",
  "code_before": "The exact existing lines that need to change (only if is_code_fix is true and file_path is set, else empty string)",
  "code_after": "The replacement lines after the fix (only if is_code_fix is true and file_path is set, else empty string)"
}"""

# ─── Code-context system prompt ───────────────────────────────────────────────

CODE_CONTEXT_SYSTEM_PROMPT = """You are an expert software engineer reviewing a GitHub issue.
You have been provided with the actual source code of the relevant files from the repository.

RULES:
1. Use the provided source code to identify the EXACT location of the bug or missing feature.
2. Provide the exact file path where the change must be made.
3. Quote the EXISTING code lines that must be changed as `code_before`.
4. Provide the CORRECTED replacement as `code_after`.
5. Keep snippets minimal — only the specific lines that change, not the entire file.
6. Steps must be numbered, clear, and actionable.
7. Your response MUST be valid JSON only — no extra text, no markdown fences.

OUTPUT FORMAT (strict JSON):
{
  "summary": "One-sentence description of the root cause and the fix",
  "is_code_fix": true or false,
  "steps": [
    "Step 1: ...",
    "Step 2: ...",
    "Step 3: ..."
  ],
  "file_path": "exact/relative/path/to/file.py (required when is_code_fix is true)",
  "code_before": "The exact existing lines that need to change (copy verbatim from the provided source)",
  "code_after": "The corrected replacement for those lines",
  "code_language": "python/javascript/typescript/bash/etc",
  "code_explanation": "One sentence: what the change does and why it fixes the issue",
  "code": "Same as code_after for backward compatibility"
}"""


def generate_with_gpt(issue_id: str, title: str, body: str, owner: str, repo: str) -> dict:
    """
    Generate an AI solution without source-code context (original behaviour).
    File paths in this mode are NOT confirmed against real repo files.
    """
    user_message = f"""GitHub Repository: {owner}/{repo}

Issue Title: {title}

Issue Description:
{body or "No description provided."}

Please analyze this issue and provide a structured solution following the JSON format exactly."""

    result = _call_gpt(BASE_SYSTEM_PROMPT, user_message, issue_id)
    result["path_confirmed"] = False  # Path was guessed — not validated against repo
    return result


def generate_with_code_context(
    issue_id: str,
    title: str,
    body: str,
    owner: str,
    repo: str,
    code_chunks: list[dict],
) -> dict:
    """
    Generate an AI solution WITH source-code context.
    code_chunks: list of {path: str, content: str}
    Falls back to generate_with_gpt if no chunks provided.
    """
    if not code_chunks:
        logger.info(f"No code context for issue {issue_id} — falling back to base prompt.")
        return generate_with_gpt(issue_id, title, body, owner, repo)

    # Build code context block
    code_section = ""
    for chunk in code_chunks:
        code_section += f"\n\n### FILE: {chunk['path']}\n```\n{chunk['content']}\n```"

    user_message = f"""GitHub Repository: {owner}/{repo}

Issue Title: {title}

Issue Description:
{body or "No description provided."}

--- RELEVANT SOURCE FILES ---
{code_section}

Using the source files above, identify the exact file and lines that need to change, then provide a structured solution in the required JSON format."""

    result = _call_gpt(CODE_CONTEXT_SYSTEM_PROMPT, user_message, issue_id)

    # Ensure code_after is mirrored to `code` for backward compat
    if not result.get("code") and result.get("code_after"):
        result["code"] = result["code_after"]

    # Paths confirmed — they came from real indexed source files
    result["path_confirmed"] = bool(result.get("file_path"))
    return result


def _call_gpt(system_prompt: str, user_message: str, issue_id: str) -> dict:
    """Shared GPT call with JSON parsing and normalization."""
    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=0.3,
            max_tokens=1800,
            response_format={"type": "json_object"}
        )

        raw = response.choices[0].message.content
        solution = json.loads(raw)

        is_code = bool(solution.get("is_code_fix", False))

        return {
            "issue_id": issue_id,
            "summary": solution.get("summary", "No summary available."),
            "is_code_fix": is_code,
            "steps": solution.get("steps", []),
            # Code context fields
            "file_path": solution.get("file_path", "") if is_code else "",
            "code_before": solution.get("code_before", "") if is_code else "",
            "code_after": solution.get("code_after", "") if is_code else "",
            # Legacy / fallback fields
            "code": solution.get("code", solution.get("code_after", "")) if is_code else "",
            "code_language": solution.get("code_language", "") if is_code else "",
            "code_explanation": solution.get("code_explanation", "") if is_code else "",
            "generated_by": "gpt-4o-mini"
        }

    except json.JSONDecodeError as e:
        logger.error(f"GPT returned invalid JSON for issue {issue_id}: {e}")
        raise ValueError("GPT returned invalid JSON. Please try again.")
    except Exception as e:
        logger.error(f"GPT generation failed for issue {issue_id}: {e}")
        raise

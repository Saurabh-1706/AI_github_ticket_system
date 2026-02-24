"""
GPT-4o-mini powered solution generator for GitHub issues.
Generates structured, actionable solutions with steps and optional code.
"""

import os
import json
import logging
from openai import OpenAI

logger = logging.getLogger(__name__)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

SYSTEM_PROMPT = """You are an expert software engineer and technical support specialist.
Your task is to analyze a GitHub issue and provide a clear, structured solution.

RULES:
1. First determine if the issue requires CODE CHANGES (bug fixes, feature implementation, config changes) or NOT (documentation, questions, process/workflow issues, environment setup).
2. For CODE issues: Provide steps AND a small focused code snippet showing exactly what to change or implement.
3. For NON-CODE issues: Provide steps and a clear description only — NO code blocks.
4. Keep code snippets minimal and targeted — only the essential lines needed to fix the issue, not an entire file.
5. Steps must be numbered, clear, and actionable — a developer should be able to follow them immediately.
6. Your response MUST be valid JSON only — no extra text, no markdown fences.

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
  "code_explanation": "Brief explanation of what the code does and where to put it (only if is_code_fix is true, else empty string)"
}"""


def generate_with_gpt(issue_id: str, title: str, body: str, owner: str, repo: str) -> dict:
    """
    Generate an AI solution for a GitHub issue using GPT-4o-mini.
    Returns a structured solution dict.
    """
    user_message = f"""GitHub Repository: {owner}/{repo}

Issue Title: {title}

Issue Description:
{body or "No description provided."}

Please analyze this issue and provide a structured solution following the JSON format exactly."""

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_message}
            ],
            temperature=0.3,
            max_tokens=1500,
            response_format={"type": "json_object"}
        )

        raw = response.choices[0].message.content
        solution = json.loads(raw)

        # Normalize and sanitize fields
        return {
            "issue_id": issue_id,
            "summary": solution.get("summary", "No summary available."),
            "is_code_fix": bool(solution.get("is_code_fix", False)),
            "steps": solution.get("steps", []),
            "code": solution.get("code", "") if solution.get("is_code_fix") else "",
            "code_language": solution.get("code_language", "") if solution.get("is_code_fix") else "",
            "code_explanation": solution.get("code_explanation", "") if solution.get("is_code_fix") else "",
            "generated_by": "gpt-4o-mini"
        }

    except json.JSONDecodeError as e:
        logger.error(f"GPT returned invalid JSON for issue {issue_id}: {e}")
        raise ValueError("GPT returned invalid JSON. Please try again.")
    except Exception as e:
        logger.error(f"GPT generation failed for issue {issue_id}: {e}")
        raise

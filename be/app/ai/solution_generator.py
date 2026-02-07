from app.ai.patterns import SECURITY_PATTERNS, CRASH_PATTERNS, GENERIC_FIX
from app.ai.solution_memory import store_solution
from app.db.mongo import solution_memory


def extract_code_blocks(text: str):
    if not text:
        return []

    blocks = []
    inside = False
    current = []

    for line in text.splitlines():
        if line.strip().startswith("```"):
            if inside:
                blocks.append("\n".join(current))
                current = []
                inside = False
            else:
                inside = True
            continue

        if inside:
            current.append(line)

    return blocks


def detect_pattern(title: str, body: str):
    text = f"{title} {body}".lower()

    for key, pattern in SECURITY_PATTERNS.items():
        if key in text:
            return pattern

    for key, pattern in CRASH_PATTERNS.items():
        if key in text:
            return pattern

    return None


def generate_solution(issue: dict, similar_issues: list):
    title = issue.get("title", "")
    body = issue.get("body", "")

    solution = {
        "summary": "",
        "steps": [],
        "code": [],
        "references": [],
        "confidence": 0.0,  # ✅ ADD THIS
    }

    # 1️⃣ Pattern-based solution
    pattern = detect_pattern(title, body)
    if pattern:
        solution["summary"] = pattern.get(
            "title", "Detected known issue pattern"
        )
        solution["steps"] = pattern.get("steps", [])
        solution["code"] = pattern.get("code", [])
        solution["confidence"] = 0.7  # pattern match = strong signal

    # 2️⃣ Reuse from similar issues
    for sim in similar_issues:
        sim_score = sim.get("similarity", 0)
        if sim_score >= 0.8:
            solution["references"].append(
                f"Similar issue #{sim.get('number')} ({int(sim_score*100)}% match)"
            )
            solution["confidence"] = max(solution["confidence"], sim_score)

    # 3️⃣ Extract code blocks from issue body
    solution["code"].extend(extract_code_blocks(body))

    # 4️⃣ Fallback (weak confidence)
    if not solution["steps"]:
        solution["summary"] = "General issue resolution guidance"
        solution["steps"] = GENERIC_FIX["steps"]
        solution["confidence"] = max(solution["confidence"], 0.4)

    # 5️⃣ 🔁 LEARNING LOOP — EXACT PLACE
    if solution["confidence"] >= 0.8:
        store_solution(solution_memory, issue, solution)

    return solution

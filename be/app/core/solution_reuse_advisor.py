def suggest_solution_reuse(similar_issue: dict) -> dict:
    similarity = similar_issue.get("similarity", 0)

    if similarity >= 0.9:
        approach = "direct"
        guidance = "Apply the same solution with minimal changes"
    elif similarity >= 0.8:
        approach = "adapt"
        guidance = "Reuse core logic with small adjustments"
    elif similarity >= 0.7:
        approach = "reference"
        guidance = "Use as reference only"
    else:
        approach = "minimal"
        guidance = "Low relevance"

    return {
        "approach": approach,
        "guidance": guidance,
        "confidence": round(similarity, 2),
    }

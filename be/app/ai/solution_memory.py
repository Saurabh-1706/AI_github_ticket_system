from datetime import datetime

def store_solution(memory_collection, issue, solution):
    memory_collection.insert_one({
        "issue_title": issue["title"],
        "solution": solution,
        "confidence": solution.get("confidence", 0),
        "created_at": datetime.utcnow(),
    })

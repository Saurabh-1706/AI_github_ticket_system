def recommend(title: str):
    if "login" in title.lower():
        return ["Check auth middleware", "Validate token handling"]
    return ["Inspect related components"]

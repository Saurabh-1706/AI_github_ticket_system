def analyze(title: str, body: str):
    text = f"{title} {body}".lower()

    if any(x in text for x in ["crash","error","fail"]):
        return {"type":"bug","priority":"high"}
    if any(x in text for x in ["add","feature"]):
        return {"type":"feature","priority":"medium"}
    return {"type":"enhancement","priority":"low"}

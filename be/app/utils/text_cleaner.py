import re

def clean(text: str) -> str:
    text = re.sub(r"http\S+", "", text)
    text = re.sub(r"`.*?`", "", text)
    return text.lower().strip()

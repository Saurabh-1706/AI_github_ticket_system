def advise(similarity: float):
    if similarity > 0.9:
        return "Direct reuse"
    if similarity > 0.8:
        return "Adapt solution"
    return "Reference only"

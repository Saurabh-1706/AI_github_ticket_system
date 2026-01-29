from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import github, analysis, vector, duplicates, solution

app = FastAPI(title="Git IntelliSolve")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(github.router, prefix="/api/github")
app.include_router(analysis.router, prefix="/api/analysis")
app.include_router(vector.router, prefix="/api/vector")
app.include_router(duplicates.router, prefix="/api/duplicates")
app.include_router(solution.router, prefix="/api/solution")


@app.get("/")
def health():
    return {"status": "running"}

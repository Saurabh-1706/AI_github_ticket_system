from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import github, analysis, vector, duplicates, solution


app = FastAPI(
    title="Git IntelliSolve API",
    version="1.0.0",
)

# -----------------------------
# CORS (Frontend support)
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # during development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# API Routers
# -----------------------------
app.include_router(github.router)
app.include_router(analysis.router, prefix="/api/analysis")
app.include_router(vector.router, prefix="/api/vector")
app.include_router(duplicates.router, prefix="/api/duplicates")
app.include_router(solution.router, prefix="/api/solution")

# -----------------------------
# Health Check
# -----------------------------
@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "Git IntelliSolve backend running"
    }


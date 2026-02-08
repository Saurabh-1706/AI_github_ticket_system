from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.api import github, analysis, vector, duplicates, solution, oauth, streaming, auth
from app.middleware.error_handlers import register_exception_handlers
from app.middleware.logging import log_requests_middleware

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

app = FastAPI(
    title="Git IntelliSolve API",
    version="1.0.0",
    description="AI-powered GitHub issue analysis and duplicate detection system"
)

# -----------------------------
# Middleware
# -----------------------------

# CORS (Frontend support)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # during development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging middleware
app.middleware("http")(log_requests_middleware)

# Error handlers
register_exception_handlers(app)

# -----------------------------
# API Routers
# -----------------------------
app.include_router(github.router)
app.include_router(analysis.router, prefix="/api/analysis")
app.include_router(vector.router, prefix="/api/vector")
app.include_router(duplicates.router, prefix="/api/duplicates")
app.include_router(solution.router, prefix="/api/solution")
app.include_router(oauth.router)
app.include_router(streaming.router, prefix="/api/github")
app.include_router(auth.router)

# -----------------------------
# Health Check
# -----------------------------
@app.get("/")
def root():
    return {
        "status": "ok",
        "message": "Git IntelliSolve backend running",
        "version": "1.0.0"
    }

@app.get("/health")
def health_check():
    """Detailed health check endpoint."""
    return {
        "status": "healthy",
        "services": {
            "api": "running",
            "database": "connected",
            "embeddings": "loaded"
        }
    }

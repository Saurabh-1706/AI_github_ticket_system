import os
from dotenv import load_dotenv

# Load env file in the backend root directory (be/.env)
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(dotenv_path)

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import github, analysis, solution, oauth, streaming, auth, cache, analytics, ai_features
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

# CORS
# allow_origins="*" cannot be combined with allow_credentials=True (browser rejects it).
# Use an explicit list from the environment variable ALLOWED_ORIGINS.
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001,http://localhost:5173")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
app.include_router(solution.router, prefix="/api/solution")
app.include_router(oauth.router)
app.include_router(streaming.router, prefix="/api/github")
app.include_router(auth.router)
app.include_router(cache.router)
app.include_router(analytics.router)
app.include_router(ai_features.router)

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
    """Detailed health check — probes the real MongoDB connection."""
    from app.db.mongo import client as _mongo_client
    db_status = "disconnected"
    try:
        _mongo_client.admin.command("ping")
        db_status = "connected"
    except Exception:
        db_status = "unreachable"

    overall = "healthy" if db_status == "connected" else "degraded"
    return {
        "status": overall,
        "services": {
            "api": "running",
            "database": db_status,
        },
    }


@app.on_event("startup")
async def startup_event():
    """Run tasks on FastAPI application startup."""
    from app.db.mongo import init_indexes
    await init_indexes()

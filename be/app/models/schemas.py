"""
Pydantic models for request/response validation.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any


# ============================================================================
# GitHub Models
# ============================================================================

class RepoAccessRequest(BaseModel):
    """Request model for checking repository access."""
    owner: str = Field(..., description="Repository owner")
    repo: str = Field(..., description="Repository name")
    user_token: Optional[str] = Field(None, description="User OAuth token")


class RepoAccessResponse(BaseModel):
    """Response model for repository access check."""
    is_private: bool
    has_access: bool
    requires_auth: bool
    repo_exists: bool


# ============================================================================
# Issue Models
# ============================================================================

class IssueAnalysisRequest(BaseModel):
    """Request model for issue analysis."""
    id: int
    title: str
    body: str
    owner: str
    repo: str


class CategoryInfo(BaseModel):
    """Category information for an issue."""
    primary_category: str
    categories: List[str]
    confidence: float
    scores: Dict[str, float] = {}


class AIAnalysis(BaseModel):
    """AI analysis result for an issue."""
    type: str
    criticality: str
    confidence: float
    similar_issues: List[Dict[str, Any]] = []
    solution: Optional[str] = None


class DuplicateInfo(BaseModel):
    """Duplicate detection information."""
    classification: str
    similarity: float
    reuse_type: str


class IssueResponse(BaseModel):
    """Response model for a single issue."""
    id: int
    number: int
    title: str
    body: str
    state: str
    labels: List[str]
    category: str
    ai_analysis: AIAnalysis
    duplicate_info: DuplicateInfo
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class PaginationInfo(BaseModel):
    """Pagination metadata."""
    page: int
    per_page: int
    has_next: bool
    has_prev: bool
    count: int


class IssuesListResponse(BaseModel):
    """Response model for list of issues."""
    total: int
    issues: List[IssueResponse]
    pagination: PaginationInfo


# ============================================================================
# OAuth Models
# ============================================================================

class OAuthStatusResponse(BaseModel):
    """OAuth status response."""
    authenticated: bool
    username: Optional[str] = None
    github_user_id: Optional[int] = None


class UserTokenResponse(BaseModel):
    """User token response."""
    access_token: str
    username: str
    github_user_id: int


# ============================================================================
# Error Models
# ============================================================================

class ErrorResponse(BaseModel):
    """Standard error response."""
    error: str
    detail: Optional[str] = None
    status_code: int


class ValidationErrorDetail(BaseModel):
    """Validation error detail."""
    loc: List[str]
    msg: str
    type: str


class ValidationErrorResponse(BaseModel):
    """Validation error response."""
    detail: List[ValidationErrorDetail]

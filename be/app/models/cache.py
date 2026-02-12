"""
Pydantic models for MongoDB cache collections
"""
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Any, Annotated, Dict
from datetime import datetime
from bson import ObjectId
from pydantic.functional_validators import BeforeValidator


# Custom type for MongoDB ObjectId
def validate_object_id(v: Any) -> ObjectId:
    if isinstance(v, ObjectId):
        return v
    if isinstance(v, str):
        return ObjectId(v)
    raise ValueError("Invalid ObjectId")


PyObjectId = Annotated[ObjectId, BeforeValidator(validate_object_id)]


class CachedRepository(BaseModel):
    """Model for cached repository metadata"""
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )
    
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    owner: str
    name: str
    last_synced: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AIAnalysis(BaseModel):
    """AI analysis results for an issue"""
    type: Optional[str] = None  # bug, feature, documentation, etc.
    criticality: str = "medium"  # low, medium, high
    confidence: Optional[float] = None  # 0.0 to 1.0
    similar_issues: List[Dict[str, Any]] = []  # List of similar issues


class SimilarIssue(BaseModel):
    """Similar issue reference"""
    number: int
    title: str
    similarity: float


class DuplicateInfo(BaseModel):
    """Duplicate detection information"""
    classification: str  # unique, potential_duplicate, duplicate
    similarity: float
    similar_issues: List[SimilarIssue] = []


class CachedIssue(BaseModel):
    """Model for cached GitHub issue"""
    model_config = ConfigDict(
        populate_by_name=True,
        arbitrary_types_allowed=True,
        json_encoders={ObjectId: str}
    )
    
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    repository_id: PyObjectId
    number: int
    title: str
    body: str = ""
    state: str  # open, closed
    created_at: datetime
    updated_at: datetime
    user: dict = {}
    labels: List[dict] = []
    
    # AI analysis fields
    category: Optional[str] = None
    ai_analysis: Optional[AIAnalysis] = None
    duplicate_info: Optional[DuplicateInfo] = None
    
    synced_at: datetime = Field(default_factory=datetime.utcnow)

# schemas.py — Pydantic models for request/response validation

from pydantic import BaseModel
from typing import Optional

class ExtractRequest(BaseModel):
    """What the extension sends to the backend."""
    text: str                          # raw transcript from speech
    language: Optional[str] = "en"    # "en" or "hi"

class ExtractedEntity(BaseModel):
    """A single extracted piece of information."""
    entity_type: str      # e.g. "name", "email", "phone"
    value: str            # e.g. "Somil Jain"
    normalized: str       # cleaned/normalized value
    confidence: float     # 0.0 to 1.0
    raw_text: str         # original matched text in transcript

class ExtractResponse(BaseModel):
    """What we send back to the extension."""
    success: bool
    transcript: str
    entities: list[ExtractedEntity]
    entity_map: dict      # flat dict e.g. {"name": "Somil Jain", "email": "..."}
    message: str = ""
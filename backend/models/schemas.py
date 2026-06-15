# schemas.py

from pydantic import BaseModel
from typing import Optional

class ExtractRequest(BaseModel):
    text: str
    language: Optional[str] = "en"

class ExtractedEntity(BaseModel):
    entity_type: str
    value: str
    normalized: str
    confidence: float
    raw_text: str

class ExtractResponse(BaseModel):
    success: bool
    transcript: str
    entities: list[ExtractedEntity]
    entity_map: dict
    message: str = ""

# ── New schemas for Phase 5 ───────────────────────────────────────────────────

class FormField(BaseModel):
    """Mirrors DetectedField from the Chrome extension."""
    fieldId: str
    label: str = ""
    placeholder: str = ""
    name: str = ""
    id: str = ""
    type: str = "text"
    tagName: str = "INPUT"
    value: str = ""

class MappingResult(BaseModel):
    """One entity → one field mapping with confidence."""
    entity_type: str
    entity_value: str
    field_id: str
    field_label: str
    field_type: str
    confidence: float
    matched: bool

class MapRequest(BaseModel):
    """What the extension sends to /map."""
    entities: list[ExtractedEntity]
    fields: list[FormField]

class MapResponse(BaseModel):
    """What /map returns."""
    success: bool
    mappings: list[MappingResult]
    matched_count: int
    unmatched_count: int
    message: str = ""
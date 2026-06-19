# schemas.py

from pydantic import BaseModel
from typing import Optional

class ExtractRequest(BaseModel):
    text: str
    language: Optional[str] = "auto"   # "auto", "en", "hi"

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
    detected_language: str = "en"      # ← new
    message: str = ""

class FormField(BaseModel):
    fieldId: str
    label: str = ""
    placeholder: str = ""
    name: str = ""
    id: str = ""
    type: str = "text"
    tagName: str = "INPUT"
    value: str = ""

class MappingResult(BaseModel):
    entity_type: str
    entity_value: str
    field_id: str
    field_label: str
    field_type: str
    confidence: float
    matched: bool

class MapRequest(BaseModel):
    entities: list[ExtractedEntity]
    fields: list[FormField]

class MapResponse(BaseModel):
    success: bool
    mappings: list[MappingResult]
    matched_count: int
    unmatched_count: int
    message: str = ""

# Add these to schemas.py

class ValidationResult(BaseModel):
    entity_type: str
    is_valid: bool
    suggestion: str = ""

class CompletionStats(BaseModel):
    total_fields: int
    filled_fields: int
    percentage: int
    status: str   # complete, mostly_complete, partial, minimal

class AnalyzeRequest(BaseModel):
    entities: list[ExtractedEntity]
    fields: list[FormField]
    template: Optional[str] = "common"   # "common" or "scholarship"

class AnalyzeResponse(BaseModel):
    success: bool
    validations: list[ValidationResult]
    missing_fields: list[str]
    completion: CompletionStats
    ambiguous_entities: list[str]   # entity types with confidence < 0.70
    message: str = ""    
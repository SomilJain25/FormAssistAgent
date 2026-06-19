# analyze.py — FastAPI router for /analyze endpoint
# Combines validation + missing field detection + completion stats

from fastapi import APIRouter, HTTPException
from models.schemas import AnalyzeRequest, AnalyzeResponse, ValidationResult, CompletionStats
from services.validation_service import (
    validate_entity,
    detect_missing_fields,
    calculate_completion,
)
from services.mapping_service import map_entities_to_fields

router = APIRouter()

AMBIGUOUS_THRESHOLD = 0.70

@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(request: AnalyzeRequest):
    """
    Runs full intelligence analysis:
    1. Validates each entity's format
    2. Detects fields likely missing from the transcript
    3. Calculates form completion percentage
    4. Flags ambiguous (low-confidence) entities

    Example input:
    {
      "entities": [...],
      "fields": [...],
      "template": "scholarship"
    }
    """
    if not request.entities:
        raise HTTPException(status_code=400, detail="No entities provided.")

    try:
        entities = [e.model_dump() for e in request.entities]
        fields   = [f.model_dump() for f in request.fields]

        # ── 1. Validate each entity ──
        validations = []
        for entity in entities:
            result = validate_entity(entity['entity_type'], entity['normalized'])
            validations.append(ValidationResult(
                entity_type=entity['entity_type'],
                is_valid=result['is_valid'],
                suggestion=result['suggestion'],
            ))

        # ── 2. Detect missing fields ──
        detected_types = [e['entity_type'] for e in entities]
        form_field_types = [f.get('type', 'text') for f in fields]
        missing_fields = detect_missing_fields(
            detected_types, form_field_types, request.template or "common"
        )

        # ── 3. Calculate completion ──
        mappings = map_entities_to_fields(entities, fields)
        matched_count = len([m for m in mappings if m.matched])
        completion = calculate_completion(len(fields), matched_count)

        # ── 4. Ambiguous entities ──
        ambiguous = [
            e['entity_type'] for e in entities
            if e.get('confidence', 1.0) < AMBIGUOUS_THRESHOLD
        ]

        return AnalyzeResponse(
            success=True,
            validations=validations,
            missing_fields=missing_fields,
            completion=CompletionStats(**completion),
            ambiguous_entities=ambiguous,
            message=f"Analysis complete. {completion['percentage']}% form completion.",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")
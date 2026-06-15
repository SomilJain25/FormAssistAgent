# map.py — FastAPI router for /map endpoint

from fastapi import APIRouter, HTTPException
from models.schemas import MapRequest, MapResponse
from services.mapping_service import map_entities_to_fields

router = APIRouter()

@router.post("/map", response_model=MapResponse)
async def map_fields(request: MapRequest):
    """
    Maps extracted NLP entities to detected form fields.

    Example input:
    {
      "entities": [
        { "entity_type": "name", "normalized": "Somil Jain", ... }
      ],
      "fields": [
        { "fieldId": "fullName", "label": "Full Name", "type": "text" }
      ]
    }

    Example output:
    {
      "mappings": [
        {
          "entity_type": "name",
          "entity_value": "Somil Jain",
          "field_id": "fullName",
          "field_label": "Full Name",
          "confidence": 0.95,
          "matched": true
        }
      ]
    }
    """
    if not request.entities:
        raise HTTPException(status_code=400, detail="No entities provided.")
    if not request.fields:
        raise HTTPException(status_code=400, detail="No form fields provided.")

    try:
        # Convert pydantic models to plain dicts for the service
        entities = [e.model_dump() for e in request.entities]
        fields   = [f.model_dump() for f in request.fields]

        mappings = map_entities_to_fields(entities, fields)

        matched   = [m for m in mappings if m.matched]
        unmatched = [m for m in mappings if not m.matched]

        return MapResponse(
            success=True,
            mappings=mappings,
            matched_count=len(matched),
            unmatched_count=len(unmatched),
            message=f"{len(matched)} fields mapped, {len(unmatched)} unmatched.",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Mapping error: {str(e)}")
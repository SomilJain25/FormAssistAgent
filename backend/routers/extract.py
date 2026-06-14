# extract.py — FastAPI router for /extract endpoint

from fastapi import APIRouter, HTTPException
from models.schemas import ExtractRequest, ExtractResponse
from services.nlp_service import extract_entities

router = APIRouter()

@router.post("/extract", response_model=ExtractResponse)
async def extract(request: ExtractRequest):
    """
    Accepts a speech transcript and returns extracted entities.

    Example input:
        { "text": "My name is Somil Jain. My email is somil@gmail.com.
                   My income is three lakh rupees." }

    Example output:
        { "entities": [
            { "entity_type": "name",   "value": "Somil Jain", ... },
            { "entity_type": "email",  "value": "somil@gmail.com", ... },
            { "entity_type": "income", "value": "300000", ... }
          ]
        }
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    try:
        entities = extract_entities(request.text)

        # Build flat entity_map for easy lookup
        entity_map = {e.entity_type: e.normalized for e in entities}

        return ExtractResponse(
            success=True,
            transcript=request.text,
            entities=entities,
            entity_map=entity_map,
            message=f"Extracted {len(entities)} entities.",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"NLP error: {str(e)}")
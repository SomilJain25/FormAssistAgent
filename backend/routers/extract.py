# extract.py — routes to English or Hindi NLP based on language param

from fastapi import APIRouter, HTTPException
from models.schemas import ExtractRequest, ExtractResponse
from services.nlp_service import extract_entities as extract_english
from services.hindi_nlp_service import extract_entities_hindi

router = APIRouter()

def detect_language(text: str) -> str:
    """
    Auto-detect if text contains Hindi (Devanagari) characters.
    Unicode range U+0900–U+097F = Devanagari script.
    """
    hindi_chars = sum(
        1 for c in text
        if '\u0900' <= c <= '\u097F'
    )
    # If more than 10% of characters are Hindi, treat as Hindi
    if len(text) > 0 and hindi_chars / len(text) > 0.10:
        return 'hi'
    return 'en'

@router.post("/extract", response_model=ExtractResponse)
async def extract(request: ExtractRequest):
    """
    Extracts entities from speech transcript.
    Supports English and Hindi — auto-detects language.

    Hindi example:
        "मेरा नाम सोमिल जैन है। मेरी वार्षिक आय तीन लाख रुपये है।"

    English example:
        "My name is Somil Jain. My annual income is three lakh rupees."
    """
    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty.")

    try:
        # Determine language
        lang = request.language or detect_language(request.text)

        # Route to correct NLP pipeline
        if lang == 'hi' or detect_language(request.text) == 'hi':
            entities = extract_entities_hindi(request.text)
            detected_lang = 'hi'
        else:
            entities = extract_english(request.text)
            detected_lang = 'en'

        entity_map = {e.entity_type: e.normalized for e in entities}

        return ExtractResponse(
            success=True,
            transcript=request.text,
            entities=entities,
            entity_map=entity_map,
            message=f"Extracted {len(entities)} entities ({detected_lang}).",
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"NLP error: {str(e)}")
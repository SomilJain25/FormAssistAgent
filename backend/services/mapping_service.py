# mapping_service.py
# Matches extracted NLP entities to detected form fields.
# Uses three-layer matching: exact → keyword → fuzzy similarity

from rapidfuzz import fuzz
from models.schemas import MappingResult

# ── Master synonym table ───────────────────────────────────────────────────────
# Maps entity_type → all possible field label variations we might encounter

ENTITY_SYNONYMS: dict[str, list[str]] = {
    "name": [
        "full name", "name", "applicant name", "candidate name",
        "student name", "your name", "complete name", "first name",
        "last name", "surname", "given name", "legal name",
        "naam", "poora naam",
    ],
    "father_name": [
        "father name", "father's name", "fathers name",
        "father", "paternal name", "dad name", "papa name",
        "pita ka naam", "pita naam",
    ],
    "mother_name": [
        "mother name", "mother's name", "mothers name",
        "mother", "maternal name", "mom name",
        "mata ka naam", "mata naam",
    ],
    "email": [
        "email", "email address", "e-mail", "e mail",
        "electronic mail", "mail", "email id", "email-id",
    ],
    "phone": [
        "phone", "phone number", "mobile", "mobile number",
        "contact number", "telephone", "cell", "cell number",
        "contact", "whatsapp", "mob no", "ph no", "phone no",
        "mobile no", "contact no",
    ],
    "dob": [
        "date of birth", "dob", "birth date", "birthday",
        "date of birth (dd/mm/yyyy)", "born on", "birth day",
        "janm tithi", "janm din",
    ],
    "income": [
        "annual income", "income", "yearly income", "family income",
        "household income", "monthly income", "salary",
        "annual salary", "total income", "gross income",
        "aay", "varshik aay",
    ],
    "address": [
        "address", "full address", "residential address",
        "home address", "permanent address", "current address",
        "postal address", "mailing address", "street address",
        "pata", "ghar ka pata",
    ],
    "city": [
        "city", "town", "district", "tehsil", "taluka",
        "city name", "sheher", "nagar",
    ],
    "state": [
        "state", "province", "state name", "rajya",
    ],
    "pincode": [
        "pincode", "pin code", "postal code", "zip", "zip code",
        "post code", "pin",
    ],
    "gender": [
        "gender", "sex", "gender identity",
        "ling",
    ],
    "category": [
        "category", "caste category", "reservation category",
        "social category", "general/obc/sc/st", "caste",
    ],
    "nationality": [
        "nationality", "citizenship", "country",
        "rashtriyata",
    ],
    "religion": [
        "religion", "faith", "dharm",
    ],
}

# ── Confidence thresholds ──────────────────────────────────────────────────────
EXACT_CONFIDENCE    = 1.00
KEYWORD_CONFIDENCE  = 0.90
FUZZY_HIGH          = 0.85
FUZZY_MED           = 0.70
MIN_FUZZY_SCORE     = 60    # rapidfuzz score 0-100; below this we skip

# ── Core matching logic ────────────────────────────────────────────────────────

def normalize_label(label: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace."""
    import re
    label = label.lower().strip()
    label = re.sub(r'[*:()\[\]\/\\]', ' ', label)
    label = re.sub(r'\s+', ' ', label)
    return label.strip()

def match_field(
    entity_type: str,
    field_label: str,
    field_placeholder: str,
    field_name: str,
    field_id: str,
) -> float:
    """
    Returns a confidence score 0.0-1.0 for how well
    entity_type matches a form field.
    """
    synonyms = ENTITY_SYNONYMS.get(entity_type, [entity_type])

    # Collect all field identifiers, normalized
    candidates = [
        normalize_label(field_label),
        normalize_label(field_placeholder),
        normalize_label(field_name),
        normalize_label(field_id),
    ]
    candidates = [c for c in candidates if c]  # remove empty

    if not candidates:
        return 0.0

    best_score = 0.0

    for synonym in synonyms:
        syn_norm = normalize_label(synonym)

        for candidate in candidates:
            # Layer 1 — exact match
            if syn_norm == candidate:
                return EXACT_CONFIDENCE

            # Layer 2 — keyword containment
            if syn_norm in candidate or candidate in syn_norm:
                best_score = max(best_score, KEYWORD_CONFIDENCE)
                continue

            # Layer 3 — fuzzy similarity (token_sort handles word order)
            fuzzy_score = fuzz.token_sort_ratio(syn_norm, candidate)
            if fuzzy_score >= MIN_FUZZY_SCORE:
                # Map fuzzy 60-100 → confidence 0.60-0.85
                confidence = FUZZY_MED + (FUZZY_HIGH - FUZZY_MED) * (
                    (fuzzy_score - MIN_FUZZY_SCORE) / (100 - MIN_FUZZY_SCORE)
                )
                best_score = max(best_score, confidence)

    return round(best_score, 3)


def map_entities_to_fields(
    entities: list[dict],
    fields: list[dict],
) -> list[MappingResult]:
    """
    Main mapping function.
    For each entity, find the best matching field.
    For each field, find the best matching entity.
    Returns a list of MappingResult with confidence scores.
    """
    results: list[MappingResult] = []
    used_fields: set[str] = set()  # prevent two entities mapping to same field

    # Sort entities by confidence descending so high-confidence ones
    # claim their fields first
    sorted_entities = sorted(entities, key=lambda e: e.get("confidence", 0), reverse=True)

    for entity in sorted_entities:
        entity_type = entity["entity_type"]
        entity_value = entity["normalized"]

        best_field = None
        best_confidence = 0.0

        for field in fields:
            field_id = field.get("fieldId", "")

            # Skip already-claimed fields
            if field_id in used_fields:
                continue

            score = match_field(
                entity_type=entity_type,
                field_label=field.get("label", ""),
                field_placeholder=field.get("placeholder", ""),
                field_name=field.get("name", ""),
                field_id=field.get("id", ""),
            )

            if score > best_confidence:
                best_confidence = score
                best_field = field

        if best_field and best_confidence >= 0.60:
            used_fields.add(best_field.get("fieldId", ""))
            results.append(MappingResult(
                entity_type=entity_type,
                entity_value=entity_value,
                field_id=best_field.get("fieldId", ""),
                field_label=best_field.get("label")
                    or best_field.get("placeholder")
                    or best_field.get("name", ""),
                field_type=best_field.get("type", "text"),
                confidence=best_confidence,
                matched=True,
            ))
        else:
            # Entity found but no field matched
            results.append(MappingResult(
                entity_type=entity_type,
                entity_value=entity_value,
                field_id="",
                field_label="",
                field_type="",
                confidence=best_confidence,
                matched=False,
            ))

    return results
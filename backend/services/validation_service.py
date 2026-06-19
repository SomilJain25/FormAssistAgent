# validation_service.py
# Validates extracted entities against expected formats.
# Generates smart correction suggestions.

import re

# ── Validation rules per entity type ──────────────────────────────────────────

def validate_email(value: str) -> tuple[bool, str]:
    pattern = re.compile(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
    if pattern.match(value):
        return True, ""
    if '@' not in value:
        return False, "Missing @ symbol. Did you mean to say 'at' clearly?"
    if '.' not in value.split('@')[-1]:
        return False, "Missing domain extension (.com, .in, etc.)"
    return False, "Email format looks incorrect."

def validate_phone(value: str) -> tuple[bool, str]:
    digits = re.sub(r'\D', '', value)
    if len(digits) == 10 and digits[0] in '6789':
        return True, ""
    if len(digits) < 10:
        return False, f"Phone number too short ({len(digits)} digits, need 10)."
    if len(digits) > 10:
        return False, f"Phone number too long ({len(digits)} digits, need 10)."
    if digits and digits[0] not in '6789':
        return False, "Indian mobile numbers start with 6, 7, 8, or 9."
    return False, "Invalid phone format."

def validate_pincode(value: str) -> tuple[bool, str]:
    digits = re.sub(r'\D', '', value)
    if len(digits) == 6 and digits[0] != '0':
        return True, ""
    return False, "PIN code must be exactly 6 digits."

def validate_dob(value: str) -> tuple[bool, str]:
    # Expecting DD-MM-YYYY after normalization
    match = re.match(r'^(\d{2})-(\d{2})-(\d{4})$', value)
    if not match:
        return False, "Date format unclear. Expected DD-MM-YYYY."

    day, month, year = int(match[1]), int(match[2]), int(match[3])

    if not (1 <= month <= 12):
        return False, f"Invalid month: {month}"
    if not (1 <= day <= 31):
        return False, f"Invalid day: {day}"
    if not (1900 <= year <= 2026):
        return False, f"Year {year} seems incorrect."

    return True, ""

def validate_income(value: str) -> tuple[bool, str]:
    try:
        amount = int(value)
        if amount < 0:
            return False, "Income cannot be negative."
        if amount > 1_000_000_000:  # 100 crore sanity check
            return False, "Income value seems unusually large. Please verify."
        return True, ""
    except ValueError:
        return False, "Could not convert income to a number."

def validate_name(value: str) -> tuple[bool, str]:
    if len(value.strip()) < 2:
        return False, "Name seems too short."
    if re.search(r'\d', value):
        return False, "Name contains numbers — please verify."
    if len(value.split()) > 5:
        return False, "Name has unusually many words — please verify."
    return True, ""

def validate_state(value: str) -> tuple[bool, str]:
    if len(value.strip()) < 3:
        return False, "State name seems too short."
    return True, ""

def validate_generic(value: str) -> tuple[bool, str]:
    if not value or not value.strip():
        return False, "Value is empty."
    return True, ""

# ── Validator registry ────────────────────────────────────────────────────────

VALIDATORS = {
    'email':    validate_email,
    'phone':    validate_phone,
    'pincode':  validate_pincode,
    'dob':      validate_dob,
    'income':   validate_income,
    'name':     validate_name,
    'father_name': validate_name,
    'mother_name': validate_name,
    'state':    validate_state,
}

def validate_entity(entity_type: str, normalized_value: str) -> dict:
    """
    Returns:
    {
        "is_valid": bool,
        "suggestion": str  # empty if valid
    }
    """
    validator = VALIDATORS.get(entity_type, validate_generic)
    is_valid, suggestion = validator(normalized_value)
    return {
        "is_valid": is_valid,
        "suggestion": suggestion,
    }

# ── Required fields for common Indian form types ──────────────────────────────

COMMON_REQUIRED_FIELDS = [
    'name', 'email', 'phone', 'dob', 'address', 'city', 'state', 'pincode'
]

SCHOLARSHIP_REQUIRED_FIELDS = [
    'name', 'father_name', 'mother_name', 'email', 'phone',
    'dob', 'income', 'city', 'state', 'pincode', 'category'
]

def detect_missing_fields(
    detected_entity_types: list[str],
    form_field_types: list[str],
    template: str = "common",
) -> list[str]:
    """
    Compares what was extracted vs what fields exist on the form,
    and returns a list of likely-missing entity types.

    template: "common" or "scholarship" — determines expected field set
    """
    required = (
        SCHOLARSHIP_REQUIRED_FIELDS if template == "scholarship"
        else COMMON_REQUIRED_FIELDS
    )

    # Only flag as missing if the form actually seems to need it
    # (heuristic: form has more than 3 fields = probably a real application)
    if len(form_field_types) < 3:
        return []

    missing = [
        field for field in required
        if field not in detected_entity_types
    ]
    return missing

def calculate_completion(
    total_form_fields: int,
    matched_fields: int,
) -> dict:
    """Returns form completion stats."""
    if total_form_fields == 0:
        percentage = 0
    else:
        percentage = round((matched_fields / total_form_fields) * 100)

    return {
        "total_fields": total_form_fields,
        "filled_fields": matched_fields,
        "percentage": percentage,
        "status": (
            "complete" if percentage == 100
            else "mostly_complete" if percentage >= 70
            else "partial" if percentage >= 30
            else "minimal"
        ),
    }
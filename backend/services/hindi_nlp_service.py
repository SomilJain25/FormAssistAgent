# hindi_nlp_service.py
# NLP entity extraction for Hindi speech transcripts.
# Uses regex patterns + Hindi word dictionaries.

import re
from models.schemas import ExtractedEntity
from services.hindi_preprocessor import (
    extract_by_hindi_pattern,
    normalize_hindi_income,
    normalize_hindi_date,
    preprocess_hindi,
    HINDI_NAME_PATTERNS,
    HINDI_FATHER_PATTERNS,
    HINDI_MOTHER_PATTERNS,
    HINDI_INCOME_PATTERNS,
    HINDI_PHONE_PATTERNS,
    HINDI_DOB_PATTERNS,
    HINDI_CITY_PATTERNS,
    HINDI_GENDER_MAP,
)

# ── Shared patterns (work in both Hindi and English) ──────────────────────────

EMAIL_PATTERN = re.compile(
    r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'
)

PHONE_PATTERN = re.compile(
    r'(?<!\d)(\+91[\s\-]?)?[6-9]\d{9}(?!\d)'
)

PINCODE_PATTERN = re.compile(r'\b[1-9][0-9]{5}\b')

HINDI_STATES = [
    'आंध्र प्रदेश', 'अरुणाचल प्रदेश', 'असम', 'बिहार',
    'छत्तीसगढ़', 'गोवा', 'गुजरात', 'हरियाणा',
    'हिमाचल प्रदेश', 'झारखंड', 'कर्नाटक', 'केरल',
    'मध्य प्रदेश', 'महाराष्ट्र', 'मणिपुर', 'मेघालय',
    'मिजोरम', 'नागालैंड', 'ओडिशा', 'पंजाब',
    'राजस्थान', 'सिक्किम', 'तमिल नाडु', 'तेलंगाना',
    'त्रिपुरा', 'उत्तर प्रदेश', 'उत्तराखंड',
    'पश्चिम बंगाल', 'दिल्ली',
]

# ── Helper ────────────────────────────────────────────────────────────────────

def make_entity(
    entity_type: str,
    value: str,
    normalized: str,
    confidence: float,
    raw_text: str,
) -> ExtractedEntity:
    return ExtractedEntity(
        entity_type=entity_type,
        value=value,
        normalized=normalized,
        confidence=confidence,
        raw_text=raw_text,
    )

# ── Main Hindi extraction ─────────────────────────────────────────────────────

def extract_entities_hindi(raw_text: str) -> list[ExtractedEntity]:
    entities: list[ExtractedEntity] = []
    found: set[str] = set()

    text = preprocess_hindi(raw_text)

    # ── Email (same as English) ────────────────────────────────────────────
    email_match = EMAIL_PATTERN.search(text)
    if email_match and 'email' not in found:
        val = email_match.group().lower()
        entities.append(make_entity('email', val, val, 0.98, val))
        found.add('email')

    # ── Phone ──────────────────────────────────────────────────────────────
    phone_match = PHONE_PATTERN.search(text)
    if phone_match and 'phone' not in found:
        raw = phone_match.group()
        normalized = re.sub(r'\D', '', raw)
        entities.append(make_entity('phone', raw, normalized, 0.95, raw))
        found.add('phone')

    # Also try Hindi phone pattern
    if 'phone' not in found:
        for pattern in HINDI_PHONE_PATTERNS:
            match = re.search(pattern, text)
            if match:
                raw = match.group(1)
                normalized = re.sub(r'\D', '', raw)
                if len(normalized) >= 10:
                    entities.append(make_entity('phone', raw, normalized, 0.90, raw))
                    found.add('phone')
                    break

    # ── Pincode ────────────────────────────────────────────────────────────
    pin_match = PINCODE_PATTERN.search(text)
    if pin_match and 'pincode' not in found:
        val = pin_match.group()
        entities.append(make_entity('pincode', val, val, 0.90, val))
        found.add('pincode')

    # ── Name ───────────────────────────────────────────────────────────────
    name = extract_by_hindi_pattern(text, HINDI_NAME_PATTERNS)
    if name and 'name' not in found:
        # Clean trailing punctuation / words
        name = re.sub(r'\s+(?:है|हूँ|हूं|और|,|।).*$', '', name).strip()
        entities.append(make_entity('name', name, name, 0.93, name))
        found.add('name')

    # ── Father name ────────────────────────────────────────────────────────
    father = extract_by_hindi_pattern(text, HINDI_FATHER_PATTERNS)
    if father and 'father_name' not in found:
        father = re.sub(r'\s+(?:है|और|,|।).*$', '', father).strip()
        entities.append(make_entity('father_name', father, father, 0.93, father))
        found.add('father_name')

    # ── Mother name ────────────────────────────────────────────────────────
    mother = extract_by_hindi_pattern(text, HINDI_MOTHER_PATTERNS)
    if mother and 'mother_name' not in found:
        mother = re.sub(r'\s+(?:है|और|,|।).*$', '', mother).strip()
        entities.append(make_entity('mother_name', mother, mother, 0.93, mother))
        found.add('mother_name')

    # ── Income ─────────────────────────────────────────────────────────────
    income_raw = extract_by_hindi_pattern(text, HINDI_INCOME_PATTERNS)
    if income_raw and 'income' not in found:
        normalized = normalize_hindi_income(income_raw)
        entities.append(make_entity('income', income_raw, normalized, 0.88, income_raw))
        found.add('income')

    # Also catch inline: "तीन लाख रुपये"
    if 'income' not in found:
        income_inline = re.search(
            r'([\u0900-\u097F\s\d]+(?:लाख|करोड़|हजार)[\u0900-\u097F\s]*(?:रुपये|रूपये|रुपए)?)',
            text
        )
        if income_inline:
            raw = income_inline.group(1).strip()
            normalized = normalize_hindi_income(raw)
            if normalized != raw:  # only if we actually converted
                entities.append(make_entity('income', raw, normalized, 0.85, raw))
                found.add('income')

    # ── Date of Birth ──────────────────────────────────────────────────────
    dob_raw = extract_by_hindi_pattern(text, HINDI_DOB_PATTERNS)
    if dob_raw and 'dob' not in found:
        normalized = normalize_hindi_date(dob_raw)
        entities.append(make_entity('dob', dob_raw, normalized, 0.88, dob_raw))
        found.add('dob')

    # ── Gender ─────────────────────────────────────────────────────────────
    for hindi_word, english_val in HINDI_GENDER_MAP.items():
        if hindi_word in text and 'gender' not in found:
            entities.append(make_entity('gender', hindi_word, english_val, 0.92, hindi_word))
            found.add('gender')
            break

    # ── City ───────────────────────────────────────────────────────────────
    city = extract_by_hindi_pattern(text, HINDI_CITY_PATTERNS)
    if city and 'city' not in found:
        city = re.sub(r'\s+(?:है|और|,|।).*$', '', city).strip()
        entities.append(make_entity('city', city, city, 0.82, city))
        found.add('city')

    # ── State ──────────────────────────────────────────────────────────────
    for state in HINDI_STATES:
        if state in text and 'state' not in found:
            entities.append(make_entity('state', state, state, 0.87, state))
            found.add('state')
            break

    return entities
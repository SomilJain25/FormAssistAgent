# nlp_service.py
# Core NLP extraction using spaCy + custom regex rules.
# Extracts: name, email, phone, dob, address, income, city, state, pincode, gender

import re
import spacy
from models.schemas import ExtractedEntity
from services.text_preprocessor import (
    normalize_email, normalize_phone,
    normalize_date, normalize_income, preprocess
)

# Load spaCy model once at startup
nlp = spacy.load("en_core_web_sm")

# ── Regex Patterns ────────────────────────────────────────────────────────────

EMAIL_PATTERN = re.compile(
    r'[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}'
)

# Also catch spoken "somil at gmail dot com" after preprocessing
PHONE_PATTERN = re.compile(
    r'(?<!\d)(\+91[\s\-]?)?[6-9]\d{9}(?!\d)'
)

PINCODE_PATTERN = re.compile(r'\b[1-9][0-9]{5}\b')

INCOME_PATTERN = re.compile(
    r'([\w\s]+(?:lakh|crore|thousand|hundred|lakhs|crores)[\w\s]*rupees?|'
    r'rs\.?\s*[\d,]+|'
    r'rupees?\s*[\w\s]+)',
    re.IGNORECASE
)

DOB_PATTERN = re.compile(
    r'\b(\d{1,2}[\s/\-]\d{1,2}[\s/\-]\d{2,4}|'
    r'\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|'
    r'apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|'
    r'oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{2,4})\b',
    re.IGNORECASE
)

GENDER_PATTERN = re.compile(
    r'\b(male|female|other|transgender)\b', re.IGNORECASE
)

# Indian states for detection
INDIAN_STATES = [
    'andhra pradesh','arunachal pradesh','assam','bihar','chhattisgarh',
    'goa','gujarat','haryana','himachal pradesh','jharkhand','karnataka',
    'kerala','madhya pradesh','maharashtra','manipur','meghalaya','mizoram',
    'nagaland','odisha','punjab','rajasthan','sikkim','tamil nadu','telangana',
    'tripura','uttar pradesh','uttarakhand','west bengal','delhi','jammu',
    'kashmir','ladakh',
]

# Intro phrase patterns to strip before name extraction
NAME_INTRO_PATTERNS = [
    r"my name is\s+", r"i am\s+", r"i'm\s+", r"this is\s+",
    r"my full name is\s+", r"name is\s+",
    r"मेरा नाम\s+", r"मैं\s+",
]

FATHER_INTRO_PATTERNS = [
    r"my father'?s? name is\s+", r"father'?s? name is\s+",
    r"father name is\s+",
]

MOTHER_INTRO_PATTERNS = [
    r"my mother'?s? name is\s+", r"mother'?s? name is\s+",
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

def extract_by_intro(text: str, patterns: list[str]) -> str | None:
    """Extract a name that follows an intro phrase."""
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            rest = text[match.end():].strip()
            # Take up to 4 words (names aren't longer)
            words = rest.split()
            name_words = []
            for w in words[:5]:
                # Stop at sentence boundary or common stop words
                if w.lower() in {'and','my','is','the','a','an','.'} or re.match(r'[.!?,]', w):
                    break
                name_words.append(w.strip('.,!?'))
            if name_words:
                return ' '.join(name_words)
    return None

# ── Main Extraction Function ──────────────────────────────────────────────────

def extract_entities(raw_text: str) -> list[ExtractedEntity]:
    entities: list[ExtractedEntity] = []
    found: set[str] = set()  # prevent duplicates

    # Step 1 — preprocess (normalize email spelling, etc.)
    text = preprocess(raw_text)

    # ── Email ──────────────────────────────────────────────────────────────
    email_match = EMAIL_PATTERN.search(text)
    if email_match and 'email' not in found:
        val = email_match.group().lower()
        entities.append(make_entity('email', val, val, 0.98, email_match.group()))
        found.add('email')

    # ── Phone ──────────────────────────────────────────────────────────────
    phone_match = PHONE_PATTERN.search(text)
    if phone_match and 'phone' not in found:
        raw = phone_match.group()
        normalized = normalize_phone(raw)
        entities.append(make_entity('phone', raw, normalized, 0.95, raw))
        found.add('phone')

    # ── Pincode ────────────────────────────────────────────────────────────
    pin_match = PINCODE_PATTERN.search(text)
    if pin_match and 'pincode' not in found:
        val = pin_match.group()
        entities.append(make_entity('pincode', val, val, 0.90, val))
        found.add('pincode')

    # ── Date of Birth ──────────────────────────────────────────────────────
    dob_match = DOB_PATTERN.search(text)
    if dob_match and 'dob' not in found:
        raw = dob_match.group()
        normalized = normalize_date(raw)
        entities.append(make_entity('dob', raw, normalized, 0.88, raw))
        found.add('dob')

    # ── Income ─────────────────────────────────────────────────────────────
    income_match = INCOME_PATTERN.search(text)
    if income_match and 'income' not in found:
        raw = income_match.group()
        normalized = normalize_income(raw)
        entities.append(make_entity('income', raw, normalized, 0.85, raw))
        found.add('income')

    # ── Gender ─────────────────────────────────────────────────────────────
    gender_match = GENDER_PATTERN.search(text)
    if gender_match and 'gender' not in found:
        val = gender_match.group().lower()
        entities.append(make_entity('gender', val, val, 0.92, gender_match.group()))
        found.add('gender')

    # ── State ──────────────────────────────────────────────────────────────
    text_lower = text.lower()
    for state in INDIAN_STATES:
        if state in text_lower and 'state' not in found:
            entities.append(make_entity('state', state.title(), state.title(), 0.87, state))
            found.add('state')
            break

    # ── spaCy NER for PERSON / GPE ─────────────────────────────────────────
    doc = nlp(text)

    for ent in doc.ents:
        if ent.label_ == 'PERSON':
            # Father name check
            before = text[:ent.start_char].lower()
            if any(p in before for p in ["father", "papa", "dad"]) and 'father_name' not in found:
                entities.append(make_entity('father_name', ent.text, ent.text, 0.85, ent.text))
                found.add('father_name')
            elif any(p in before for p in ["mother", "mama", "mom"]) and 'mother_name' not in found:
                entities.append(make_entity('mother_name', ent.text, ent.text, 0.85, ent.text))
                found.add('mother_name')
            elif 'name' not in found:
                entities.append(make_entity('name', ent.text, ent.text, 0.82, ent.text))
                found.add('name')

        elif ent.label_ == 'GPE' and 'city' not in found:
            entities.append(make_entity('city', ent.text, ent.text, 0.80, ent.text))
            found.add('city')

    # ── Intro-phrase name extraction (higher confidence than spaCy) ─────────
    name_from_intro = extract_by_intro(text, NAME_INTRO_PATTERNS)
    if name_from_intro and 'name' not in found:
        entities.append(make_entity('name', name_from_intro, name_from_intro, 0.93, name_from_intro))
        found.add('name')
    elif name_from_intro:
        # Override spaCy name with intro-phrase name (higher confidence)
        for e in entities:
            if e.entity_type == 'name':
                e.value = name_from_intro
                e.normalized = name_from_intro
                e.confidence = 0.93
                break

    father_from_intro = extract_by_intro(text, FATHER_INTRO_PATTERNS)
    if father_from_intro and 'father_name' not in found:
        entities.append(make_entity('father_name', father_from_intro, father_from_intro, 0.93, father_from_intro))
        found.add('father_name')

    mother_from_intro = extract_by_intro(text, MOTHER_INTRO_PATTERNS)
    if mother_from_intro and 'mother_name' not in found:
        entities.append(make_entity('mother_name', mother_from_intro, mother_from_intro, 0.93, mother_from_intro))
        found.add('mother_name')

    return entities
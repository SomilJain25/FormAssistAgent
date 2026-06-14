# text_preprocessor.py
# Cleans raw speech transcript before NLP processing.
# Speech-to-text produces spoken words — we normalize them here.

import re
from word2number import w2n

# Spoken email patterns → fix spacing
# e.g. "somil at gmail dot com" → "somil@gmail.com"
def normalize_email(text: str) -> str:
    text = re.sub(r'\s+at\s+', '@', text, flags=re.IGNORECASE)
    text = re.sub(r'\s+dot\s+', '.', text, flags=re.IGNORECASE)
    return text

# Convert spoken numbers to digits
# e.g. "three lakh" → "300000"
# e.g. "nine eight seven six" → "9876"
LAKH  = 100_000
CRORE = 10_000_000

def normalize_income(text: str) -> str:
    text_lower = text.lower()

    # Handle lakh/crore
    crore_match = re.search(r'([\w\s]+)\s+crore', text_lower)
    lakh_match  = re.search(r'([\w\s]+)\s+lakh',  text_lower)

    if crore_match:
        try:
            num = w2n.word_to_num(crore_match.group(1).strip())
            return str(num * CRORE)
        except Exception:
            pass

    if lakh_match:
        try:
            num = w2n.word_to_num(lakh_match.group(1).strip())
            return str(num * LAKH)
        except Exception:
            pass

    # Try converting plain spoken number
    try:
        return str(w2n.word_to_num(text_lower))
    except Exception:
        return text

# Normalize phone numbers — remove spaces/dashes
def normalize_phone(text: str) -> str:
    digits = re.sub(r'\D', '', text)
    return digits

# Normalize dates
# e.g. "15th August 1999" → "15-08-1999"
MONTH_MAP = {
    'january':'01','february':'02','march':'03','april':'04',
    'may':'05','june':'06','july':'07','august':'08',
    'september':'09','october':'10','november':'11','december':'12',
    'jan':'01','feb':'02','mar':'03','apr':'04','jun':'06',
    'jul':'07','aug':'08','sep':'09','oct':'10','nov':'11','dec':'12',
}

def normalize_date(text: str) -> str:
    text_lower = text.lower()
    # Remove ordinal suffixes
    text_lower = re.sub(r'(\d+)(st|nd|rd|th)', r'\1', text_lower)

    for month_name, month_num in MONTH_MAP.items():
        if month_name in text_lower:
            day_match  = re.search(r'\b(\d{1,2})\b', text_lower)
            year_match = re.search(r'\b(\d{4})\b', text_lower)
            day  = day_match.group(1).zfill(2)  if day_match  else '01'
            year = year_match.group(1)           if year_match else ''
            return f"{day}-{month_num}-{year}".strip('-')

    # Already numeric like "15/08/1999"
    return text

def preprocess(text: str) -> str:
    """Main preprocessing pipeline."""
    text = normalize_email(text)
    return text
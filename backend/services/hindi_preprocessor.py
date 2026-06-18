# hindi_preprocessor.py
# Normalizes Hindi speech transcript before entity extraction.
# Handles Hindi number words, spoken patterns, transliteration.

import re

# ── Hindi number words → digits ───────────────────────────────────────────────

HINDI_ONES = {
    'शून्य': 0, 'एक': 1, 'दो': 2, 'तीन': 3, 'चार': 4,
    'पाँच': 5, 'पांच': 5, 'छह': 6, 'छः': 6, 'सात': 7,
    'आठ': 8, 'नौ': 9, 'दस': 10, 'ग्यारह': 11, 'बारह': 12,
    'तेरह': 13, 'चौदह': 14, 'पंद्रह': 15, 'सोलह': 16,
    'सत्रह': 17, 'अठारह': 18, 'उन्नीस': 19, 'बीस': 20,
    'इक्कीस': 21, 'बाईस': 22, 'तेईस': 23, 'चौबीस': 24,
    'पच्चीस': 25, 'छब्बीस': 26, 'सत्ताईस': 27, 'अट्ठाईस': 28,
    'उनतीस': 29, 'तीस': 30, 'इकतीस': 31, 'बत्तीस': 32,
    'तैंतीस': 33, 'चौंतीस': 34, 'पैंतीस': 35, 'छत्तीस': 36,
    'सैंतीस': 37, 'अड़तीस': 38, 'उनतालीस': 39, 'चालीस': 40,
    'इकतालीस': 41, 'बयालीस': 42, 'तैंतालीस': 43, 'चौंतालीस': 44,
    'पैंतालीस': 45, 'छियालीस': 46, 'सैंतालीस': 47, 'अड़तालीस': 48,
    'उनचास': 49, 'पचास': 50, 'इकावन': 51, 'बावन': 52,
    'तिरपन': 53, 'चौवन': 54, 'पचपन': 55, 'छप्पन': 56,
    'सत्तावन': 57, 'अट्ठावन': 58, 'उनसठ': 59, 'साठ': 60,
    'इकसठ': 61, 'बासठ': 62, 'तिरसठ': 63, 'चौंसठ': 64,
    'पैंसठ': 65, 'छियासठ': 66, 'सड़सठ': 67, 'अड़सठ': 68,
    'उनहत्तर': 69, 'सत्तर': 70, 'इकहत्तर': 71, 'बहत्तर': 72,
    'तिहत्तर': 73, 'चौहत्तर': 74, 'पचहत्तर': 75, 'छिहत्तर': 76,
    'सतहत्तर': 77, 'अठहत्तर': 78, 'उनासी': 79, 'अस्सी': 80,
    'इक्यासी': 81, 'बयासी': 82, 'तिरासी': 83, 'चौरासी': 84,
    'पचासी': 85, 'छियासी': 86, 'सतासी': 87, 'अट्ठासी': 88,
    'नवासी': 89, 'नब्बे': 90, 'इक्यानवे': 91, 'बानवे': 92,
    'तिरानवे': 93, 'चौरानवे': 94, 'पचानवे': 95, 'छियानवे': 96,
    'सत्तानवे': 97, 'अट्ठानवे': 98, 'निन्यानवे': 99,
    'सौ': 100, 'हजार': 1000, 'लाख': 100000, 'करोड़': 10000000,
}

HINDI_MULTIPLIERS = {
    'सौ': 100,
    'हजार': 1000,
    'लाख': 100000,
    'करोड़': 10000000,
}

def hindi_words_to_number(text: str) -> int | None:
    """
    Convert Hindi number words to integer.
    e.g. "तीन लाख" → 300000
         "पचास हजार" → 50000
    """
    text = text.strip()
    total = 0
    current = 0

    words = text.split()
    for word in words:
        if word in HINDI_MULTIPLIERS:
            multiplier = HINDI_MULTIPLIERS[word]
            if current == 0:
                current = 1
            if multiplier >= 100:
                total += current * multiplier
                current = 0
            else:
                current *= multiplier
        elif word in HINDI_ONES:
            current += HINDI_ONES[word]
        else:
            return None  # unknown word

    total += current
    return total if total > 0 else None

# ── Hindi month names ─────────────────────────────────────────────────────────

HINDI_MONTHS = {
    'जनवरी': '01', 'फरवरी': '02', 'मार्च': '03',
    'अप्रैल': '04', 'मई': '05', 'जून': '06',
    'जुलाई': '07', 'अगस्त': '08', 'सितंबर': '09',
    'अक्टूबर': '10', 'नवंबर': '11', 'दिसंबर': '12',
}

# ── Hindi intro patterns ──────────────────────────────────────────────────────

HINDI_NAME_PATTERNS = [
    r'मेरा नाम\s+(.+?)\s+है',
    r'मेरा नाम\s+(.+?)$',
    r'नाम है\s+(.+?)(?:\s+और|$)',
    r'मैं\s+(.+?)\s+हूँ',
    r'मैं\s+(.+?)\s+हूं',
]

HINDI_FATHER_PATTERNS = [
    r'पिता का नाम\s+(.+?)\s+है',
    r'पिता जी का नाम\s+(.+?)\s+है',
    r'पापा का नाम\s+(.+?)\s+है',
    r'पिता का नाम\s+(.+?)(?:\s+और|$)',
]

HINDI_MOTHER_PATTERNS = [
    r'माता का नाम\s+(.+?)\s+है',
    r'माँ का नाम\s+(.+?)\s+है',
    r'माता जी का नाम\s+(.+?)\s+है',
    r'माता का नाम\s+(.+?)(?:\s+और|$)',
]

HINDI_INCOME_PATTERNS = [
    r'(?:वार्षिक\s+)?आय\s+(.+?)\s+(?:रुपये|रूपये|रुपए)\s+है',
    r'(.+?)\s+(?:रुपये|रूपये|रुपए)\s+(?:की\s+)?(?:वार्षिक\s+)?आय',
    r'(?:मेरी\s+)?(?:वार्षिक\s+)?आय\s+(.+?)\s+है',
    r'सालाना\s+आय\s+(.+?)\s+(?:रुपये|है)',
]

HINDI_PHONE_PATTERNS = [
    r'(?:मेरा\s+)?(?:फ़ोन|फोन|मोबाइल)\s+(?:नंबर\s+)?(?:है\s+)?(\d[\d\s]{8,})',
]

HINDI_DOB_PATTERNS = [
    r'(?:मेरी\s+)?जन्म\s+(?:तिथि|दिनांक)\s+(.+?)\s+है',
    r'मेरा\s+जन्म\s+(.+?)\s+को\s+हुआ',
]

HINDI_CITY_PATTERNS = [
    r'(?:मैं|हम)\s+(.+?)\s+में\s+रहता',
    r'(?:मेरा\s+)?शहर\s+(.+?)\s+है',
    r'(?:मेरा\s+)?पता\s+(.+?)\s+है',
]

HINDI_GENDER_MAP = {
    'पुरुष': 'male',
    'महिला': 'female',
    'स्त्री': 'female',
    'लड़का': 'male',
    'लड़की': 'female',
    'अन्य': 'other',
}

# ── Main Hindi preprocessing ──────────────────────────────────────────────────

def normalize_hindi_email(text: str) -> str:
    """Handle spoken Hindi email: "somil ऐट gmail डॉट com" """
    text = re.sub(r'\s+ऐट\s+', '@', text)
    text = re.sub(r'\s+at\s+', '@', text, flags=re.IGNORECASE)
    text = re.sub(r'\s+डॉट\s+', '.', text)
    text = re.sub(r'\s+dot\s+', '.', text, flags=re.IGNORECASE)
    return text

def normalize_hindi_income(text: str) -> str:
    """Convert Hindi income expressions to digits."""
    # Try full Hindi number conversion
    result = hindi_words_to_number(text)
    if result:
        return str(result)

    # Fallback: English words within Hindi sentence
    from services.text_preprocessor import normalize_income
    return normalize_income(text)

def normalize_hindi_date(text: str) -> str:
    """Normalize Hindi date expressions."""
    # Check Hindi month names
    for month_hi, month_num in HINDI_MONTHS.items():
        if month_hi in text:
            day_match  = re.search(r'\b(\d{1,2})\b', text)
            year_match = re.search(r'\b(\d{4})\b', text)
            day  = day_match.group(1).zfill(2)  if day_match  else '01'
            year = year_match.group(1)           if year_match else ''
            return f"{day}-{month_num}-{year}"

    # Try numeric date
    date_match = re.search(r'(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})', text)
    if date_match:
        d, m, y = date_match.groups()
        return f"{d.zfill(2)}-{m.zfill(2)}-{y}"

    return text

def extract_by_hindi_pattern(text: str, patterns: list[str]) -> str | None:
    """Extract value using Hindi regex patterns."""
    for pattern in patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(1).strip()
    return None

def preprocess_hindi(text: str) -> str:
    """Main Hindi preprocessing — normalize email, numbers."""
    text = normalize_hindi_email(text)
    return text
# text_preprocessor.py
# Cleans raw speech transcript before NLP processing.
# Speech-to-text produces spoken words — we normalize them here.

import re
from word2number import w2n

# Spoken email patterns → fix spacing
# e.g. "somil at gmail dot com" → "somil@gmail.com"
_SPOKEN_EMAIL = re.compile(
    r'\b([A-Za-z0-9._%+\-]+(?:\s+dot\s+[A-Za-z0-9_%+\-]+)*)\s+(?:at the rate of|at the rate|at)\s+'
    r'([A-Za-z0-9\-]+(?:\s+dot\s+[A-Za-z0-9\-]+)+|[A-Za-z0-9\-]+\.[A-Za-z]{2,}(?:\.[A-Za-z]{2,})*)',
    re.IGNORECASE,
)

def normalize_email(text: str) -> str:
    """
    Converts spoken emails ("somil at gmail dot com") to "somil@gmail.com"
    WITHOUT touching normal sentences such as "I live at Indore".
    """
    def _fix(m: re.Match) -> str:
        local = re.sub(r'\s+dot\s+', '.', m.group(1), flags=re.IGNORECASE)
        domain = re.sub(r'\s+dot\s+', '.', m.group(2), flags=re.IGNORECASE)
        domain = re.sub(r'\s+', '', domain)
        return f"{local.replace(' ', '')}@{domain}"
    text = _SPOKEN_EMAIL.sub(_fix, text)
    # "somil@gmail dot com" (user said "@" literally)
    text = re.sub(r'(@[A-Za-z0-9\-]+)\s+dot\s+', r'\1.', text, flags=re.IGNORECASE)
    text = re.sub(r'(@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*)\s+dot\s+', r'\1.', text, flags=re.IGNORECASE)
    return text

# Convert spoken numbers to digits
# e.g. "three lakh" → "300000"
# e.g. "nine eight seven six" → "9876"
LAKH  = 100_000
CRORE = 10_000_000

_MULTIPLIERS = {'crore': CRORE, 'crores': CRORE, 'lakh': LAKH, 'lakhs': LAKH,
                'lac': LAKH, 'lacs': LAKH, 'thousand': 1000, 'hazar': 1000, 'hazaar': 1000,
                'k': 1000}

def _to_number(chunk: str):
    chunk = chunk.strip().replace(',', '')
    if not chunk:
        return None
    try:
        return float(chunk)
    except ValueError:
        pass
    try:
        return float(w2n.word_to_num(chunk))
    except Exception:
        return None

def normalize_income(text: str) -> str:
    """'three lakh rupees' / '3.5 lakh' / 'Rs. 2,50,000' / '45 thousand' -> '300000'"""
    t = text.lower()
    t = re.sub(r'\b(rs\.?|inr|rupees?|rupaye|only|per annum|annual|yearly|income|is|of|about|around)\b', ' ', t)
    t = re.sub(r'[₹]', ' ', t)
    t = re.sub(r'\s+', ' ', t).strip()

    # "<number-ish> <multiplier>" e.g. "three lakh", "3.5 lakh", "two crore fifty lakh"
    total, matched = 0.0, False
    for mult_word in ('crore', 'crores', 'lakh', 'lakhs', 'lac', 'lacs', 'thousand'):
        m = re.search(r'((?:\d[\d,]*\.?\d*)|(?:[a-z\- ]+?))\s*' + mult_word + r'\b', t)
        if m:
            num = _to_number(m.group(1).split('lakh')[-1].split('crore')[-1])
            if num is not None:
                total += num * _MULTIPLIERS[mult_word]
                matched = True
                t = (t[:m.start()] + ' ' + t[m.end():]).strip()
    if matched:
        rest = _to_number(t)
        if rest:
            total += rest
        return str(int(round(total)))

    num = _to_number(t)
    if num is not None:
        return str(int(round(num)))
    digits = re.sub(r'[^\d]', '', t)
    return digits if digits else text

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
    """Return DD-MM-YYYY whenever the date can be understood."""
    t = text.lower().strip()
    t = re.sub(r'(\d+)(st|nd|rd|th)\b', r'\1', t)

    # "15 august 1999" / "august 15, 1999"
    for month_name in sorted(MONTH_MAP, key=len, reverse=True):
        if re.search(r'\b' + month_name + r'\b', t):
            nums = re.findall(r'\d+', t)
            day = next((n for n in nums if len(n) <= 2), None)
            year = next((n for n in nums if len(n) == 4), None)
            if day and year:
                return f"{day.zfill(2)}-{MONTH_MAP[month_name]}-{year}"
            return t

    # numeric: 15/08/1999, 15-8-99, 15 08 1999, 1999-08-15
    m = re.match(r'^(\d{4})[\s/\-.](\d{1,2})[\s/\-.](\d{1,2})$', t)
    if m:
        return f"{m[3].zfill(2)}-{m[2].zfill(2)}-{m[1]}"
    m = re.match(r'^(\d{1,2})[\s/\-.](\d{1,2})[\s/\-.](\d{2,4})$', t)
    if m:
        year = m[3]
        if len(year) == 2:
            year = ('19' if int(year) > 30 else '20') + year
        return f"{m[1].zfill(2)}-{m[2].zfill(2)}-{year}"
    return text

def preprocess(text: str) -> str:
    """Main preprocessing pipeline."""
    text = normalize_email(text)
    return text
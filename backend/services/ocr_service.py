# ocr_service.py
# OCR pipeline using EasyOCR to extract text + bounding boxes from
# scanned form images or PDFs.

import easyocr
import numpy as np
from PIL import Image
import io
import re

# Load EasyOCR reader once at startup (English + Hindi)
# gpu=False for compatibility on most machines; set True if CUDA available
_reader = None

def get_reader():
    global _reader
    if _reader is None:
        _reader = easyocr.Reader(['en', 'hi'], gpu=False)
    return _reader

# ── OCR Text Box ──────────────────────────────────────────────────────────────

class OCRBox:
    def __init__(self, text: str, confidence: float, bbox: list):
        self.text = text
        self.confidence = confidence
        self.bbox = bbox  # [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]

    @property
    def x_min(self):
        return min(p[0] for p in self.bbox)

    @property
    def y_min(self):
        return min(p[1] for p in self.bbox)

    @property
    def x_max(self):
        return max(p[0] for p in self.bbox)

    @property
    def y_max(self):
        return max(p[1] for p in self.bbox)

    @property
    def y_center(self):
        return (self.y_min + self.y_max) / 2

# ── Core OCR function ─────────────────────────────────────────────────────────

def run_ocr_on_image(image_bytes: bytes) -> list[OCRBox]:
    """Run EasyOCR on raw image bytes, return list of detected text boxes."""
    reader = get_reader()
    image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    image_np = np.array(image)

    results = reader.readtext(image_np)

    boxes = []
    for bbox, text, confidence in results:
        boxes.append(OCRBox(text.strip(), float(confidence), bbox))

    return boxes

# ── Field-label detection ──────────────────────────────────────────────────────

# Common form-label keywords (English + Hindi)
LABEL_KEYWORDS = [
    'name', 'father', 'mother', 'email', 'phone', 'mobile', 'contact',
    'date of birth', 'dob', 'birth', 'income', 'address', 'city', 'state',
    'pincode', 'pin code', 'gender', 'category', 'nationality', 'religion',
    'signature', 'photo', 'application', 'roll number', 'aadhar', 'aadhaar',
    'नाम', 'पिता', 'माता', 'ईमेल', 'फोन', 'मोबाइल', 'जन्म', 'आय', 'पता',
    'शहर', 'राज्य', 'पिन कोड', 'लिंग', 'श्रेणी',
]

def looks_like_label(text: str) -> bool:
    """Check if a text box looks like a form field label."""
    text_lower = text.lower().strip(' :*')
    if len(text_lower) < 2:
        return False
    return any(keyword in text_lower for keyword in LABEL_KEYWORDS)

def looks_like_blank_line(text: str) -> bool:
    """Detect underscores or dots used as fill-in blanks."""
    return bool(re.match(r'^[_\.\-\s]{3,}$', text))

# ── Form structure builder ────────────────────────────────────────────────────

def group_boxes_into_rows(boxes: list[OCRBox], y_tolerance: float = 15) -> list[list[OCRBox]]:
    """
    Group OCR boxes into horizontal rows based on y-coordinate proximity.
    Scanned forms typically have label + blank on the same visual row.
    """
    if not boxes:
        return []

    sorted_boxes = sorted(boxes, key=lambda b: b.y_center)
    rows = []
    current_row = [sorted_boxes[0]]

    for box in sorted_boxes[1:]:
        if abs(box.y_center - current_row[-1].y_center) <= y_tolerance:
            current_row.append(box)
        else:
            rows.append(sorted(current_row, key=lambda b: b.x_min))
            current_row = [box]

    rows.append(sorted(current_row, key=lambda b: b.x_min))
    return rows

def build_form_fields(boxes: list[OCRBox]) -> list[dict]:
    """
    Converts OCR boxes into structured form fields matching the
    DetectedField shape used by the Chrome extension.

    Heuristic: a label box followed (same row, or blank/underscore pattern)
    by empty space = one form field.
    """
    rows = group_boxes_into_rows(boxes)
    fields = []
    field_index = 0

    for row in rows:
        for i, box in enumerate(row):
            if looks_like_label(box.text):
                # Clean label text
                label = re.sub(r'[:*]+$', '', box.text).strip()

                # Determine likely field type from label keywords
                field_type = guess_field_type(label)

                fields.append({
                    "index": field_index,
                    "fieldId": f"ocr_field_{field_index}",
                    "label": label,
                    "placeholder": "",
                    "name": "",
                    "id": f"ocr_field_{field_index}",
                    "type": field_type,
                    "tagName": "INPUT",
                    "value": "",
                    "confidence": box.confidence,
                    "bbox": box.bbox,
                })
                field_index += 1

    return fields

def guess_field_type(label: str) -> str:
    """Guess HTML input type from label text."""
    label_lower = label.lower()
    if 'email' in label_lower or 'ईमेल' in label:
        return 'email'
    if any(k in label_lower for k in ['phone', 'mobile', 'contact']) or 'फोन' in label:
        return 'tel'
    if 'date' in label_lower or 'dob' in label_lower or 'जन्म' in label:
        return 'date'
    if 'income' in label_lower or 'आय' in label:
        return 'number'
    return 'text'

# ── Main pipeline ──────────────────────────────────────────────────────────────

def process_form_image(image_bytes: bytes) -> dict:
    """
    Full OCR pipeline: image bytes → detected text → structured fields.
    """
    boxes = run_ocr_on_image(image_bytes)
    fields = build_form_fields(boxes)

    full_text = ' '.join(b.text for b in boxes)

    return {
        "fields": fields,
        "raw_text": full_text,
        "total_text_boxes": len(boxes),
        "fields_detected": len(fields),
    }
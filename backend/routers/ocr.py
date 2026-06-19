# ocr.py — FastAPI router for OCR form parsing

from fastapi import APIRouter, UploadFile, File, HTTPException
from models.schemas import OCRParseResponse, OCRField
from services.ocr_service import process_form_image
from services.pdf_service import pdf_to_images

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}
ALLOWED_PDF_TYPE = "application/pdf"
MAX_FILE_SIZE_MB = 10

@router.post("/ocr/parse", response_model=OCRParseResponse)
async def parse_scanned_form(file: UploadFile = File(...)):
    """
    Accepts a scanned form image (PNG/JPEG) or PDF.
    Returns structured field data extracted via OCR.

    Usage: multipart/form-data with key "file"
    """
    content_type = file.content_type
    file_bytes = await file.read()

    # Size check
    size_mb = len(file_bytes) / (1024 * 1024)
    if size_mb > MAX_FILE_SIZE_MB:
        raise HTTPException(status_code=413, detail=f"File too large ({size_mb:.1f}MB). Max {MAX_FILE_SIZE_MB}MB.")

    try:
        all_fields = []
        all_text = []
        pages_processed = 1

        if content_type == ALLOWED_PDF_TYPE:
            # Convert each PDF page to image, then OCR each
            images = pdf_to_images(file_bytes)
            pages_processed = len(images)

            for page_num, image_bytes in enumerate(images):
                result = process_form_image(image_bytes)
                # Offset field indices per page
                for f in result['fields']:
                    f['index'] += page_num * 1000
                    f['fieldId'] = f"p{page_num}_{f['fieldId']}"
                    f['id'] = f['fieldId']
                all_fields.extend(result['fields'])
                all_text.append(result['raw_text'])

        elif content_type in ALLOWED_IMAGE_TYPES:
            result = process_form_image(file_bytes)
            all_fields = result['fields']
            all_text = [result['raw_text']]

        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type: {content_type}. Use PNG, JPEG, or PDF."
            )

        return OCRParseResponse(
            success=True,
            fields=[OCRField(**f) for f in all_fields],
            raw_text=' '.join(all_text),
            total_text_boxes=len(all_fields),
            fields_detected=len(all_fields),
            pages_processed=pages_processed,
            message=f"Detected {len(all_fields)} fields across {pages_processed} page(s).",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing error: {str(e)}")
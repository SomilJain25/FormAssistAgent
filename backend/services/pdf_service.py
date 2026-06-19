# pdf_service.py
# Converts PDF pages to images for OCR processing.

from pdf2image import convert_from_bytes
import io

def pdf_to_images(pdf_bytes: bytes, dpi: int = 200) -> list[bytes]:
    """
    Converts each page of a PDF into PNG image bytes.
    Returns a list — one entry per page.
    """
    pages = convert_from_bytes(pdf_bytes, dpi=dpi)

    image_bytes_list = []
    for page in pages:
        buffer = io.BytesIO()
        page.save(buffer, format='PNG')
        image_bytes_list.append(buffer.getvalue())

    return image_bytes_list
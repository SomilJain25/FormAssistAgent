# Dockerfile — FastAPI backend with spaCy + EasyOCR

FROM python:3.11-slim

# System dependencies for EasyOCR (PDF conversion needs poppler,
# OpenCV needs these libs)
RUN apt-get update && apt-get install -y \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies first (better Docker layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model at build time
RUN python -m spacy download en_core_web_sm

# Copy application code
COPY . .

# Pre-download EasyOCR models at build time so the first request isn't slow
RUN python -c "import easyocr; easyocr.Reader(['en', 'hi'], gpu=False)"

EXPOSE 8000

# Run with multiple workers in production
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
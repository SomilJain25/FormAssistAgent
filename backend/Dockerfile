FROM python:3.11-slim

RUN apt-get update && apt-get install -y \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --default-timeout=300 --retries 5 -r requirements.txt

RUN python -m spacy download en_core_web_sm

COPY . .

RUN python -c "import easyocr; easyocr.Reader(['en', 'hi'], gpu=False)"

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
FROM python:3.10-slim

RUN apt-get update && apt-get install -y \
    poppler-utils \
    libgl1 \
    libglib2.0-0 \
    gcc \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# CPU-only torch first (the default wheel pulls ~2GB of CUDA libs, too big for Render)
RUN pip install --no-cache-dir \
    --default-timeout=300 --retries 5 \
    torch torchvision --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir \
    --default-timeout=300 \
    --retries 5 \
    -r requirements.txt

RUN pip install --no-cache-dir \
    https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl

COPY . .

RUN python -c "import easyocr; easyocr.Reader(['en','hi'], gpu=False)"

EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
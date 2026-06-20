# main.py — production-ready FastAPI app

import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

from database import engine, Base
from routers.extract import router as extract_router
from routers.map import router as map_router
from routers.analyze import router as analyze_router
from routers.ocr import router as ocr_router
from routers.profile import router as profile_router

load_dotenv()

# Create DB tables on startup (use Alembic migrations for real production)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Voice Form Assistant API",
    description="NLP backend for extracting entities from speech transcripts",
    version="1.0.0",
)

# ── CORS — restrict to known origins in production ──
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(extract_router,  prefix="/api/v1", tags=["NLP"])
app.include_router(map_router,      prefix="/api/v1", tags=["Mapping"])
app.include_router(analyze_router,  prefix="/api/v1", tags=["Intelligence"])
app.include_router(ocr_router,      prefix="/api/v1", tags=["OCR"])
app.include_router(profile_router,  prefix="/api/v1", tags=["Profile"])

@app.get("/")
async def root():
    return {"status": "running", "version": "1.0.0", "docs": "/docs"}

@app.get("/health")
async def health():
    return {"status": "ok"}
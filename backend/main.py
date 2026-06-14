# main.py — FastAPI application entry point

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.extract import router as extract_router

app = FastAPI(
    title="Voice Form Assistant API",
    description="NLP backend for extracting entities from speech transcripts",
    version="1.0.0",
)

# Allow Chrome extension to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],        # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(extract_router, prefix="/api/v1", tags=["NLP"])

@app.get("/")
async def root():
    return {
        "status": "running",
        "version": "1.0.0",
        "docs": "/docs",
    }

@app.get("/health")
async def health():
    return {"status": "ok"}
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers.extract import router as extract_router
from routers.map import router as map_router
from routers.analyze import router as analyze_router
from routers.ocr import router as ocr_router          # ← add this

app = FastAPI(
    title="Voice Form Assistant API",
    description="NLP backend for extracting entities from speech transcripts",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(extract_router,  prefix="/api/v1", tags=["NLP"])
app.include_router(map_router,      prefix="/api/v1", tags=["Mapping"])
app.include_router(analyze_router,  prefix="/api/v1", tags=["Intelligence"])
app.include_router(ocr_router,      prefix="/api/v1", tags=["OCR"])         # ← add this

@app.get("/")
async def root():
    return {"status": "running", "version": "1.0.0", "docs": "/docs"}

@app.get("/health")
async def health():
    return {"status": "ok"}
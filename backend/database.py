# database.py — SQLAlchemy engine, session, and base model setup

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

load_dotenv()

# Falls back to SQLite for local dev if DATABASE_URL isn't set
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./voice_form_assistant.db"
)

# PostgreSQL URLs from Render/Railway sometimes start with "postgres://"
# SQLAlchemy 2.0 requires "postgresql://"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {"check_same_thread": False} if "sqlite" in DATABASE_URL else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """FastAPI dependency — yields a DB session, closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
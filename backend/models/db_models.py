# db_models.py — SQLAlchemy ORM tables

from sqlalchemy import Column, String, Integer, Float, DateTime, Text, JSON
from sqlalchemy.sql import func
from database import Base

class UserProfile(Base):
    """Stores saved profile fields per device/user."""
    __tablename__ = "user_profiles"

    id          = Column(Integer, primary_key=True, index=True)
    device_id   = Column(String, index=True)   # generated client-side, anonymous
    entity_type = Column(String, index=True)    # e.g. "name", "email"
    value       = Column(Text)
    label       = Column(String)
    use_count   = Column(Integer, default=1)
    created_at  = Column(DateTime(timezone=True), server_default=func.now())
    updated_at  = Column(DateTime(timezone=True), onupdate=func.now())


class FormSubmissionLog(Base):
    """Optional analytics — logs each fill event (no PII stored long-term)."""
    __tablename__ = "form_submission_logs"

    id              = Column(Integer, primary_key=True, index=True)
    device_id       = Column(String, index=True)
    domain          = Column(String)             # which website
    fields_filled   = Column(Integer)
    fields_total    = Column(Integer)
    language        = Column(String, default="en")
    template        = Column(String, default="common")
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
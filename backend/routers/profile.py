# profile.py — server-side profile persistence (optional, syncs across devices)

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
from models.db_models import UserProfile

router = APIRouter()

class ProfileFieldIn(BaseModel):
    device_id: str
    entity_type: str
    value: str
    label: Optional[str] = ""

class ProfileFieldOut(BaseModel):
    entity_type: str
    value: str
    label: str
    use_count: int

    class Config:
        from_attributes = True

@router.post("/profile/save")
async def save_profile_field(data: ProfileFieldIn, db: Session = Depends(get_db)):
    existing = db.query(UserProfile).filter(
        UserProfile.device_id == data.device_id,
        UserProfile.entity_type == data.entity_type,
    ).first()

    if existing:
        existing.value = data.value
        existing.use_count += 1
    else:
        existing = UserProfile(
            device_id=data.device_id,
            entity_type=data.entity_type,
            value=data.value,
            label=data.label or data.entity_type,
            use_count=1,
        )
        db.add(existing)

    db.commit()
    return {"success": True}

@router.get("/profile/{device_id}", response_model=list[ProfileFieldOut])
async def get_profile(device_id: str, db: Session = Depends(get_db)):
    fields = db.query(UserProfile).filter(
        UserProfile.device_id == device_id
    ).all()
    return fields

@router.delete("/profile/{device_id}/{entity_type}")
async def delete_profile_field(device_id: str, entity_type: str, db: Session = Depends(get_db)):
    field = db.query(UserProfile).filter(
        UserProfile.device_id == device_id,
        UserProfile.entity_type == entity_type,
    ).first()

    if not field:
        raise HTTPException(status_code=404, detail="Field not found.")

    db.delete(field)
    db.commit()
    return {"success": True}
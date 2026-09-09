from __future__ import annotations
from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class JournalLineCreate(BaseModel):
    account_code: str = Field(..., min_length=3, max_length=20)
    debit: float = Field(..., ge=0)
    credit: float = Field(..., ge=0)
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class JournalEntryCreate(BaseModel):
    journal_id: str = Field(..., min_length=3)
    lines: List[JournalLineCreate]
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class JournalEntryResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    journal_id: str
    posted_at: Optional[datetime] = None
    posted_by: Optional[str] = None
    is_posted: bool = False
    description: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class JournalPostedEventResponse(BaseModel):
    entry_id: UUID
    posted_at: datetime
    posted_by: str

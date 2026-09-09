from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

@dataclass(frozen=True)
class DomainEvent:
    """پایه Domain Event (برای همه رویدادهای حسابداری)"""
    event_id: UUID = UUID()
    occurred_at: datetime = datetime.utcnow()

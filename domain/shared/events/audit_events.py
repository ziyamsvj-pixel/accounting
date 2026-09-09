from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from uuid import UUID
from domain.shared.events import DomainEvent

@dataclass(frozen=True)
class AuditTrailEvent(DomainEvent):
    """رویداد Audit Trail برای ثبت تغییرات (Immutable + Audit)"""
    entry_id: UUID
    action: str  # post, update, delete
    performed_by: str
    timestamp: datetime
    details: dict

@dataclass(frozen=True)
class JournalImmutableEvent(DomainEvent):
    """رویداد وقتی Jورنال غیرقابل تغییر می‌شود"""
    entry_id: UUID
    reason: str

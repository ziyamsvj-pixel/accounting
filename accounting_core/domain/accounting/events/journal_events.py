from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID, uuid4

from ..value_objects.persian_date import PersianDate


@dataclass(frozen=True, slots=True)
class DomainEvent:
    """پایه تمام رویدادهای دامنه"""

    event_id: UUID = field(default_factory=uuid4)
    occurred_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    aggregate_id: Optional[UUID] = None


@dataclass(frozen=True, slots=True)
class JournalEntryCreated(DomainEvent):
    entry_number: str = ""
    entry_date: Optional[PersianDate] = None
    created_by: Optional[UUID] = None


@dataclass(frozen=True, slots=True)
class JournalEntryPosted(DomainEvent):
    entry_number: str = ""
    entry_date: Optional[PersianDate] = None
    total_debit: str = "0"  # به صورت رشته برای سریالایز آسان
    posted_by: Optional[UUID] = None


@dataclass(frozen=True, slots=True)
class JournalEntryReversed(DomainEvent):
    original_entry_id: UUID = field(default_factory=uuid4)
    original_entry_number: str = ""
    reverse_entry_id: UUID = field(default_factory=uuid4)
    reverse_entry_number: str = ""
    reversed_by: Optional[UUID] = None


@dataclass(frozen=True, slots=True)
class JournalEntryCancelled(DomainEvent):
    entry_number: str = ""
    cancelled_by: Optional[UUID] = None
    reason: str = ""

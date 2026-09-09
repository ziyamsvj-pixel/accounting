from __future__ import annotations
from datetime import datetime
from uuid import UUID, uuid4
from dataclasses import dataclass, field
from typing import List, Optional
from domain.accounting.value_objects.money import Money
from domain.accounting.value_objects.journal_line import JournalLine
from domain.shared.events import DomainEvent
from domain.tenant.tenant_context import TenantContext

class JournalPostedEvent(DomainEvent):
    entry_id: UUID
    posted_at: datetime
    posted_by: str

class JournalEntry:
    """Aggregate Root اصلی Accounting Core"""
    def __init__(
        self,
        tenant_id: UUID,
        journal_id: str,
        lines: List[JournalLine],
        description: Optional[str] = None,
    ):
        self.id = uuid4()
        self.tenant_id = tenant_id
        self.journal_id = journal_id
        self.lines = lines
        self.description = description
        self.posted_at: Optional[datetime] = None
        self.posted_by: Optional[str] = None
        self.created_at = datetime.utcnow()

        # Double-Entry Validation (فقط در Domain)
        self._validate_double_entry()

    def _validate_double_entry(self) -> None:
        total_debit = sum(line.debit for line in self.lines)
        total_credit = sum(line.credit for line in self.lines)
        if total_debit != total_credit:
            raise ValueError(f"Double-Entry violation: Debit {total_debit} != Credit {total_credit}")

    def post(self, posted_by: str) -> JournalPostedEvent:
        if self.posted_at:
            raise ValueError("JournalEntry قبلاً پست شده است (Immutable)")
        self.posted_at = datetime.utcnow()
        self.posted_by = posted_by
        return JournalPostedEvent(entry_id=self.id, posted_at=self.posted_at, posted_by=posted_by)

    def add_line(self, line: JournalLine) -> None:
        if self.posted_at:
            raise ValueError("پس از پست، تغییر خط مجاز نیست (Immutable)")
        self.lines.append(line)
        self._validate_double_entry()

    @property
    def balance(self) -> Money:
        return sum(line.amount for line in self.lines)

    @classmethod
    def create(cls, tenant_id: UUID, journal_id: str, lines: List[JournalLine], description: Optional[str] = None) -> JournalEntry:
        tenant = TenantContext.get_current()
        if not tenant:
            raise ValueError("TenantContext تنظیم نشده است")
        return cls(tenant_id=tenant_id, journal_id=journal_id, lines=lines, description=description)

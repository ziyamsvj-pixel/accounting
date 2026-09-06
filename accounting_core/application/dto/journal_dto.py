from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from domain.accounting.aggregates.journal_entry import JournalEntryStatus
from domain.accounting.value_objects.persian_date import PersianDate


@dataclass(frozen=True)
class JournalLineCommand:
    """دستور یک خط سند"""

    account_id: UUID
    debit_amount: Decimal = Decimal("0")
    credit_amount: Decimal = Decimal("0")
    description: str = ""
    foreign_amount: Optional[Decimal] = None
    foreign_currency_code: Optional[str] = None
    exchange_rate: Optional[Decimal] = None
    cost_center_id: Optional[UUID] = None
    detail_id: Optional[UUID] = None


@dataclass(frozen=True)
class CreateJournalEntryCommand:
    """دستور ایجاد سند حسابداری"""

    entry_date: PersianDate
    description: str
    lines: List[JournalLineCommand]
    reference: str = ""
    notes: str = ""
    created_by: Optional[UUID] = None
    fiscal_year: Optional[int] = None
    # اگر خالی باشد، سیستم خودش شماره می‌دهد
    entry_number: Optional[str] = None


@dataclass(frozen=True)
class PostJournalEntryCommand:
    entry_id: UUID
    posted_by: Optional[UUID] = None


@dataclass(frozen=True)
class ReverseJournalEntryCommand:
    entry_id: UUID
    reverse_date: PersianDate
    reverse_number: Optional[str] = None  # اگر خالی باشد سیستم می‌دهد
    created_by: Optional[UUID] = None


@dataclass(frozen=True)
class JournalLineDTO:
    id: UUID
    account_id: UUID
    debit: str
    credit: str
    description: str
    is_debit: bool


@dataclass(frozen=True)
class JournalEntryDTO:
    """خروجی خواندن سند"""

    id: UUID
    entry_number: str
    entry_date: str
    description: str
    status: str
    total_debit: str
    total_credit: str
    is_balanced: bool
    reference: str
    notes: str
    fiscal_year: Optional[int]
    created_at: str
    posted_at: Optional[str]
    lines: List[JournalLineDTO] = field(default_factory=list)

    @classmethod
    def from_entity(cls, entry) -> "JournalEntryDTO":
        from domain.accounting.aggregates.journal_entry import JournalEntry

        assert isinstance(entry, JournalEntry)

        lines = [
            JournalLineDTO(
                id=line.id,
                account_id=line.account_id,
                debit=str(line.debit.amount),
                credit=str(line.credit.amount),
                description=line.description,
                is_debit=line.is_debit,
            )
            for line in entry.lines
        ]

        return cls(
            id=entry.id,
            entry_number=entry.entry_number,
            entry_date=str(entry.entry_date),
            description=entry.description,
            status=entry.status.value,
            total_debit=str(entry.total_debit),
            total_credit=str(entry.total_credit),
            is_balanced=entry.is_balanced,
            reference=entry.reference,
            notes=entry.notes,
            fiscal_year=entry.fiscal_year,
            created_at=entry.created_at.isoformat(),
            posted_at=entry.posted_at.isoformat() if entry.posted_at else None,
            lines=lines,
        )

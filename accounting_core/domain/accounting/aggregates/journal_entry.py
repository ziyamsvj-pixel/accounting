from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum
from typing import List, Optional
from uuid import UUID, uuid4

from ..value_objects.money import Money
from ..value_objects.persian_date import PersianDate
from ..value_objects.currency import Currency


class JournalEntryStatus(str, Enum):
    DRAFT = "DRAFT"
    POSTED = "POSTED"
    REVERSED = "REVERSED"
    CANCELLED = "CANCELLED"


@dataclass(frozen=True, slots=True)
class JournalLine:
    """
    یک خط سند حسابداری (بدهکار یا بستانکار)
    Immutable Value Object داخل Aggregate
    """

    id: UUID
    account_id: UUID
    debit: Money
    credit: Money
    description: str = ""
    # پشتیبانی از ارز خارجی
    foreign_amount: Optional[Money] = None
    exchange_rate: Optional[Decimal] = None
    cost_center_id: Optional[UUID] = None  # مرکز هزینه (اختیاری)
    detail_id: Optional[UUID] = None  # تفصیلی سطح پایین‌تر

    def __post_init__(self) -> None:
        if self.debit.is_zero() and self.credit.is_zero():
            raise ValueError("Either debit or credit must be non-zero")
        if not self.debit.is_zero() and not self.credit.is_zero():
            raise ValueError("A line cannot have both debit and credit amounts")

    @property
    def is_debit(self) -> bool:
        return not self.debit.is_zero()

    @property
    def is_credit(self) -> bool:
        return not self.credit.is_zero()

    @property
    def amount(self) -> Money:
        return self.debit if self.is_debit else self.credit


@dataclass
class JournalEntry:
    """
    Aggregate Root: سند حسابداری (Journal Entry)
    
    قوانین اصلی:
    - فقط در وضعیت DRAFT قابل ویرایش است
    - هنگام POST باید بالانس باشد (جمع بدهکار = جمع بستانکار)
    - حداقل دو خط داشته باشد
    - سند ثبت‌شده فقط با سند برگشت قابل خنثی‌سازی است
    """

    id: UUID
    entry_number: str
    entry_date: PersianDate
    description: str
    status: JournalEntryStatus = JournalEntryStatus.DRAFT
    lines: List[JournalLine] = field(default_factory=list)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    posted_at: Optional[datetime] = None
    created_by: Optional[UUID] = None
    fiscal_year: Optional[int] = None
    reference: str = ""  # شماره مرجع (فاکتور، چک، قرارداد و ...)
    notes: str = ""

    # ---------- Factory ----------
    @classmethod
    def create(
        cls,
        entry_number: str,
        entry_date: PersianDate,
        description: str,
        created_by: Optional[UUID] = None,
        fiscal_year: Optional[int] = None,
        reference: str = "",
        notes: str = "",
    ) -> JournalEntry:
        if not entry_number or not entry_number.strip():
            raise ValueError("Entry number is required")
        if not description or not description.strip():
            raise ValueError("Description is required")

        return cls(
            id=uuid4(),
            entry_number=entry_number.strip(),
            entry_date=entry_date,
            description=description.strip(),
            created_by=created_by,
            fiscal_year=fiscal_year or entry_date.year,
            reference=reference.strip(),
            notes=notes.strip(),
        )

    # ---------- Business Methods ----------
    def add_line(
        self,
        account_id: UUID,
        debit: Optional[Money] = None,
        credit: Optional[Money] = None,
        description: str = "",
        foreign_amount: Optional[Money] = None,
        exchange_rate: Optional[Decimal] = None,
        cost_center_id: Optional[UUID] = None,
        detail_id: Optional[UUID] = None,
    ) -> None:
        self._assert_draft()

        debit = debit or Money.zero()
        credit = credit or Money.zero()

        # اطمینان از اینکه ارز خطوط یکسان باشد (در نسخه ساده)
        # در نسخه‌های پیشرفته‌تر می‌توان چند ارزی کرد

        line = JournalLine(
            id=uuid4(),
            account_id=account_id,
            debit=debit,
            credit=credit,
            description=description,
            foreign_amount=foreign_amount,
            exchange_rate=exchange_rate,
            cost_center_id=cost_center_id,
            detail_id=detail_id,
        )
        self.lines.append(line)

    def remove_line(self, line_id: UUID) -> None:
        self._assert_draft()
        self.lines = [line for line in self.lines if line.id != line_id]

    def clear_lines(self) -> None:
        self._assert_draft()
        self.lines.clear()

    def post(self) -> None:
        """ثبت قطعی سند"""
        self._assert_draft()
        self._validate_has_minimum_lines()
        self._validate_balance()

        self.status = JournalEntryStatus.POSTED
        self.posted_at = datetime.now(timezone.utc)

    def reverse(
        self,
        reverse_date: PersianDate,
        reverse_number: str,
        created_by: Optional[UUID] = None,
    ) -> JournalEntry:
        """صدور سند برگشت (Reversing Entry)"""
        if self.status != JournalEntryStatus.POSTED:
            raise ValueError("Only posted entries can be reversed")

        reversed_entry = JournalEntry.create(
            entry_number=reverse_number,
            entry_date=reverse_date,
            description=f"برگشت سند شماره {self.entry_number} — {self.description}",
            created_by=created_by or self.created_by,
            fiscal_year=self.fiscal_year,
            reference=self.entry_number,
            notes=f"Reversal of {self.id}",
        )

        for line in self.lines:
            # بدهکار و بستانکار جابه‌جا می‌شوند
            reversed_entry.add_line(
                account_id=line.account_id,
                debit=line.credit,
                credit=line.debit,
                description=f"برگشت: {line.description}" if line.description else "برگشت",
                foreign_amount=line.foreign_amount,
                exchange_rate=line.exchange_rate,
                cost_center_id=line.cost_center_id,
                detail_id=line.detail_id,
            )

        reversed_entry.post()
        self.status = JournalEntryStatus.REVERSED
        return reversed_entry

    def cancel(self) -> None:
        if self.status == JournalEntryStatus.POSTED:
            raise ValueError(
                "Posted entries cannot be cancelled. Use reverse() instead."
            )
        if self.status == JournalEntryStatus.CANCELLED:
            raise ValueError("Entry is already cancelled")
        self.status = JournalEntryStatus.CANCELLED

    def update_description(self, new_description: str) -> None:
        self._assert_draft()
        if not new_description or not new_description.strip():
            raise ValueError("Description cannot be empty")
        self.description = new_description.strip()

    def update_reference(self, reference: str) -> None:
        self._assert_draft()
        self.reference = reference.strip()

    # ---------- Invariants & Validations ----------
    def _assert_draft(self) -> None:
        if self.status != JournalEntryStatus.DRAFT:
            raise ValueError(
                f"Cannot modify journal entry in status {self.status.value}. "
                "Only DRAFT entries are editable."
            )

    def _validate_balance(self) -> None:
        total_debit = self.total_debit
        total_credit = self.total_credit

        if total_debit != total_credit:
            raise ValueError(
                f"Journal entry is not balanced. "
                f"Total Debit: {total_debit}, Total Credit: {total_credit}"
            )

    def _validate_has_minimum_lines(self) -> None:
        if len(self.lines) < 2:
            raise ValueError("Journal entry must have at least two lines")

    # ---------- Properties ----------
    @property
    def total_debit(self) -> Decimal:
        return sum((line.debit.amount for line in self.lines), Decimal("0"))

    @property
    def total_credit(self) -> Decimal:
        return sum((line.credit.amount for line in self.lines), Decimal("0"))

    @property
    def is_balanced(self) -> bool:
        return self.total_debit == self.total_credit

    @property
    def line_count(self) -> int:
        return len(self.lines)

    def __str__(self) -> str:
        return (
            f"JournalEntry({self.entry_number}, {self.entry_date}, "
            f"{self.status.value}, lines={self.line_count})"
        )

from __future__ import annotations
from datetime import datetime
from typing import List, Optional
from domain.accounting.aggregates.journal_entry import JournalEntry, JournalPostedEvent
from domain.accounting.services.currency_conversion_service import CurrencyConversionService
from domain.shared.value_objects.currency_policy import CurrencyPolicy
from domain.shared.value_objects.money import Money
from domain.shared.value_objects.exchange_rate import ExchangeRate
from domain.shared.events import DomainEvent
from domain.tenant.tenant_context import TenantContext

class JournalService:
    """Service مرکزی برای مدیریت JournalEntry (Application Layer)"""
    def __init__(self, policy: Optional[CurrencyPolicy] = None):
        self.policy = policy or CurrencyPolicy()
        self.conversion_service = CurrencyConversionService(self.policy)

    def create_journal_entry(
        self,
        journal_id: str,
        lines: List[dict],  # در فازهای بعدی از DTOها استفاده خواهد شد
        description: Optional[str] = None
    ) -> JournalEntry:
        """ایجاد Jورنال (قبل از پست)"""
        tenant = TenantContext.get_current()
        if not tenant:
            raise ValueError("TenantContext تنظیم نشده است")

        # تبدیل به Money objects
        journal_lines = []
        for line in lines:
            journal_lines.append(
                line.__class__(
                    account_code=line.account_code,
                    debit=Money(amount=Decimal(line.debit or 0), currency=line.currency or "IRR"),
                    credit=Money(amount=Decimal(line.credit or 0), currency=line.currency or "IRR"),
                    description=line.description
                )
            )

        entry = JournalEntry.create(
            tenant_id=tenant.id,
            journal_id=journal_id,
            lines=journal_lines,
            description=description
        )
        return entry

    def post_journal_entry(self, entry: JournalEntry, posted_by: str) -> JournalPostedEvent:
        """پست کردن (با Transaction Safety)"""
        if entry.posted_at:
            raise ValueError("Jورنال قبلاً پست شده است")

        # Double-Entry validation (قبل از پست)
        if not all(line.debit.amount > 0 or line.credit.amount > 0 for line in entry.lines):
            raise ValueError("خطوط باید حداقل یکی از debit یا credit داشته باشند")

        event = entry.post(posted_by)
        return event

    def convert_to_base(self, entry: JournalEntry, rate: ExchangeRate) -> JournalEntry:
        """تبدیل به ارز پایه قبل از پست"""
        return self.conversion_service.convert_journal_entry_to_base(entry, rate)

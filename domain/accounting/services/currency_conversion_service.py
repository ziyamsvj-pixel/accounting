from __future__ import annotations
from typing import Optional
from domain.shared.value_objects.money import Money
from domain.shared.value_objects.exchange_rate import ExchangeRate
from domain.shared.value_objects.currency_policy import CurrencyPolicy
from domain.accounting.aggregates.journal_entry import JournalEntry
from domain.tenant.tenant_context import TenantContext

class CurrencyConversionService:
    """Service مرکزی تبدیل ارز (فقط Domain + Application Layer)"""
    def __init__(self, policy: Optional[CurrencyPolicy] = None):
        self.policy = policy or CurrencyPolicy()

    def convert_journal_entry_to_base(self, entry: JournalEntry, rate: ExchangeRate) -> JournalEntry:
        """تبدیل کل Jورنال به ارز پایه (IRR) - قبل از پست"""
        new_lines: list = []
        for line in entry.lines:
            self.policy.validate_money(line.debit)
            self.policy.validate_money(line.credit)

            debit_base = self.policy.convert_to_base(line.debit, rate)
            credit_base = self.policy.convert_to_base(line.credit, rate)

            new_lines.append(
                line.__class__(
                    account_code=line.account_code,
                    debit=debit_base,
                    credit=credit_base,
                    description=line.description
                )
            )

        new_entry = JournalEntry(
            tenant_id=entry.tenant_id,
            journal_id=entry.journal_id,
            lines=new_lines,
            description=f"Converted to base currency: {entry.description or ''}"
        )

        # Double-Entry جدید باید صحیح باشد
        new_entry._validate_double_entry()
        return new_entry

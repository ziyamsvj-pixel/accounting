from __future__ import annotations
from domain.shared.specifications.base import Specification
from domain.accounting.aggregates.journal_entry import JournalEntry
from decimal import Decimal

class DoubleEntrySpecification(Specification):
    """Specification برای Double-Entry"""
    def is_satisfied_by(self, entry: JournalEntry) -> bool:
        total_debit = sum(line.debit.amount for line in entry.lines)
        total_credit = sum(line.credit.amount for line in entry.lines)
        return total_debit == total_credit

class NonNegativeAmountSpecification(Specification):
    """Specification برای مقدار غیرمنفی"""
    def is_satisfied_by(self, money: Money) -> bool:
        return money.amount >= 0

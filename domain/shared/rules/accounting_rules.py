from __future__ import annotations
from domain.accounting.aggregates.journal_entry import JournalEntry
from domain.shared.value_objects.money import Money

class DoubleEntryRule:
    """قانون دوگانه حسابداری (Specification)"""
    def is_satisfied_by(self, entry: JournalEntry) -> bool:
        total_debit = sum(line.debit.amount for line in entry.lines)
        total_credit = sum(line.credit.amount for line in entry.lines)
        return total_debit == total_credit and total_debit > 0

class ImmutableRule:
    """قانون غیرقابل تغییر بعد از پست"""
    def is_satisfied_by(self, entry: JournalEntry) -> bool:
        return entry.posted_at is None

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..aggregates.journal_entry import JournalEntry
    from ..entities.account import Account


class BusinessRule(ABC):
    """پایه قوانین کسب‌وکار دامنه"""

    @abstractmethod
    def is_broken(self) -> bool:
        ...

    @abstractmethod
    def message(self) -> str:
        ...


class JournalEntryMustBeBalancedRule(BusinessRule):
    def __init__(self, entry: JournalEntry) -> None:
        self._entry = entry

    def is_broken(self) -> bool:
        return not self._entry.is_balanced

    def message(self) -> str:
        return (
            f"سند حسابداری بالانس نیست. "
            f"جمع بدهکار: {self._entry.total_debit} — "
            f"جمع بستانکار: {self._entry.total_credit}"
        )


class JournalEntryMustHaveMinimumLinesRule(BusinessRule):
    def __init__(self, entry: JournalEntry, minimum: int = 2) -> None:
        self._entry = entry
        self._minimum = minimum

    def is_broken(self) -> bool:
        return self._entry.line_count < self._minimum

    def message(self) -> str:
        return f"سند باید حداقل {self._minimum} خط داشته باشد (فعلی: {self._entry.line_count})"


class AccountMustBeActiveRule(BusinessRule):
    def __init__(self, account: Account) -> None:
        self._account = account

    def is_broken(self) -> bool:
        return not self._account.is_active

    def message(self) -> str:
        return f"حساب «{self._account.code} - {self._account.name}» غیرفعال است و قابل استفاده نیست."


class AccountMustBeLeafRule(BusinessRule):
    """فقط حساب‌های برگ (سطح آخر) قابل ثبت در سند هستند"""

    def __init__(self, account: Account) -> None:
        self._account = account

    def is_broken(self) -> bool:
        return not self._account.is_leaf

    def message(self) -> str:
        return (
            f"حساب «{self._account.code} - {self._account.name}» گروهی است "
            f"و نمی‌توان مستقیماً در سند از آن استفاده کرد."
        )


class OnlyDraftEntriesAreEditableRule(BusinessRule):
    def __init__(self, entry: JournalEntry) -> None:
        self._entry = entry

    def is_broken(self) -> bool:
        from ..aggregates.journal_entry import JournalEntryStatus
        return self._entry.status != JournalEntryStatus.DRAFT

    def message(self) -> str:
        return (
            f"فقط اسناد پیش‌نویس قابل ویرایش هستند. "
            f"وضعیت فعلی: {self._entry.status.value}"
        )


def check_rule(rule: BusinessRule) -> None:
    """کمک‌کننده برای بررسی قانون و پرتاب استثنا در صورت شکسته شدن"""
    if rule.is_broken():
        raise ValueError(rule.message())

from __future__ import annotations

from typing import Dict, List, Optional
from uuid import UUID

from application.ports.repositories import (
    AccountRepository,
    JournalEntryRepository,
    UnitOfWork,
)
from domain.accounting.aggregates.journal_entry import JournalEntry, JournalEntryStatus
from domain.accounting.entities.account import Account
from domain.accounting.value_objects.persian_date import PersianDate


class InMemoryAccountRepository(AccountRepository):
    def __init__(self) -> None:
        self._store: Dict[UUID, Account] = {}
        self._by_code: Dict[str, UUID] = {}

    def get_by_id(self, account_id: UUID) -> Optional[Account]:
        return self._store.get(account_id)

    def get_by_code(self, code: str) -> Optional[Account]:
        account_id = self._by_code.get(code)
        if account_id is None:
            return None
        return self._store.get(account_id)

    def list_active(self, only_leaf: bool = False) -> List[Account]:
        result = [a for a in self._store.values() if a.is_active]
        if only_leaf:
            result = [a for a in result if a.is_leaf]
        return result

    def save(self, account: Account) -> None:
        self._store[account.id] = account
        self._by_code[account.code] = account.id

    def exists_by_code(self, code: str) -> bool:
        return code in self._by_code


class InMemoryJournalEntryRepository(JournalEntryRepository):
    def __init__(self) -> None:
        self._store: Dict[UUID, JournalEntry] = {}
        self._by_number: Dict[str, UUID] = {}
        self._counters: Dict[int, int] = {}  # fiscal_year → last number

    def get_by_id(self, entry_id: UUID) -> Optional[JournalEntry]:
        return self._store.get(entry_id)

    def get_by_number(self, entry_number: str) -> Optional[JournalEntry]:
        entry_id = self._by_number.get(entry_number)
        if entry_id is None:
            return None
        return self._store.get(entry_id)

    def save(self, entry: JournalEntry) -> None:
        self._store[entry.id] = entry
        self._by_number[entry.entry_number] = entry.id

    def next_entry_number(self, fiscal_year: int) -> str:
        current = self._counters.get(fiscal_year, 0) + 1
        self._counters[fiscal_year] = current
        return f"JE-{fiscal_year}-{current:04d}"

    def list_by_date_range(
        self,
        from_date: PersianDate,
        to_date: PersianDate,
        status: Optional[JournalEntryStatus] = None,
    ) -> List[JournalEntry]:
        result = []
        for entry in self._store.values():
            if from_date <= entry.entry_date <= to_date:
                if status is None or entry.status == status:
                    result.append(entry)
        return result

    def list_by_status(self, status: JournalEntryStatus) -> List[JournalEntry]:
        return [e for e in self._store.values() if e.status == status]


class InMemoryUnitOfWork(UnitOfWork):
    """Unit of Work ساده در حافظه (برای تست و دمو)"""

    def __init__(self) -> None:
        self.accounts = InMemoryAccountRepository()
        self.journal_entries = InMemoryJournalEntryRepository()
        self._committed = False

    def __enter__(self) -> "InMemoryUnitOfWork":
        self._committed = False
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type is not None:
            self.rollback()
        # در نسخه حافظه‌ای نیازی به commit اجباری نیست

    def commit(self) -> None:
        self._committed = True

    def rollback(self) -> None:
        # در نسخه ساده کاری انجام نمی‌دهیم
        # (در پیاده‌سازی واقعی تغییرات را برمی‌گرداند)
        pass

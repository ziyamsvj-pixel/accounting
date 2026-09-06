from __future__ import annotations

from abc import ABC, abstractmethod
from typing import List, Optional, Protocol
from uuid import UUID

from domain.accounting.aggregates.journal_entry import JournalEntry, JournalEntryStatus
from domain.accounting.entities.account import Account
from domain.accounting.value_objects.persian_date import PersianDate


class AccountRepository(ABC):
    """Port: دسترسی به حساب‌ها"""

    @abstractmethod
    def get_by_id(self, account_id: UUID) -> Optional[Account]:
        ...

    @abstractmethod
    def get_by_code(self, code: str) -> Optional[Account]:
        ...

    @abstractmethod
    def list_active(self, only_leaf: bool = False) -> List[Account]:
        ...

    @abstractmethod
    def save(self, account: Account) -> None:
        ...

    @abstractmethod
    def exists_by_code(self, code: str) -> bool:
        ...


class JournalEntryRepository(ABC):
    """Port: دسترسی به اسناد حسابداری"""

    @abstractmethod
    def get_by_id(self, entry_id: UUID) -> Optional[JournalEntry]:
        ...

    @abstractmethod
    def get_by_number(self, entry_number: str) -> Optional[JournalEntry]:
        ...

    @abstractmethod
    def save(self, entry: JournalEntry) -> None:
        ...

    @abstractmethod
    def next_entry_number(self, fiscal_year: int) -> str:
        """تولید شماره سند بعدی برای سال مالی مشخص"""
        ...

    @abstractmethod
    def list_by_date_range(
        self,
        from_date: PersianDate,
        to_date: PersianDate,
        status: Optional[JournalEntryStatus] = None,
    ) -> List[JournalEntry]:
        ...

    @abstractmethod
    def list_by_status(self, status: JournalEntryStatus) -> List[JournalEntry]:
        ...


class UnitOfWork(ABC):
    """Port: مدیریت تراکنش"""

    accounts: AccountRepository
    journal_entries: JournalEntryRepository

    @abstractmethod
    def __enter__(self) -> "UnitOfWork":
        ...

    @abstractmethod
    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        ...

    @abstractmethod
    def commit(self) -> None:
        ...

    @abstractmethod
    def rollback(self) -> None:
        ...

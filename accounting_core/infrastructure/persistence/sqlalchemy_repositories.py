from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from application.ports.repositories import AccountRepository, JournalEntryRepository
from domain.accounting.aggregates.journal_entry import JournalEntry, JournalEntryStatus
from domain.accounting.entities.account import Account
from domain.accounting.value_objects.persian_date import PersianDate
from infrastructure.persistence.mappers import (
    account_to_domain,
    account_to_model,
    journal_entry_to_domain,
    journal_entry_to_model,
)
from infrastructure.persistence.models import (
    AccountModel,
    EntryNumberSequenceModel,
    JournalEntryModel,
)


class SQLAlchemyAccountRepository(AccountRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_id(self, account_id: UUID) -> Optional[Account]:
        model = self._session.get(AccountModel, account_id)
        return account_to_domain(model) if model else None

    def get_by_code(self, code: str) -> Optional[Account]:
        stmt = select(AccountModel).where(AccountModel.code == code)
        model = self._session.scalar(stmt)
        return account_to_domain(model) if model else None

    def list_active(self, only_leaf: bool = False) -> List[Account]:
        stmt = select(AccountModel).where(AccountModel.is_active.is_(True))
        if only_leaf:
            stmt = stmt.where(AccountModel.is_leaf.is_(True))
        models = self._session.scalars(stmt).all()
        return [account_to_domain(m) for m in models]

    def save(self, account: Account) -> None:
        existing = self._session.get(AccountModel, account.id)
        model = account_to_model(account, existing)
        self._session.add(model)

    def exists_by_code(self, code: str) -> bool:
        stmt = select(AccountModel.id).where(AccountModel.code == code).limit(1)
        return self._session.scalar(stmt) is not None


class SQLAlchemyJournalEntryRepository(JournalEntryRepository):
    def __init__(self, session: Session) -> None:
        self._session = session

    def get_by_id(self, entry_id: UUID) -> Optional[JournalEntry]:
        stmt = (
            select(JournalEntryModel)
            .where(JournalEntryModel.id == entry_id)
            .options(selectinload(JournalEntryModel.lines))
        )
        model = self._session.scalar(stmt)
        return journal_entry_to_domain(model) if model else None

    def get_by_number(self, entry_number: str) -> Optional[JournalEntry]:
        stmt = (
            select(JournalEntryModel)
            .where(JournalEntryModel.entry_number == entry_number)
            .options(selectinload(JournalEntryModel.lines))
        )
        model = self._session.scalar(stmt)
        return journal_entry_to_domain(model) if model else None

    def save(self, entry: JournalEntry) -> None:
        existing = self._session.get(JournalEntryModel, entry.id)
        if existing is not None:
            # برای به‌روزرسانی خطوط، ابتدا بارگذاری با relationship
            self._session.refresh(existing, attribute_names=["lines"])
        model = journal_entry_to_model(entry, existing)
        self._session.add(model)

    def next_entry_number(self, fiscal_year: int) -> str:
        stmt = select(EntryNumberSequenceModel).where(
            EntryNumberSequenceModel.fiscal_year == fiscal_year
        )
        seq = self._session.scalar(stmt)
        if seq is None:
            seq = EntryNumberSequenceModel(fiscal_year=fiscal_year, last_number=0)
            self._session.add(seq)
            self._session.flush()

        seq.last_number += 1
        self._session.flush()
        return f"JE-{fiscal_year}-{seq.last_number:04d}"

    def list_by_date_range(
        self,
        from_date: PersianDate,
        to_date: PersianDate,
        status: Optional[JournalEntryStatus] = None,
    ) -> List[JournalEntry]:
        # مقایسه تقریبی با سال/ماه/روز
        stmt = (
            select(JournalEntryModel)
            .options(selectinload(JournalEntryModel.lines))
            .where(
                (JournalEntryModel.entry_date_year > from_date.year)
                | (
                    (JournalEntryModel.entry_date_year == from_date.year)
                    & (JournalEntryModel.entry_date_month > from_date.month)
                )
                | (
                    (JournalEntryModel.entry_date_year == from_date.year)
                    & (JournalEntryModel.entry_date_month == from_date.month)
                    & (JournalEntryModel.entry_date_day >= from_date.day)
                )
            )
            .where(
                (JournalEntryModel.entry_date_year < to_date.year)
                | (
                    (JournalEntryModel.entry_date_year == to_date.year)
                    & (JournalEntryModel.entry_date_month < to_date.month)
                )
                | (
                    (JournalEntryModel.entry_date_year == to_date.year)
                    & (JournalEntryModel.entry_date_month == to_date.month)
                    & (JournalEntryModel.entry_date_day <= to_date.day)
                )
            )
        )
        if status is not None:
            stmt = stmt.where(JournalEntryModel.status == status.value)

        models = self._session.scalars(stmt).all()
        return [journal_entry_to_domain(m) for m in models]

    def list_by_status(self, status: JournalEntryStatus) -> List[JournalEntry]:
        stmt = (
            select(JournalEntryModel)
            .where(JournalEntryModel.status == status.value)
            .options(selectinload(JournalEntryModel.lines))
        )
        models = self._session.scalars(stmt).all()
        return [journal_entry_to_domain(m) for m in models]

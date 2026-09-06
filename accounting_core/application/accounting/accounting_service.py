from __future__ import annotations

from typing import Optional
from uuid import UUID

from application.dto.journal_dto import (
    CreateJournalEntryCommand,
    JournalEntryDTO,
    PostJournalEntryCommand,
    ReverseJournalEntryCommand,
)
from application.ports.repositories import UnitOfWork
from application.usecases.create_account import AccountDTO, CreateAccountCommand, CreateAccountUseCase
from application.usecases.create_journal_entry import CreateJournalEntryUseCase
from application.usecases.get_journal_entry import GetJournalEntryUseCase
from application.usecases.post_journal_entry import PostJournalEntryUseCase
from application.usecases.reverse_journal_entry import ReverseJournalEntryUseCase
from domain.accounting.value_objects.persian_date import PersianDate


class AccountingService:
    """
    Application Service: نقطه ورود سطح بالاتر برای عملیات حسابداری
    (Facade روی Use Caseها)
    """

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow
        self._create_account = CreateAccountUseCase(uow)
        self._create_journal = CreateJournalEntryUseCase(uow)
        self._post_journal = PostJournalEntryUseCase(uow)
        self._reverse_journal = ReverseJournalEntryUseCase(uow)
        self._get_journal = GetJournalEntryUseCase(uow)

    # ---------- Account ----------
    def create_account(self, command: CreateAccountCommand) -> AccountDTO:
        return self._create_account.execute(command)

    # ---------- Journal Entry ----------
    def create_journal_entry(self, command: CreateJournalEntryCommand) -> JournalEntryDTO:
        return self._create_journal.execute(command)

    def post_journal_entry(self, entry_id: UUID, posted_by: Optional[UUID] = None) -> JournalEntryDTO:
        return self._post_journal.execute(
            PostJournalEntryCommand(entry_id=entry_id, posted_by=posted_by)
        )

    def reverse_journal_entry(
        self,
        entry_id: UUID,
        reverse_date: PersianDate,
        reverse_number: Optional[str] = None,
        created_by: Optional[UUID] = None,
    ) -> JournalEntryDTO:
        return self._reverse_journal.execute(
            ReverseJournalEntryCommand(
                entry_id=entry_id,
                reverse_date=reverse_date,
                reverse_number=reverse_number,
                created_by=created_by,
            )
        )

    def get_journal_entry(self, entry_id: UUID) -> Optional[JournalEntryDTO]:
        return self._get_journal.by_id(entry_id)

    def get_journal_entry_by_number(self, entry_number: str) -> Optional[JournalEntryDTO]:
        return self._get_journal.by_number(entry_number)

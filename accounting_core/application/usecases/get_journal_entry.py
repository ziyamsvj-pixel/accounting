from __future__ import annotations

from typing import Optional
from uuid import UUID

from application.dto.journal_dto import JournalEntryDTO
from application.ports.repositories import UnitOfWork


class GetJournalEntryUseCase:
    """Use Case: خواندن یک سند حسابداری"""

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    def by_id(self, entry_id: UUID) -> Optional[JournalEntryDTO]:
        with self._uow:
            entry = self._uow.journal_entries.get_by_id(entry_id)
            if entry is None:
                return None
            return JournalEntryDTO.from_entity(entry)

    def by_number(self, entry_number: str) -> Optional[JournalEntryDTO]:
        with self._uow:
            entry = self._uow.journal_entries.get_by_number(entry_number)
            if entry is None:
                return None
            return JournalEntryDTO.from_entity(entry)

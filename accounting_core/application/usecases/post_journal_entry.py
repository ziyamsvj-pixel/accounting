from __future__ import annotations

from application.dto.journal_dto import JournalEntryDTO, PostJournalEntryCommand
from application.ports.repositories import UnitOfWork


class PostJournalEntryUseCase:
    """
    Use Case: ثبت قطعی سند حسابداری (Draft → Posted)
    """

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    def execute(self, command: PostJournalEntryCommand) -> JournalEntryDTO:
        with self._uow:
            entry = self._uow.journal_entries.get_by_id(command.entry_id)
            if entry is None:
                raise ValueError(f"سند با شناسه {command.entry_id} یافت نشد")

            # قوانین دامنه داخل Aggregate اعمال می‌شود
            # (بالانس بودن، حداقل دو خط، فقط Draft قابل ثبت)
            entry.post()

            self._uow.journal_entries.save(entry)
            self._uow.commit()

            return JournalEntryDTO.from_entity(entry)

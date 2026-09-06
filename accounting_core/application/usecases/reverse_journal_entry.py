from __future__ import annotations

from application.dto.journal_dto import JournalEntryDTO, ReverseJournalEntryCommand
from application.ports.repositories import UnitOfWork


class ReverseJournalEntryUseCase:
    """
    Use Case: صدور سند برگشت برای یک سند ثبت‌شده
    """

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    def execute(self, command: ReverseJournalEntryCommand) -> JournalEntryDTO:
        with self._uow:
            original = self._uow.journal_entries.get_by_id(command.entry_id)
            if original is None:
                raise ValueError(f"سند با شناسه {command.entry_id} یافت نشد")

            fiscal_year = original.fiscal_year or command.reverse_date.year
            reverse_number = (
                command.reverse_number
                or self._uow.journal_entries.next_entry_number(fiscal_year)
            )

            # متد دامنه خودش سند برگشت را می‌سازد و post می‌کند
            reversed_entry = original.reverse(
                reverse_date=command.reverse_date,
                reverse_number=reverse_number,
                created_by=command.created_by,
            )

            # ذخیره هر دو (اصلی تغییر وضعیت داده + سند برگشت جدید)
            self._uow.journal_entries.save(original)
            self._uow.journal_entries.save(reversed_entry)
            self._uow.commit()

            return JournalEntryDTO.from_entity(reversed_entry)

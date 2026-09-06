from __future__ import annotations

from decimal import Decimal
from typing import Optional
from uuid import UUID

from application.dto.journal_dto import CreateJournalEntryCommand, JournalEntryDTO
from application.ports.repositories import UnitOfWork
from domain.accounting.aggregates.journal_entry import JournalEntry
from domain.accounting.entities.account import Account
from domain.accounting.rules.journal_rules import (
    AccountMustBeActiveRule,
    AccountMustBeLeafRule,
    check_rule,
)
from domain.accounting.value_objects.currency import Currency
from domain.accounting.value_objects.money import Money


class CreateJournalEntryUseCase:
    """
    Use Case: ایجاد سند حسابداری جدید (در وضعیت Draft)
    """

    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    def execute(self, command: CreateJournalEntryCommand) -> JournalEntryDTO:
        with self._uow:
            # ۱. تعیین شماره سند
            fiscal_year = command.fiscal_year or command.entry_date.year
            entry_number = command.entry_number or self._uow.journal_entries.next_entry_number(
                fiscal_year
            )

            # ۲. ایجاد Aggregate
            entry = JournalEntry.create(
                entry_number=entry_number,
                entry_date=command.entry_date,
                description=command.description,
                created_by=command.created_by,
                fiscal_year=fiscal_year,
                reference=command.reference,
                notes=command.notes,
            )

            # ۳. افزودن خطوط + اعتبارسنجی حساب‌ها
            for line_cmd in command.lines:
                account = self._get_and_validate_account(line_cmd.account_id)

                debit = Money(line_cmd.debit_amount, account.currency)
                credit = Money(line_cmd.credit_amount, account.currency)

                foreign_amount = None
                if line_cmd.foreign_amount is not None and line_cmd.foreign_currency_code:
                    # ساده‌سازی: فعلاً فقط ارز اصلی حساب را پشتیبانی می‌کنیم
                    # در نسخه‌های بعدی Currency factory کامل‌تر می‌شود
                    foreign_amount = Money(
                        line_cmd.foreign_amount,
                        account.currency,  # placeholder
                    )

                entry.add_line(
                    account_id=account.id,
                    debit=debit if not debit.is_zero() else None,
                    credit=credit if not credit.is_zero() else None,
                    description=line_cmd.description,
                    foreign_amount=foreign_amount,
                    exchange_rate=line_cmd.exchange_rate,
                    cost_center_id=line_cmd.cost_center_id,
                    detail_id=line_cmd.detail_id,
                )

            # ۴. اعتبارسنجی اولیه (حداقل دو خط)
            if entry.line_count < 2:
                raise ValueError("سند باید حداقل دو خط داشته باشد")

            # ۵. ذخیره
            self._uow.journal_entries.save(entry)
            self._uow.commit()

            return JournalEntryDTO.from_entity(entry)

    def _get_and_validate_account(self, account_id: UUID) -> Account:
        account = self._uow.accounts.get_by_id(account_id)
        if account is None:
            raise ValueError(f"حساب با شناسه {account_id} یافت نشد")

        check_rule(AccountMustBeActiveRule(account))
        check_rule(AccountMustBeLeafRule(account))
        return account

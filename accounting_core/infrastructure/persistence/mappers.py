from __future__ import annotations

from decimal import Decimal
from typing import List
from uuid import UUID

from domain.accounting.aggregates.journal_entry import (
    JournalEntry,
    JournalEntryStatus,
    JournalLine,
)
from domain.accounting.entities.account import Account, AccountNature, AccountType
from domain.accounting.value_objects.currency import Currency, CurrencyCode
from domain.accounting.value_objects.money import Money
from domain.accounting.value_objects.persian_date import PersianDate
from infrastructure.persistence.models import (
    AccountModel,
    JournalEntryModel,
    JournalLineModel,
)


def _currency_from_code(code: str) -> Currency:
    mapping = {
        "IRR": Currency.irr,
        "IRT": Currency.irt,
        "USD": Currency.usd,
        "EUR": Currency.eur,
    }
    factory = mapping.get(code.upper())
    if factory:
        return factory()
    return Currency(CurrencyCode(code.upper()), code.upper(), decimal_places=0)


# ---------- Account ----------
def account_to_domain(model: AccountModel) -> Account:
    return Account(
        id=model.id,
        code=model.code,
        name=model.name,
        account_type=AccountType(model.account_type),
        nature=AccountNature(model.nature),
        parent_id=model.parent_id,
        currency=_currency_from_code(model.currency_code),
        is_active=model.is_active,
        is_leaf=model.is_leaf,
        level=model.level,
        description=model.description or "",
        tax_code=model.tax_code,
    )


def account_to_model(entity: Account, existing: AccountModel | None = None) -> AccountModel:
    if existing is None:
        model = AccountModel(id=entity.id)
    else:
        model = existing

    model.code = entity.code
    model.name = entity.name
    model.account_type = entity.account_type.value
    model.nature = entity.nature.value
    model.parent_id = entity.parent_id
    model.currency_code = entity.currency.code.value
    model.is_active = entity.is_active
    model.is_leaf = entity.is_leaf
    model.level = entity.level
    model.description = entity.description
    model.tax_code = entity.tax_code
    return model


# ---------- Journal Entry ----------
def journal_line_to_domain(model: JournalLineModel) -> JournalLine:
    currency = _currency_from_code(model.currency_code)
    debit = Money(model.debit_amount or Decimal("0"), currency)
    credit = Money(model.credit_amount or Decimal("0"), currency)

    foreign_amount = None
    if model.foreign_amount is not None and model.foreign_currency_code:
        foreign_currency = _currency_from_code(model.foreign_currency_code)
        foreign_amount = Money(model.foreign_amount, foreign_currency)

    return JournalLine(
        id=model.id,
        account_id=model.account_id,
        debit=debit,
        credit=credit,
        description=model.description or "",
        foreign_amount=foreign_amount,
        exchange_rate=model.exchange_rate,
        cost_center_id=model.cost_center_id,
        detail_id=model.detail_id,
    )


def journal_entry_to_domain(model: JournalEntryModel) -> JournalEntry:
    entry_date = PersianDate(
        model.entry_date_year, model.entry_date_month, model.entry_date_day
    )
    lines = [journal_line_to_domain(line) for line in model.lines]

    entry = JournalEntry(
        id=model.id,
        entry_number=model.entry_number,
        entry_date=entry_date,
        description=model.description,
        status=JournalEntryStatus(model.status),
        lines=lines,
        created_at=model.created_at,
        posted_at=model.posted_at,
        created_by=model.created_by,
        fiscal_year=model.fiscal_year,
        reference=model.reference or "",
        notes=model.notes or "",
    )
    return entry


def journal_entry_to_model(
    entity: JournalEntry, existing: JournalEntryModel | None = None
) -> JournalEntryModel:
    if existing is None:
        model = JournalEntryModel(id=entity.id)
    else:
        model = existing
        # حذف خطوط قبلی برای جایگزینی کامل (ساده‌ترین روش consistency)
        model.lines.clear()

    model.entry_number = entity.entry_number
    model.entry_date_year = entity.entry_date.year
    model.entry_date_month = entity.entry_date.month
    model.entry_date_day = entity.entry_date.day
    model.description = entity.description
    model.status = entity.status.value
    model.reference = entity.reference
    model.notes = entity.notes
    model.fiscal_year = entity.fiscal_year
    model.created_by = entity.created_by
    model.created_at = entity.created_at
    model.posted_at = entity.posted_at

    for line in entity.lines:
        line_model = JournalLineModel(
            id=line.id,
            account_id=line.account_id,
            debit_amount=line.debit.amount,
            credit_amount=line.credit.amount,
            currency_code=line.debit.currency.code.value
            if not line.debit.is_zero()
            else line.credit.currency.code.value,
            description=line.description,
            foreign_amount=line.foreign_amount.amount if line.foreign_amount else None,
            foreign_currency_code=(
                line.foreign_amount.currency.code.value if line.foreign_amount else None
            ),
            exchange_rate=line.exchange_rate,
            cost_center_id=line.cost_center_id,
            detail_id=line.detail_id,
        )
        model.lines.append(line_model)

    return model

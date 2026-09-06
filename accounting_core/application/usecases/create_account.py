from __future__ import annotations

from dataclasses import dataclass
from typing import Optional
from uuid import UUID

from application.ports.repositories import UnitOfWork
from domain.accounting.entities.account import Account, AccountNature, AccountType
from domain.accounting.value_objects.currency import Currency, CurrencyCode


@dataclass(frozen=True)
class CreateAccountCommand:
    code: str
    name: str
    account_type: str  # "ASSET", "LIABILITY", ...
    nature: str  # "DEBIT" or "CREDIT"
    parent_id: Optional[UUID] = None
    currency_code: str = "IRR"
    is_leaf: bool = True
    level: int = 1
    description: str = ""
    tax_code: Optional[str] = None


@dataclass(frozen=True)
class AccountDTO:
    id: UUID
    code: str
    name: str
    account_type: str
    nature: str
    parent_id: Optional[UUID]
    currency: str
    is_active: bool
    is_leaf: bool
    level: int
    description: str

    @classmethod
    def from_entity(cls, account: Account) -> "AccountDTO":
        return cls(
            id=account.id,
            code=account.code,
            name=account.name,
            account_type=account.account_type.value,
            nature=account.nature.value,
            parent_id=account.parent_id,
            currency=account.currency.code.value,
            is_active=account.is_active,
            is_leaf=account.is_leaf,
            level=account.level,
            description=account.description,
        )


class CreateAccountUseCase:
    def __init__(self, uow: UnitOfWork) -> None:
        self._uow = uow

    def execute(self, command: CreateAccountCommand) -> AccountDTO:
        with self._uow:
            if self._uow.accounts.exists_by_code(command.code):
                raise ValueError(f"کد حساب «{command.code}» قبلاً استفاده شده است")

            try:
                account_type = AccountType(command.account_type.upper())
                nature = AccountNature(command.nature.upper())
            except ValueError as e:
                raise ValueError(f"نوع یا ماهیت حساب نامعتبر است: {e}") from e

            currency = self._resolve_currency(command.currency_code)

            account = Account.create(
                code=command.code,
                name=command.name,
                account_type=account_type,
                nature=nature,
                parent_id=command.parent_id,
                currency=currency,
                is_leaf=command.is_leaf,
                level=command.level,
                description=command.description,
                tax_code=command.tax_code,
            )

            self._uow.accounts.save(account)
            self._uow.commit()

            return AccountDTO.from_entity(account)

    def _resolve_currency(self, code: str) -> Currency:
        code = code.upper()
        mapping = {
            "IRR": Currency.irr,
            "IRT": Currency.irt,
            "USD": Currency.usd,
            "EUR": Currency.eur,
        }
        factory = mapping.get(code)
        if factory is None:
            # fallback ساده
            return Currency(CurrencyCode(code), code, decimal_places=0)
        return factory()

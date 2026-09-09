from __future__ import annotations
from dataclasses import dataclass
from typing import Any
from domain.shared.value_objects.money import Money

@dataclass(frozen=True, eq=True)
class JournalLine:
    account_code: str
    debit: Money
    credit: Money
    description: Optional[str] = None

    def __post_init__(self):
        if self.debit.amount == 0 and self.credit.amount == 0:
            raise ValueError("خط باید debit یا credit داشته باشد")

    @property
    def amount(self) -> Money:
        if self.debit.amount > 0:
            return self.debit
        return self.credit

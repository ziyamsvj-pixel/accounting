from __future__ import annotations
from dataclasses import dataclass
from decimal import Decimal
from typing import Any
from domain.shared.value_objects.money import Money

@dataclass(frozen=True, eq=True)
class ExchangeRate:
    """Value Object نرخ ارز (پشتیبانی کامل چندارزی)"""
    from_currency: str
    to_currency: str
    rate: Decimal  # مثلاً 1 USD = 42,000 IRR

    def __post_init__(self):
        if self.rate <= 0:
            raise ValueError("نرخ ارز باید مثبت باشد")
        if self.from_currency == self.to_currency:
            raise ValueError("نرخ خودارز باید صفر باشد (در Money استفاده شود)")

    def convert(self, amount: Money, to_currency: str) -> Money:
        if amount.currency != self.from_currency:
            raise ValueError("ارز مبلغ با ارز نرخ مطابقت ندارد")
        if to_currency == amount.currency:
            return amount
        return Money(
            amount=amount.amount * self.rate,
            currency=to_currency
        )

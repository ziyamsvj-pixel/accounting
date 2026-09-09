from __future__ import annotations
from dataclasses import dataclass
from decimal import Decimal
from typing import Any

@dataclass(frozen=True, eq=True)
class Money:
    amount: Decimal
    currency: str = "IRR"

    def __post_init__(self):
        if self.amount < 0:
            raise ValueError("مبلغ نمی‌تواند منفی باشد")

    def __add__(self, other: Money) -> Money:
        if self.currency != other.currency:
            raise ValueError("ارزهای مختلف")
        return Money(amount=self.amount + other.amount, currency=self.currency)

    def __sub__(self, other: Money) -> Money:
        return self.__add__(-other)

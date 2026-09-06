from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Union

from .currency import Currency


@dataclass(frozen=True, slots=True)
class Money:
    """Value Object: مبلغ پولی با ارز مشخص"""

    amount: Decimal
    currency: Currency

    def __post_init__(self) -> None:
        if not isinstance(self.amount, Decimal):
            object.__setattr__(self, "amount", Decimal(str(self.amount)))

        quantize_exp = Decimal("1").scaleb(-self.currency.decimal_places)
        object.__setattr__(
            self,
            "amount",
            self.amount.quantize(quantize_exp, rounding=ROUND_HALF_UP),
        )

    # ---------- Factory methods ----------
    @classmethod
    def zero(cls, currency: Currency | None = None) -> Money:
        return cls(Decimal("0"), currency or Currency.irr())

    @classmethod
    def from_int(cls, amount: int, currency: Currency | None = None) -> Money:
        return cls(Decimal(amount), currency or Currency.irr())

    @classmethod
    def from_str(cls, amount: str, currency: Currency | None = None) -> Money:
        return cls(Decimal(amount), currency or Currency.irr())

    # ---------- Arithmetic ----------
    def __add__(self, other: Money) -> Money:
        self._assert_same_currency(other)
        return Money(self.amount + other.amount, self.currency)

    def __sub__(self, other: Money) -> Money:
        self._assert_same_currency(other)
        return Money(self.amount - other.amount, self.currency)

    def __mul__(self, factor: Union[Decimal, int, float, str]) -> Money:
        return Money(self.amount * Decimal(str(factor)), self.currency)

    def __truediv__(self, divisor: Union[Decimal, int, float, str]) -> Money:
        return Money(self.amount / Decimal(str(divisor)), self.currency)

    def __neg__(self) -> Money:
        return Money(-self.amount, self.currency)

    def __abs__(self) -> Money:
        return Money(abs(self.amount), self.currency)

    # ---------- Comparison ----------
    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Money):
            return NotImplemented
        return self.amount == other.amount and self.currency.code == other.currency.code

    def __lt__(self, other: Money) -> bool:
        self._assert_same_currency(other)
        return self.amount < other.amount

    def __le__(self, other: Money) -> bool:
        self._assert_same_currency(other)
        return self.amount <= other.amount

    def __gt__(self, other: Money) -> bool:
        self._assert_same_currency(other)
        return self.amount > other.amount

    def __ge__(self, other: Money) -> bool:
        self._assert_same_currency(other)
        return self.amount >= other.amount

    # ---------- Helpers ----------
    def is_zero(self) -> bool:
        return self.amount == 0

    def is_positive(self) -> bool:
        return self.amount > 0

    def is_negative(self) -> bool:
        return self.amount < 0

    def _assert_same_currency(self, other: Money) -> None:
        if self.currency.code != other.currency.code:
            raise ValueError(
                f"Cannot operate on different currencies: "
                f"{self.currency.code} vs {other.currency.code}"
            )

    def __str__(self) -> str:
        places = self.currency.decimal_places
        return f"{self.amount:,.{places}f} {self.currency.code.value}"

    def __repr__(self) -> str:
        return f"Money({self.amount}, {self.currency.code.value})"

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from .currency import Currency
from .persian_date import PersianDate


@dataclass(frozen=True, slots=True)
class ExchangeRate:
    """Value Object: نرخ تبدیل ارز"""

    from_currency: Currency
    to_currency: Currency
    rate: Decimal
    date: PersianDate
    source: str = "manual"  # manual | api | central_bank

    def __post_init__(self) -> None:
        if not isinstance(self.rate, Decimal):
            object.__setattr__(self, "rate", Decimal(str(self.rate)))

        if self.rate <= 0:
            raise ValueError("Exchange rate must be positive")
        if self.from_currency.code == self.to_currency.code:
            raise ValueError("From and To currency cannot be the same")

    def convert(self, amount: Decimal) -> Decimal:
        """تبدیل مبلغ از ارز مبدأ به ارز مقصد"""
        return amount * self.rate

    def inverse(self) -> ExchangeRate:
        """نرخ معکوس"""
        return ExchangeRate(
            from_currency=self.to_currency,
            to_currency=self.from_currency,
            rate=(Decimal("1") / self.rate).quantize(Decimal("0.000001")),
            date=self.date,
            source=self.source,
        )

    def __str__(self) -> str:
        return (
            f"1 {self.from_currency.code} = {self.rate} {self.to_currency.code} "
            f"({self.date})"
        )

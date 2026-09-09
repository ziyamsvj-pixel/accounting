from __future__ import annotations
from dataclasses import dataclass
from typing import Any
from domain.shared.value_objects.money import Money
from domain.shared.value_objects.exchange_rate import ExchangeRate

@dataclass(frozen=True)
class CurrencyPolicy:
    """Policy مرکزی برای مدیریت قوانین حسابداری ایران (Moadian + چندارزی)"""
    base_currency: str = "IRR"
    precision: int = 4  # طبق استاندارد مودعی

    def validate_money(self, money: Money) -> None:
        if money.currency != self.base_currency and money.amount == 0:
            raise ValueError("مبلغ صفر برای ارز خارجی مجاز نیست")
        if money.amount < 0:
            raise ValueError("مبلغ نمی‌تواند منفی باشد")

    def convert_to_base(self, money: Money, rate: ExchangeRate) -> Money:
        self.validate_money(money)
        if money.currency == rate.from_currency:
            return rate.convert(money, self.base_currency)
        raise ValueError("نرخ ارز نامعتبر برای تبدیل به ارز پایه")

    def normalize_amount(self, amount: Money) -> Money:
        """قطع کردن اعداد اعشاری طبق استاندارد مودعی"""
        return Money(amount=amount.amount.quantize(Decimal("0." + "0"*self.precision)), currency=amount.currency)

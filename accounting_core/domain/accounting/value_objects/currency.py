from enum import Enum
from dataclasses import dataclass


class CurrencyCode(str, Enum):
    IRR = "IRR"  # ریال ایران
    IRT = "IRT"  # تومان
    USD = "USD"
    EUR = "EUR"
    AED = "AED"
    TRY = "TRY"
    GBP = "GBP"


@dataclass(frozen=True, slots=True)
class Currency:
    """Value Object: ارز"""

    code: CurrencyCode
    name: str
    decimal_places: int = 0
    symbol: str = ""

    def __post_init__(self) -> None:
        if self.decimal_places < 0:
            raise ValueError("decimal_places cannot be negative")

    @classmethod
    def irr(cls) -> "Currency":
        return cls(CurrencyCode.IRR, "ریال ایران", decimal_places=0, symbol="﷼")

    @classmethod
    def irt(cls) -> "Currency":
        return cls(CurrencyCode.IRT, "تومان", decimal_places=0, symbol="تومان")

    @classmethod
    def usd(cls) -> "Currency":
        return cls(CurrencyCode.USD, "دلار آمریکا", decimal_places=2, symbol="$")

    @classmethod
    def eur(cls) -> "Currency":
        return cls(CurrencyCode.EUR, "یورو", decimal_places=2, symbol="€")

    def __str__(self) -> str:
        return self.code.value

    def __repr__(self) -> str:
        return f"Currency({self.code.value})"

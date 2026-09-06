from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from ..value_objects.currency import Currency


class AccountType(str, Enum):
    """نوع حساب طبق استاندارد حسابداری"""

    ASSET = "ASSET"  # دارایی
    LIABILITY = "LIABILITY"  # بدهی
    EQUITY = "EQUITY"  # حقوق صاحبان سهام
    REVENUE = "REVENUE"  # درآمد
    EXPENSE = "EXPENSE"  # هزینه
    CONTRA_ASSET = "CONTRA_ASSET"  # دارایی متقابل (استهلاک انباشته)
    CONTRA_LIABILITY = "CONTRA_LIABILITY"
    CONTRA_EQUITY = "CONTRA_EQUITY"


class AccountNature(str, Enum):
    """ماهیت حساب (بدهکار یا بستانکار)"""

    DEBIT = "DEBIT"
    CREDIT = "CREDIT"


@dataclass
class Account:
    """
    Entity: حساب کل / معین / تفصیلی
    """

    id: UUID
    code: str  # کد حساب (مثلاً 1101 یا 1-1-01)
    name: str
    account_type: AccountType
    nature: AccountNature
    parent_id: Optional[UUID] = None
    currency: Currency = field(default_factory=Currency.irr)
    is_active: bool = True
    is_leaf: bool = True  # فقط حساب‌های برگ قابل ثبت سند هستند
    level: int = 1  # سطح در درخت حساب‌ها
    description: str = ""
    tax_code: Optional[str] = None  # کد مالیاتی در صورت نیاز

    def __post_init__(self) -> None:
        if not self.code or not self.code.strip():
            raise ValueError("Account code cannot be empty")
        if not self.name or not self.name.strip():
            raise ValueError("Account name cannot be empty")
        object.__setattr__(self, "code", self.code.strip())
        object.__setattr__(self, "name", self.name.strip())

    @classmethod
    def create(
        cls,
        code: str,
        name: str,
        account_type: AccountType,
        nature: AccountNature,
        parent_id: Optional[UUID] = None,
        currency: Optional[Currency] = None,
        is_leaf: bool = True,
        level: int = 1,
        description: str = "",
        tax_code: Optional[str] = None,
    ) -> Account:
        return cls(
            id=uuid4(),
            code=code,
            name=name,
            account_type=account_type,
            nature=nature,
            parent_id=parent_id,
            currency=currency or Currency.irr(),
            is_leaf=is_leaf,
            level=level,
            description=description,
            tax_code=tax_code,
        )

    def deactivate(self) -> None:
        if not self.is_active:
            raise ValueError("Account is already inactive")
        self.is_active = False

    def activate(self) -> None:
        if self.is_active:
            raise ValueError("Account is already active")
        self.is_active = True

    def rename(self, new_name: str) -> None:
        if not new_name or not new_name.strip():
            raise ValueError("New name cannot be empty")
        self.name = new_name.strip()

    def change_parent(self, new_parent_id: Optional[UUID], new_level: int) -> None:
        self.parent_id = new_parent_id
        self.level = new_level

    def mark_as_group(self) -> None:
        """تبدیل به حساب گروهی (غیرقابل ثبت سند مستقیم)"""
        self.is_leaf = False

    def mark_as_leaf(self) -> None:
        self.is_leaf = True

    def __str__(self) -> str:
        return f"{self.code} - {self.name}"

    def __repr__(self) -> str:
        return f"Account(code={self.code!r}, name={self.name!r}, type={self.account_type.value})"

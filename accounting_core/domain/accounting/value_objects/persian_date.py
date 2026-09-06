from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Optional


@dataclass(frozen=True, slots=True)
class PersianDate:
    """
    Value Object: تاریخ شمسی (جلالی)
    
    برای تبدیل دقیق به میلادی در محیط production از کتابخانه jdatetime استفاده کنید:
        pip install jdatetime
    """

    year: int
    month: int
    day: int

    def __post_init__(self) -> None:
        if not (1300 <= self.year <= 1500):
            raise ValueError(f"Year {self.year} is out of reasonable range (1300-1500)")
        if not (1 <= self.month <= 12):
            raise ValueError(f"Month must be between 1 and 12, got {self.month}")
        if not (1 <= self.day <= 31):
            raise ValueError(f"Day must be between 1 and 31, got {self.day}")

        # اعتبارسنجی روز بر اساس ماه (تقریبی بدون jdatetime)
        max_days = 31 if self.month <= 6 else 30
        if self.month == 12:
            max_days = 29  # تقریبی؛ سال کبیسه را jdatetime دقیق‌تر چک می‌کند
        if self.day > max_days:
            raise ValueError(f"Day {self.day} is invalid for month {self.month}")

    @classmethod
    def today(cls) -> PersianDate:
        """تاریخ امروز شمسی (تقریبی بدون jdatetime)"""
        # در production از jdatetime.date.today() استفاده کنید
        from datetime import date as greg_date
        # تبدیل تقریبی ساده (برای تست)
        # بهتر است همیشه jdatetime نصب باشد
        try:
            import jdatetime
            today = jdatetime.date.today()
            return cls(today.year, today.month, today.day)
        except ImportError:
            # fallback تقریبی
            g = greg_date.today()
            # الگوریتم تقریبی (نه دقیق)
            py = g.year - 621
            return cls(py, g.month, g.day)

    @classmethod
    def from_string(cls, value: str) -> PersianDate:
        """از رشته yyyy/mm/dd یا yyyy-mm-dd"""
        value = value.replace("-", "/").strip()
        parts = value.split("/")
        if len(parts) != 3:
            raise ValueError(f"Invalid date format: {value}. Expected yyyy/mm/dd")
        return cls(int(parts[0]), int(parts[1]), int(parts[2]))

    def to_string(self, separator: str = "/") -> str:
        return f"{self.year:04d}{separator}{self.month:02d}{separator}{self.day:02d}"

    def __str__(self) -> str:
        return self.to_string()

    def __repr__(self) -> str:
        return f"PersianDate({self.year}, {self.month}, {self.day})"

    def __lt__(self, other: PersianDate) -> bool:
        return (self.year, self.month, self.day) < (other.year, other.month, other.day)

    def __le__(self, other: PersianDate) -> bool:
        return (self.year, self.month, self.day) <= (other.year, other.month, other.day)

    def __gt__(self, other: PersianDate) -> bool:
        return (self.year, self.month, self.day) > (other.year, other.month, other.day)

    def __ge__(self, other: PersianDate) -> bool:
        return (self.year, self.month, self.day) >= (other.year, other.month, other.day)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, PersianDate):
            return NotImplemented
        return (self.year, self.month, self.day) == (other.year, other.month, other.day)

    def __hash__(self) -> int:
        return hash((self.year, self.month, self.day))

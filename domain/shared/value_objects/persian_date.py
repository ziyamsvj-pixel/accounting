from __future__ import annotations
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional
from jdatetime import date as JDate

@dataclass(frozen=True, eq=True)
class PersianDate:
    year: int
    month: int
    day: int

    def __post_init__(self):
        if not (1 <= self.month <= 12 and 1 <= self.day <= 31):
            raise ValueError("تاریخ شمسی نامعتبر است")

    @classmethod
    def today(cls) -> PersianDate:
        return cls.from_date(JDate.today())

    @classmethod
    def from_date(cls, jdate: JDate) -> PersianDate:
        return cls(year=jdate.year, month=jdate.month, day=jdate.day)

    def to_jdate(self) -> JDate:
        return JDate(self.year, self.month, self.day)

    def to_gregorian(self) -> datetime:
        j = self.to_jdate()
        return datetime(j.year, j.month, j.day)

    def __str__(self) -> str:
        return f"{self.year:04d}/{self.month:02d}/{self.day:02d}"

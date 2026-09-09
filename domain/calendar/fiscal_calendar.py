from __future__ import annotations
from datetime import datetime, date
from enum import Enum
from dataclasses import dataclass
from typing import Optional, List
from jdatetime import date as JDate  # استاندارد ایرانی برای AC-001
from domain.shared.value_objects import PersianDate

class FiscalPeriodType(Enum):
    OPENING = "opening"
    NORMAL = "normal"
    CLOSING = "closing"

@dataclass(frozen=True)
class FiscalPeriod:
    year: int
    start: JDate
    end: JDate
    period_type: FiscalPeriodType
    is_closed: bool = False

class FiscalCalendar:
    """کلاس مرکزی تقویم مالی شمسی AC-001 (جلدنامه حسابداری ایران)"""
    _instance: Optional[FiscalCalendar] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def today(self) -> PersianDate:
        """تاریخ امروز شمسی (AC-001)"""
        return PersianDate.from_date(JDate.today())

    def from_date(self, date_obj: date) -> PersianDate:
        """تبدیل تاریخ میلادی به شمسی"""
        return PersianDate.from_date(JDate(date_obj.year, date_obj.month, date_obj.day))

    def to_gregorian(self, persian_date: PersianDate) -> datetime:
        """تبدیل شمسی به میلادی (deterministic)"""
        jdate = persian_date.to_jdate()
        return datetime(jdate.year, jdate.month, jdate.day)

    def get_current_fiscal_year(self) -> int:
        """سال مالی جاری (سال شمسی)"""
        return self.today().year

    def create_fiscal_period(self, year: int, period_type: FiscalPeriodType = FiscalPeriodType.NORMAL) -> FiscalPeriod:
        """ایجاد دوره مالی (سال مالی)"""
        start = JDate(year, 1, 1)
        end = JDate(year, 12, 30) if JDate(year, 12, 29).month != 12 else JDate(year, 12, 29)
        return FiscalPeriod(year=year, start=start, end=end, period_type=period_type)

    def get_fiscal_period(self, year: int) -> FiscalPeriod:
        """دوره مالی خاص"""
        return self.create_fiscal_period(year)

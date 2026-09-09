from __future__ import annotations
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from domain.calendar.fiscal_calendar import FiscalCalendar
from domain.calendar.fiscal_period import FiscalPeriod

class FiscalRepository:
    """Repository برای Fiscal Calendar (AC-001)"""
    def __init__(self, session: AsyncSession):
        self.session = session
        self.fiscal = FiscalCalendar()

    async def get_current_fiscal_year(self) -> int:
        return self.fiscal.get_current_fiscal_year()

    async def get_fiscal_period(self, year: int) -> FiscalPeriod:
        return self.fiscal.get_fiscal_period(year)

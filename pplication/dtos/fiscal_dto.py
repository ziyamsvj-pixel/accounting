from __future__ import annotations
from pydantic import BaseModel
from datetime import date

class FiscalPeriodResponse(BaseModel):
    year: int
    start: date
    end: date
    period_type: str
    is_closed: bool

    class Config:
        from_attributes = True

from __future__ import annotations
from typing import List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from domain.shared.events.audit_events import AuditTrailEvent

class AuditRepository:
    """Repository برای Audit Trail (Immutable + Audit)"""
    def __init__(self, session: AsyncSession):
        self.session = session

    async def save_event(self, event: AuditTrailEvent) -> None:
        # در فازهای بعدی با SQLAlchemy Audit table ذخیره می‌شود
        pass  # placeholder

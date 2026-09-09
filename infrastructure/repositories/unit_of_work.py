from __future__ import annotations
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from infrastructure.repositories.journal_repository import JournalRepository

class UnitOfWork:
    """Unit of Work Pattern - هماهنگی تغییرات (Transaction Safety)"""
    def __init__(self, session: AsyncSession):
        self.session = session
        self.journal_repo = JournalRepository(session)

    async def commit(self) -> None:
        """Commit تراکنش"""
        await self.session.commit()

    async def rollback(self) -> None:
        """Rollback تراکنش"""
        await self.session.rollback()

    async def __aenter__(self) -> UnitOfWork:
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type:
            await self.rollback()
        else:
            await self.commit()

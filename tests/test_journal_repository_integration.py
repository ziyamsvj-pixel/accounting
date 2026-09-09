import pytest
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from domain.accounting.aggregates.journal_entry import JournalEntry
from domain.accounting.services.journal_service import JournalService
from domain.tenant.tenant_context import TenantContext
from infrastructure.repositories.unit_of_work import UnitOfWork
from infrastructure.repositories.journal_repository import JournalRepository

@pytest.mark.asyncio
async def test_full_integration_journal_post_with_persian_fiscal_calendar():
    # Arrange
    DATABASE_URL = "postgresql+asyncpg://user:pass@localhost:5432/accounting_core_test"
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    TenantContext.set_current("test-tenant-123")
    service = JournalService()

    lines = [
        {"account_code": "101", "debit": 100000, "credit": 0, "description": "دبی"},
        {"account_code": "201", "debit": 0, "credit": 100000, "description": "کری"},
    ]
    entry = service.create_journal_entry("J001", lines)

    # PersianDate Fiscal Calendar تست (AC-001)
    from domain.calendar.fiscal_calendar import FiscalCalendar
    fiscal = FiscalCalendar()
    today = fiscal.today()
    assert today.year >= 1400

    # Act - با Unit of Work
    async with UnitOfWork(async_session()) as uow:
        repo = uow.journal_repo
        await repo.save(entry)  # placeholder در فاز بعدی واقعی SQLAlchemy

    # Assert
    assert entry.posted_at is not None
    assert entry.lines[0].debit.amount == 100000

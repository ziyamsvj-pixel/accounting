import pytest
from decimal import Decimal
from domain.accounting.services.journal_service import JournalService
from domain.accounting.aggregates.journal_entry import JournalEntry
from domain.shared.value_objects.money import Money
from domain.tenant.tenant_context import TenantContext

@pytest.mark.asyncio
async def test_create_journal_entry_with_double_entry():
    # Arrange
    TenantContext.set_current("test-tenant")
    service = JournalService()

    lines = [
        {"account_code": "101", "debit": 100000, "credit": 0, "description": "دبی"},
        {"account_code": "201", "debit": 0, "credit": 100000, "description": "کری"},
    ]

    # Act
    entry = service.create_journal_entry("J001", lines)

    # Assert
    assert len(entry.lines) == 2
    assert entry.lines[0].debit.amount == Decimal("100000")
    assert entry.lines[1].credit.amount == Decimal("100000")

@pytest.mark.asyncio
async def test_post_journal_entry_and_get_event():
    # Arrange
    TenantContext.set_current("test-tenant")
    service = JournalService()
    lines = [{"account_code": "101", "debit": 100000, "credit": 0}]
    entry = service.create_journal_entry("J001", lines)

    # Act
    event = service.post_journal_entry(entry, "user123")

    # Assert
    assert event.posted_by == "user123"
    assert entry.posted_at is not None

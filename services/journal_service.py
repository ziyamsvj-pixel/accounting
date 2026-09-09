from __future__ import annotations
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from domain.accounting.services.journal_service import JournalService as DomainJournalService
from domain.accounting.aggregates.journal_entry import JournalEntry
from domain.shared.value_objects.money import Money
from domain.shared.value_objects.currency_policy import CurrencyPolicy
from application.dtos.journal_dto import JournalEntryCreate, JournalEntryResponse, JournalPostedEventResponse
from domain.tenant.tenant_context import TenantContext

class JournalApplicationService:
    """Application Service Layer - هماهنگی Domain با Infrastructure"""
    def __init__(self):
        self.domain_service = DomainJournalService()

    async def create_journal_entry(self, dto: JournalEntryCreate) -> JournalEntryResponse:
        """ایجاد Jورنال از DTO (قبل از پست)"""
        tenant = TenantContext.get_current()
        if not tenant:
            raise ValueError("TenantContext تنظیم نشده است")

        # تبدیل DTO به domain lines
        lines = []
        for line in dto.lines:
            lines.append(
                line.__class__(
                    account_code=line.account_code,
                    debit=Money(amount=decimal.Decimal(str(line.debit)), currency="IRR"),
                    credit=Money(amount=decimal.Decimal(str(line.credit)), currency="IRR"),
                    description=line.description
                )
            )

        entry = self.domain_service.create_journal_entry(
            journal_id=dto.journal_id,
            lines=lines,
            description=dto.description
        )
        return JournalEntryResponse.model_validate(entry)

    async def post_journal_entry(self, entry_id: UUID, posted_by: str) -> JournalPostedEventResponse:
        """پست کردن Jورنال"""
        tenant = TenantContext.get_current()
        if not tenant:
            raise ValueError("TenantContext تنظیم نشده است")

        # در فازهای بعدی: از repository با UnitOfWork استفاده کنید
        # اینجا placeholder برای integration
        event = self.domain_service.post_journal_entry(entry, posted_by)  # entry از قبل ایجاد شده
        return JournalPostedEventResponse(
            entry_id=event.entry_id,
            posted_at=event.posted_at,
            posted_by=event.posted_by
        )

    async def convert_to_base(self, entry_id: UUID, rate: decimal.Decimal) -> JournalEntryResponse:
        """تبدیل به ارز پایه قبل از پست"""
        # placeholder برای rate object
        return None

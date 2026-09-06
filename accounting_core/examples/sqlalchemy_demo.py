"""
دمو کامل با SQLAlchemy + SQLite
"""

from decimal import Decimal
from uuid import uuid4

from application.dto.journal_dto import CreateJournalEntryCommand, JournalLineCommand
from application.accounting.accounting_service import AccountingService
from application.usecases.create_account import CreateAccountCommand
from domain.accounting.value_objects.persian_date import PersianDate
from infrastructure.persistence.database import init_db, get_database_url
from infrastructure.persistence.sqlalchemy_unit_of_work import SQLAlchemyUnitOfWork


def main() -> None:
    print("=" * 60)
    print("  دمو SQLAlchemy Infrastructure (SQLite)")
    print("=" * 60)
    print(f"Database URL: {get_database_url()}")

    # ایجاد جداول
    init_db(echo=False)
    print("✓ جداول ایجاد شدند\n")

    uow = SQLAlchemyUnitOfWork()
    service = AccountingService(uow)

    # ---------- ایجاد حساب‌ها ----------
    print("[1] ایجاد حساب‌ها...")
    cash = service.create_account(
        CreateAccountCommand(
            code="1101",
            name="صندوق",
            account_type="ASSET",
            nature="DEBIT",
        )
    )
    capital = service.create_account(
        CreateAccountCommand(
            code="3101",
            name="سرمایه",
            account_type="EQUITY",
            nature="CREDIT",
        )
    )
    print(f"  ✓ {cash.code} - {cash.name}")
    print(f"  ✓ {capital.code} - {capital.name}")

    # ---------- ایجاد و ثبت سند ----------
    print("\n[2] ایجاد سند آورده سرمایه...")
    entry = service.create_journal_entry(
        CreateJournalEntryCommand(
            entry_date=PersianDate(1404, 5, 21),
            description="آورده نقدی سرمایه — تست SQLAlchemy",
            created_by=uuid4(),
            lines=[
                JournalLineCommand(
                    account_id=cash.id,
                    debit_amount=Decimal("2500000000"),
                    description="دریافت وجه",
                ),
                JournalLineCommand(
                    account_id=capital.id,
                    credit_amount=Decimal("2500000000"),
                    description="آورده سرمایه",
                ),
            ],
        )
    )
    print(f"  ✓ سند {entry.entry_number} ایجاد شد (وضعیت: {entry.status})")

    print("\n[3] ثبت قطعی...")
    posted = service.post_journal_entry(entry.id)
    print(f"  ✓ وضعیت: {posted.status}")
    print(f"    زمان ثبت: {posted.posted_at}")

    # ---------- خواندن مجدد از دیتابیس ----------
    print("\n[4] خواندن مجدد از دیتابیس...")
    loaded = service.get_journal_entry(posted.id)
    if loaded:
        print(f"  ✓ {loaded.entry_number} | {loaded.description}")
        print(f"    وضعیت: {loaded.status} | بالانس: {loaded.is_balanced}")
        for line in loaded.lines:
            side = "بدهکار" if line.is_debit else "بستانکار"
            amt = line.debit if line.is_debit else line.credit
            print(f"      • {side}: {amt}")

    print("\n" + "=" * 60)
    print("  دمو SQLAlchemy با موفقیت تمام شد.")
    print("  فایل دیتابیس در مسیر DATABASE_URL")
    print("=" * 60)


if __name__ == "__main__":
    main()

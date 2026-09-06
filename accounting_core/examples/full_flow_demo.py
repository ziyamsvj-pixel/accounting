"""
دمو کامل جریان کار حسابداری با Application Layer + InMemory Infrastructure
"""

from decimal import Decimal
from uuid import uuid4

from application.dto.journal_dto import CreateJournalEntryCommand, JournalLineCommand
from application.accounting.accounting_service import AccountingService
from application.usecases.create_account import CreateAccountCommand
from domain.accounting.value_objects.persian_date import PersianDate
from infrastructure.persistence.in_memory import InMemoryUnitOfWork


def main() -> None:
    print("=" * 60)
    print("  دمو کامل Accounting Core — Stage 1 + Stage 2")
    print("=" * 60)

    # راه‌اندازی Unit of Work و سرویس
    uow = InMemoryUnitOfWork()
    service = AccountingService(uow)

    # ---------- ۱. ایجاد حساب‌ها ----------
    print("\n[1] ایجاد حساب‌ها...")

    cash = service.create_account(
        CreateAccountCommand(
            code="1101",
            name="صندوق",
            account_type="ASSET",
            nature="DEBIT",
            level=2,
        )
    )
    print(f"  ✓ {cash.code} - {cash.name} (id={cash.id})")

    capital = service.create_account(
        CreateAccountCommand(
            code="3101",
            name="سرمایه",
            account_type="EQUITY",
            nature="CREDIT",
            level=2,
        )
    )
    print(f"  ✓ {capital.code} - {capital.name} (id={capital.id})")

    bank = service.create_account(
        CreateAccountCommand(
            code="1102",
            name="بانک ملت",
            account_type="ASSET",
            nature="DEBIT",
            level=2,
        )
    )
    print(f"  ✓ {bank.code} - {bank.name} (id={bank.id})")

    # ---------- ۲. ایجاد سند آورده سرمایه ----------
    print("\n[2] ایجاد سند آورده نقدی سرمایه...")

    entry1 = service.create_journal_entry(
        CreateJournalEntryCommand(
            entry_date=PersianDate(1404, 5, 21),
            description="آورده نقدی سرمایه اولیه",
            reference="CONTRACT-001",
            created_by=uuid4(),
            lines=[
                JournalLineCommand(
                    account_id=cash.id,
                    debit_amount=Decimal("1000000000"),  # ۱ میلیارد ریال
                    description="دریافت وجه نقد",
                ),
                JournalLineCommand(
                    account_id=capital.id,
                    credit_amount=Decimal("1000000000"),
                    description="آورده سرمایه",
                ),
            ],
        )
    )
    print(f"  ✓ سند ایجاد شد: {entry1.entry_number}")
    print(f"    وضعیت: {entry1.status}")
    print(f"    جمع بدهکار/بستانکار: {entry1.total_debit} / {entry1.total_credit}")
    print(f"    بالانس؟ {entry1.is_balanced}")

    # ---------- ۳. ثبت قطعی سند ----------
    print("\n[3] ثبت قطعی سند...")
    posted = service.post_journal_entry(entry1.id)
    print(f"  ✓ وضعیت جدید: {posted.status}")
    print(f"    زمان ثبت: {posted.posted_at}")

    # ---------- ۴. سند انتقال وجه به بانک ----------
    print("\n[4] ایجاد و ثبت سند انتقال به بانک...")

    entry2 = service.create_journal_entry(
        CreateJournalEntryCommand(
            entry_date=PersianDate(1404, 5, 22),
            description="واریز بخشی از موجودی صندوق به بانک",
            lines=[
                JournalLineCommand(
                    account_id=bank.id,
                    debit_amount=Decimal("700000000"),
                    description="واریز به حساب بانک",
                ),
                JournalLineCommand(
                    account_id=cash.id,
                    credit_amount=Decimal("700000000"),
                    description="برداشت از صندوق",
                ),
            ],
        )
    )
    posted2 = service.post_journal_entry(entry2.id)
    print(f"  ✓ سند {posted2.entry_number} ثبت شد")

    # ---------- ۵. برگشت سند دوم ----------
    print("\n[5] صدور سند برگشت برای سند انتقال...")
    reversed_entry = service.reverse_journal_entry(
        entry_id=posted2.id,
        reverse_date=PersianDate(1404, 5, 23),
    )
    print(f"  ✓ سند برگشت: {reversed_entry.entry_number}")
    print(f"    وضعیت سند برگشت: {reversed_entry.status}")

    # ---------- ۶. خواندن مجدد ----------
    print("\n[6] خواندن سند اول...")
    loaded = service.get_journal_entry(entry1.id)
    if loaded:
        print(f"  ✓ {loaded.entry_number} | {loaded.description}")
        print(f"    وضعیت: {loaded.status} | خطوط: {len(loaded.lines)}")
        for line in loaded.lines:
            side = "بدهکار" if line.is_debit else "بستانکار"
            amount = line.debit if line.is_debit else line.credit
            print(f"      - {side}: {amount} | {line.description}")

    print("\n" + "=" * 60)
    print("  دمو با موفقیت به پایان رسید.")
    print("=" * 60)


if __name__ == "__main__":
    main()

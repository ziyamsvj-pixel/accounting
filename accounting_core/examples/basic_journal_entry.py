"""
مثال ساده استفاده از Domain Layer حسابداری
"""

from decimal import Decimal
from uuid import uuid4

from domain.accounting import (
    Account,
    AccountType,
    AccountNature,
    Currency,
    Money,
    PersianDate,
    JournalEntry,
)


def main() -> None:
    # ایجاد دو حساب نمونه
    cash_account = Account.create(
        code="1101",
        name="صندوق",
        account_type=AccountType.ASSET,
        nature=AccountNature.DEBIT,
    )

    capital_account = Account.create(
        code="3101",
        name="سرمایه",
        account_type=AccountType.EQUITY,
        nature=AccountNature.CREDIT,
    )

    print("حساب‌ها:")
    print(f"  {cash_account}")
    print(f"  {capital_account}")
    print()

    # ایجاد سند حسابداری
    entry = JournalEntry.create(
        entry_number="JE-1404-0001",
        entry_date=PersianDate(1404, 5, 21),
        description="آورده نقدی سرمایه",
        created_by=uuid4(),
    )

    # افزودن خطوط
    amount = Money.from_str("500000000", Currency.irr())  # ۵۰۰ میلیون ریال

    entry.add_line(
        account_id=cash_account.id,
        debit=amount,
        description="دریافت وجه نقد",
    )
    entry.add_line(
        account_id=capital_account.id,
        credit=amount,
        description="آورده سرمایه",
    )

    print(f"سند قبل از ثبت: {entry}")
    print(f"  بالانس؟ {entry.is_balanced}")
    print(f"  جمع بدهکار: {entry.total_debit}")
    print(f"  جمع بستانکار: {entry.total_credit}")
    print()

    # ثبت قطعی
    entry.post()
    print(f"سند بعد از ثبت: {entry}")
    print(f"  وضعیت: {entry.status.value}")
    print(f"  زمان ثبت: {entry.posted_at}")


if __name__ == "__main__":
    main()

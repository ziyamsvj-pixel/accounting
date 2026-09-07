import os
import unittest
from datetime import date
from decimal import Decimal

from application.services import JournalService, ChartOfAccountsService, TrialBalanceService
from domain.entities import Account, AccountType, DomainError, JournalEntry, JournalLine
from domain.value_objects.currency import Currency
from infrastructure.repositories import (
    SchemaBuilder,
    SqliteAccountRepository,
    SqliteAuditLog,
    SqliteJournalRepository,
)


TEST_DB = "regression_test.db"


class TestAccountingRegressions(unittest.TestCase):
    def setUp(self):
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)
        SchemaBuilder.create_all(TEST_DB)
        self.accounts = SqliteAccountRepository(TEST_DB)
        self.journals = SqliteJournalRepository(TEST_DB)
        self.audit = SqliteAuditLog(TEST_DB)
        self.coa = ChartOfAccountsService(self.accounts)
        self.service = JournalService(self.journals, self.accounts, self.audit)
        self.coa.add_account(Account("1-101", "صندوق", AccountType.ASSET))
        self.coa.add_account(Account("4-401", "فروش", AccountType.REVENUE))

    def tearDown(self):
        if os.path.exists(TEST_DB):
            os.remove(TEST_DB)

    def test_foreign_currency_requires_conversion_service(self):
        entry = JournalEntry(
            entry_date=date(2026, 8, 10),
            lines=[
                JournalLine("1-101", debit=Decimal("100"), currency=Currency.USD),
                JournalLine("4-401", credit=Decimal("100"), currency=Currency.IRR),
            ],
        )
        with self.assertRaises(DomainError):
            self.service.create_and_post(entry, user="test")

    def test_trial_balance_uses_base_amounts(self):
        entry = JournalEntry(
            entry_date=date(2026, 8, 10),
            fiscal_year="",
            base_currency=Currency.USD,
            lines=[
                JournalLine("1-101", debit=Decimal("100"), currency=Currency.USD,
                            amount_in_base=Decimal("58000000")),
                JournalLine("4-401", credit=Decimal("58000000"), currency=Currency.USD,
                            amount_in_base=Decimal("58000000")),
            ],
        )
        self.service.create_and_post(entry, user="test")
        balance = TrialBalanceService(self.journals, self.accounts).compute("")
        self.assertEqual(balance["total_debit"], Decimal("58000000"))
        self.assertEqual(balance["total_credit"], Decimal("58000000"))

    def test_base_currency_survives_round_trip(self):
        entry = JournalEntry(
            entry_date=date(2026, 8, 10),
            base_currency=Currency.USD,
            lines=[
                JournalLine("1-101", debit=Decimal("100"), currency=Currency.USD),
                JournalLine("4-401", credit=Decimal("100"), currency=Currency.USD),
            ],
        )
        self.service.create_and_post(entry, user="test")
        loaded = self.journals.get(entry.id)
        self.assertEqual(loaded.base_currency, Currency.USD)


if __name__ == "__main__":
    unittest.main()

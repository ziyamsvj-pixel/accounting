import unittest
from datetime import date

from domain.value_objects.persian_date import PersianDate


class PersianDateTests(unittest.TestCase):
    def test_first_day_of_year_1404(self):
        self.assertEqual(PersianDate(1404, 1, 1).to_gregorian(), date(2025, 3, 21))

    def test_last_day_of_first_six_months(self):
        self.assertEqual(PersianDate(1404, 6, 31).to_gregorian(), date(2025, 9, 22))

    def test_last_day_of_month_11(self):
        self.assertEqual(PersianDate(1404, 11, 30).to_gregorian(), date(2026, 2, 19))

    def test_round_trip(self):
        samples = [
            PersianDate(1400, 1, 1),
            PersianDate(1401, 12, 29),
            PersianDate(1402, 7, 15),
            PersianDate(1403, 12, 30),
            PersianDate(1404, 1, 1),
        ]
        for value in samples:
            with self.subTest(value=value):
                self.assertEqual(PersianDate.from_gregorian(value.to_gregorian()), value)

    def test_invalid_month(self):
        with self.assertRaises(ValueError):
            PersianDate(1404, 13, 1)

    def test_invalid_day(self):
        with self.assertRaises(ValueError):
            PersianDate(1404, 1, 32)


if __name__ == "__main__":
    unittest.main()

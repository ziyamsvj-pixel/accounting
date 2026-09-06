# Accounting Core — Clean Architecture

## مراحل تکمیل‌شده

| مرحله | لایه | وضعیت |
|-------|------|--------|
| Stage 1 | Domain | ✅ |
| Stage 2 | Application + InMemory | ✅ |
| Stage 3 | Infrastructure (SQLAlchemy + SQLite/PostgreSQL) | ✅ |
| Stage 4 | API / Presentation | ⏳ |

## ساختار

```
accounting_core/
├── domain/accounting/          # Domain Layer (خالص)
├── application/                # Use Cases, Ports, DTOs, Services
├── infrastructure/
│   └── persistence/
│       ├── database.py         # Engine & Session
│       ├── models.py           # ORM Models (جدا از Domain)
│       ├── mappers.py          # Domain ↔ ORM
│       ├── sqlalchemy_repositories.py
│       ├── sqlalchemy_unit_of_work.py
│       └── in_memory.py        # برای تست سریع
├── alembic/                    # Migrations
├── examples/
│   ├── full_flow_demo.py       # InMemory
│   └── sqlalchemy_demo.py      # SQLAlchemy + SQLite
├── alembic.ini
└── requirements.txt
```

## اجرای دمو SQLAlchemy

```bash
cd accounting_core
pip install -r requirements.txt

# پیش‌فرض از SQLite در /tmp استفاده می‌کند
PYTHONPATH=. python examples/sqlalchemy_demo.py

# یا با PostgreSQL:
# export DATABASE_URL="postgresql+psycopg2://user:pass@localhost:5432/accounting"
# PYTHONPATH=. python examples/sqlalchemy_demo.py
```

## Alembic

```bash
# ایجاد مایگریشن اولیه (بعد از تنظیم DATABASE_URL)
alembic revision --autogenerate -m "initial"
alembic upgrade head
```

## نکات معماری

- **Domain کاملاً مستقل** از SQLAlchemy است.
- **Mapper** وظیفه تبدیل Domain ↔ ORM را دارد.
- **UnitOfWork** تراکنش را مدیریت می‌کند.
- پشتیبانی همزمان از **SQLite** (دمو/تست) و **PostgreSQL** (production).

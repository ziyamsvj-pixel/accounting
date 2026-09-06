from __future__ import annotations

import os
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


class Base(DeclarativeBase):
    """پایه تمام مدل‌های ORM"""
    pass


def get_database_url() -> str:
    """
    اولویت:
    1. متغیر محیطی DATABASE_URL
    2. SQLite محلی (برای دمو و تست)
    """
    url = os.getenv("DATABASE_URL")
    if url:
        return url
    # پیش‌فرض: SQLite در پوشه پروژه
    return "sqlite:////tmp/accounting_core.db"


def create_db_engine(echo: bool = False) -> Engine:
    url = get_database_url()
    connect_args = {}
    if url.startswith("sqlite"):
        connect_args["check_same_thread"] = False

    engine = create_engine(url, echo=echo, future=True, connect_args=connect_args)

    # فعال‌سازی Foreign Keys در SQLite
    if url.startswith("sqlite"):

        @event.listens_for(engine, "connect")
        def set_sqlite_pragma(dbapi_conn, connection_record):
            cursor = dbapi_conn.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


# Session factory سراسری (در production بهتر است از dependency injection استفاده شود)
_engine: Engine | None = None
_SessionLocal: sessionmaker | None = None


def get_engine(echo: bool = False) -> Engine:
    global _engine
    if _engine is None:
        _engine = create_db_engine(echo=echo)
    return _engine


def get_session_factory(echo: bool = False) -> sessionmaker:
    global _SessionLocal
    if _SessionLocal is None:
        engine = get_engine(echo=echo)
        _SessionLocal = sessionmaker(
            bind=engine,
            autocommit=False,
            autoflush=False,
            expire_on_commit=False,
            class_=Session,
        )
    return _SessionLocal


def get_session() -> Generator[Session, None, None]:
    """برای استفاده در FastAPI یا اسکریپت‌ها"""
    SessionLocal = get_session_factory()
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def init_db(echo: bool = False) -> None:
    """ایجاد تمام جداول (برای دمو و تست — در production از Alembic استفاده کنید)"""
    from infrastructure.persistence import models  # noqa: F401

    engine = get_engine(echo=echo)
    Base.metadata.create_all(bind=engine)

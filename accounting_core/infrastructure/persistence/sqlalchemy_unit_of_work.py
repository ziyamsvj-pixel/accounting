from __future__ import annotations

from sqlalchemy.orm import Session

from application.ports.repositories import UnitOfWork
from infrastructure.persistence.database import get_session_factory
from infrastructure.persistence.sqlalchemy_repositories import (
    SQLAlchemyAccountRepository,
    SQLAlchemyJournalEntryRepository,
)


class SQLAlchemyUnitOfWork(UnitOfWork):
    """
    Unit of Work مبتنی بر SQLAlchemy Session.
    استفاده:

        with SQLAlchemyUnitOfWork() as uow:
            ...
            uow.commit()
    """

    def __init__(self, session: Session | None = None) -> None:
        self._session_factory = get_session_factory()
        self._session: Session | None = session
        self._own_session = session is None

    def __enter__(self) -> "SQLAlchemyUnitOfWork":
        if self._session is None:
            self._session = self._session_factory()
            self._own_session = True

        self.accounts = SQLAlchemyAccountRepository(self._session)
        self.journal_entries = SQLAlchemyJournalEntryRepository(self._session)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type is not None:
            self.rollback()
        if self._own_session and self._session is not None:
            self._session.close()
            self._session = None

    def commit(self) -> None:
        if self._session is None:
            raise RuntimeError("No active session")
        self._session.commit()

    def rollback(self) -> None:
        if self._session is not None:
            self._session.rollback()

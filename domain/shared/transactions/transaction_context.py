from __future__ import annotations
from contextvars import ContextVar
from typing import Any, Callable
from uuid import UUID, uuid4

_transaction_context: ContextVar[Optional[UUID]] = ContextVar("transaction_context", default=None)

class TransactionContext:
    """Context برای Transaction Safety و Idempotency"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def start_transaction(cls) -> UUID:
        tx_id = uuid4()
        _transaction_context.set(tx_id)
        return tx_id

    @classmethod
    def get_current_transaction_id(cls) -> Optional[UUID]:
        return _transaction_context.get()

    @classmethod
    def commit(cls) -> None:
        _transaction_context.set(None)

    @classmethod
    def rollback(cls) -> None:
        _transaction_context.set(None)

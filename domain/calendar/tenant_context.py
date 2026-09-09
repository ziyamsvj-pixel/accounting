from __future__ import annotations
from typing import Optional, Dict, Any
from contextvars import ContextVar
from sqlalchemy.orm import Session
from domain.tenant.tenant import Tenant

_tenant_context: ContextVar[Optional[Tenant]] = ContextVar("tenant_context", default=None)

class TenantContext:
    """Singleton Context برای Multi-Tenant (ردیابی tenant جاری)"""
    _instance: Optional[TenantContext] = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    @classmethod
    def set_current(cls, tenant: Tenant) -> None:
        _tenant_context.set(tenant)

    @classmethod
    def get_current(cls) -> Optional[Tenant]:
        return _tenant_context.get()

    @classmethod
    def clear(cls) -> None:
        _tenant_context.set(None)

    @classmethod
    def enforce_isolation(cls, session: Session, model: Any, tenant_id: Optional[str] = None) -> None:
        """اعتبارسنجی isolation (برای RLS در queryها)"""
        if not tenant_id and not cls.get_current():
            raise ValueError("TenantContext نمی‌تواند خالی باشد")
        # در لایه Infrastructure (repository) از این متد برای اعمال RLS استفاده می‌شود

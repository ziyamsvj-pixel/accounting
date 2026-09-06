from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import Uuid

from infrastructure.persistence.database import Base


class AccountModel(Base):
    __tablename__ = "accounts"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    account_type: Mapped[str] = mapped_column(String(30), nullable=False)
    nature: Mapped[str] = mapped_column(String(10), nullable=False)  # DEBIT / CREDIT
    parent_id: Mapped[Optional[UUID]] = mapped_column(
        Uuid, ForeignKey("accounts.id"), nullable=True
    )
    currency_code: Mapped[str] = mapped_column(String(10), nullable=False, default="IRR")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_leaf: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    tax_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    parent: Mapped[Optional["AccountModel"]] = relationship(
        "AccountModel", remote_side=[id], back_populates="children"
    )
    children: Mapped[List["AccountModel"]] = relationship(
        "AccountModel", back_populates="parent"
    )


class JournalEntryModel(Base):
    __tablename__ = "journal_entries"
    __table_args__ = (UniqueConstraint("entry_number", name="uq_journal_entry_number"),)

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    entry_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entry_date_year: Mapped[int] = mapped_column(Integer, nullable=False)
    entry_date_month: Mapped[int] = mapped_column(Integer, nullable=False)
    entry_date_day: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT", index=True)
    reference: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    fiscal_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    created_by: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, nullable=False
    )
    posted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    lines: Mapped[List["JournalLineModel"]] = relationship(
        "JournalLineModel",
        back_populates="journal_entry",
        cascade="all, delete-orphan",
        order_by="JournalLineModel.id",
    )


class JournalLineModel(Base):
    __tablename__ = "journal_lines"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    journal_entry_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    account_id: Mapped[UUID] = mapped_column(
        Uuid, ForeignKey("accounts.id"), nullable=False, index=True
    )
    debit_amount: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False, default=0)
    credit_amount: Mapped[Decimal] = mapped_column(Numeric(20, 4), nullable=False, default=0)
    currency_code: Mapped[str] = mapped_column(String(10), nullable=False, default="IRR")
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    foreign_amount: Mapped[Optional[Decimal]] = mapped_column(Numeric(20, 4), nullable=True)
    foreign_currency_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    exchange_rate: Mapped[Optional[Decimal]] = mapped_column(Numeric(18, 8), nullable=True)
    cost_center_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)
    detail_id: Mapped[Optional[UUID]] = mapped_column(Uuid, nullable=True)

    journal_entry: Mapped["JournalEntryModel"] = relationship(
        "JournalEntryModel", back_populates="lines"
    )
    account: Mapped["AccountModel"] = relationship("AccountModel")


class EntryNumberSequenceModel(Base):
    """شمارنده شماره سند به تفکیک سال مالی"""

    __tablename__ = "entry_number_sequences"

    fiscal_year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

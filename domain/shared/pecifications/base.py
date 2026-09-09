from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any

class Specification(ABC):
    """پایه Specification Pattern (برای اعتبارسنجی)"""
    @abstractmethod
    def is_satisfied_by(self, candidate: Any) -> bool:
        pass

"""
SQLAlchemy ORM models for the ACW Assistant backend.
"""

import json
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass


class CallSummary(Base):
    """Stores AI-generated summaries for completed calls."""

    __tablename__ = "call_summaries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_id = Column(String(128), nullable=False, index=True)
    transcript = Column(Text, nullable=False, default="")
    summary = Column(Text, nullable=False)
    sentiment = Column(String(32), nullable=False, default="neutral")
    action_items_json = Column(Text, nullable=False, default="[]")
    category = Column(String(128), nullable=False, default="general")
    duration = Column(Integer, nullable=False, default=0)  # seconds
    quality_score = Column(Float, nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    @property
    def action_items(self) -> list[str]:
        """Deserializes action_items_json into a Python list."""
        try:
            return json.loads(self.action_items_json)
        except (json.JSONDecodeError, TypeError):
            return []

    def to_dict(self) -> dict:
        """Returns a serializable dictionary representation."""
        return {
            "id": self.id,
            "agent_id": self.agent_id,
            "transcript": self.transcript,
            "summary": self.summary,
            "sentiment": self.sentiment,
            "action_items": self.action_items,
            "category": self.category,
            "duration": self.duration,
            "quality_score": self.quality_score,
            "created_at": (
                self.created_at.isoformat() if self.created_at else None
            ),
        }

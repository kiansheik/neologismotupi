"""Ephemeral, one-use authorization codes. Passwords remain exclusively in User."""
import uuid
from sqlalchemy import BigInteger, ForeignKey, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.db import Base

class StudioLoginCode(Base):
    __tablename__ = "studio_login_codes"
    code_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    session_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    challenge: Mapped[str] = mapped_column(String(43), nullable=False)
    auth_revision: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[int] = mapped_column(BigInteger, nullable=False)

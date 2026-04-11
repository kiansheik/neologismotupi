import uuid

from sqlalchemy import String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class NavarroEntry(Base):
    __tablename__ = "navarro_entries"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, nullable=False)
    first_word: Mapped[str] = mapped_column(String(200), nullable=False)
    optional_number: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    definition: Mapped[str] = mapped_column(Text, nullable=False, default="")
    normalized_headword: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    search_text: Mapped[str] = mapped_column(Text, nullable=False, index=True)

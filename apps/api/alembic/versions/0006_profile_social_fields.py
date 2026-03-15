"""add profile social fields

Revision ID: 0006_profile_social_fields
Revises: 0005_example_source
Create Date: 2026-03-14 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_profile_social_fields"
down_revision: str | Sequence[str] | None = "0005_example_source"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("profiles", sa.Column("website_url", sa.String(length=500), nullable=True))
    op.add_column("profiles", sa.Column("instagram_handle", sa.String(length=120), nullable=True))
    op.add_column("profiles", sa.Column("tiktok_handle", sa.String(length=120), nullable=True))
    op.add_column("profiles", sa.Column("youtube_handle", sa.String(length=120), nullable=True))
    op.add_column("profiles", sa.Column("bluesky_handle", sa.String(length=253), nullable=True))


def downgrade() -> None:
    op.drop_column("profiles", "bluesky_handle")
    op.drop_column("profiles", "youtube_handle")
    op.drop_column("profiles", "tiktok_handle")
    op.drop_column("profiles", "instagram_handle")
    op.drop_column("profiles", "website_url")

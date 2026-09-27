"""Add short-lived first-party Studio authorization codes."""
from alembic import op
import sqlalchemy as sa
revision = "0031_studio_identity"
down_revision = "0030_review_participation_events"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("studio_login_codes",
        sa.Column("code_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_hash", sa.String(128), nullable=False),
        sa.Column("challenge", sa.String(43), nullable=False),
        sa.Column("auth_revision", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.BigInteger(), nullable=False))

def downgrade():
    op.drop_table("studio_login_codes")

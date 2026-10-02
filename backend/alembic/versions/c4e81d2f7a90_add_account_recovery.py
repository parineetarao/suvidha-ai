"""add account recovery: admin password resets, citizen recovery requests, otp purpose

Revision ID: c4e81d2f7a90
Revises: a78c1524ccd4
Create Date: 2026-10-02 23:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'c4e81d2f7a90'
down_revision: Union[str, Sequence[str], None] = 'a78c1524ccd4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'otp_requests',
        sa.Column('purpose', sa.String(length=20), nullable=False, server_default='login'),
    )

    op.create_table(
        'admin_password_resets',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('admin_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('code_hash', sa.String(length=128), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('attempts', sa.SmallInteger(), nullable=False),
        sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['admin_id'], ['admins.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_admin_password_resets_admin_id'), 'admin_password_resets', ['admin_id'], unique=False)

    op.create_table(
        'account_recovery_requests',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('full_name', sa.String(length=255), nullable=True),
        sa.Column('registered_contact', sa.String(length=255), nullable=False),
        sa.Column('new_contact', sa.String(length=255), nullable=False),
        sa.Column('details', sa.Text(), nullable=True),
        sa.Column('matched_user_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('reviewed_by', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('review_note', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['matched_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['reviewed_by'], ['admins.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_account_recovery_requests_status'), 'account_recovery_requests', ['status'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_account_recovery_requests_status'), table_name='account_recovery_requests')
    op.drop_table('account_recovery_requests')
    op.drop_index(op.f('ix_admin_password_resets_admin_id'), table_name='admin_password_resets')
    op.drop_table('admin_password_resets')
    op.drop_column('otp_requests', 'purpose')

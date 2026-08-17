"""add eligibility_text, application_process, faqs columns

Revision ID: 3d8530313aaf
Revises: 8500f0bbe940
Create Date: 2026-07-28 07:23:56.243595

"""
from typing import Sequence, Union
import pgvector.sqlalchemy

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '3d8530313aaf'
down_revision: Union[str, Sequence[str], None] = '8500f0bbe940'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('schemes', sa.Column('eligibility_text', sa.Text(), nullable=True))
    op.add_column('schemes', sa.Column('application_process', sa.Text(), nullable=True))
    op.add_column('schemes', sa.Column('faqs', postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default='[]'))
    # ### end Alembic commands ###

def downgrade() -> None:
    op.drop_column('schemes', 'faqs')
    op.drop_column('schemes', 'application_process')
    op.drop_column('schemes', 'eligibility_text')

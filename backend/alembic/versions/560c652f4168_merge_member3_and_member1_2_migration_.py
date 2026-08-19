"""merge member3 and member1/2 migration heads

Revision ID: 560c652f4168
Revises: 3d8530313aaf, 63607d1b40db
Create Date: 2026-08-14 16:55:05.887161

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '560c652f4168'
down_revision: Union[str, Sequence[str], None] = ('3d8530313aaf', '63607d1b40db')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

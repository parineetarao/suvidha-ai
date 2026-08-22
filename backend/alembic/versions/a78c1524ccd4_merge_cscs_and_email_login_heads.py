"""merge cscs and email login heads

Revision ID: a78c1524ccd4
Revises: 7f2a1c9d4e6b, b997800061c5
Create Date: 2026-08-21 22:28:38.019439

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a78c1524ccd4'
down_revision: Union[str, Sequence[str], None] = ('7f2a1c9d4e6b', 'b997800061c5')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

"""merge schemes and identity/access branches

Revision ID: 8500f0bbe940
Revises: 2ac3a903d489, a82a2f043315
Create Date: 2026-07-28 07:17:42.431409

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8500f0bbe940'
down_revision: Union[str, Sequence[str], None] = ('2ac3a903d489', 'a82a2f043315')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass

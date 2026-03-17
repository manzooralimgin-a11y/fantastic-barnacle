"""merge_heads

Revision ID: 5eb71fbec071
Revises: a1b2c3d4e5f6, f5a1b2c3d4e5
Create Date: 2026-03-17 19:16:34.606627

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5eb71fbec071'
down_revision: Union[str, None] = ('a1b2c3d4e5f6', 'f5a1b2c3d4e5')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

"""merge hotel feature heads for production deployment

Revision ID: 0f4d9c8b7a6e
Revises: f7a8b9c0d1e2, z003a4b5c6d7
Create Date: 2026-04-14 00:00:00.000000

"""

from typing import Sequence, Union


revision: str = "0f4d9c8b7a6e"
down_revision: Union[str, Sequence[str], None] = ("f7a8b9c0d1e2", "z003a4b5c6d7")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

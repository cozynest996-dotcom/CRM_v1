"""add_channel_to_messages

Revision ID: 0e6263bda5fc
Revises: bfd2feb9a6c7
Create Date: 2025-10-19 11:36:06.713987

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0e6263bda5fc'
down_revision: Union[str, Sequence[str], None] = 'bfd2feb9a6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 添加 channel 字段到 messages 表
    op.add_column('messages', sa.Column('channel', sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    # 删除 channel 字段
    op.drop_column('messages', 'channel')

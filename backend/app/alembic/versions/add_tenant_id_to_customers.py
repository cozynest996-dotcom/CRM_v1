"""add tenant_id to customers

Revision ID: add_tenant_id_to_customers
Revises: 000000000001_make_settings_user_id_nullable
Create Date: 2025-09-26 02:40:00.000000

"""
from alembic import op
import sqlalchemy as sa
import uuid

# revision identifiers, used by Alembic.
revision = 'add_tenant_id_to_customers'
down_revision = '000000000001_make_settings_user_id_nullable'
branch_labels = None
depends_on = None

def upgrade():
    # 添加 tenant_id 列
    op.add_column('customers', sa.Column('tenant_id', sa.String(), nullable=True))
    
    # 为现有记录生成 tenant_id
    connection = op.get_bind()
    connection.execute(
        sa.text(
            "UPDATE customers SET tenant_id = :uuid WHERE tenant_id IS NULL"
        ),
        {"uuid": str(uuid.uuid4())}
    )
    
    # 创建索引
    op.create_index(op.f('ix_customers_tenant_id'), 'customers', ['tenant_id'])

def downgrade():
    # 删除索引
    op.drop_index(op.f('ix_customers_tenant_id'), table_name='customers')
    
    # 删除列
    op.drop_column('customers', 'tenant_id')


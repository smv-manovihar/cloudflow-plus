"""initial_schema

Revision ID: efec3089a774
Revises: 
Create Date: 2026-09-15 20:48:45.934251

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine import reflection


# revision identifiers, used by Alembic.
revision: str = 'efec3089a774'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = reflection.Inspector.from_engine(conn)
    existing_tables = insp.get_table_names()

    # Drop legacy storage_providers if it exists
    if 'storage_providers' in existing_tables:
        op.drop_table('storage_providers')

    # 1. users
    if 'users' not in existing_tables:
        op.create_table(
            'users',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('email', sa.String(), nullable=False, unique=True),
            sa.Column('password', sa.String(), nullable=False),
            sa.Column('sync_enabled', sa.Boolean(), nullable=False, server_default=sa.text('0')),
        )
    else:
        user_cols = [c['name'] for c in insp.get_columns('users')]
        if 'sync_enabled' not in user_cols:
            with op.batch_alter_table('users') as batch_op:
                batch_op.add_column(sa.Column('sync_enabled', sa.Boolean(), nullable=False, server_default=sa.text('0')))

    # 2. file_records
    if 'file_records' not in existing_tables:
        op.create_table(
            'file_records',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('object_key', sa.String(), nullable=False),
            sa.Column('display_name', sa.String(), nullable=False),
            sa.Column('parent_path', sa.String(), nullable=False, server_default=''),
            sa.Column('size_bytes', sa.BigInteger(), nullable=False, server_default=sa.text('0')),
            sa.Column('content_type', sa.String(), nullable=False, server_default='application/octet-stream'),
            sa.Column('etag', sa.String(), nullable=True),
            sa.Column('is_folder', sa.Boolean(), nullable=False, server_default=sa.text('0')),
            sa.Column('sync_status', sa.String(), nullable=False, server_default='none'),
            sa.Column('last_synced_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('sync_error', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        )

    # 3. sync_jobs
    if 'sync_jobs' not in existing_tables:
        op.create_table(
            'sync_jobs',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('status', sa.String(), nullable=False, server_default='queued'),
            sa.Column('total_files', sa.Integer(), nullable=False, server_default=sa.text('0')),
            sa.Column('synced_files', sa.Integer(), nullable=False, server_default=sa.text('0')),
            sa.Column('failed_files', sa.Integer(), nullable=False, server_default=sa.text('0')),
            sa.Column('error_message', sa.Text(), nullable=True),
            sa.Column('started_at', sa.DateTime(timezone=True), nullable=False),
            sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        )

    # 4. shared_links
    if 'shared_links' not in existing_tables:
        op.create_table(
            'shared_links',
            sa.Column('id', sa.String(), primary_key=True),
            sa.Column('user_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
            sa.Column('name', sa.String(), nullable=False),
            sa.Column('bucket', sa.String(), nullable=False),
            sa.Column('object_key', sa.String(), nullable=False),
            sa.Column('size_bytes', sa.BigInteger(), nullable=True),
            sa.Column('password', sa.String(), nullable=True),
            sa.Column('enabled', sa.Boolean(), nullable=False, server_default=sa.text('1')),
            sa.Column('qr_code', sa.String(), nullable=True),
            sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        )


def downgrade() -> None:
    op.drop_table('shared_links', if_exists=True)
    op.drop_table('sync_jobs', if_exists=True)
    op.drop_table('file_records', if_exists=True)
    op.drop_table('users', if_exists=True)

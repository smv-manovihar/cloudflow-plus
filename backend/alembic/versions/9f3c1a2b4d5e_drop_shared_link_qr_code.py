"""drop_shared_link_qr_code

Revision ID: 9f3c1a2b4d5e
Revises: efec3089a774
Create Date: 2026-09-15

QR codes are now generated client-side from the share URL.
Drops the unused shared_links.qr_code column.

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.engine import reflection


# revision identifiers, used by Alembic.
revision: str = '9f3c1a2b4d5e'
down_revision: Union[str, Sequence[str], None] = 'efec3089a774'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    insp = reflection.Inspector.from_engine(conn)
    if 'shared_links' not in insp.get_table_names():
        return
    cols = [c['name'] for c in insp.get_columns('shared_links')]
    if 'qr_code' in cols:
        with op.batch_alter_table('shared_links') as batch_op:
            batch_op.drop_column('qr_code')


def downgrade() -> None:
    conn = op.get_bind()
    insp = reflection.Inspector.from_engine(conn)
    if 'shared_links' not in insp.get_table_names():
        return
    cols = [c['name'] for c in insp.get_columns('shared_links')]
    if 'qr_code' not in cols:
        with op.batch_alter_table('shared_links') as batch_op:
            batch_op.add_column(sa.Column('qr_code', sa.String(), nullable=True))

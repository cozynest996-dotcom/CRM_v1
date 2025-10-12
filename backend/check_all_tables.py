#!/usr/bin/env python3
"""
Inspect all database tables:
- list table names
- row counts
- column list
- null counts per column
- sample rows (up to 5)

Usage: python check_all_tables.py
"""
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError
from app.db.database import engine
import json
import sys


def get_tables():
    inspector = inspect(engine)
    return inspector.get_table_names()


def get_columns(table_name):
    inspector = inspect(engine)
    cols = inspector.get_columns(table_name)
    return [c['name'] for c in cols]


def row_count(table_name):
    with engine.connect() as conn:
        r = conn.execute(text(f"SELECT COUNT(*) AS cnt FROM \"{table_name}\""))
        return int(r.scalar() or 0)


def sample_rows(table_name, limit=5):
    with engine.connect() as conn:
        res = conn.execute(text(f"SELECT * FROM \"{table_name}\" LIMIT :limit"), {"limit": limit})
        rows = [dict(row) for row in res]
        return rows


def null_counts(table_name, columns):
    counts = {}
    with engine.connect() as conn:
        for col in columns:
            try:
                q = text(f'SELECT COUNT(*) FROM "{table_name}" WHERE "{col}" IS NULL')
                r = conn.execute(q)
                counts[col] = int(r.scalar() or 0)
            except Exception:
                counts[col] = None
    return counts


def inspect_db():
    try:
        tables = get_tables()
    except Exception as e:
        print('Failed to enumerate tables:', e)
        sys.exit(2)

    print(f"Found {len(tables)} tables\n")

    for t in tables:
        print('=' * 80)
        print(f"Table: {t}")
        try:
            cnt = row_count(t)
            print(f"Rows: {cnt}")

            cols = get_columns(t)
            print(f"Columns ({len(cols)}): {', '.join(cols)}")

            print('\nNull counts per column:')
            nulls = null_counts(t, cols)
            for c, n in nulls.items():
                print(f"  {c}: {n}")

            print('\nSample rows:')
            samples = sample_rows(t)
            if samples:
                print(json.dumps(samples, default=str, ensure_ascii=False, indent=2))
            else:
                print('  (no rows)')

        except SQLAlchemyError as e:
            print('  SQLAlchemy error:', e)
        except Exception as e:
            print('  Error inspecting table:', e)


if __name__ == '__main__':
    inspect_db()




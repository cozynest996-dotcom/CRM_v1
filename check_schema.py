
import os
from sqlalchemy import create_engine, inspect

DATABASE_URL = os.environ.get("DATABASE_URL")

if not DATABASE_URL:
    print("Error: DATABASE_URL environment variable is not set.")
    exit(1)

engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as connection:
        inspector = inspect(connection)
        
        print(f"--- Schema for table 'customers' ---")
        columns = inspector.get_columns('customers')
        for column in columns:
            print(f"  Column: {column['name']}, Type: {column['type']}, Nullable: {column['nullable']}")
        
        print(f"--- Schema for table 'settings' (to check for telegram_session_file, etc.) ---")
        columns = inspector.get_columns('settings')
        for column in columns:
            print(f"  Column: {column['name']}, Type: {column['type']}, Nullable: {column['nullable']}")

except Exception as e:
    print(f"Error connecting to database or inspecting schema: {e}")

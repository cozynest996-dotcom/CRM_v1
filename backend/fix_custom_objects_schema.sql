-- Fix custom objects schema issues
-- Add missing is_active column to custom_entity_types table
-- Add missing reference_entity_type_id column to custom_fields table (if not exists)

-- Add is_active column to custom_entity_types if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'custom_entity_types' 
        AND column_name = 'is_active'
    ) THEN
        ALTER TABLE custom_entity_types 
        ADD COLUMN is_active BOOLEAN DEFAULT TRUE NOT NULL;
        
        -- Update existing records to be active
        UPDATE custom_entity_types SET is_active = TRUE WHERE is_active IS NULL;
        
        RAISE NOTICE 'Added is_active column to custom_entity_types table';
    ELSE
        RAISE NOTICE 'is_active column already exists in custom_entity_types table';
    END IF;
END $$;

-- Add reference_entity_type_id column to custom_fields if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'custom_fields' 
        AND column_name = 'reference_entity_type_id'
    ) THEN
        ALTER TABLE custom_fields 
        ADD COLUMN reference_entity_type_id INTEGER REFERENCES custom_entity_types(id) ON DELETE SET NULL;
        
        RAISE NOTICE 'Added reference_entity_type_id column to custom_fields table';
    ELSE
        RAISE NOTICE 'reference_entity_type_id column already exists in custom_fields table';
    END IF;
END $$;

-- Verify the schema
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_name IN ('custom_entity_types', 'custom_fields', 'custom_entity_records')
ORDER BY table_name, ordinal_position;

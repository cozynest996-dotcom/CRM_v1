-- Add custom_entity_types table
CREATE TABLE custom_entity_types (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_custom_entity_types_id ON custom_entity_types (id);
CREATE INDEX ix_custom_entity_types_user_id ON custom_entity_types (user_id);

-- Add custom_fields table
CREATE TABLE custom_fields (
    id SERIAL PRIMARY KEY,
    entity_type_id INTEGER NOT NULL REFERENCES custom_entity_types(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    field_key VARCHAR(255) NOT NULL,
    field_type VARCHAR(255) NOT NULL,
    is_required BOOLEAN DEFAULT FALSE,
    options JSONB, -- For select/multiselect
    reference_entity_type_id INTEGER REFERENCES custom_entity_types(id) ON DELETE SET NULL, -- For 'reference' type fields
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (entity_type_id, field_key)
);
CREATE INDEX ix_custom_fields_id ON custom_fields (id);
CREATE INDEX ix_custom_fields_entity_type_id ON custom_fields (entity_type_id);

-- Add custom_entity_records table
CREATE TABLE custom_entity_records (
    id SERIAL PRIMARY KEY,
    entity_type_id INTEGER NOT NULL REFERENCES custom_entity_types(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ix_custom_entity_records_id ON custom_entity_records (id);
CREATE INDEX ix_custom_entity_records_entity_type_id ON custom_entity_records (entity_type_id);
CREATE INDEX ix_custom_entity_records_user_id ON custom_entity_records (user_id);

-- Add update triggers for updated_at columns
-- Function to update updated_at column
CREATE OR REPLACE FUNCTION update_timestamp() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for custom_entity_types
CREATE TRIGGER update_custom_entity_types_updated_at
BEFORE UPDATE ON custom_entity_types
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Trigger for custom_fields
CREATE TRIGGER update_custom_fields_updated_at
BEFORE UPDATE ON custom_fields
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- Trigger for custom_entity_records
CREATE TRIGGER update_custom_entity_records_updated_at
BEFORE UPDATE ON custom_entity_records
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

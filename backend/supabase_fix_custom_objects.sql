-- Supabase 修复脚本：为 custom objects 添加缺少的列和表
-- 请在 Supabase SQL Editor 中执行此脚本

-- 1. 检查并添加 is_active 列到 custom_entity_types 表
DO $$
BEGIN
    -- 检查 custom_entity_types 表是否存在
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'custom_entity_types'
    ) THEN
        -- 检查 is_active 列是否存在
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public'
            AND table_name = 'custom_entity_types' 
            AND column_name = 'is_active'
        ) THEN
            ALTER TABLE public.custom_entity_types 
            ADD COLUMN is_active BOOLEAN DEFAULT TRUE NOT NULL;
            
            -- 更新现有记录
            UPDATE public.custom_entity_types 
            SET is_active = TRUE 
            WHERE is_active IS NULL;
            
            RAISE NOTICE 'Added is_active column to custom_entity_types table';
        ELSE
            RAISE NOTICE 'is_active column already exists in custom_entity_types table';
        END IF;
    ELSE
        RAISE NOTICE 'custom_entity_types table does not exist - will be created by backend';
    END IF;
END $$;

-- 2. 检查并添加 reference_entity_type_id 列到 custom_fields 表
DO $$
BEGIN
    -- 检查 custom_fields 表是否存在
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'custom_fields'
    ) THEN
        -- 检查 reference_entity_type_id 列是否存在
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_schema = 'public'
            AND table_name = 'custom_fields' 
            AND column_name = 'reference_entity_type_id'
        ) THEN
            ALTER TABLE public.custom_fields 
            ADD COLUMN reference_entity_type_id INTEGER;
            
            -- 添加外键约束（如果 custom_entity_types 表存在）
            IF EXISTS (
                SELECT 1 FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'custom_entity_types'
            ) THEN
                ALTER TABLE public.custom_fields 
                ADD CONSTRAINT fk_custom_fields_reference_entity_type 
                FOREIGN KEY (reference_entity_type_id) 
                REFERENCES public.custom_entity_types(id) 
                ON DELETE SET NULL;
            END IF;
            
            RAISE NOTICE 'Added reference_entity_type_id column to custom_fields table';
        ELSE
            RAISE NOTICE 'reference_entity_type_id column already exists in custom_fields table';
        END IF;
    ELSE
        RAISE NOTICE 'custom_fields table does not exist - will be created by backend';
    END IF;
END $$;

-- 3. 创建完整的 custom objects 表结构（如果不存在）
-- 这些表将由后端自动创建，但如果需要手动创建，可以使用以下脚本：

-- custom_entity_types 表
CREATE TABLE IF NOT EXISTS public.custom_entity_types (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- custom_fields 表
CREATE TABLE IF NOT EXISTS public.custom_fields (
    id SERIAL PRIMARY KEY,
    entity_type_id INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    field_key VARCHAR(255) NOT NULL,
    field_type VARCHAR(255) NOT NULL,
    is_required BOOLEAN DEFAULT FALSE,
    options JSONB,
    reference_entity_type_id INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (entity_type_id, field_key)
);

-- custom_entity_records 表
CREATE TABLE IF NOT EXISTS public.custom_entity_records (
    id SERIAL PRIMARY KEY,
    entity_type_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 添加外键约束（如果表已存在且约束不存在）
DO $$
BEGIN
    -- custom_entity_types 到 users 的外键
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') 
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.table_constraints 
           WHERE constraint_name = 'fk_custom_entity_types_user_id'
       ) THEN
        ALTER TABLE public.custom_entity_types 
        ADD CONSTRAINT fk_custom_entity_types_user_id 
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;

    -- custom_fields 到 custom_entity_types 的外键
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_custom_fields_entity_type_id'
    ) THEN
        ALTER TABLE public.custom_fields 
        ADD CONSTRAINT fk_custom_fields_entity_type_id 
        FOREIGN KEY (entity_type_id) REFERENCES public.custom_entity_types(id) ON DELETE CASCADE;
    END IF;

    -- custom_fields 到 custom_entity_types 的引用外键
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_custom_fields_reference_entity_type'
    ) THEN
        ALTER TABLE public.custom_fields 
        ADD CONSTRAINT fk_custom_fields_reference_entity_type 
        FOREIGN KEY (reference_entity_type_id) REFERENCES public.custom_entity_types(id) ON DELETE SET NULL;
    END IF;

    -- custom_entity_records 的外键
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') 
       AND NOT EXISTS (
           SELECT 1 FROM information_schema.table_constraints 
           WHERE constraint_name = 'fk_custom_entity_records_user_id'
       ) THEN
        ALTER TABLE public.custom_entity_records 
        ADD CONSTRAINT fk_custom_entity_records_user_id 
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'fk_custom_entity_records_entity_type_id'
    ) THEN
        ALTER TABLE public.custom_entity_records 
        ADD CONSTRAINT fk_custom_entity_records_entity_type_id 
        FOREIGN KEY (entity_type_id) REFERENCES public.custom_entity_types(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 创建索引（如果不存在）
CREATE INDEX IF NOT EXISTS ix_custom_entity_types_id ON public.custom_entity_types (id);
CREATE INDEX IF NOT EXISTS ix_custom_entity_types_user_id ON public.custom_entity_types (user_id);
CREATE INDEX IF NOT EXISTS ix_custom_fields_id ON public.custom_fields (id);
CREATE INDEX IF NOT EXISTS ix_custom_fields_entity_type_id ON public.custom_fields (entity_type_id);
CREATE INDEX IF NOT EXISTS ix_custom_entity_records_id ON public.custom_entity_records (id);
CREATE INDEX IF NOT EXISTS ix_custom_entity_records_entity_type_id ON public.custom_entity_records (entity_type_id);
CREATE INDEX IF NOT EXISTS ix_custom_entity_records_user_id ON public.custom_entity_records (user_id);

-- 创建 updated_at 触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_timestamp() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器（如果不存在）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'update_custom_entity_types_updated_at'
    ) THEN
        CREATE TRIGGER update_custom_entity_types_updated_at
        BEFORE UPDATE ON public.custom_entity_types
        FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'update_custom_fields_updated_at'
    ) THEN
        CREATE TRIGGER update_custom_fields_updated_at
        BEFORE UPDATE ON public.custom_fields
        FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.triggers 
        WHERE trigger_name = 'update_custom_entity_records_updated_at'
    ) THEN
        CREATE TRIGGER update_custom_entity_records_updated_at
        BEFORE UPDATE ON public.custom_entity_records
        FOR EACH ROW EXECUTE FUNCTION update_timestamp();
    END IF;
END $$;

-- 验证表结构
SELECT 
    table_name, 
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
  AND table_name IN ('custom_entity_types', 'custom_fields', 'custom_entity_records')
ORDER BY table_name, ordinal_position;

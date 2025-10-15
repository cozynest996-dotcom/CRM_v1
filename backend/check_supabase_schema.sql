-- 在 Supabase SQL Editor 中执行以下查询来检查表结构

-- 1. 检查 custom_entity_types 表结构
SELECT 
    'custom_entity_types' as table_name,
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
  AND table_name = 'custom_entity_types'
ORDER BY ordinal_position;

-- 2. 检查 custom_fields 表结构
SELECT 
    'custom_fields' as table_name,
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
  AND table_name = 'custom_fields'
ORDER BY ordinal_position;

-- 3. 检查 custom_entity_records 表结构
SELECT 
    'custom_entity_records' as table_name,
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
  AND table_name = 'custom_entity_records'
ORDER BY ordinal_position;

-- 4. 检查 ai_prompts 表结构
SELECT 
    'ai_prompts' as table_name,
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
  AND table_name = 'ai_prompts'
ORDER BY ordinal_position;

-- 5. 检查 knowledge_bases 表结构
SELECT 
    'knowledge_bases' as table_name,
    column_name, 
    data_type, 
    is_nullable, 
    column_default
FROM information_schema.columns 
WHERE table_schema = 'public'
  AND table_name = 'knowledge_bases'
ORDER BY ordinal_position;

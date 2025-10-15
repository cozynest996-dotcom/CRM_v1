# Supabase 配置指南

## 当前状态
✅ 后端已成功连接到 Supabase  
✅ 基础表已存在  
✅ 后端服务正常启动  

## 需要检查的表结构

由于之前的错误提到缺少某些列，请在 Supabase SQL Editor 中执行以下查询来检查表结构：

### 1. 检查表结构
```sql
-- 执行 backend/check_supabase_schema.sql 中的查询
```

### 2. 如果缺少列，执行修复脚本
```sql
-- 执行 backend/supabase_fix_custom_objects.sql 中的脚本
```

## 预期的表结构

### custom_entity_types 表应包含：
- `id` (SERIAL PRIMARY KEY)
- `user_id` (INTEGER NOT NULL)
- `name` (VARCHAR(255) NOT NULL)
- `description` (TEXT)
- `icon` (VARCHAR(255))
- `is_active` (BOOLEAN DEFAULT TRUE NOT NULL) ⚠️ **重要：这个列可能缺失**
- `created_at` (TIMESTAMP WITH TIME ZONE)
- `updated_at` (TIMESTAMP WITH TIME ZONE)

### custom_fields 表应包含：
- `id` (SERIAL PRIMARY KEY)
- `entity_type_id` (INTEGER NOT NULL)
- `name` (VARCHAR(255) NOT NULL)
- `field_key` (VARCHAR(255) NOT NULL)
- `field_type` (VARCHAR(255) NOT NULL)
- `is_required` (BOOLEAN DEFAULT FALSE)
- `options` (JSONB)
- `reference_entity_type_id` (INTEGER) ⚠️ **重要：这个列可能缺失**
- `created_at` (TIMESTAMP WITH TIME ZONE)
- `updated_at` (TIMESTAMP WITH TIME ZONE)

### custom_entity_records 表应包含：
- `id` (SERIAL PRIMARY KEY)
- `entity_type_id` (INTEGER NOT NULL)
- `user_id` (INTEGER NOT NULL)
- `data` (JSONB DEFAULT '{}')
- `created_at` (TIMESTAMP WITH TIME ZONE)
- `updated_at` (TIMESTAMP WITH TIME ZONE)

## 测试步骤

1. 访问前端：http://localhost:3000
2. 导航到 "AI Prompt Library" 页面
3. 导航到 "Custom Entity Configuration" 页面
4. 测试创建自定义实体类型
5. 在 LLM 节点中测试变量选择功能

## 如果仍有问题

如果在测试过程中遇到 API 错误，请：

1. 检查后端日志：
   ```bash
   docker logs crm_automation-main-backend-1 --tail 50
   ```

2. 检查 Supabase 表结构是否完整

3. 确认环境变量配置正确（DATABASE_URL 指向 Supabase）

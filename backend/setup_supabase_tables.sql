-- 检查 ai_prompts 表是否存在
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE  table_schema = 'public'
   AND    table_name   = 'ai_prompts'
);

-- 如果表不存在，创建 ai_prompts 表
CREATE TABLE IF NOT EXISTS ai_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR NOT NULL,
    description TEXT,
    system_prompt TEXT,
    user_prompt TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_ai_prompts_user_id ON ai_prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_prompts_id ON ai_prompts(id);

-- 检查 knowledge_bases 表是否存在
SELECT EXISTS (
   SELECT FROM information_schema.tables 
   WHERE  table_schema = 'public'
   AND    table_name   = 'knowledge_bases'
);

-- 如果表不存在，创建 knowledge_bases 表
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id INTEGER NOT NULL REFERENCES users(id),
    name VARCHAR NOT NULL,
    description TEXT,
    category VARCHAR,
    content TEXT NOT NULL,
    tags JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_user_id ON knowledge_bases(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_id ON knowledge_bases(id);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_category ON knowledge_bases(category);
CREATE INDEX IF NOT EXISTS idx_knowledge_bases_is_active ON knowledge_bases(is_active);

-- 创建更新时间触发器函数（如果不存在）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为 ai_prompts 表创建更新时间触发器
DROP TRIGGER IF EXISTS update_ai_prompts_updated_at ON ai_prompts;
CREATE TRIGGER update_ai_prompts_updated_at 
    BEFORE UPDATE ON ai_prompts 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 为 knowledge_bases 表创建更新时间触发器
DROP TRIGGER IF EXISTS update_knowledge_bases_updated_at ON knowledge_bases;
CREATE TRIGGER update_knowledge_bases_updated_at 
    BEFORE UPDATE ON knowledge_bases 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

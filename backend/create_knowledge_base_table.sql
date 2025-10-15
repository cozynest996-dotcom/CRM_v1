-- 创建知识库表
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

-- 创建更新时间触发器
CREATE TRIGGER update_knowledge_bases_updated_at 
    BEFORE UPDATE ON knowledge_bases 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 插入一些示例知识库数据
INSERT INTO knowledge_bases (user_id, name, description, category, content, tags) VALUES 
(1, '产品知识库', '包含所有产品信息和FAQ', 'product', '
# 产品知识库

## 主要产品

### CRM 自动化系统
- **功能**: 客户关系管理、工作流自动化、AI 智能分析
- **价格**: 基础版 ¥99/月，专业版 ¥299/月，企业版 ¥599/月
- **特色**: 
  - WhatsApp 集成
  - AI 智能回复
  - 自定义工作流
  - 数据分析报表

## 常见问题

### Q: 如何设置 WhatsApp 集成？
A: 进入设置页面，点击 WhatsApp 集成，扫描二维码即可连接。

### Q: 支持多少个用户？
A: 基础版支持 3 个用户，专业版支持 10 个用户，企业版无限制。
', '["产品", "FAQ", "价格"]'),

(1, '销售话术库', '标准销售话术和应答模板', 'sales', '
# 销售话术库

## 开场白

### 初次联系
- "您好！我是 [公司名] 的 [姓名]，很高兴为您介绍我们的 CRM 解决方案。"
- "听说您在寻找客户管理系统，我们刚好有一个完美的解决方案。"

### 电话回访
- "您好，我是上次联系您的 [姓名]，想了解一下您对我们产品的想法。"

## 产品介绍

### 核心价值
- "我们的系统可以帮您节省 70% 的客户管理时间"
- "通过 AI 自动化，您的转化率可以提升 40%"

### 功能亮点
- "WhatsApp 自动回复，24小时不间断服务客户"
- "智能客户分析，精准识别高价值客户"

## 异议处理

### 价格异议
- "我理解您对价格的考虑，让我们算一笔账..."
- "相比人工成本，我们的系统其实能为您节省更多"

### 功能质疑
- "我们有免费试用期，您可以先体验效果"
- "已经有 1000+ 企业在使用，效果显著"
', '["销售", "话术", "开场白", "异议处理"]'),

(1, '客服手册', '客户服务标准操作流程', 'support', '
# 客服手册

## 服务标准

### 响应时间
- 工作时间内：5分钟内响应
- 非工作时间：2小时内响应
- 紧急问题：立即响应

### 服务态度
- 热情友好，专业耐心
- 积极主动解决问题
- 及时跟进处理结果

## 常见问题处理

### 技术问题
1. 确认问题现象
2. 收集错误信息
3. 提供解决方案
4. 跟进处理结果

### 账户问题
1. 验证用户身份
2. 查询账户状态
3. 协助解决问题
4. 记录处理过程

### 投诉处理
1. 耐心倾听
2. 表示理解和歉意
3. 提出解决方案
4. 跟进满意度

## 升级流程

### 何时升级
- 超出权限范围
- 技术问题复杂
- 客户强烈不满

### 升级步骤
1. 详细记录问题
2. 联系上级主管
3. 协助交接处理
4. 跟进处理结果
', '["客服", "流程", "标准", "处理"]'),

(1, '公司政策', '公司各项政策和规定', 'policy', '
# 公司政策

## 退款政策

### 退款条件
- 购买后 30 天内
- 未超过使用限额
- 提供合理退款理由

### 退款流程
1. 提交退款申请
2. 客服审核处理
3. 财务确认退款
4. 3-7个工作日到账

## 数据安全

### 数据保护
- 采用银行级加密
- 定期备份数据
- 严格权限控制

### 隐私政策
- 不会泄露客户信息
- 不会用于其他用途
- 遵守相关法律法规

## 服务协议

### 服务承诺
- 99.9% 系统可用性
- 24/7 技术支持
- 定期功能更新

### 使用规范
- 禁止恶意使用
- 禁止违法操作
- 遵守使用条款

## 合作政策

### 代理商政策
- 提供培训支持
- 给予价格优惠
- 共同市场推广

### 合作伙伴
- 技术对接支持
- 联合解决方案
- 互利共赢发展
', '["政策", "退款", "安全", "协议"]') 
ON CONFLICT DO NOTHING;

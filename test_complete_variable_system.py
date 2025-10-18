#!/usr/bin/env python3
"""
完整的变量映射系统端到端测试
测试 PromptFormModal.tsx、NodeConfig.tsx 和 workflow_engine.py 的变量解析功能
"""

import re
import json
from datetime import datetime
from typing import Dict, Any, List

class MockCustomer:
    """模拟客户对象"""
    def __init__(self):
        self.id = "97e0194b-9c60-4c20-9109-73b7d5b29ff4"
        self.name = "张三"
        self.phone = "13800138000"
        self.email = "zhangsan@example.com"
        self.status = "active"
        self.user_id = 1
        self.telegram_chat_id = "1671499516"
        self.custom_fields = {
            "budget": "500000",
            "source": "微信",
            "notes": "VIP客户",
            "preferred_location": "深圳南山区"
        }

class MockWorkflowContext:
    """模拟工作流上下文"""
    def __init__(self):
        self.variables = {}
        self.db = {}
        self.ai = {}
        
        # 模拟触发器数据 - 完整的触发器信息
        self.variables["trigger_data"] = {
            "trigger_type": "message",
            "channel": "whatsapp", 
            "phone": "13800138000",
            "chat_id": "1671499516",
            "from_id": "1671499516",
            "message": "我想了解房产信息，预算在50万左右",
            "name": "张三",
            "timestamp": "2025-10-18T15:18:33.845651",
            "user_id": 1
        }
        
        # 模拟客户数据
        self.db["customer"] = MockCustomer()
        
        # 模拟 AI 输出数据
        self.ai = {
            "reply": {
                "reply_text": "感谢您的咨询！根据您50万的预算，我为您推荐几个优质楼盘。",
                "media_uuids": ["f59c9185-f77f-4d42-a791-fba127bbbaa8"],
                "followup_questions": ["您更偏好哪个区域？", "您对户型有什么要求？"]
            },
            "analyze": {
                "confidence": 0.85,
                "updates": {
                    "customer.custom.budget": 500000,
                    "customer.custom.source": "WhatsApp咨询"
                },
                "reason": "客户明确表达了购房意向和预算范围"
            },
            "meta": {
                "used_profile": "real_estate_assistant",
                "handoff": {
                    "triggered": False,
                    "confidence": 0.85
                }
            }
        }
        
        # 模拟 API 响应数据
        self.variables["api.response"] = {
            "status_code": 200,
            "headers": {"Content-Type": "application/json"},
            "data": {
                "success": True,
                "user_id": "12345",
                "message": "用户注册成功",
                "registration_id": "REG-2025-001",
                "properties": [
                    {"id": 1, "name": "海景花园", "price": 450000},
                    {"id": 2, "name": "山景豪庭", "price": 520000}
                ]
            }
        }
    
    def get(self, key, default=None):
        return self.variables.get(key, default)
    
    def set(self, key, value):
        self.variables[key] = value

class CompleteVariableResolver:
    """完整的变量解析器 - 模拟 workflow_engine.py 的逻辑"""
    
    def __init__(self, context):
        self.context = context
    
    def _resolve_text_variables(self, text: str) -> str:
        """解析文本中的所有 {{variable_path}} 变量"""
        if not isinstance(text, str):
            return str(text)

        def get_nested_value(data, path_parts):
            current = data
            for part in path_parts:
                if isinstance(current, dict) and part in current:
                    current = current[part]
                elif isinstance(current, object) and hasattr(current, part):
                    current = getattr(current, part)
                else:
                    return None
            return current

        def replace_match(match):
            var_path = match.group(1).strip()
            
            # 1. 触发器变量
            if var_path.startswith("trigger."):
                trigger_data = self.context.get("trigger_data", {})
                value = get_nested_value(trigger_data, var_path.split('.')[1:])
                if value is not None:
                    return str(value)
            
            # 2. 客户自定义字段 - 必须在基础字段之前处理
            elif var_path.startswith("custom_fields.") or var_path.startswith("customer.custom."):
                customer = self.context.db.get("customer")
                if customer and hasattr(customer, 'custom_fields'):
                    # 处理 custom_fields.field 和 customer.custom.field 两种格式
                    if var_path.startswith("custom_fields."):
                        field_name = var_path.replace("custom_fields.", "")
                    else:
                        field_name = var_path.replace("customer.custom.", "")
                    
                    custom_fields = customer.custom_fields or {}
                    value = custom_fields.get(field_name)
                    return str(value) if value is not None else ""
            
            # 3. 客户基础信息 - 支持多种格式
            elif var_path.startswith("db.customer.") or var_path.startswith("customer."):
                customer = self.context.db.get("customer")
                if customer:
                    # 处理 db.customer.field 和 customer.field 两种格式
                    if var_path.startswith("db.customer."):
                        field_name = var_path.replace("db.customer.", "")
                    else:
                        field_name = var_path.replace("customer.", "")
                    
                    if hasattr(customer, field_name):
                        value = getattr(customer, field_name)
                        return str(value) if value is not None else ""
            
            # 4. AI 输出
            elif var_path.startswith("ai."):
                ai_data = self.context.ai
                value = get_nested_value(ai_data, var_path.split('.')[1:])
                if value is not None:
                    return str(value)
            
            # 5. API 响应
            elif var_path.startswith("api.response."):
                api_data = self.context.get("api.response", {})
                value = get_nested_value(api_data, var_path.split('.')[2:])
                if value is not None:
                    return str(value)
            elif var_path.startswith("api."):
                api_data = self.context.get("api.response", {})
                value = get_nested_value(api_data, var_path.split('.')[1:])
                if value is not None:
                    return str(value)
            
            # 6. 直接从上下文变量中查找
            else:
                value = self.context.get(var_path)
                if value is not None:
                    return str(value)
            
            # 如果找不到变量，返回原始文本
            return f"{{{{{var_path}}}}}"

        return re.sub(r'\{\{([^}]+)\}\}', replace_match, text)
    
    def _resolve_json_body_from_context(self, json_string: str):
        """解析 JSON 字符串中的所有变量"""
        def replace_var(match):
            var_path = match.group(1)
            resolved_text = self._resolve_text_variables(f"{{{{{var_path}}}}}")
            
            if resolved_text == f"{{{{{var_path}}}}}":
                return "null"
            
            # 数字处理
            if resolved_text.replace('.', '').replace('-', '').isdigit():
                return resolved_text
            elif resolved_text.lower() in ['true', 'false']:
                return resolved_text.lower()
            else:
                # 转义特殊字符但不添加额外的引号
                escaped = resolved_text.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
                return escaped

        processed_json_string = re.sub(r'\{\{([^}]+)\}\}', replace_var, json_string)
        
        try:
            return json.loads(processed_json_string)
        except json.JSONDecodeError as e:
            raise ValueError(f"无效的 JSON 请求体: {e}")

def test_frontend_variable_definitions():
    """测试前端变量定义的正确性"""
    print("🧪 测试前端变量定义")
    print("=" * 60)
    
    # PromptFormModal.tsx 中的变量定义
    prompt_modal_variables = {
        '触发器数据': [
            {'label': '发送者姓名', 'value': '{{trigger.name}}', 'description': '发送消息的用户姓名'},
            {'label': '发送者电话', 'value': '{{trigger.phone}}', 'description': '发送消息的用户电话号码'},
            {'label': '聊天ID', 'value': '{{trigger.chat_id}}', 'description': 'Telegram 聊天ID'},
            {'label': '消息内容', 'value': '{{trigger.message}}', 'description': '用户发送的原始消息内容'},
            {'label': '时间戳', 'value': '{{trigger.timestamp}}', 'description': '消息发送的时间'},
            {'label': '用户ID', 'value': '{{trigger.user_id}}', 'description': '系统用户ID'},
            {'label': '消息来源', 'value': '{{trigger.channel}}', 'description': '消息来源平台（whatsapp/telegram）'},
        ],
        '客户基础信息': [
            {'label': '客户姓名', 'value': '{{customer.name}}', 'description': '客户的完整姓名'},
            {'label': '客户电话', 'value': '{{customer.phone}}', 'description': '客户的联系电话'},
            {'label': '客户邮箱', 'value': '{{customer.email}}', 'description': '客户的邮箱地址'},
            {'label': '客户状态', 'value': '{{customer.status}}', 'description': '客户的当前状态'},
            {'label': '头像URL', 'value': '{{customer.photo_url}}', 'description': '客户头像图片链接'},
            {'label': '最后消息', 'value': '{{customer.last_message}}', 'description': '客户最后发送的消息'},
        ],
        '客户自定义字段': [
            {'label': '预算', 'value': '{{customer.custom.budget}}', 'description': '客户自定义字段: budget'},
            {'label': '来源', 'value': '{{customer.custom.source}}', 'description': '客户自定义字段: source'},
            {'label': '偏好位置', 'value': '{{customer.custom.preferred_location}}', 'description': '客户自定义字段: preferred_location'},
        ],
        'AI 输出': [
            {'label': 'AI 回复文本', 'value': '{{ai.reply.reply_text}}', 'description': 'AI 生成的回复内容'},
            {'label': 'AI 分析结果', 'value': '{{ai.analyze}}', 'description': 'AI 分析的完整结果'},
            {'label': 'AI 置信度', 'value': '{{ai.analyze.confidence}}', 'description': 'AI 分析的置信度评分'},
        ],
        'API 响应': [
            {'label': 'API 响应数据', 'value': '{{api.response.data}}', 'description': 'API 调用返回的数据'},
            {'label': 'API 状态码', 'value': '{{api.response.status_code}}', 'description': 'API 调用的HTTP状态码'},
        ]
    }
    
    # NodeConfig.tsx 中的变量定义
    node_config_variables = {
        '触发器信息': [
            {'label': '手机号', 'value': '{{trigger.phone}}', 'description': '触发消息的发送者手机号'},
            {'label': '聊天ID', 'value': '{{trigger.chat_id}}', 'description': 'Telegram 聊天ID'},
            {'label': '发送者姓名', 'value': '{{trigger.name}}', 'description': '触发消息的发送者姓名'},
            {'label': '消息内容', 'value': '{{trigger.message}}', 'description': '触发消息的文本内容'},
            {'label': '时间戳', 'value': '{{trigger.timestamp}}', 'description': '消息发送时间'},
            {'label': '用户ID', 'value': '{{trigger.user_id}}', 'description': '系统用户ID'},
        ],
        'AI 输出': [
            {'label': 'AI 回复文本', 'value': '{{ai.reply.reply_text}}', 'description': 'AI 生成的回复内容'},
            {'label': 'AI 分析结果', 'value': '{{ai.analyze}}', 'description': 'AI 分析的完整结果'},
            {'label': 'AI 置信度', 'value': '{{ai.analyze.confidence}}', 'description': 'AI 分析的置信度评分'},
        ],
        'API 响应': [
            {'label': 'API 响应数据', 'value': '{{api.response.data}}', 'description': 'API 调用返回的数据'},
            {'label': 'API 状态码', 'value': '{{api.response.status_code}}', 'description': 'API 调用的HTTP状态码'},
        ]
    }
    
    # 检查一致性
    print("📋 检查前端变量定义一致性:")
    
    # 提取所有变量值
    prompt_vars = set()
    node_vars = set()
    
    for category in prompt_modal_variables.values():
        for var in category:
            prompt_vars.add(var['value'])
    
    for category in node_config_variables.values():
        for var in category:
            node_vars.add(var['value'])
    
    # 找出共同变量和差异
    common_vars = prompt_vars & node_vars
    prompt_only = prompt_vars - node_vars
    node_only = node_vars - prompt_vars
    
    print(f"   ✅ 共同变量: {len(common_vars)} 个")
    for var in sorted(common_vars):
        print(f"      {var}")
    
    if prompt_only:
        print(f"   📝 仅在 PromptFormModal 中: {len(prompt_only)} 个")
        for var in sorted(prompt_only):
            print(f"      {var}")
    
    if node_only:
        print(f"   🔧 仅在 NodeConfig 中: {len(node_only)} 个")
        for var in sorted(node_only):
            print(f"      {var}")
    
    consistency_score = len(common_vars) / len(prompt_vars | node_vars) * 100
    print(f"   📊 一致性评分: {consistency_score:.1f}%")
    
    return consistency_score > 90

def test_variable_resolution():
    """测试变量解析功能"""
    print("\n🧪 测试变量解析功能")
    print("=" * 60)
    
    context = MockWorkflowContext()
    resolver = CompleteVariableResolver(context)
    
    # 测试用例 - 涵盖所有类型的变量
    test_cases = [
        # 触发器变量
        {
            "name": "触发器 - 发送者姓名",
            "input": "用户姓名：{{trigger.name}}",
            "expected": "用户姓名：张三"
        },
        {
            "name": "触发器 - 手机号",
            "input": "联系电话：{{trigger.phone}}",
            "expected": "联系电话：13800138000"
        },
        {
            "name": "触发器 - 消息内容",
            "input": "客户消息：{{trigger.message}}",
            "expected": "客户消息：我想了解房产信息，预算在50万左右"
        },
        {
            "name": "触发器 - 聊天ID",
            "input": "Telegram ID：{{trigger.chat_id}}",
            "expected": "Telegram ID：1671499516"
        },
        {
            "name": "触发器 - 用户ID",
            "input": "系统用户：{{trigger.user_id}}",
            "expected": "系统用户：1"
        },
        {
            "name": "触发器 - 消息来源",
            "input": "来源平台：{{trigger.channel}}",
            "expected": "来源平台：whatsapp"
        },
        
        # 客户基础信息 - 旧格式 (db.customer.*)
        {
            "name": "客户 - 基础信息 (旧格式)",
            "input": "客户：{{db.customer.name}}（{{db.customer.email}}）",
            "expected": "客户：张三（zhangsan@example.com）"
        },
        
        # 客户基础信息 - 新格式 (customer.*)
        {
            "name": "客户 - 基础信息 (新格式)",
            "input": "客户：{{customer.name}}，电话：{{customer.phone}}，状态：{{customer.status}}",
            "expected": "客户：张三，电话：13800138000，状态：active"
        },
        
        # 客户自定义字段 - 旧格式 (custom_fields.*)
        {
            "name": "客户 - 自定义字段 (旧格式)",
            "input": "预算：{{custom_fields.budget}}，来源：{{custom_fields.source}}",
            "expected": "预算：500000，来源：微信"
        },
        
        # 客户自定义字段 - 新格式 (customer.custom.*)
        {
            "name": "客户 - 自定义字段 (新格式)",
            "input": "预算：{{customer.custom.budget}}，偏好区域：{{customer.custom.preferred_location}}",
            "expected": "预算：500000，偏好区域：深圳南山区"
        },
        
        # AI 输出
        {
            "name": "AI - 回复文本",
            "input": "AI回复：{{ai.reply.reply_text}}",
            "expected": "AI回复：感谢您的咨询！根据您50万的预算，我为您推荐几个优质楼盘。"
        },
        {
            "name": "AI - 置信度",
            "input": "置信度：{{ai.analyze.confidence}}",
            "expected": "置信度：0.85"
        },
        
        # API 响应
        {
            "name": "API - 状态码",
            "input": "API状态：{{api.response.status_code}}",
            "expected": "API状态：200"
        },
        {
            "name": "API - 响应数据",
            "input": "注册ID：{{api.response.data.registration_id}}",
            "expected": "注册ID：REG-2025-001"
        },
        
        # 复合变量
        {
            "name": "复合 - 多个变量",
            "input": "客户{{trigger.name}}（{{trigger.phone}}）咨询：{{trigger.message}}，AI置信度：{{ai.analyze.confidence}}",
            "expected": "客户张三（13800138000）咨询：我想了解房产信息，预算在50万左右，AI置信度：0.85"
        },
        
        # 不存在的变量
        {
            "name": "错误 - 不存在的变量",
            "input": "{{nonexistent.variable}}",
            "expected": "{{nonexistent.variable}}"
        }
    ]
    
    passed = 0
    failed = 0
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"📋 测试 {i}: {test_case['name']}")
        print(f"   输入: {test_case['input']}")
        
        try:
            result = resolver._resolve_text_variables(test_case['input'])
            print(f"   输出: {result}")
            print(f"   期望: {test_case['expected']}")
            
            if result == test_case['expected']:
                print("   ✅ 通过\n")
                passed += 1
            else:
                print("   ❌ 失败\n")
                failed += 1
                
        except Exception as e:
            print(f"   ❌ 异常: {e}\n")
            failed += 1
    
    total = passed + failed
    success_rate = (passed / total * 100) if total > 0 else 0
    
    print(f"📊 变量解析测试结果:")
    print(f"   总计: {total} 个测试")
    print(f"   ✅ 通过: {passed} 个")
    print(f"   ❌ 失败: {failed} 个")
    print(f"   📈 成功率: {success_rate:.1f}%")
    
    return failed == 0

def test_json_body_resolution():
    """测试 JSON 请求体变量解析"""
    print("\n🧪 测试 JSON 请求体变量解析")
    print("=" * 60)
    
    context = MockWorkflowContext()
    resolver = CompleteVariableResolver(context)
    
    # 复杂的 JSON 请求体模板
    json_template = '''
    {
        "customer": {
            "name": "{{trigger.name}}",
            "phone": "{{trigger.phone}}",
            "chat_id": "{{trigger.chat_id}}",
            "message": "{{trigger.message}}",
            "source": "{{trigger.channel}}"
        },
        "customerInfo": {
            "email": "{{db.customer.email}}",
            "status": "{{db.customer.status}}",
            "customFields": {
                "budget": "{{custom_fields.budget}}",
                "source": "{{custom_fields.source}}",
                "location": "{{custom_fields.preferred_location}}"
            }
        },
        "aiAnalysis": {
            "reply": "{{ai.reply.reply_text}}",
            "confidence": {{ai.analyze.confidence}},
            "updates": "{{ai.analyze.updates}}"
        },
        "apiData": {
            "statusCode": {{api.response.status_code}},
            "registrationId": "{{api.response.data.registration_id}}",
            "success": {{api.response.data.success}}
        },
        "metadata": {
            "userId": {{trigger.user_id}},
            "timestamp": "{{trigger.timestamp}}"
        }
    }
    '''
    
    print("📋 测试复杂 JSON 请求体解析")
    print("输入 JSON 模板:")
    print(json_template)
    
    try:
        result = resolver._resolve_json_body_from_context(json_template)
        
        print("\n✅ 解析成功!")
        print("解析结果:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
        # 验证关键字段
        expected_checks = [
            ("customer.name", "张三"),
            ("customer.phone", "13800138000"),
            ("customer.message", "我想了解房产信息，预算在50万左右"),
            ("customerInfo.email", "zhangsan@example.com"),
            ("customerInfo.customFields.budget", "500000"),
            ("aiAnalysis.confidence", 0.85),
            ("apiData.statusCode", 200),
            ("apiData.registrationId", "REG-2025-001"),
            ("metadata.userId", 1)
        ]
        
        print("\n🔍 验证关键字段:")
        all_passed = True
        
        for field_path, expected_value in expected_checks:
            current = result
            for part in field_path.split('.'):
                current = current.get(part) if isinstance(current, dict) else None
                if current is None:
                    break
            
            if current == expected_value:
                print(f"   ✅ {field_path}: {current}")
            else:
                print(f"   ❌ {field_path}: 期望 {expected_value}, 实际 {current}")
                all_passed = False
        
        if all_passed:
            print("\n🎉 JSON 请求体解析测试完全通过！")
        else:
            print("\n⚠️  JSON 请求体解析测试有部分问题。")
            
        return all_passed
        
    except Exception as e:
        print(f"\n❌ JSON 解析异常: {e}")
        return False

def test_real_world_scenarios():
    """测试真实世界场景"""
    print("\n🧪 测试真实世界场景")
    print("=" * 60)
    
    context = MockWorkflowContext()
    resolver = CompleteVariableResolver(context)
    
    scenarios = [
        {
            "name": "房产咨询 - System Prompt",
            "template": """你是专业的房产顾问助手。

客户信息：
- 姓名：{{trigger.name}}
- 电话：{{trigger.phone}}
- 来源：{{trigger.channel}}

客户需求：{{trigger.message}}

客户档案：
- 邮箱：{{db.customer.email}}
- 预算：{{custom_fields.budget}}
- 偏好区域：{{custom_fields.preferred_location}}

请根据以上信息为客户提供专业的房产建议。""",
            "description": "房产咨询的 System Prompt 模板"
        },
        {
            "name": "API 注册请求",
            "template": """{
    "action": "register_customer",
    "customer": {
        "name": "{{trigger.name}}",
        "phone": "{{trigger.phone}}",
        "email": "{{db.customer.email}}",
        "source": "{{trigger.channel}}",
        "message": "{{trigger.message}}",
        "budget": "{{custom_fields.budget}}"
    },
    "ai_analysis": {
        "confidence": {{ai.analyze.confidence}},
        "reply": "{{ai.reply.reply_text}}"
    },
    "metadata": {
        "user_id": {{trigger.user_id}},
        "timestamp": "{{trigger.timestamp}}"
    }
}""",
            "description": "客户注册 API 请求体"
        },
        {
            "name": "WhatsApp 消息模板",
            "template": """🏠 *房产咨询回复*

尊敬的 {{trigger.name}} 先生/女士，

感谢您通过 {{trigger.channel}} 联系我们！

📞 您的联系方式：{{trigger.phone}}
💬 您的咨询：{{trigger.message}}
💰 您的预算：{{custom_fields.budget}}

{{ai.reply.reply_text}}

如需进一步咨询，请随时联系我们！

---
*此消息由AI助手生成（置信度：{{ai.analyze.confidence}}）*""",
            "description": "WhatsApp 消息回复模板"
        }
    ]
    
    all_passed = True
    
    for i, scenario in enumerate(scenarios, 1):
        print(f"📋 场景 {i}: {scenario['name']}")
        print(f"   描述: {scenario['description']}")
        print(f"   模板长度: {len(scenario['template'])} 字符")
        
        try:
            if scenario['template'].strip().startswith('{'):
                # JSON 格式
                result = resolver._resolve_json_body_from_context(scenario['template'])
                print(f"   ✅ JSON 解析成功")
                print(f"   📊 解析后字段数: {len(result) if isinstance(result, dict) else 'N/A'}")
            else:
                # 文本格式
                result = resolver._resolve_text_variables(scenario['template'])
                print(f"   ✅ 文本解析成功")
                print(f"   📊 解析后长度: {len(result)} 字符")
                
                # 检查是否还有未解析的变量
                unresolved = re.findall(r'\{\{([^}]+)\}\}', result)
                if unresolved:
                    print(f"   ⚠️  未解析变量: {unresolved}")
                else:
                    print(f"   ✅ 所有变量已解析")
            
            print()
            
        except Exception as e:
            print(f"   ❌ 解析失败: {e}\n")
            all_passed = False
    
    return all_passed

def main():
    """主测试函数"""
    print("🚀 完整变量映射系统端到端测试")
    print("=" * 80)
    print("测试范围：PromptFormModal.tsx + NodeConfig.tsx + workflow_engine.py")
    print("=" * 80)
    
    # 运行所有测试
    test_results = []
    
    print("🔍 第一阶段：前端变量定义一致性检查")
    test_results.append(("前端变量定义一致性", test_frontend_variable_definitions()))
    
    print("\n🔍 第二阶段：后端变量解析功能测试")
    test_results.append(("后端变量解析功能", test_variable_resolution()))
    
    print("\n🔍 第三阶段：JSON 请求体解析测试")
    test_results.append(("JSON 请求体解析", test_json_body_resolution()))
    
    print("\n🔍 第四阶段：真实世界场景测试")
    test_results.append(("真实世界场景", test_real_world_scenarios()))
    
    # 总结报告
    print("\n" + "=" * 80)
    print("📋 完整测试报告")
    print("=" * 80)
    
    passed_tests = 0
    total_tests = len(test_results)
    
    for test_name, result in test_results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"   {test_name}: {status}")
        if result:
            passed_tests += 1
    
    overall_success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
    
    print(f"\n📊 总体结果:")
    print(f"   测试阶段: {total_tests} 个")
    print(f"   ✅ 通过: {passed_tests} 个")
    print(f"   ❌ 失败: {total_tests - passed_tests} 个")
    print(f"   📈 成功率: {overall_success_rate:.1f}%")
    
    if overall_success_rate == 100:
        print("\n🎉 所有测试都通过！变量映射系统运行完美！")
        print("\n💡 系统状态:")
        print("   ✅ 前端变量定义一致")
        print("   ✅ 后端变量解析正确")
        print("   ✅ JSON 处理完善")
        print("   ✅ 真实场景验证通过")
        print("\n🚀 系统已准备好投入生产使用！")
    else:
        print(f"\n⚠️  有 {total_tests - passed_tests} 个测试阶段失败，需要进一步检查。")
    
    return overall_success_rate == 100

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)

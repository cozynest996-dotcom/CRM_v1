#!/usr/bin/env python3
"""
测试 CustomAPIProcessor 的变量映射功能
直接测试变量解析逻辑，避免复杂的依赖
"""

import re
import json
from datetime import datetime

class MockCustomer:
    def __init__(self):
        self.id = "97e0194b-9c60-4c20-9109-73b7d5b29ff4"
        self.name = "张三"
        self.phone = "13800138000"
        self.email = "zhangsan@example.com"
        self.status = "active"
        self.user_id = 1
        self.custom_fields = {
            "budget": "500000",
            "source": "微信",
            "notes": "VIP客户"
        }

class MockWorkflowContext:
    def __init__(self):
        self.variables = {}
        self.db = {}
        self.ai = {}
        
        # 模拟触发器数据
        self.variables["trigger_data"] = {
            "trigger_type": "message",
            "channel": "telegram", 
            "phone": "13800138000",
            "chat_id": "1671499516",
            "from_id": "1671499516",
            "message": "我想了解房产信息",
            "name": "张三",
            "timestamp": "2025-10-18T15:18:33.845651",
            "user_id": 1
        }
        
        # 模拟客户数据
        self.db["customer"] = MockCustomer()
        
        # 模拟 AI 输出数据
        self.ai = {
            "reply": {
                "reply_text": "感谢您的咨询，我们会为您提供专业的房产建议。",
                "media_uuids": ["f59c9185-f77f-4d42-a791-fba127bbbaa8"]
            },
            "analyze": {
                "confidence": 0.85,
                "updates": {
                    "customer.custom.budget": 500000
                }
            }
        }
        
        # 模拟 API 响应数据
        self.variables["api.response"] = {
            "status_code": 200,
            "data": {
                "success": True,
                "user_id": "12345",
                "message": "注册成功"
            }
        }
    
    def get(self, key, default=None):
        return self.variables.get(key, default)
    
    def set(self, key, value):
        self.variables[key] = value

class CustomAPIVariableResolver:
    """提取的变量解析器，模拟 CustomAPIProcessor 的逻辑"""
    
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
            
            # 尝试从各种上下文中解析变量
            # 1. 优先尝试 'trigger' 相关变量
            if var_path.startswith("trigger."):
                trigger_data = self.context.get("trigger_data", {})
                value = get_nested_value(trigger_data, var_path.split('.')[1:])
                if value is not None:
                    return str(value)
            
            # 2. 尝试 'db.customer' 相关变量
            elif var_path.startswith("db.customer."):
                customer = self.context.db.get("customer")
                if customer:
                    field_name = var_path.replace("db.customer.", "")
                    if hasattr(customer, field_name):
                        value = getattr(customer, field_name)
                        return str(value) if value is not None else ""
            
            # 3. 尝试 'custom_fields' 相关变量
            elif var_path.startswith("custom_fields."):
                customer = self.context.db.get("customer")
                if customer and hasattr(customer, 'custom_fields'):
                    field_name = var_path.replace("custom_fields.", "")
                    custom_fields = customer.custom_fields or {}
                    value = custom_fields.get(field_name)
                    return str(value) if value is not None else ""
            
            # 4. 尝试从 AI 输出中解析
            elif var_path.startswith("ai."):
                ai_data = self.context.ai
                value = get_nested_value(ai_data, var_path.split('.')[1:])
                if value is not None:
                    return str(value)
            
            # 5. 尝试从 API 响应中解析
            elif var_path.startswith("api.response."):
                api_data = self.context.get("api.response", {})
                value = get_nested_value(api_data, var_path.split('.')[2:])  # 跳过 'api.response'
                if value is not None:
                    return str(value)
            elif var_path.startswith("api."):
                # 处理其他 api.* 变量
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

        # 使用正则表达式替换所有 {{variable}} 格式的变量
        result = re.sub(r'\{\{([^}]+)\}\}', replace_match, text)
        return result
    
    def _resolve_json_body_from_context(self, json_string: str):
        """解析 JSON 字符串中的所有变量"""
        def replace_var(match):
            var_path = match.group(1)
            # 使用文本变量解析方法获取原始值
            resolved_text = self._resolve_text_variables(f"{{{{{var_path}}}}}")
            
            # 如果变量没有被解析（仍然是 {{var}} 格式），返回 null
            if resolved_text == f"{{{{{var_path}}}}}":
                return "null"
            
            # 尝试将解析后的文本转换为合适的 JSON 值
            try:
                # 尝试解析为数字
                if resolved_text.replace('.', '').replace('-', '').isdigit():
                    if '.' in resolved_text:
                        return resolved_text  # 直接返回数字字符串，不加引号
                    else:
                        return resolved_text  # 直接返回数字字符串，不加引号
                # 尝试解析为布尔值
                elif resolved_text.lower() in ['true', 'false']:
                    return resolved_text.lower()
                else:
                    # 不使用 json.dumps，直接返回转义后的字符串
                    # 转义特殊字符但不添加额外的引号
                    escaped = resolved_text.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
                    return escaped
            except:
                # 如果转换失败，作为字符串处理
                escaped = str(resolved_text).replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
                return escaped

        # 首先尝试解析整个 JSON 字符串中的变量
        processed_json_string = re.sub(r'\{\{([^}]+)\}\}', replace_var, json_string)
        
        try:
            # 重新解析为 JSON 对象
            return json.loads(processed_json_string)
        except json.JSONDecodeError as e:
            raise ValueError(f"无效的 JSON 请求体: {e}")
    
    def _resolve_variable_from_context(self, variable_path: str, default=None):
        """解析上下文中的变量"""
        try:
            # 1. 直接访问 context.variables (最常用)
            if variable_path in self.context.variables:
                return self.context.variables.get(variable_path)

            # 2. 深度解析带点的路径 (如 'trigger.channel', 'ai.reply.reply_text')
            parts = variable_path.split('.')
            current_data = self.context.variables
            for part in parts:
                if isinstance(current_data, dict):
                    current_data = current_data.get(part)
                elif hasattr(current_data, part):
                    current_data = getattr(current_data, part)
                else:
                    return default # 路径不存在
            return current_data
        except Exception:
            return default

def test_variable_resolution():
    """测试变量解析功能"""
    print("🧪 开始测试 CustomAPIProcessor 变量解析功能\n")
    
    # 创建模拟对象
    context = MockWorkflowContext()
    resolver = CustomAPIVariableResolver(context)
    
    # 测试用例
    test_cases = [
        {
            "name": "触发器变量 - 手机号",
            "input": "{{trigger.phone}}",
            "expected": "13800138000"
        },
        {
            "name": "触发器变量 - 消息内容", 
            "input": "{{trigger.message}}",
            "expected": "我想了解房产信息"
        },
        {
            "name": "触发器变量 - 发送者姓名",
            "input": "{{trigger.name}}",
            "expected": "张三"
        },
        {
            "name": "触发器变量 - 聊天ID",
            "input": "{{trigger.chat_id}}",
            "expected": "1671499516"
        },
        {
            "name": "触发器变量 - 用户ID",
            "input": "{{trigger.user_id}}",
            "expected": "1"
        },
        {
            "name": "客户基础信息 - 客户姓名",
            "input": "{{db.customer.name}}",
            "expected": "张三"
        },
        {
            "name": "客户基础信息 - 客户邮箱",
            "input": "{{db.customer.email}}",
            "expected": "zhangsan@example.com"
        },
        {
            "name": "客户自定义字段 - 预算",
            "input": "{{custom_fields.budget}}",
            "expected": "500000"
        },
        {
            "name": "客户自定义字段 - 来源",
            "input": "{{custom_fields.source}}",
            "expected": "微信"
        },
        {
            "name": "AI 输出 - 回复文本",
            "input": "{{ai.reply.reply_text}}",
            "expected": "感谢您的咨询，我们会为您提供专业的房产建议。"
        },
        {
            "name": "AI 输出 - 置信度",
            "input": "{{ai.analyze.confidence}}",
            "expected": "0.85"
        },
        {
            "name": "API 响应 - 状态码",
            "input": "{{api.response.status_code}}",
            "expected": "200"
        },
        {
            "name": "API 响应 - 数据",
            "input": "{{api.response.data.user_id}}",
            "expected": "12345"
        },
        {
            "name": "复合文本 - 多个变量",
            "input": "用户{{trigger.name}}({{trigger.phone}})发送消息：{{trigger.message}}",
            "expected": "用户张三(13800138000)发送消息：我想了解房产信息"
        },
        {
            "name": "JSON 格式 - 完整请求体",
            "input": '{"name": "{{db.customer.name}}", "phone": "{{trigger.phone}}", "message": "{{trigger.message}}", "budget": "{{custom_fields.budget}}"}',
            "expected": '{"name": "张三", "phone": "13800138000", "message": "我想了解房产信息", "budget": "500000"}'
        }
    ]
    
    # 执行测试
    passed = 0
    failed = 0
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"📋 测试 {i}: {test_case['name']}")
        print(f"   输入: {test_case['input']}")
        
        try:
            # 调用变量解析方法
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
    
    # 输出测试结果
    total = passed + failed
    print("=" * 50)
    print(f"🎯 测试完成!")
    print(f"📊 总计: {total} 个测试")
    print(f"✅ 通过: {passed} 个")
    print(f"❌ 失败: {failed} 个")
    print(f"📈 成功率: {(passed/total*100):.1f}%")
    
    if failed == 0:
        print("\n🎉 所有测试都通过了！变量映射功能正常工作。")
    else:
        print(f"\n⚠️  有 {failed} 个测试失败，需要检查变量映射逻辑。")
    
    return failed == 0

def test_json_body_resolution():
    """测试 JSON 请求体的变量解析"""
    print("\n🧪 测试 JSON 请求体变量解析\n")
    
    context = MockWorkflowContext()
    resolver = CustomAPIVariableResolver(context)
    
    # 测试复杂的 JSON 请求体
    json_body = '''
    {
        "referenceCode": "{{trigger.message}}",
        "phoneNumber": "{{trigger.phone}}",
        "customerInfo": {
            "name": "{{db.customer.name}}",
            "email": "{{db.customer.email}}",
            "customFields": {
                "budget": "{{custom_fields.budget}}",
                "source": "{{custom_fields.source}}"
            }
        },
        "aiAnalysis": {
            "confidence": {{ai.analyze.confidence}},
            "reply": "{{ai.reply.reply_text}}"
        },
        "metadata": {
            "userId": {{trigger.user_id}},
            "timestamp": "{{trigger.timestamp}}"
        }
    }
    '''
    
    print("📋 测试复杂 JSON 请求体解析")
    print("输入 JSON:")
    print(json_body)
    
    try:
        # 解析 JSON 请求体
        result = resolver._resolve_json_body_from_context(json_body)
        
        print("\n解析结果:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
        # 验证关键字段
        expected_checks = [
            ("referenceCode", "我想了解房产信息"),
            ("phoneNumber", "13800138000"),
            ("customerInfo.name", "张三"),
            ("customerInfo.email", "zhangsan@example.com"),
            ("customerInfo.customFields.budget", "500000"),
            ("aiAnalysis.confidence", 0.85),
            ("metadata.userId", 1)
        ]
        
        print("\n🔍 验证关键字段:")
        all_passed = True
        
        for field_path, expected_value in expected_checks:
            # 解析嵌套字段路径
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
            print("\n🎉 JSON 请求体解析测试通过！")
        else:
            print("\n⚠️  JSON 请求体解析测试有问题。")
            
        return all_passed
        
    except Exception as e:
        print(f"\n❌ JSON 解析异常: {e}")
        return False

def test_edge_cases():
    """测试边缘情况"""
    print("\n🧪 测试边缘情况\n")
    
    context = MockWorkflowContext()
    resolver = CustomAPIVariableResolver(context)
    
    edge_cases = [
        {
            "name": "不存在的变量",
            "input": "{{nonexistent.variable}}",
            "expected": "{{nonexistent.variable}}"  # 应该保持原样
        },
        {
            "name": "空字符串",
            "input": "",
            "expected": ""
        },
        {
            "name": "没有变量的普通文本",
            "input": "这是普通文本",
            "expected": "这是普通文本"
        },
        {
            "name": "格式错误的变量",
            "input": "{{trigger.phone}",  # 缺少右括号
            "expected": "{{trigger.phone}"  # 应该保持原样
        },
        {
            "name": "嵌套变量（不支持）",
            "input": "{{trigger.{{nested}}}}",
            "expected": "{{trigger.{{nested}}}}"  # 应该保持原样
        }
    ]
    
    passed = 0
    failed = 0
    
    for i, test_case in enumerate(edge_cases, 1):
        print(f"📋 边缘测试 {i}: {test_case['name']}")
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
    print(f"🎯 边缘情况测试完成: {passed}/{total} 通过")
    return failed == 0

if __name__ == "__main__":
    print("🚀 CustomAPIProcessor 变量映射测试")
    print("=" * 50)
    
    # 运行所有测试
    test1_passed = test_variable_resolution()
    test2_passed = test_json_body_resolution() 
    test3_passed = test_edge_cases()
    
    # 总结
    print("\n" + "=" * 50)
    print("📋 最终测试报告:")
    print(f"   基础变量解析: {'✅ 通过' if test1_passed else '❌ 失败'}")
    print(f"   JSON 请求体解析: {'✅ 通过' if test2_passed else '❌ 失败'}")
    print(f"   边缘情况测试: {'✅ 通过' if test3_passed else '❌ 失败'}")
    
    if all([test1_passed, test2_passed, test3_passed]):
        print("\n🎉 所有测试都通过！CustomAPIProcessor 变量映射功能正常工作。")
        print("\n💡 建议:")
        print("   1. 在前端 NodeConfig.tsx 中使用这些变量格式")
        print("   2. 确保用户知道正确的变量语法：{{trigger.message}} 而不是 {{trigger.text}}")
        print("   3. 提供变量选择器帮助用户选择正确的变量")
        exit(0)
    else:
        print("\n⚠️  部分测试失败，需要检查 CustomAPIProcessor 的变量映射逻辑。")
        exit(1)

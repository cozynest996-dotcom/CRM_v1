#!/usr/bin/env python3
"""
只测试 JSON 解析功能
"""

import re
import json

class MockCustomer:
    def __init__(self):
        self.name = "张三"
        self.email = "zhangsan@example.com"
        self.custom_fields = {"budget": "500000", "source": "微信"}

class MockWorkflowContext:
    def __init__(self):
        self.variables = {
            "trigger_data": {
                "phone": "13800138000",
                "message": "我想了解房产信息",
                "name": "张三",
                "user_id": 1,
                "timestamp": "2025-10-18T15:18:33.845651"
            }
        }
        self.db = {"customer": MockCustomer()}
        self.ai = {
            "reply": {"reply_text": "感谢您的咨询"},
            "analyze": {"confidence": 0.85}
        }
    
    def get(self, key, default=None):
        return self.variables.get(key, default)

class SimpleVariableResolver:
    def __init__(self, context):
        self.context = context
    
    def _resolve_text_variables(self, text: str) -> str:
        """简化的变量解析"""
        def get_nested_value(data, path_parts):
            current = data
            for part in path_parts:
                if isinstance(current, dict) and part in current:
                    current = current[part]
                elif hasattr(current, part):
                    current = getattr(current, part)
                else:
                    return None
            return current

        def replace_match(match):
            var_path = match.group(1).strip()
            
            if var_path.startswith("trigger."):
                trigger_data = self.context.get("trigger_data", {})
                value = get_nested_value(trigger_data, var_path.split('.')[1:])
                if value is not None:
                    return str(value)
            elif var_path.startswith("db.customer."):
                customer = self.context.db.get("customer")
                if customer:
                    field_name = var_path.replace("db.customer.", "")
                    if hasattr(customer, field_name):
                        value = getattr(customer, field_name)
                        return str(value) if value is not None else ""
            elif var_path.startswith("custom_fields."):
                customer = self.context.db.get("customer")
                if customer and hasattr(customer, 'custom_fields'):
                    field_name = var_path.replace("custom_fields.", "")
                    custom_fields = customer.custom_fields or {}
                    value = custom_fields.get(field_name)
                    return str(value) if value is not None else ""
            elif var_path.startswith("ai."):
                ai_data = self.context.ai
                value = get_nested_value(ai_data, var_path.split('.')[1:])
                if value is not None:
                    return str(value)
            
            return f"{{{{{var_path}}}}}"

        return re.sub(r'\{\{([^}]+)\}\}', replace_match, text)
    
    def _resolve_json_body_from_context(self, json_string: str):
        """解析 JSON 字符串中的所有变量"""
        def replace_var(match):
            var_path = match.group(1)
            resolved_text = self._resolve_text_variables(f"{{{{{var_path}}}}}")
            
            print(f"  变量 {var_path} -> {resolved_text}")
            
            if resolved_text == f"{{{{{var_path}}}}}":
                return "null"
            
            # 数字处理
            if resolved_text.replace('.', '').replace('-', '').isdigit():
                return resolved_text
            elif resolved_text.lower() in ['true', 'false']:
                return resolved_text.lower()
            else:
                # 不使用 json.dumps，直接返回转义后的字符串
                # 转义特殊字符但不添加额外的引号
                escaped = resolved_text.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r').replace('\t', '\\t')
                return escaped

        print("🔍 开始解析 JSON 变量:")
        processed_json_string = re.sub(r'\{\{([^}]+)\}\}', replace_var, json_string)
        
        print(f"\n🔍 处理后的 JSON:")
        print(processed_json_string)
        
        try:
            return json.loads(processed_json_string)
        except json.JSONDecodeError as e:
            print(f"\n❌ JSON 解析错误: {e}")
            print(f"错误位置: {e.pos}")
            if hasattr(e, 'lineno'):
                print(f"错误行号: {e.lineno}")
            return None

def test_json_parsing():
    context = MockWorkflowContext()
    resolver = SimpleVariableResolver(context)
    
    json_body = '''{
        "referenceCode": "{{trigger.message}}",
        "phoneNumber": "{{trigger.phone}}",
        "customerInfo": {
            "name": "{{db.customer.name}}",
            "email": "{{db.customer.email}}"
        },
        "confidence": {{ai.analyze.confidence}},
        "userId": {{trigger.user_id}}
    }'''
    
    print("📋 测试 JSON 解析")
    print("原始 JSON:")
    print(json_body)
    print()
    
    result = resolver._resolve_json_body_from_context(json_body)
    
    if result:
        print("\n✅ 解析成功:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print("\n❌ 解析失败")

if __name__ == "__main__":
    test_json_parsing()

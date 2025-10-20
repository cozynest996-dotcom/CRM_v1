#!/usr/bin/env python3
import requests
import json

# 工作流配置
workflow = {
    "name": "测试CustomAPI智能变量",
    "description": "测试CustomAPI节点的智能变量功能",
    "nodes": [
        {
            "id": "trigger_test_api",
            "type": "MessageTrigger",
            "position": {"x": 100, "y": 100},
            "data": {
                "triggerType": "message",
                "config": {
                    "channel": "whatsapp",
                    "match_key": "phone"
                },
                "label": "消息触发器",
                "description": "等待WhatsApp消息"
            }
        },
        {
            "id": "customapi_test",
            "type": "CustomAPI",
            "position": {"x": 400, "y": 100},
            "data": {
                "label": "测试API调用",
                "description": "调用httpbin测试智能变量",
                "method": "POST",
                "url": "https://httpbin.org/post",
                "headers": {
                    "Content-Type": "application/json"
                },
                "body": '{"customer_name": "{{var_name}}", "phone_last_4": "{{var_phone}}", "raw_phone": "{{trigger.phone}}", "raw_name": "{{trigger.name}}"}',
                "smart_variables": {
                    "var_name": {
                        "display_name": "客户姓名（首字）",
                        "source": "{{trigger.name}}",
                        "transformer": "First Word",
                        "description": "提取客户名字的第一个词"
                    },
                    "var_phone": {
                        "display_name": "电话后4位",
                        "source": "{{trigger.phone}}",
                        "transformer": "Last 4 Digits",
                        "description": "提取电话号码的后4位"
                    }
                },
                "auth": {},
                "timeout": 10,
                "retry_count": 0,
                "response_mapping": {
                    "data_field": "json"
                }
            }
        },
        {
            "id": "template_result",
            "type": "Template",
            "position": {"x": 700, "y": 100},
            "data": {
                "label": "显示结果",
                "description": "显示API调用结果",
                "message_templates": [
                    {
                        "id": 1,
                        "content": "✅ API测试成功！\n\n智能变量结果：\n客户名: {{var_name}}\n电话后4位: {{var_phone}}\n\n原始数据：\n姓名: {{trigger.name}}\n电话: {{trigger.phone}}"
                    }
                ],
                "smart_variables": {
                    "var_name": {
                        "display_name": "客户姓名（首字）",
                        "source": "{{trigger.name}}",
                        "transformer": "First Word"
                    },
                    "var_phone": {
                        "display_name": "电话后4位",
                        "source": "{{trigger.phone}}",
                        "transformer": "Last 4 Digits"
                    }
                }
            }
        },
        {
            "id": "send_result",
            "type": "SendWhatsAppMessage",
            "position": {"x": 1000, "y": 100},
            "data": {
                "label": "发送结果",
                "description": "发送测试结果"
            }
        }
    ],
    "edges": [
        {
            "id": "edge1",
            "source": "trigger_test_api",
            "target": "customapi_test",
            "sourceHandle": "out"
        },
        {
            "id": "edge2",
            "source": "customapi_test",
            "target": "template_result",
            "sourceHandle": "out"
        },
        {
            "id": "edge3",
            "source": "template_result",
            "target": "send_result",
            "sourceHandle": "out"
        }
    ],
    "is_active": True
}

# 创建工作流
url = "http://localhost:8000/api/workflows"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6Im1pbmdrdW4xOTk5QGdtYWlsLmNvbSIsImV4cCI6MTc2MTY2NjQ5OH0.qF9jZL_kqxG3FqF_bYmQxBKxDQvBZ0ZVxH_jGBqM_bE"
}

print("创建测试工作流...")
response = requests.post(url, headers=headers, json=workflow)

print(f"状态码: {response.status_code}")
print(f"响应: {json.dumps(response.json(), indent=2, ensure_ascii=False)}")

if response.status_code in [200, 201]:
    print("\n✅ 工作流创建成功!")
    print("\n📱 测试步骤:")
    print("1. 从手机发送WhatsApp消息 'test api' 到 601168208639")
    print("2. 查看backend日志: docker-compose logs -f backend")
    print("3. 你应该会收到包含智能变量解析结果的回复消息")
else:
    print(f"\n❌ 创建失败: {response.text}")



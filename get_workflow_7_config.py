import requests
import json
import os

# 从环境变量或直接设置你的JWT Token
AUTH_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoxLCJlbWFpbCI6Im1pbmdrdW4xOTk5QGdtYWlsLmNvbSIsInN1YnNjcmlwdGlvbl9wbGFuIjoiZnJlZSIsImV4cCI6MTc2MDQyODIxNSwiaWF0IjoxNzU5ODIzNDE1fQ.n2HQ7Tu2o7KSexCydeljILgzv4GMc74JJbT5TzqYP-0'
WORKFLOW_ID = 7
BASE_URL = "http://localhost:8000"

headers = {
    "Authorization": f"Bearer {AUTH_TOKEN}",
    "Content-Type": "application/json"
}

def get_workflow_config(workflow_id: int):
    url = f"{BASE_URL}/api/workflows/{workflow_id}"
    try:
        response = requests.get(url, headers=headers)
        response.raise_for_status()  # 如果请求不成功，抛出HTTPError
        return response.json()
    except requests.exceptions.HTTPError as e:
        print(f"HTTP error occurred: {e.response.status_code} - {e.response.text}")
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
    return None

if __name__ == "__main__":
    workflow_config = get_workflow_config(WORKFLOW_ID)
    if workflow_config:
        print(json.dumps(workflow_config, indent=2, ensure_ascii=False))
        # Optional: Save to a file for easier inspection
        with open(f'workflow_{WORKFLOW_ID}_config.json', 'w', encoding='utf-8') as f:
            json.dump(workflow_config, f, indent=2, ensure_ascii=False)
        print(f"Workflow {WORKFLOW_ID} configuration saved to workflow_{WORKFLOW_ID}_config.json")

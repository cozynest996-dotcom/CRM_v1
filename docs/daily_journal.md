
# 每日工作日报模板（发送给 Cursor AI）

此模板用于每天向 Cursor AI 汇报进展。请尽量简洁、要点化——AI 会根据这些信息生成总结、建议下一步动作并帮助撰写 PR 描述。

模板（请填写每一项）：

日期：YYYY-MM-DD

1) 今日完成
- 任务 1：简短描述
- 任务 2：简短描述

2) 阻塞 / 问题
- 简要描述阻塞点，包含错误信息或相关日志（如有）

3) 做出的决策
- 决策 1：简要说明理由

4) 下一步（今日 / 明日）
- 动作 1：负责人
- 动作 2：负责人

5) 修改的文件（路径）
- backend/...
- frontend/...

6) 发布说明 / 用户影响
- 短要点（例如：修复了消息重复发送 bug，影响小范围用户）

7) 给 Cursor AI 的问题（最多 1-2 个）
- 问题 1（例如：“是否建议将 SQLite 迁移到 PostgreSQL？请给出优缺点。”）

使用说明：
- 把填写好的内容直接复制粘贴到 Cursor AI 聊天窗口，或使用自动化脚本把文本发送给 AI。
- 建议正文长度控制在 400 字以内，以获得更准确的摘要与建议。

示例（示范填写）：

日期：2025-10-04

1) 今日完成
- 修复 `NodeConfig.tsx` 表头加载接口错误；使其从 `/api/customers/fields` 动态读取。
- 在 `mac_setup` 下添加 `install_deps.sh` 与 `start_servers.sh` 脚本并测试通过。

2) 阻塞 / 问题
- CI 测试中 `WorkflowEditor` 的自动保存偶发失败，日志报错未获取到 workflow ID（见 `frontend` 控制台）。

3) 做出的决策
- 先把数据库字段映射逻辑放在后端统一提供 API，避免前端硬编码字段名。

4) 下一步（今日 / 明日）
- 修复 `WorkflowEditor` 自动保存逻辑（负责人：Ming）
- 为 `Handoff` 节点实现后端 API 草案（负责人：Ming）

5) 修改的文件（路径）
- frontend/components/NodeConfig.tsx
- mac_setup/install_deps.sh

6) 发布说明 / 用户影响
- 前端用户现在能在 AI 节点选择真实的客户字段进行 LLM 数据注入；无感知回归风险。

7) 给 Cursor AI 的问题
- 我们是否应在后端统一注入 PII（姓名/电话）到模板，而不是让 LLM 直接输出？请给出建议。

备注：若需要自动化发送日报，我可以帮你编写一个简单的脚本，把 `docs/daily_journal.md` 的内容作为正文 POST 给 Cursor AI 的接口或通过本地命令行触发。




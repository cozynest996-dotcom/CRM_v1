# 🎨 前端 UI 架构（Wireframes & Spec）

> 技术栈：**Next.js + TypeScript**，样式建议 **Tailwind**（或 shadcn/ui 组件库 + lucide-react 图标）。  
> 布局基准宽度：1440×900（桌面端）。  
> 目标模块：**Dashboard / CRM / Integrations / Workflow / Reports / Settings**。

---

## 0) 设计目标与原则

- **三栏心智模型（仅 CRM）**：左（Customer Inbox）→ 中（Conversations）→ 右（Customer Details）。  
- **单一入口**：一切数据经 Backend API，前端不直连外部服务。  
- **低惊扰**：加载 Skeleton、空状态友好、错误明确可恢复。  
- **可扩展**：保留多渠道、多账号、任务与自动化入口。

---

## 1) 全局框架

### 1.1 顶部工具栏（Global Topbar）
- **元素**：  
  - 左：App Logo（点击回 Dashboard）  
  - 中：全局搜索框（支持客户名/电话/标签/消息内容）  
  - 右：通知铃铛（任务/失败重试/网关状态）、用户头像菜单（Profile、Settings、Logout）
- **状态**：  
  - 搜索框 Debounce（300ms）；  
  - 通知下拉含“按类型筛选”（任务/失败/系统）。
- **快捷键**：  
  - `/` 聚焦搜索；  
  - `g d` → Dashboard；`g c` → CRM；`g i` → Integrations；`g w` → Workflow。

### 1.2 左侧主导航（Global Sidebar）
- **顺序**：Dashboard / **CRM** / Integrations / Workflow / Reports / Settings  
- **指示**：当前页高亮；支持折叠（宽 80px）/展开（宽 200px）。  
- **WhatsApp 状态点**：在 Integrations 图标右上角显示绿色（已连接）、黄色（需扫码）、红色（断开）。

---

## 2) CRM 模块（三栏布局）

> 路由：`/crm`  
> 栅格：左 320px / 中自适应 / 右 360px（右栏仅在 CRM 出现）。

### 2.1 左栏：Customer Inbox（联系人/会话列表）
- **区域结构**：  
  1) 顶部工具条（48px 高）：  
     - 搜索输入（占满宽度，placeholder: “搜索姓名/电话/标签/消息”）  
     - 右侧：筛选按钮（popover）  
  2) Tabs：  
     - **All / My / Tagged**  
  3) 过滤器（Filters & Tags）：  
     - 状态（Collecting Info / Follow Up / Viewing / Closed …）  
     - 预算区间（slider）  
     - 地区（多选）  
     - 标签（多选，如 “高预算”“已看房”“急租”）
  4) 列表项（虚拟滚动）：
     - 头像/首字母、姓名、电话  
     - 最后一条消息 + 时间（相对时间）  
     - 状态彩色点、标签小胶囊
- **批量操作**（可选开关）：  
  - 多选后顶部浮层：发送模板 / 添加标签 / 更改状态
- **空状态**：  
  - “暂无客户，请在 Integrations → Google Sheets 导入或同步。”

**交互要点**：搜索/筛选联动；切换客户 → 中/右栏随之刷新。

---

### 2.2 中栏：Conversations（聊天会话）
- **顶部标题栏**：  
  - 左：客户名（副标题：渠道/电话）  
  - 中：渠道 Tab（WhatsApp / Email / SMS，MVP 仅 WhatsApp）  
  - 右：操作按钮  
    - 置顶/标星（会话级）  
    - 导出聊天（.txt / .csv）  
    - 更多（…）：拉黑/归档（后续）
- **消息区（虚拟列表）**：  
  - **消息类型**：文本、图片、视频、文件、系统消息（状态变更）。  
  - **气泡样式**：  
    - 入站（客户）左侧、出站（Agent/系统）右侧；  
    - 显示时间戳、已送达/已读（✓/✓✓）。  
  - **媒体**：点击图片打开 Lightbox；文件显示文件名+大小，点击下载。
  - **系统消息**（浅灰居中条）：如 “Status 从 ‘Collecting Info’ → ‘Viewing’”。
- **底部输入区（Composer）**：  
  - 文本框（多行自动增高，最大 6 行）  
  - 按钮：**发送**、附件（上传到 Drive/Storage）、模板、AI 切换  
  - 变量插入器（M2）：点击插入 `{Name}` `{Budget}` `{Status}`  
  - 快捷键：`Cmd/Ctrl + Enter` 发送；`Esc` 失焦。

**错误/保护**：  
- 夜间发送保护（22:00–09:00）→ 二次确认或排程（TimeTrigger）。  
- AI 超时 >10s → 自动回退到模板；失败弹 Toast。

---

### 2.3 右栏：Customer Details（客户详情）
**Tab 结构**：  
1) **Info**：Name / Phone / Budget / Status / 自定义字段  
2) **Notes**：笔记时间线，增删改  
3) **Tasks**：待办列表，新建/完成任务  
4) **Payments**：押金/租金记录（预留）  
5) **Timeline**：关键事件流（创建、状态更新、自动化触发）  
6) **Custom Fields**：Google Sheets 扩展列

**操作**：  
- 修改 Status → 写回 Sheet（M2）；  
- Notes/Tasks → DB 保存；  
- 右上角：**查看 Sheet 行**（跳 Google Sheets）。

---

## 3) Integrations（外部集成）

> 路由：`/integrations`

### 3.1 WhatsApp
- 状态：Ready / Need QR / Reauth Required  
- 按钮：显示二维码、重新登录  
- 最后在线：时间戳

### 3.2 Google Sheets
- 登录 Google（OAuth）  
- 选择 Sheet + Worksheet  
- 字段映射表（Sheet 列 ↔ CRM 字段）  
- 按钮：测试读取、启用写回 Status

### 3.3 LLM（OpenAI/DeepSeek）
- API Key 输入（隐藏显示）  
- 测试 Prompt（小窗）  
- 超时设置（默认 10s）

---

## 4) Workflow（可视化工作流）

> 路由：`/workflow`

- **左侧**：节点库  
  - Triggers：SheetTrigger / NewMessageTrigger / TimeTrigger  
  - Actions：SendWhatsAppMessage / UpdateSheet / CreateTask（M3）  
- **中间**：React Flow 画布  
- **右侧**：Node Inspector（参数表单）  
- **顶部**：加载/保存 JSON、运行测试（Dry-run）

---

## 5) Dashboard / Reports / Settings

### 5.1 Dashboard
- 今日收/发消息数、进行中任务、状态分布  
- 图表：日/周切换

### 5.2 Reports
- 历史趋势：消息量、转化漏斗  
- 导出 CSV

### 5.3 Settings
- 用户与角色（Admin/Agent/Viewer）  
- 模板库（变量支持）  
- 标签与分组  
- 渠道开关（Email/SMS 预留）

---

## 6) 样式与组件

- **排版**：`text-base` 正文；标题 `text-xl/2xl`；辅助 `text-sm`  
- **间距**：8px 基准  
- **圆角**：`rounded-2xl`  
- **阴影**：`shadow-md` 基本；`shadow-lg` 悬浮  
- **颜色**：蓝=主色，绿=成功，黄=警告，红=错误  
- **状态点**：灰=New，蓝=Follow Up，紫=Viewing，绿=Closed  
- **Skeleton**：列表骨架、气泡骨架、右栏字段骨架  
- **空状态**：插画 + 引导按钮

---



## 7) 前端目录结构（建议）

```text
frontend/
├─ app/
│  ├─ layout.tsx
│  ├─ page.tsx
│  ├─ dashboard/page.tsx
│  ├─ crm/page.tsx
│  ├─ integrations/page.tsx
│  ├─ workflow/page.tsx
│  ├─ reports/page.tsx
│  └─ settings/page.tsx
├─ components/
│  ├─ crm/
│  │  ├─ Inbox.tsx
│  │  ├─ Conversation.tsx
│  │  ├─ Composer.tsx
│  │  ├─ DetailsPanel.tsx
│  │  └─ MessageBubble.tsx
│  ├─ common/
│  │  ├─ Topbar.tsx
│  │  ├─ Sidebar.tsx
│  │  ├─ SearchInput.tsx
│  │  └─ Tag.tsx
│  └─ workflow/
│     ├─ FlowCanvas.tsx
│     └─ NodeInspector.tsx
├─ lib/
│  ├─ api.ts
│  ├─ format.ts
│  ├─ validators.ts
│  └─ store.ts
└─ styles/globals.css
````

---

## 8) 验收清单（QA Checklist）

* [ ] 切换客户 <150ms 更新中/右栏
* [ ] 消息发送成功：气泡显示、✓/✓✓ 更新
* [ ] WhatsApp 未连接：Composer 禁用 + 引导
* [ ] 模板变量可正确替换
* [ ] 附件上传返回 `media_url` 可预览
* [ ] 修改 Status 写回 Sheet
* [ ] 搜索/筛选/标签生效
* [ ] Workflow 节点可新增/保存/执行 Dry-run
* [ ] 错误/空状态清晰可恢复
* [ ] 快捷键正常；屏幕阅读器读得通


# 短期任务清单（优先级）

此文件用于跟踪最重要的短期任务。请保持任务原子性并指派负责人。

1. 修复 AI 节点和 Condition 节点 `handoff` 状态存储后出现的问题。 [completed]
2. **构建自动跟进架构**: [in_progress]
    a. 定义客户管理列表所需的核心列和数据结构。 [pending]
    b. 设计并实现基于客户阶段的自动跟进逻辑。 [pending]
    c. 创建并测试针对不同客户阶段的自动跟进工作流。 [pending]
    d. **导航栏功能规划与实现**: [in_progress]
        i. 规划仪表盘/概览功能。 [completed]
        ii. 规划对话管理功能。 [pending]
        iii. 规划工作流/自动化功能。 [completed]
        iv. 规划报告/分析功能。 [completed]
        v. 规划系统设置功能。 [completed]
        vi. 规划团队与角色管理功能。 [completed]
        vii. 规划订阅/账单功能。 [pending]
        viii. 规划知识库功能。 [completed]
3. **构建知识库和产品服务管理**: [in_progress]
    a. 设计知识库的数据模型和存储方案。 [pending]
    b. 实现产品和服务的管理界面和数据模型。 [pending]
    c. 集成知识库和产品服务数据到 AI 回复或工作流中。 [pending]
    d. **前端 UI 实现**: [completed]
        i. 创建知识库主页面 `knowledge-base.tsx`。 [completed]
        ii. 实现知识库左侧导航组件 `KnowledgeBaseNavigation.tsx`。 [completed]
        iii. 实现 FAQ 列表组件 `FAQList.tsx`。 [completed]
        iv. 实现产品/服务列表组件 `ProductServiceList.tsx`。 [completed]
        v. 实现文章/文档列表组件 `ArticleList.tsx`。 [completed]
        vi. 创建 '集成与导入' 主页面 `KnowledgeBaseIntegrationsPage.tsx`。 [completed]
        vii. 实现 'Google Sheets 集成' UI 组件。 [completed]
        viii. 实现 'AI / JSON 智能导入' UI 组件。 [completed]
        ix. 在 `FAQList.tsx` 中添加分类筛选功能。 [completed]
        x. 在 `ProductServiceList.tsx` 中完善分类筛选功能。 [completed]
    g. **构建自定义对象 (Custom Objects) 管理系统**: [pending]
        i. 后端：定义 `CustomEntityType` 和 `CustomField` 数据模型。 [pending]
        ii. 后端：实现 `CustomEntityType` 和 `CustomField` 的 CRUD API。 [pending]
        iii. 后端：设计 `CustomEntityRecord` 数据模型用于存储动态数据。 [pending]
        iv. 后端：实现 `CustomEntityRecord` 的通用 CRUD API。 [pending]
        v. 前端：添加 '自定义对象' 到知识库导航。 [completed]
        vi. 前端：创建 '自定义实体配置界面'。 [in_progress]
        vii. 前端：创建 '通用自定义对象列表' 组件。 [completed]
        viii. 前端：创建 '通用自定义对象编辑/创建表单' 组件。 [completed]
        ix. 更新 Google Sheets 集成以支持自定义对象类型。 [pending]
        x. 更新 AI / JSON 智能导入以支持自定义对象类型。 [pending]
        xi. 前端：在 '自定义实体配置界面' 添加全局 '保存配置' 按钮。 [completed]
        xii. 前端：在 '自定义实体配置界面' 中实现 '配置字段' 与 '管理记录' 的内部视图切换。 [in_progress]

4. **媒体管理系统**: [pending]
    a. 设计媒体（图片、视频）的数据模型和存储方案（优先考虑云存储和 URL 链接）。 [pending]
    b. 实现媒体文件上传 API 和前端上传组件。 [pending]
    c. 构建媒体库管理界面（预览、分类、搜索、删除）。 [pending]
    d. 实现媒体 URL 的自动生成和在知识库、自定义对象中的集成。 [pending]

5. **工作人员职位管理与 Handoff 增强**: [pending]
    a. 定义工作人员职位（如销售、客服）的数据模型。 [pending]
    b. 实现将工作流 handoff 到特定职位工作人员的逻辑。 [pending]
    c. 在 AI 节点中配置 handoff 到不同职位或特定人员的策略。 [pending]

使用指南：
- **任务长度**：每项任务尽量 ≤ 14 个词
- **状态标注**：请使用方括号标注状态：`[pending] [in_progress] [completed] [cancelled]`

---

未完成（待明日继续）:
- **3.g.i**: 后端：定义 `CustomEntityType` 和 `CustomField` 数据模型。 [pending]
- **3.g.ii**: 后端：实现 `CustomEntityType` 和 `CustomField` 的 CRUD API。 [pending]
- **3.g.iii**: 后端：设计 `CustomEntityRecord` 数据模型用于存储动态数据。 [pending]
- **3.g.iv**: 后端：实现 `CustomEntityRecord` 的通用 CRUD API。 [pending]
- **3.g.ix**: 更新 Google Sheets 集成以支持自定义对象类型。 [pending]
- **3.g.x**: 更新 AI / JSON 智能导入以支持自定义对象类型。 [pending]
- **3.j**: 澄清并决定 `meta.handoff.confidence` 字段的最终用途。 [pending]
- **4.a-d**: 媒体管理系统（数据模型、上传 API、媒体库、URL 生成）。 [pending]
- **5.a-c**: 工作人员职位管理与 Handoff 增强（数据模型、handoff 路由、策略配置）。 [pending]

请在明天继续上述条目，或告诉我优先级我来按优先级排序。



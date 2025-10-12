# GitHub 团队协作工作流最佳实践

---

## 1. 初次同步到 GitHub

1. 在 GitHub 建一个空仓库。
2. 本地项目目录初始化 Git：

   ```bash
   git init
   git remote add origin https://github.com/你的用户名/仓库名.git
   ```
3. 确认 `.gitignore` 生效（敏感/大文件不会进 Git）。
4. 第一次提交并推送：

   ```bash
   git add .
   git commit -m "init project"
   git push -u origin main
   ```

👉 到这一步，你的项目就和 GitHub 绑定了。

---

## 2. 日常协作工作流（提取 / 更新 / 标注）

团队常用的 Git 协作流程是 **Git Flow 精简版**：

1. **拉取最新代码 (Pull)**

   ```bash
   git pull origin main
   ```
   保证你本地是最新的。

2. **创建分支 (Branch)**

   ```bash
   git checkout -b feat/add-login
   ```
   每个功能/修复用独立分支，这样不会直接动 main。

3. **写代码 + Commit 提交**

   ```bash
   git add .
   git commit -m "feat(login): add user authentication API"
   ```
   标注常见规范：
   - `feat:` 新功能
   - `fix:` 修 Bug
   - `docs:` 文档更新
   - `refactor:` 重构
   - `chore:` 配置/依赖更新

4. **推送分支 (Push)**

   ```bash
   git push origin feat/add-login
   ```

5. **Pull Request (PR)**

   - 在 GitHub 提交 PR，请队友 Review。
   - PR 会自动显示 commit 历史、修改文件，方便审查。
   - 审核通过后 Merge 到 `main`。

---

## 3. 常用功能（团队高效协作必备）

- **Pull Request (PR) + Code Review**：每次合并都走 PR，让队友审查代码，保证质量。
- **Issues / Projects**：GitHub 的任务管理，用来分配工作。
- **标签/Release**：重要版本打 tag，比如：

  ```bash
  git tag v1.0.0
  git push origin v1.0.0
  ```
  方便以后回滚。
- **GitHub Actions (CI/CD)**：自动化测试、部署，每次 push/merge 自动跑测试和打包。
- **.gitignore**：避免上传无关文件（venv、node_modules、.env）。
- **.cursorignore**：避免 AI 读取敏感/庞大文件。

---

## 4. 总结推荐工作流

1. **开发前**：`git pull`
2. **开发中**：新建分支 → 编码 → commit（规范 message）
3. **开发后**：push 分支 → 提交 PR → Code Review → Merge
4. **协作工具**：
   - GitHub PR/Issues → 协作
   - GitHub Actions → 自动化测试/部署
   - GitLens 插件 → 直观查看历史
   - Cursor Agent → 自动生成 PR 描述、帮你写 commit 信息

---

## 5. 工作流优势

- 每个人都有自己的分支，互不干扰。
- main 分支始终保持稳定可用。
- 每次改动都有记录，可追溯。
- 敏感文件不会泄露。

---

> 如需团队协作 Git 工作流图，可随时告知！

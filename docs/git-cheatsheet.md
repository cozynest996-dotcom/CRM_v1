# Git Cheatsheet
🚀 标准 Git 常用指令清单（精简版，适合日常开发）

复制这份内容存到 docs/git-cheatsheet.md，以后随时查 👇

# 📌 Git 常用指令清单 (快速上手)

## 1. 初始化 & 配置
```bash
git init                          # 初始化仓库
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"

2. 拉取/克隆代码
git clone <仓库地址>              # 第一次从远程获取项目
git pull origin main              # 拉取远程最新代码

3. 提交改动
git status                        # 查看当前改动
git add .                         # 添加所有改动
git commit -m "修改说明"          # 提交改动

4. 推送到远程
git push origin main              # 推送到 GitHub main 分支

5. 分支操作
git branch                        # 查看本地分支
git checkout -b feature-x         # 新建并切换分支
git checkout main                 # 切换回 main
git merge feature-x               # 合并分支

6. 回退与撤销
git checkout -- <文件>            # 撤销文件改动（未提交）
git reset --hard HEAD             # 回退到最近一次提交
git revert <commit_id>            # 撤销某次提交（保留历史）

7. 临时保存
git stash                         # 暂存当前修改
git stash pop                     # 恢复上次暂存
---
name: taskboard-issue-split
description: 把 taskboard 面板中的初始任务(描述含多个子需求)拆分为批次父任务 + 多个子任务,含分支/worktree 绑定、父子关系、优先级、标签。Use when the user asks to 拆分任务/拆分成小任务/拆解需求/把 X 拆成几个任务, or when a task description lists multiple numbered requirements that should each become its own issue with its own branch.
---

# Taskboard Issue Split

按"需求 = 任务,需求按分支"的原则,把一个大任务拆成可独立推进的子任务。

## 工作流

1. **读取父任务**:`taskctl issue get <ID>` 获取描述、标签、分支、版本。描述里编号列出的子需求即拆分依据。
2. **确定拆分方案**(与用户确认或按经验分配):
   - 每个编号子需求 = 一个子任务
   - 功能开发类 → 绑分支;验收类(UI 走查等)→ 不绑
   - 优先级:支付/合规类 urgent~high;功能 high;走查 medium
   - 标签:按模块归类(支付/合规/账号/优惠券/NFC/质量…)
3. **写 spec 文件**并运行拆分脚本:
   ```bash
   node scripts/split-issue.mjs <PARENT_ID> --new-title "批次标题" --spec <spec文件> --thread-id <会话ID>
   ```
   spec 每行:`title|labels|priority|git-branch|worktree-path|description`(`\n` 表示换行,空字段留空,`#` 开头的行忽略)。
   空字段继承父任务;`--status` 默认 `backlog`,可用 `--dry-run` 预览。
   脚本自动:父任务改标题 + 清空 developmentContext → 创建子任务 → 建立 parent 关系。
4. **验证结果**:`taskctl issue list --project <项目>` 确认层级与绑定。

## 决策规则

- **串行推进**:子任务只绑 `--git-branch`,一个工作目录切分支。
- **并行推进**:先建 worktree 再把 `--worktree-path` 写进 spec(worktree 目录天然在正确分支,打开即绑定,无需 checkout)。
- **父任务**:改标题为批次名,清空 developmentContext,保持 backlog 直到全部子任务 done。
- **写入归因**:所有写操作必须带 `--thread-id`,便于面板回溯来源会话。

## 常用 taskctl 命令

```bash
taskctl issue get <ID>                          # 读任务(含版本/关系)
taskctl issue create --project <P> --title "T" --labels "L" --priority high --git-branch "b" --thread-id ID
taskctl issue update <ID> --worktree-path <PATH> --worktree-branch <B> --thread-id ID
taskctl issue list --project <P>                # 列表
taskctl issue tree <ID> --direction descendants --depth 3   # 层级
taskctl comment list <ID>                       # 读评论
```

## 环境要求

- 面板地址 `http://127.0.0.1:47823/`,由 Docker 容器 `codex-taskboard` 提供。
- 脚本与 `taskctl` 都读取 `CODEX_TASKBOARD_URL`,未设置时脚本默认指向该地址;`taskctl` 需要显式设置:
  `export CODEX_TASKBOARD_URL=http://127.0.0.1:47823`
- spec 里的 `worktree-path` 必须是绝对路径。
- 后置步骤(并行时,脚本不会自动建 worktree):
  ```bash
  git -C <repo> worktree add <path> <branch>      # 分支已存在
  git -C <repo> worktree add -b <branch> <path>   # 分支不存在时创建
  ```


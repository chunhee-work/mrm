# Autopilotclaim 自动审查流程（loop:codex / loop:ui）

范围：只管 Autopilotclaim 网站（`web/`）。Merimen 自动化（playbook/、tools/、typesafe/、memory/）一概不碰：
改到 `web/` 以外的 PR，流程会贴 `loop:stuck` 并停下，不会自动合并。

来源：chunhee-work/oeru-onhand 的同一套系统，改了 `fix-loop.config.json`（allowedPaths = `web/**`）并加了 `loop:ui`。

## loop:codex
1. 给 PR 贴标签 `loop:codex`。
2. Codex 审查 → 有问题交给 Claude 改 → Codex 复查，直到 Codex 没意见。
3. Codex 干净后：等 CI 检查 `check` 绿了再自动合并；CI 红了贴 `loop:stuck`。
4. 卡住（超过 5 轮、Codex 2 小时没回、改到受保护文件或 web/ 以外、冲突）：贴 `loop:stuck` 并 @ 你。
另外两个入口：issue 贴 `fix-loop` 标签 → Claude 修并开 PR；main 上 CI 失败 → 自动开 issue 交给 Claude。
每 15 分钟扫一遍，防止漏掉的事件。

## loop:ui
给改了 `web/` 的 PR 贴标签 `loop:ui`：自动构建网站，截电脑版（1440x900）和手机版（390x844）的首页、登录页、注册页，
存成 artifact `ui-shots`，在 PR 里留言放链接，并通过 Grok webhook 请 Grok 看图审查。只看图，不合并。
也可以在 Actions 里手动运行 `loop-ui`，填 PR 号重跑。

## plan-review / plan-gate
新功能先开贴 `plan` 标签的 issue 写计划，评论 `/review`，Grok（webhook）和 Dots（OpenAI）都会回审查意见；
全部回答后评论「Reviews resolved」再写代码。PR 正文写 `Plan: #<issue 号>`；小修写 `Plan: none (至少三个词的原因)` 并贴 `fix` 或 `copy`。
`plan-gate` 只对改了 `web/` 的 PR 显示，不会挡住自动合并。

## 需要的 secrets / variables（只写名字）
| 名字 | 类型 | 状态 | 说明 |
|---|---|---|---|
| `GROK_WEBHOOK_URL` / `GROK_WEBHOOK_SECRET` | secret | 已有 | Grok（plan-review、loop:ui） |
| `OPENAI_API_KEY` | secret | 已有 | Dots 计划审查 |
| `SMOKE_PASSWORD` | secret | 已有 | 网站冒烟测试 |
| `FIX_LOOP_TOKEN` | secret | **缺** | chunhee00 的 fine-grained token：Contents / Issues / Pull requests 读写，只给 mrm |
| `CLAUDE_CODE_OAUTH_TOKEN` 或 `ANTHROPIC_API_KEY` | secret | **缺**（二选一） | Claude 修问题用 |
| `FIX_LOOP_ENABLED` | variable | **缺** | 设为 `true` 才开始工作 |
| `PLAN_REVIEW_ENABLED` | variable | **缺** | 设为 `true` 才开计划审查 |

Codex 不需要 key：在 chatgpt.com/codex 用你的账号连接 GitHub 并选 chunhee-work/mrm。
受保护文件（永不自动合并）：`.github/**`、两个脚本、`fix-loop.config.json`、migration 与 `.sql`、`.env*`、`vercel.json`。

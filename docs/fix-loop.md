# 自动审查修复流程（loop:codex / loop:ui）— 只管 Autopilotclaim 网站（web/）

照搬 chunhee-work/oeru-onhand 的 fix-loop，改动：`allowedPaths` 只允许 `web/**`，CI 在 `web/` 里跑。Merimen 自动化（playbook/、tools/、typesafe/）不在范围内，改到它们的 PR 会被判「超出范围」并停下。

## loop:codex
PR 贴标签 `loop:codex` → Codex 审查 → Claude 改 → 再审，直到干净 → CI 的 `check` 绿了自动合并；卡住贴 `loop:stuck`。每 15 分钟扫一次。

## loop:ui
PR（改了 web/）贴标签 `loop:ui` → 构建网站，截电脑版 + 手机版（首页 / 登录 / 注册）→ 截图上传为 artifact → 发签名 webhook 给 Grok 做 UI 审查。

## 需要的 secrets / variables（只写名字）
| 名字 | 类型 | 状态 |
|---|---|---|
| `GROK_WEBHOOK_URL` / `GROK_WEBHOOK_SECRET` | secret | 已设（loop:ui、计划审查用） |
| `OPENAI_API_KEY` | secret | 已设（计划审查 Dots 用） |
| `FIX_LOOP_TOKEN` | secret | 待设：chunhee00 的 fine-grained token（Contents / Issues / Pull requests 读写，只给 mrm） |
| `CLAUDE_CODE_OAUTH_TOKEN` 或 `ANTHROPIC_API_KEY` | secret | 待设（二选一，Claude 自动修用） |
| `FIX_LOOP_ENABLED` | variable | 待设为 `true`，流程才开始工作 |
| `PLAN_REVIEW_ENABLED` | variable | 待设为 `true`，计划审查才开 |

Codex 不需要 key：在 chatgpt.com/codex 连接 GitHub 并选 chunhee-work/mrm。

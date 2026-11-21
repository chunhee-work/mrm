# Autopilot Linux worker

网站仍然负责登录、上传和读文件。这台机器负责：从 Neon 领取 `jobs`、从私有 Blob 取文件、用店里的 DINOv2 模型给照片起名、在本机 Chrome 里登录 Merimen 并做 Phase A / Phase B。Browserbase 的代码还在，`WORKER_UI` 不打开时网站仍走原来的窗口。

## 登录和密码

用户在 `/connection` 勾选同意（PR #39：`EXT_CONNECT=on`、机构的 `ext_org_settings` 已启用且有同意编号、`ext_consents` 有记录）之后，才可以保存 Merimen 用户名和密码。

密码用 AES-256-GCM 信封加密。主密钥是环境变量 `MERIMEN_CRED_KEY`（32 字节的 base64）。每个机构一把数据密钥，由主密钥包起来。密码不会写进日志，也不会回到浏览器。审计表只记动作（save、delete、login_ok、login_bad_credentials），不记密码。

Worker 只在 `MERIMEN_LOGIN=on` 时向 Merimen 提交登录，而且**只试一次**。Merimen 多次失败会锁定账号（locktime=15）。页面结果只有四种：成功、用户名或密码不对、账号已锁定、需要验证码。Chrome 没开好时不算一次失败，核对会留在队列里。

之后某个案子登录失败（例如用户在 Merimen 改了密码）：该机构的登录标成无效，Phase A / B / checks 暂停，案子状态改为 `waiting_user`，时间线写中英两句。网站在案子页和连接页用当前语言显示横幅。用户重新保存并且核对成功后，暂停的 job 自动回到 `queued`。可选：配置了 `RESEND_API_KEY` 和 `EMAIL_FROM` 时发一封双语邮件，正文里没有密码。

## 数据库连接（`DB_TRANSPORT`）

默认 `DB_TRANSPORT=http`：worker 用 Neon 的 SQL-over-HTTPS（`POST https://<主机>/sql`，请求头 `Neon-Connection-String`），不需要出站 5432 端口，也不用 WebSocket。`DB_TRANSPORT=tcp` 改回普通 psycopg 连接（要能连 5432）。`DATABASE_URL` 两种方式都一样；角色用 `autopilot_worker`。

HTTP 方式下没有长连接，所以：领取 job 是**一条** `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING …`，多个 worker 进程不会领到同一个 job。一次结果的多条写入走一个事务（一次 HTTPS 请求）。只有 `SELECT` 在网络中断时会自动重试，写入不会盲目重发。

租约：领到 job 的 worker 每 `JOB_LEASE_SECONDS`/3 秒续一次 `locked_at`（默认租约 900 秒）。租约过期仍是 `running` 的 job 会被放回队列，试满 3 次改为 `failed`。只有持有者能续约。

## 进度截图（`WORKER_UI=on` 才开）

每个里程碑从 Merimen 那个标签页截一张 JPEG（质量 70，宽度最多 1280，用 Playwright 连本机 Chrome 的调试口）：登录已验证、案件已打开、照片已命名、文件已上传、案件完成，另加任何失败一张。规则：

- 只在登录成功之后截。页面上有密码框，或地址不是已登录的 `/claims/…?CFID&RID`，就不截（登录页永远不截）。
- 只存私有 Vercel Blob：`screenshots/{userId}/{caseId}/{step}-{时间}.jpg`，不生成公开链接。`userId` 是提交这个案子的用户（`cases.created_by`），没有提交者就不存。
- 演练（没有真的写 Merimen）不会声称“案件已打开”等里程碑；只有真的保存了才记。登录已验证在 Phase A 开始前截。
- 截图失败不会让 job 失败。
- 保留期 `SCREENSHOT_RETENTION_DAYS`（默认 90）：worker 每小时清理一次，先删 Blob，再把 `deleted_at` 写上。没有 SQL DELETE；删不掉的 Blob 下次再试。
- 网站案子页的“进度截图”只给提交者看。读取走登录后的 `/api/cases/<id>/screenshots`，检查“查看者 = 案件提交者”，再从私有 Blob 转出图片；同机构的其他用户和其他机构一律 404。
- 依赖：`playwright`（只用来连已有的 Chrome，不下载浏览器）和 `pillow`。

## 队列

领取见上一节。同一机构同时运行的 Merimen job 数量由 `ORG_CONCURRENCY` 限制（默认 1）。暂时性错误用 `not_before` 退避，最长 5 分钟。密码错误不退避、不重试。

一个 worker 可以开多份 Chrome 配置（`WORKER_ACCOUNTS=default:9222,b:9223`），一份配置一个 Merimen 登录。多台机器共用同一个 Neon，各领各的 job。

## 照片

`PHOTO_WORKER=on` 时网站不再把照片发给 Claude，由 worker 写入 `model_name`、`confidence`、`alts`、`name_state`。模型进程起不来、或照片被标成 `worker:` 失败时，才退回 Claude（`PHOTO_WORKER_FALLBACK=off` 可关掉）。权重在私有仓库 `chunhee00/mrm-photo-model` 的 `production/`，用 `predict_case.py auto` 加载。这台机器没有 GPU，`PRED_BS` 默认 4。

## 运行

单机：

```sh
cp .env.example /etc/autopilot-worker.env
# 填上值。不要把这个文件提交。
sudo cp autopilot-worker.service /etc/systemd/system/
sudo systemctl enable --now autopilot-worker
```

也可用 pm2：`pm2 start /opt/mrm/worker/run.sh --name autopilot-worker --interpreter bash`。

多台：`worker/docker-compose.yml`，或 `worker/fly.toml`（示例，机器规格要在 Fly 上另选）。健康检查是 `GET /health`（`WORKER_HEALTH_PORT`，默认 8080），不访问 Merimen。

Phase A / B 在写入 Merimen 之前先做演练。`MERIMEN_WRITES` 和 `WORKER_SUBMIT` 都不是 `on` 时，不会提交。CI 不登录 Merimen。

## 迁移

`web/drizzle/0007_worker.sql` 只新增表和 `jobs.not_before`。`web/drizzle/0008_case_screenshots.sql` 只新增表 `case_screenshots`（可重复执行），并在角色 `autopilot_worker` 存在时给它 `SELECT, INSERT, UPDATE`（没有 DELETE）。生产库要等主人点头之后再跑 `npm run db:migrate`。本文件不会替你执行。

如果 PR #31 也要用 0007 这个编号，后合并的那个改号即可（迁移按文件名排序执行，每个文件都可重复执行）。

## Step 2 和学习数据（Phase B）

用户按「完成」之后，Phase B 在照片对齐之后做 Step 2：按**最终照片名字**（加上用 Space 加的、没有照片的部件）从 Merimen 的 catalogue 规划 parts + labour（`step2.py`，移植自 `typesafe/step2_plan.py`），再做照片名字和 Select Parts 的双向核对（`step2_check.py`，移植自 `tools/naming-desk/sync_check.py`）。结果写进 `step2_log`。
- 没有真实的 Merimen 适配器：默认适配器读不到 catalogue、也不能点选。`MERIMEN_WRITES` 和 `WORKER_SUBMIT` 没有同时是 `on` 时只记录计划（dry run）。
- `STEP2_AI=on` 且设了 `ANTHROPIC_API_KEY`（可选 `STEP2_MODEL`）时，AI 用 playbook 的 step2 文件复核计划：只能加 catalogue 里有的项、加手工行、去掉伴随件，不能去掉有照片的项。出错就用规则计划。
- 用户的最终名字写进 `photo_learning`（改过的标 `changed`）。取走：`python -m autopilot_worker.learning export`（JSON lines，取走的行会标记）。

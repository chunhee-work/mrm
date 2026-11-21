# Autopilot Linux worker

网站仍然负责登录、上传和读文件。这台机器负责：从 Neon 领取 `jobs`、从私有 Blob 取文件、用店里的 DINOv2 模型给照片起名、在本机 Chrome 里登录 Merimen 并做 Phase A / Phase B。Browserbase 的代码还在，`WORKER_UI` 不打开时网站仍走原来的窗口。

## 登录和密码

用户在 `/connection` 勾选同意（PR #39：`EXT_CONNECT=on`、机构的 `ext_org_settings` 已启用且有同意编号、`ext_consents` 有记录）之后，才可以保存 Merimen 用户名和密码。

密码用 AES-256-GCM 信封加密。主密钥是环境变量 `MERIMEN_CRED_KEY`（32 字节的 base64）。每个机构一把数据密钥，由主密钥包起来。密码不会写进日志，也不会回到浏览器。审计表只记动作（save、delete、login_ok、login_bad_credentials），不记密码。

Worker 只在 `MERIMEN_LOGIN=on` 时向 Merimen 提交登录，而且**只试一次**。Merimen 多次失败会锁定账号（locktime=15）。页面结果只有四种：成功、用户名或密码不对、账号已锁定、需要验证码。Chrome 没开好时不算一次失败，核对会留在队列里。

之后某个案子登录失败（例如用户在 Merimen 改了密码）：该机构的登录标成无效，Phase A / B / checks 暂停，案子状态改为 `waiting_user`，时间线写中英两句。网站在案子页和连接页用当前语言显示横幅。用户重新保存并且核对成功后，暂停的 job 自动回到 `queued`。可选：配置了 `RESEND_API_KEY` 和 `EMAIL_FROM` 时发一封双语邮件，正文里没有密码。

## 队列

`SELECT … FOR UPDATE SKIP LOCKED`。同一机构同时运行的 Merimen job 数量由 `ORG_CONCURRENCY` 限制（默认 1）。暂时性错误用 `not_before` 退避，最长 5 分钟。密码错误不退避、不重试。

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

`web/drizzle/0007_worker.sql` 只新增表和 `jobs.not_before`。生产库要等主人点头之后再跑 `npm run db:migrate`。本文件不会替你执行。

# Autopilot Linux worker

网站仍然负责登录、上传和读文件。这台机器负责：从 Neon 领取 `jobs`、从私有 Blob 取文件、用店里的 DINOv2 模型给照片起名、在本机 Chrome 里登录 Merimen 并做 Phase A / Phase B。Browserbase 的代码还在，`WORKER_UI` 不打开时网站仍走原来的窗口。

## 登录和密码

用户在 `/connection` 勾选同意（PR #39：`EXT_CONNECT=on`、机构的 `ext_org_settings` 已启用且有同意编号、`ext_consents` 有记录）之后，才可以保存 Merimen 用户名和密码。

密码用 AES-256-GCM 信封加密。主密钥是环境变量 `MERIMEN_CRED_KEY`（32 字节的 base64）。每个机构一把数据密钥，由主密钥包起来。密码不会写进日志，也不会回到浏览器。审计表只记动作（save、delete、login_ok、login_bad_credentials），不记密码。

保存时的检查：Worker 只在 `MERIMEN_LOGIN=on` 时向 Merimen 提交登录，而且每次保存**只试一次**（自动重新登录另有自己的限制，见下一节）。Merimen 多次失败会锁定账号（locktime=15）。页面结果只有四种：成功、用户名或密码不对、账号已锁定、需要验证码。

### 自动重新登录（`MERIMEN_RELOGIN=on`，计划 #133）

只要 Chrome 回答了但没有任何标签页登录着 Merimen（例如 worker 或 Chrome 重启后，或 Merimen 把会话踢回登录页）（没有 `/claims/…` 加 `CFID` 和 `RID` 的页面），worker 就用用户在网站上保存的登录**自己**再登录一次。没有人需要手动登录（开关打开、而且 worker 能读到 `MERIMEN_CRED_KEY` 时，worker 不再写「请手动登录」的 `NEED_LOGIN` 提示，开关打开前留下的旧提示也会在 Chrome 没登录或调试口不回应时被删掉；`WORKER_STATE` 不要设成 `~/mrm-bot/state`，否则会删掉 mrm-bot 自己的同名提示；开关打开后它又出现，就去查 `MERIMEN_LOGIN=on` 和 `MERIMEN_CRED_KEY`（没设或格式不对都会这样）。默认关；还要 `MERIMEN_LOGIN=on`。代码在 `relogin.py` 和 `cdp.mjs login --relogin`。

- 只在 worker **自己新开的一个标签页**里打字（打开 `https://www.merimen.com.my/claims/index.cfm?skip_browsertest=1`，不带这个参数时新标签页只会看到浏览器检测页、没有登录框），别的标签页不导航、不打字、不关（唯一例外：打开自己的标签页失败时，会关掉这期间新出现、地址正好是起始页的那个标签页）。没登录成功（成功或已登录着都会留下）就把自己的标签页关掉（但绝不关最后一个标签页，那会关掉 Chrome 窗口）；超时被杀时 worker 按标签页 id 关掉它。上次成功留下的自己的标签页，下次重试前如果已经退出登录（仍是 Merimen `/claims/` 页面）会被关掉；但它只记在当前 worker 进程里（重启后就不记得），而且是最后一个标签页时也不关。
- 只有保存的登录是 `ok` 且没被封、机构的 gate 是 ready（设置 + 同意书）、`EXT_CONNECT=on`、这个机构在 `WORKER_ACCOUNTS` / `WORKER_ORG_ACCOUNTS` 里有账号和端口、worker 能读到 `MERIMEN_CRED_KEY`（密钥不对时照样会试，每 10 分钟写一对 `relogin_try` + `relogin_key_mismatch`，什么都不打）、`worker_sessions` 里这个机构的行是 `wanted='start'`（用户停掉的机构不会试）、Chrome 回答、0 个已登录标签页时才会试。机构映射到 9222（默认，也是现在生产上的情况）时也照样在 9222 那个自动化 Chrome 里试：只用自己新开的标签页，不关窗口；所以不要再在那个窗口里跑 `relogin.mjs` 或手动输密码，那些失败不算在 worker 的限制里。每个 tick 最多一次真正的尝试；被拒的机构把机会让给下一个。
- 限制（全在 `merimen_cred_audit` 里，数据库时间）：每 10 分钟最多一次；24 小时最多 12 次**真的打字**的尝试；一次「没有明确回复」之后发一封邮件，24 小时不再试，只有**证明了密码**的成功（`relogin_ok` 或保存时的 `login_ok`）才提前解除，人手登录（`login_session_live`）或看到已连接都不算；连续两次没有明确回复（中间没有证明密码的成功）就按保存时的 `unknown` 处理（封、暂停、邮件）；自上次成功以来、在滑动的 6 小时窗口里 6 次放回（没找到登录页、Chrome 回应了标签页列表但打不开或连不上、node 起不来、提交之前就超时而且还能读到输出（读不到输出算没有明确回复）、保存的用户名或密码是空的，或页面复查在填任何值之前就拒绝了：什么都没打）就发一封邮件，会话 detail 显示 `relogin_failed`，并且不再试（调试口完全不回应的 Chrome 根本不会去试，不算放回，也不发这封邮件），直到最早那次放回滑出 6 小时窗口或出现任何成功（包括看到已连接）。
- 孤儿尝试：一次 `relogin_try` 超过 3 分钟还没有结果行（结果没写进去，或 worker 中途死了），就一直不再试，没有 24 小时期限。一发现孤儿就发一封邮件，会话 detail 显示 `relogin_stopped`；直到之后出现任何结果行（包括重新保存时 Chrome 已登录着写下的 `login_session_live`），或证明密码的成功（通常是用户先在 Merimen 确认登录再重新保存），才解除。`login_session_live` 不解除「没有明确回复」的 24 小时封锁。密钥不对时 detail 也显示 `relogin_stopped`，但那时什么都没打，也不发邮件。到达 24 小时 12 次上限时 detail 显示 `relogin_capped`。
- **自动重新登录只要开过一次，就绝不要手动用 SQL 把保存时检查重新排队**（`verify_state='queued'`），关掉回退以后也一样：那会在所有限制之外再打一次密码（第一次没读到结果或 orphan 之后，登录行还是 `ok`）。要重试就让用户在网站上重新保存登录。
- 密码不对 / 账号锁定：和保存时一样封住、暂停、发邮件，之后再也不打字，直到用户重新保存。锁定时邮件请用户先等 Merimen 解锁再保存。只有这次运行时登录还是 `ok`、而且还是这次打的那个密码（`password_nonce` 没变）才会改（用户刚好重新保存了就不动）。
- 要验证码：不写 `otp`（网页会显示一个已经没人接的验证码框），写 `unknown` + 封住 + 暂停（和保存时的 unknown 一样），审计 `relogin_otp`，发一封邮件请用户先确认登录在 Merimen 能用，再重新保存。
- 子进程只拿一小份环境变量（没有 `MERIMEN_CRED_KEY`、`DATABASE_URL`）。日志只有固定的词，没有地址、页面文字、用户名或密码。
- 一个机构只能由一个 worker 进程负责（别给同一个机构再开一个 worker），否则保存时检查和自动重新登录之间没有先后保证。
- 回退：`MERIMEN_RELOGIN=off` 再重启 worker。回退以后上面那条 SQL 禁令仍然有效；已写下的封锁（blocked）、暂停和审计记录也都保留。

「只试一次」的规则（`cdp.mjs login` + `login_flow.py`）：

- 只在 Merimen 自己的登录页上打字。登录页的判定（全部满足才算）：标签页的 origin 正好是 `https://www.merimen.com.my`（解析整个地址，不看地址里有没有这几个字）；页面**不是**已登录页（已登录页 = `/claims/…` 加 `CFID` 和 `RID`，和别处用的是同一条规则）；页面上**恰好一个**可见的密码框；**同一个 form 里**恰好一个可见的用户名文本框和一个可见的登录按钮。隐藏的 input 永远不当按钮。少一样就什么都不打，结果是 `not_login_page`。已登录页上的密码框（例如改密码页）不会被填。绝不点 Logout。
- `session_live`：Chrome 里已经登录着 Merimen（已登录页，没有任何密码框）。什么都不打，核对按「成功」结束（`verify_state = 'ok'`，不封、不发邮件、不算一次尝试），审计表写一行 `login_session_live`。
  注意：这种情况下**保存的密码没有被验证过**，只说明这台机器的 Chrome 现在是登录着的。
- 提交之后只读不动（不点、不打字），每秒看一次，最多约 15 秒，等地址或页面变了再判断；「Continue Session」之类的页面上什么都不点。等完还看不明白就是 `unknown`。
- 脚本整体限时 90 秒。超时后先杀掉脚本，再把它已经写出的内容全部读完再判断；超时后读不到输出一律当 `unknown`，绝不放回队列。
- 脚本在打字**之前**先写一行 `{"submitted": true}`。之后任何失败（读不到结果、超时、脚本崩溃）一律是 `unknown`：`verify_state = 'unknown'`、`blocked = true`、该机构的 Merimen job 暂停、案子进 `waiting_user`，等用户重新保存登录。**worker 自己绝不会再提交一次。** 时间线和邮件写的是「Merimen 没有明确回复」，不说密码不对。
- 只有「什么都没打」的四种情况会把核对放回 `queued`（不算一次、不封、不暂停、不发邮件）：
  - `key_mismatch`：保存的登录用这台 worker 的 `MERIMEN_CRED_KEY` 解不开（网站和 worker 的密钥不一样，或那一行坏了）。**要修的是密钥，不是用户的密码。**
  - `not_login_page`：没有打开着的 Merimen 登录页，也不是 `session_live`。
  - `offline`：Chrome 的调试口连不上，或脚本在提交之前就停了。
  - `no_account`：这个机构在这台 worker 上没有对应的 Chrome 配置（`WORKER_ACCOUNTS`）。核对只用该机构自己那份配置的调试口，不会借用第一份。
- 被放回的核对不会每 2 秒再领一次：同一机构先等 2 秒，每次加倍，最长 60 秒（只记在进程里），其它机构不受影响。原因在 stderr 打一行，并在 `merimen_cred_audit` 写一行 `login_released_<原因>`；同一原因只写一次，不是每个 tick 一行。状态先单独改回 `queued`，审计行之后另写：审计写不进去（例如缺权限）只在 stderr 打一行错误类名，核对照样放回；`login_session_live` 也一样。查法：`SELECT org_id, action, at FROM merimen_cred_audit WHERE action LIKE 'login_released_%' ORDER BY at DESC LIMIT 20;`

之后某个案子登录失败（例如用户在 Merimen 改了密码）：该机构的登录标成无效，Phase A / B / checks 暂停，案子状态改为 `waiting_user`，时间线写中英两句。网站在案子页和连接页用当前语言显示横幅。用户重新保存并且核对成功后，暂停的 job 自动回到 `queued`。可选：配置了 `RESEND_API_KEY` 和 `EMAIL_FROM` 时发一封双语邮件，正文里没有密码。

## 数据库连接（`DB_TRANSPORT`）

默认 `DB_TRANSPORT=http`：worker 用 Neon 的 SQL-over-HTTPS（`POST https://<主机>/sql`，请求头 `Neon-Connection-String`），不需要出站 5432 端口，也不用 WebSocket。`DB_TRANSPORT=tcp` 改回普通 psycopg 连接（要能连 5432）。`DATABASE_URL` 两种方式都一样；角色用 `autopilot_worker`。

HTTP 方式下没有长连接，所以：领取 job 是**一条** `UPDATE … WHERE id = (SELECT … FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING …`，多个 worker 进程不会领到同一个 job。一次结果的多条写入走一个事务（一次 HTTPS 请求）。只有 `SELECT` 在网络中断时会自动重试，写入不会盲目重发。

租约：领到 job 的 worker 每 `JOB_LEASE_SECONDS`/3 秒续一次 `locked_at`（默认租约 900 秒）。租约过期仍是 `running` 的 job 会被放回队列（不等待），第 3 次被领取后再过期就改为 `failed`。只有持有者能续约。

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

领取见上一节。同一机构同时运行的 Merimen job 数量由 `ORG_CONCURRENCY` 限制（默认 1）。密码错误不退避、不重试。

「稍后再试」（Merimen 读不到、没有已登录标签页、表单打不开等）：job 放回队列时写 `jobs.not_before = now() + backoff_seconds(attempts)`，到时间才会再被领取。顺序是：第 1 次 → 等 30 秒 → 第 2 次 → 等 2 分钟 → 第 3 次 → 等 10 分钟 → 第 4 次；**第 4 次还是不行才改为 `failed`**：时间线多一行「Stopped after 4 tries …」，案子的 `error` 写上原因，案子状态不变。另外两种情况仍是第 3 次被领取为止：worker 自己出错（前两次按上面的等待放回，第 3 次改为 `failed`）和租约过期（放回时不等待）。三种情况共用同一个 `attempts` 计数（每被领取一次加一）。不需要迁移（`not_before` 来自 0007）。

一个 worker 可以开多份 Chrome 配置（`WORKER_ACCOUNTS=default:9222,b:9223`），一份配置一个 Merimen 登录。多台机器共用同一个 Neon，各领各的 job。

## Chrome

- 每个 tick 先问调试口（`/json/list`）。有回应就不再启动 Chrome；没回应才启动一次，30 秒内不重复启动（同一个配置目录再启动一次只会在原来的 Chrome 里多开一个标签页）。
- Chrome 启动时**不继承 worker 的密钥**。只传这些环境变量（有才传）：`PATH`、`HOME`、`USER`、`LOGNAME`、`SHELL`、`TMPDIR`、`DISPLAY`、`XAUTHORITY`、`WAYLAND_DISPLAY`、`DBUS_SESSION_BUS_ADDRESS`、`DESKTOP_SESSION`、`GNOME_DESKTOP_SESSION_ID`、`KDE_FULL_SESSION`、`KDE_SESSION_VERSION`、`LANG`、`LANGUAGE`、`TZ`、`FONTCONFIG_FILE`、`FONTCONFIG_PATH`、代理变量（`http_proxy`、`https_proxy`、`no_proxy`、`all_proxy`、`auto_proxy`，大小写都算；`SOCKS_SERVER`、`SOCKS_VERSION`）、`CHROMIUM_FLAGS`、以及 `XDG_*` 和 `LC_*`。`XDG_RUNTIME_DIR` 和 `DBUS_SESSION_BUS_ADDRESS` 要留着：Wayland 的 socket 在前者里，Chrome 通过后者找桌面的密钥库（cookie 用它加密），少了会读不出已登录配置里的 cookie。
- 这台机器的 Chrome 还需要别的变量（例如 `LD_LIBRARY_PATH`）：把**名字**写进 `CHROME_ENV_PASS`（逗号分隔）。名字里带 KEY / TOKEN / SECRET / PASSWORD / CREDENTIAL / COOKIE / DATABASE_URL 的一律不传，写了也不传。

## 这台机器上的文件

- 下载的照片放在 `<WORKER_STATE>/files/<案子 id>/<job id>/<照片 id>-<文件名>`（目录 0700、文件 0600），**job 一结束（成功或失败）只删它自己的 `<job id>` 目录**（案子目录空了也一并删），同一案子的另一个 job 的文件不受影响。只有 `photo_model` 这一步下载；intake 不再把案件 PDF 下载到这台机器（没有东西读它们，Jev 页面检查是直接在内存里读 Blob）。数据库里的文件名当作不可信：目录部分（`/`、`\`）和控制字符去掉，过长截短，所以写不到目录外面。
- 启动时和之后每小时清一次：`<WORKER_STATE>/files` 下 6 小时没动过的东西全部删除（被强杀的 job 留下的、以及旧版本平铺在这个目录里的文件）。符号链接只删链接本身。
- 环境文件里是全部密钥，只能给启动 worker 的那个账号读：`sudo chown root:root /etc/autopilot-worker.env && sudo chmod 600 /etc/autopilot-worker.env`（systemd 用 root 读 `EnvironmentFile`；用 pm2 或 docker compose 时把属主换成启动它的那个账号）。

## 照片

`PHOTO_WORKER=on` 时网站不再把照片发给 Claude，由 worker 写入 `model_name`、`confidence`、`alts`、`name_state`。模型进程起不来、或照片被标成 `worker:` 失败时，才退回 Claude（`PHOTO_WORKER_FALLBACK=off` 可关掉）。权重在私有仓库 `chunhee00/mrm-photo-model` 的 `production/`，用 `predict_case.py auto` 加载。这台机器没有 GPU，`PRED_BS` 默认 4。

## 运行

单机：

```sh
sudo cp .env.example /etc/autopilot-worker.env
sudo chown root:root /etc/autopilot-worker.env && sudo chmod 600 /etc/autopilot-worker.env  # 里面是密钥，别人不能读
# 填上值。不要把这个文件提交。
sudo cp autopilot-worker.service /etc/systemd/system/
sudo systemctl enable --now autopilot-worker
```

也可用 pm2：`pm2 start /opt/mrm/worker/run.sh --name autopilot-worker --interpreter bash`。

多台：`worker/docker-compose.yml`，或 `worker/fly.toml`（示例，机器规格要在 Fly 上另选）。镜像的构建目录是仓库根目录，Docker（BuildKit）读的是 `worker/Dockerfile.dockerignore`：只送 `worker/` 和 `typesafe/photo_train/` 进去，本地的 `.env`、状态目录、`__pycache__`、测试都不进镜像。`worker/.dockerignore` 是同一份规则，给以 `worker/` 为构建目录的情况用。健康检查是 `GET /health`（`WORKER_HEALTH_PORT`，默认 8080），不访问 Merimen。

Phase A / B 在写入 Merimen 之前先做演练。`MERIMEN_WRITES` 和 `WORKER_SUBMIT` 都不是 `on` 时，不会提交。CI 不登录 Merimen。

## 建案子（Phase A 第 1 步，计划 issue #113）

Worker 用本机 Chrome 里已登录的 Merimen 标签页（Playwright 连本机调试口，和截图同一种方式）打开建案表单 `dsp_clmreg`，按 `cases.case_data`、用户保存的 manager / adjuster、以及这个案子的工坊（见下）填表。选择器和顺序来自主人的脚本 `tools/mrm-bot/createpar2_sinar.mjs` 和 `playbook/02-create-case.md`。session 标记（CFID、CFTOKEN、USID、RID）只从已登录标签页的地址里取，不写日志、不存库。

两个开关，默认都关：

1. `MERIMEN_DRYRUN=on`：演练。新开一个标签页，填完整张表，逐项读回检查，关掉标签页。**不保存。** 案子时间线写一行：检查了什么，或缺什么。演练时工坊只“看”（`peek_workshop_for_case`），不锁定，用户还能改。
2. `MERIMEN_WRITES=on` 且 `WORKER_SUBMIT=on`：真保存。先用只读的 `peek_workshop_for_case` 看工坊并填表、检查，**只有全部通过才在点 Next 之前一刻**调用 `claim_workshop_for_case` 锁定工坊（要和表单上的一致；返回 `None` 就停，绝不退回工坊 1），再点 Next。保存后设 manager 和 adjuster，把 caseid（和 extid）写回案子。

演练先跑，确认没问题再开第二组。**`MERIMEN_DRYRUN=on` 优先于另外两个开关**：只要它开着，不管 `MERIMEN_WRITES` 和 `WORKER_SUBMIT` 是什么，都只填表检查、什么都不保存。真保存必须把它关掉（或不设）。

停下来的情况（案子进入 `waiting_user`，时间线写明原因，不自动重试）：缺资料（写明缺哪项）、用户信息不全、工坊缺失或查到的不是恰好一行、保险公司不在 16 家表里（例如 Lonpac）、Liberty 看不出地区、车型没把握（前两名太接近）、某个下拉选项找不到、Merimen 出现“已有进行中的案子”提示（**不会自动确认**，因为崩溃后重试也会碰到同一个提示，会建出第二个案子）、Merimen 拒绝表单（显示它自己的话）、保存后落地页不明（重试前先看 worklist）。没有已登录标签页或表单打不开：稍后重试（见「队列」：30 秒、2 分钟、10 分钟，第 4 次为止）。

**放行一个被「按过 Next」标记挡住的案子**：先在 Merimen 工作清单（worklist）按车牌搜，确认真的没有这个案子，然后由人在 `case_events` 里给该案子插一行 `step = 'create_cleared'`（之后才可以重跑）。如果搜到了案子，把案号写进该案子的 `merimen_caseid` 即可，不要放行。

只自动化了建案这一步。建好之后案子进入 `waiting_user`，时间线写明 Adjuster Report、文件和照片还没有自动化，截图里程碑只记“案件已打开”。已有 Merimen 编号的案子不会再建第二个。manager 或 adjuster 在 Merimen 里匹配不上：案子照样记下编号，时间线请人手动补。

**已知限制（建案子）**：
- 选择器没在真实网站上验证过，APC bot 的演练就是验证；演练通过标准写在 `/mnt/project-files/merimen-login/APC-BOT-ADDENDUM-3-create-case.md`，没过标准不开写入开关。
- 一次只建一个：真保存时 `ORG_CONCURRENCY` 必须是 1（大于 1 直接拒绝，错误码 `concurrency_unsafe`）。「按过 Next」标记用事务里的 advisory lock 加条件写入，第二个 worker 拿不到标记就到不了 Next。
- Next 之前不会去 worklist 搜重复；Merimen 只在 1 天内有进行中的案子时才弹重复警告。出现 `create_unclear` / `duplicate_warning` / `unexpected_dialog` 都要先在 worklist 搜车牌。
- 「预计费用」固定选 `10,000 - 12,500`（和主人的脚本一样）；创建时还不知道撞击方向，损失描述先用中性文字。
- 点 OK 只点保险公司 API 提示和积分框（有白名单）；任何别的框、任何在问问题的框都不点，案子停下。
- 锁定了工坊但没按成 Next（本机失败）：标记已写，案子停下等人；人确认 Merimen 没有这个案子后，插一行 `create_cleared`（工坊锁不能自动放开，要在后台处理）。
- Jev 的保险公司/Liberty 地区检查还在 Phase A 之后跑，只警告不拦；建案前不跑。

## 迁移

`web/drizzle/0007_worker.sql` 只新增表和 `jobs.not_before`。`web/drizzle/0008_case_screenshots.sql` 只新增表 `case_screenshots`（可重复执行），并在角色 `autopilot_worker` 存在时给它 `SELECT, INSERT, UPDATE`（没有 DELETE）。生产库要等主人点头之后再跑 `npm run db:migrate`。本文件不会替你执行。
`web/drizzle/0017_worker_case_extras_grant.sql` 只给角色 `autopilot_worker` 加 `case_extras` 的 `SELECT`（worker 读照片台用 Space 加的零件，从不写）。2026-11-27 对照生产库查过 worker 用到的每张表，只缺这一张。

如果 PR #31 也要用 0007 这个编号，后合并的那个改号即可（迁移按文件名排序执行，每个文件都可重复执行）。

## Step 2 和学习数据（Phase B）

用户按「完成」之后，Phase B 在照片对齐之后做 Step 2：按**最终照片名字**（加上用 Space 加的、没有照片的部件）从 Merimen 的 catalogue 规划 parts + labour（`step2.py`，移植自 `typesafe/step2_plan.py`），再做照片名字和 Select Parts 的双向核对（`step2_check.py`，移植自 `tools/naming-desk/sync_check.py`）。结果写进 `step2_log`。

真正勾选时（两个写入开关都开、`MERIMEN_DRYRUN` 关），catalogue 里没有的部件会在 dsp_details 上加成手动行（`manual_price.py`）：分组跟同侧的保险杠（Suspension Crossmember 放 130，Rear Panel Inner Trim 放 70），Bumper Clips 固定 15 × 10.00，其它用主人的参考价（`tools/price_lookup.py ref`，同车型 → 同品牌 → 同档次 → 同级别）。只有别的档次的价格、或者没有价格的部件不加，双向核对会把它列出来给人处理。价格数据默认读仓库的 `tools/` 文件夹（Docker 镜像里是 `/app/tools/`），`PRICE_DATA_DIR` 可以改成别的文件夹。
- 没有真实的 Merimen 适配器：默认适配器读不到 catalogue、也不能点选。`MERIMEN_WRITES` 和 `WORKER_SUBMIT` 没有同时是 `on` 时只记录计划（dry run）。
- `STEP2_AI=on` 且设了 `ANTHROPIC_API_KEY`（可选 `STEP2_MODEL`）时，AI 用 playbook 的 step2 文件复核计划：只能加 catalogue 里有的项、加手工行、去掉伴随件，不能去掉有照片的项。出错就用规则计划。
- 用户的最终名字写进 `photo_learning`（改过的标 `changed`）。取走：`python -m autopilot_worker.learning export`（JSON lines，取走的行会标记）。

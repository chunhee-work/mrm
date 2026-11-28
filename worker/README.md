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
- 孤儿尝试：一次 `relogin_try` 超过 3 分钟还没有结果行（结果没写进去，或 worker 中途死了），就一直不再试，没有 24 小时期限。一发现孤儿就发一封邮件，会话 detail 显示 `relogin_stopped`；直到之后出现任何结果行（包括重新保存时 Chrome 已登录着写下的 `login_session_live`），或证明密码的成功（通常是用户先在 Merimen 确认登录再重新保存），才解除。`login_session_live` 不解除「没有明确回复」的 24 小时封锁。密钥不对时 detail 也显示 `relogin_stopped`，但那时什么都没打，也不发邮件。到达 24 小时 12 次上限时 detail 显示 `relogin_capped`。「没有明确回复」的 24 小时封锁期间 detail 显示 `relogin_unclear`。网站 app.autopilotclaim.com 登录后顶部的提醒就读这个 detail。
- **自动重新登录只要开过一次，就绝不要手动用 SQL 把保存时检查重新排队**（`verify_state='queued'`），关掉回退以后也一样：那会在所有限制之外再打一次密码（第一次没读到结果或 orphan 之后，登录行还是 `ok`）。要重试就让用户在网站上重新保存登录。
- 密码不对 / 账号锁定：和保存时一样封住、暂停、发邮件，之后再也不打字，直到用户重新保存。锁定时邮件请用户先等 Merimen 解锁再保存。只有这次运行时登录还是 `ok`、而且还是这次打的那个密码（`password_nonce` 没变）才会改（用户刚好重新保存了就不动）。
- 要验证码：不写 `otp`（网页会显示一个已经没人接的验证码框），写 `unknown` + 封住 + 暂停（和保存时的 unknown 一样），审计 `relogin_otp`，发一封邮件请用户先确认登录在 Merimen 能用，再重新保存。
- 子进程只拿一小份环境变量（没有 `MERIMEN_CRED_KEY`、`DATABASE_URL`）。日志只有固定的词，没有地址、页面文字、用户名或密码。
- **任务做到一半被登出**（2026-11-28）：Phase A / Phase B 没做完时，看这次任务里有没有某一步打开的页面出现了登录表单（`login_seen`），再看一次 Chrome（有没有已登录的 claims 地址；带登录标记的标签页是不是全都显示密码框）。被登出了，这个任务就放回队列，**不占重试次数**（`attempts` 退回一次），时间线写一行 `Merimen logged out during …`，`worker_sessions` 改成 `expired`；只在 `MERIMEN_RELOGIN` 打开时这样做（关着时任务照旧处理、照旧请用户登录）；这个机构还会被标记，下一个 tick 即使旧标签页地址还带着 `CFID`/`RID` 也会预约一次重新登录（上面的所有限制照旧）。登录回来后任务从停下的地方接着做；照片只在 Phase A、而且是同一个任务再次运行时（被放回过，或者只是这个任务的第二次以后的运行，例如 worker 中途被重启），Merimen 里正好是清单开头那几张（标题在清单里不重复）时才补传剩下的，其它不完整的情况停下等人工处理；Phase B 的照片写入（上传、改名、排序）中途断了照旧等人工处理，不放回。重新登录被拒（cap、streak 等）时，这个机构 6 小时内不再放回；标记 25 分钟内没有被一次成功的重新登录清掉，也一样 6 小时内不再放回；同一个机构 3 小时内在任务里被登出 4 次（不管哪个案件，包括到上限停下的那次），6 小时内不放回、也不再预约登录（不管标签页地址是什么）；暂停期间看到的旧标签页不算重新连上，不会清掉 streak。hold 从开始算 6 小时，期间再被拒不会延长。有好几个已登录标签页、没有一个是 worker 自己的：不猜，stderr 写 `session_lost: several_tabs`，关掉多余的 Merimen 标签页（不要关窗口）再重新排队。Merimen 里文件只有一部分（`docs_partial`）的，不管哪一次运行都停下等人工。被暂停的机构如果任务又碰到登录表单，就不算 connected，队列等着（不让每个案件一个个停下）。文件上传到一半停下（不管原因，登出也一样，不会为它再登录一次）一律等人工处理；最近一次 Phase A 还在排队或运行、或者因为照片以外的原因（文件、报告、登出太多次）停下等人工时，按「完成」也不会开始 Phase B；只因为照片停下的 Phase A 照旧让 Phase B 用最终名字上传或修照片。人工在 Merimen 修好后，重新排队同一个 Phase A 任务（下面的 SQL）：已有的文件会跳过，报告再存一次，然后 Phase B 跟着「完成」走。续传前会再读一次照片列表，两次一样才补传。照片在等待期间被改名：Merimen 里用模型名上传的那张仍算已上传（Phase B 再改名），只要这个标题不是清单里别的照片的名字。这期间被放回过的任务再跑时照样严格检查（照片只有一部分就停下等人工处理；文件只有一部分一律停下）。只有任务自己会重试的情况和 worker error 会被放回；等人处理的停止（Step 2、提交前检查、案件填不进去、缺文件缺字段、照片要人工处理）照旧停下，唯一例外是 Phase A 照片上传本身碰到了登录表单。文件上传、Select Parts 读取、读案件总额时碰到登录表单，也算可以重试；文件传到一半被打断的，下一次停下等人工处理。案件已经建好但那次运行被打断的，下一次运行照样把案件推进到 完成 / Phase B。标记 25 分钟后自动失效（这期间人工在 worker Chrome 里登录也要等它失效，因为旧标签页和人工登录分不出来）。重新登录后有两个带登录标记的标签页时，用 worker 自己重新登录的那个（它的 Chrome 标签页 id 存在 state 目录的 `relogin_own_tabs.json`，worker 重启后也认得）。worker 自己的重新登录被拒或失败后，这个机构 6 小时内（或到重新登录成功为止）不再放回任务，任务走普通重试，避免旧标签页导致反复输入密码。同一个案件 6 小时内最多放回 3 次，第 4 次任务失败、案件等人处理（停下时仍预约一次重新登录，所以一个每次都会登出的步骤每个案件最多带来 4 次自动登录，都在重新登录自己的限制之内）；要继续就重新排队**同一个**任务（不要新建）：`UPDATE jobs SET state='queued', attempts=1, locked_by=NULL, locked_at=NULL, not_before=now() WHERE id=<job id> AND state='failed'`（`attempts=1` 是故意的：下一次就不是第一次运行，即使没有放回记录，照片和文件的严格检查也照样生效，而且还有重试次数）。stderr 里有固定措辞的行：`session_lost: put_back` / `cap_reached` / `not_put_back_held` / `held_force_timeout` / `held_org_cap` / `held_relogin_<结果>`，后面带 `org=<6 位哈希>`（每个机构每种每小时最多一行）。多个机构时每个机构要有自己的 `WORKER_ACCOUNTS` 条目和 `WORKER_ORG_ACCOUNTS`，共用一个 Chrome profile 时一个机构的重新登录会被另一个机构的任务用到。代码在 `loop.check_session_after`、`photo_sync.prefix_done`。
- 一个机构只能由一个 worker 进程负责（别给同一个机构再开一个 worker），否则保存时检查和自动重新登录之间没有先后保证。
- 回退：`MERIMEN_RELOGIN=off` 再重启 worker。注意这会连自动重新登录一起关掉：下次被登出后这个机构停在 `waiting_login`，任务不会被领取，而按 owner 规定没人手动登录，案件会一直等到开关重新打开，所以只在要紧急停掉所有自动登录、并且 owner 同意时用。只想撤回「做到一半被登出」那部分（PR #147），就 revert 那个 PR，自动重新登录照旧开着。回退以后上面那条 SQL 禁令仍然有效；已写下的封锁（blocked）、暂停和审计记录也都保留。

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

领取见上一节。同一机构同时运行的 job 数量由 `ORG_CONCURRENCY` 限制（不设时等于 `WORKER_SLOTS`）。密码错误不退避、不重试。队列没有上限。

### 同时做几单（`WORKER_SLOTS`，计划 #150）

- `WORKER_SLOTS=1`（默认）：一次一单，和以前一样（只有这几点不同：按案子上传顺序领；同一案子不同时跑两个 job；启动时关掉上次开槽位留下的步骤标签页；记下的步骤标签页不算会话标签页；同一个 state 文件夹上已有 worker 在跑时拒绝启动）。`2` 到 `8`：一个 worker 进程同时跑这么多 job，每个 job 一个线程，自己的 Playwright 连接，每个 Merimen 步骤开自己的标签页（playbook 00「one tab per case」）。
- 顺序：**先上传的案子先做**，包括它后面的步骤（`ORDER BY cases.created_at, cases.id, jobs.created_at, jobs.id`）。用户 1 先上传，用户 1 的案子先占满空位；用户 2 的照片模型可以用剩下的空位。
- 同一个案子永远不会同时跑两个 job。
- 一个 Chrome 只装一个 Merimen 登录（只在开槽位时检查）：几个有 Merimen 登录的机构共用同一个 Chrome 端口时，只有拥有它的机构能跑 Merimen 步骤：现在正有 Merimen 步骤在跑的机构优先（跑着的时候归属不会换），都没有或都有时，第一个（未删除）案子最早的那个（还没有案子的排最后，时间一样按机构 id；做完的案子也算，所以实际上第一个机构一直拥有）；别的机构不会被自动登录到这个 Chrome（会话 `waiting_login`，detail `shared_chrome`），登录检查也跳过它（不输入密码、不算一次尝试），它的 Merimen 步骤一直排队，直到它有自己的 Chrome 配置（`WORKER_ACCOUNTS` + `WORKER_ORG_ACCOUNTS`）。不会把一个用户的案子写进另一个用户的 Merimen 账号。
- 建新案子（Phase A 第 1 步，约 1 分钟）一次只建一个：一个案子还在建的时候不领另一个还没有 Merimen 案号的 Phase A（不占槽位干等）；它建完（锁放开）就可以领下一个，它自己的 Adjuster Report、文件、照片接着和下一个建案同时跑。已经有案号的 Phase A（从报告开始重跑）不排这个队。万一撞上锁，最多等 10 分钟，然后放回队列 60 秒后再试（Merimen 里什么都还没做；不算一次尝试，案子的 error 和状态不变，也不算登出，时间线只写「Waiting for another case to be created in Merimen first」）。
- 这个进程还在跑的 job，租约过期（比如数据库断开超过 15 分钟）也不会被放回队列或改成 `failed`：放回租约的那一步跳过它们，正在跑的线程继续续租。同一个 job 也不会在一个进程里同时跑两次。
- 每个 job 的标签页只能打开它自己的 Merimen 案子：地址里的 `caseid=` 不是这个案子的（已存的案号，或者建案时刚记下的案号），步骤在打开之前就停下；点击、表单提交或跳转落到别的案子上，这个标签页的下一个动作就停下；标签页和它的弹出窗口每次跳转都会被看着。stderr 写一行 `slot-N job <id> case_mismatch`，job 改为 `failed`，案子 `waiting_user`、error `case_mismatch`，等人看（适配器里的 `except Exception` 吞不掉它）。还没有案号的建案步骤不检查。
- 主标签页只读（白名单）：步骤只能读 `url`、`is_closed`，以及用 `context.new_page()` 开自己的标签页；其它一切（goto、click、locator、keyboard、frames、`context.pages`、`context.close` …）都报 `home_tab_write`，job 改为 `failed`，案子 `waiting_user`，等人看。
- 会话标签页：开槽位时，记下的步骤标签页和由它们一层层弹出的窗口不算；其它标签页都算（人从主标签页点开的弹出窗口也算，两个就是 `several_tabs`）。`WORKER_SLOTS=1` 时弹出窗口照旧算标签页。只剩步骤标签页 = 已登出。步骤标签页弹出的窗口（和它们再弹出的）都记在这个 job 名下，job 结束时一起关掉，步骤自己先关了标签页也一样。
- 有 Merimen 步骤（Phase A、Phase B；`checks` 只是在等，不算）在跑的机构不跑 keepalive（步骤自己就让会话保持活跃），keepalive 不会连到步骤标签页。一个卡住的步骤会让这个机构的 keepalive 一直停着，看 `still running` 那一行。
- 开槽位时每个 job 在 stdout 写两行：`slot-N job <id> <step> start <时间>` 和 `slot-N job <id> <step> end <时间> after <秒> s`，试运行看两个案子是否同时在跑就看这两行。
- 截图（开槽位）：只截 job 自己还开着的标签页（显示的就是这个案子）；没有开着的就不截，stderr 写一行 `screenshot skipped`。从不截主标签页、从不截别的 job 的标签页。
- 照片模型（DINOv2 在 CPU 上）一次只跑一个。
- job 里发现 Merimen 登出：这个机构不再领新的 Merimen 步骤，等重新登录；重新登录等这个机构正在跑的 Merimen 步骤结束，最多等 10 分钟（`session_lost: relogin_waits_for_jobs`）。几个 job 同时撞到同一次登出（2 分钟内、中间没有成功的重新登录）只算一次登出。
- 一个 job 跑超过 `WORKER_JOB_MAX_SECONDS`（默认 3 小时）：只在 stderr 写一行提醒（`slot job … still running`），它继续占着自己的槽位和租约，不会被切断、也不会被再跑一次（Merimen 里的步骤可能会做两次）。其它槽位照常干活。卡住的是建案（`phase_a`，案子还没有 Merimen 案号）时，新的建案都会等它：先在 Merimen worklist 按车牌搜（「按过 Next」标记会让重跑停下等人），再重启 worker；重启是安全的。
- 从日志里的 job id 找到案子（只在 Neon 里查，日志不写案子和机构）：`SELECT j.id, j.step, c.id AS case_id, c.org_id, c.plate FROM jobs j JOIN cases c ON c.id = j.case_id WHERE j.id = <job id>;`
- driver 的每个属性都要写进 `pool.SHARED`（所有槽位共用，线程安全）或 `pool.PER_JOB`（每个 job 重新设置）；有新属性没写进去，测试会失败。
- 停止（SIGTERM）：不再领新 job，正在跑的最多再等 `WORKER_STOP_SECONDS`（默认 80 秒，最多 85 秒，从收到信号算起），还没完的被切断，随进程结束，租约到期（900 秒）回到队列，再跑时从已经保存的地方接着做（建案靠「按过 Next」标记，绝不建第二个；报告重新填；文件跳过 Merimen 已有的）。Phase A 要几分钟，所以想不切断，就在每个槽位日志最后一行都是 `end` 时再重启。管进程的工具给的停止时间要比它长：systemd 默认 90 秒够；pm2 要加 `--kill-timeout 90000`；`kill` 只发 TERM，然后等 90 秒再看。
- 每个槽位多一个 Playwright 连接（node 进程）和一个 Chrome 标签页。先开 2，看机器内存（Chrome + worker 的 RSS）再开 3；最多 8。启动时 stdout 打印 `worker slots: N, jobs per org: M`；`ORG_CONCURRENCY` 如果在 env 里写成 1，同一个用户还是一次一单，要删掉这一行。
- 一个 state 文件夹只跑一个 worker 进程（同一个案子不同时跑两个 job，这一点只在一个进程里保证）：每个 worker（不管开不开槽位）启动时锁住 `<state>/worker_slots.lock`，第二个就拒绝启动（不然它启动时会关掉第一个的步骤标签页）；进程结束（包括被 kill）锁自动放开。不开槽位、`ORG_CONCURRENCY` 大于 1 的多进程写入照旧拒绝（`concurrency_unsafe`）。
- 步骤开的标签页 id 记在 `<state>/step_tabs.json`；job 结束时关掉自己的；重启时按 id 关掉上次留下的（`WORKER_SLOTS=1` 也关，回滚之后不会因为旧标签页变成 `several_tabs`；Chrome 里已经没有的 id 直接删掉），从不关主标签页、从不关窗口的最后一个标签页。

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

照片模型怎么跑起来（2026-11-28 修好；之前 worker 没装 torch、也没有权重，每次都 `predict failed` 退回 Claude）：

- 依赖：CPU 版 torch（`pip install --index-url https://download.pytorch.org/whl/cpu torch==2.8.0`）、`numpy`、`huggingface_hub`（`requirements.txt`）。DINOv2 的模型代码放在 `DINOV2_HUB`（Docker 镜像里是 `/opt/dinov2_hub`，固定 commit 7764ea0；不用 Docker 时自己下载到那里，或放在 `~/.cache/torch/hub/facebookresearch_dinov2_main`）。
- 权重：第一次起名时用 `HF_TOKEN` 从 `HF_MODEL_REPO`（默认 `chunhee00/mrm-photo-model`）下载 `production/` 到 `PHOTO_MODEL_DIR`（默认 `<WORKER_STATE>/photo-model`），之后不再下载。设了 `HF_MODEL_REVISION`（模型仓库的 commit）时，文件夹不是这个版本就重新下载一次：换模型 = 改这个设置再重启，不用手动删文件夹。`production.json` 里的 `models/…` 路径会改写成这个文件夹里的文件（`production.resolved.json`），缺任何一个文件就是 `model missing`。下载和改写有文件锁，几个案件同时起名也只下载一次。
- 名字：模型的名字先过店里的命名规则再写入。规则只有一份：`typesafe/photo_train/name_rules.py`（店主 Mac 上的 `naming.py build` 也用它；新规则只加在那里，具体规则见那个文件和 playbook 10/11）。规则加载不了就算这一步失败（网站改由 Claude 起名），不会存没处理过的名字。
- `predict_case.py` 和店主 Mac 上的生产版一样（含 2026-11-19 照片不跳边规则，没有 Jev）。同一时间只跑一个 `predict_case`（两个 ViT-L + ViT-B 进程会抢 CPU、内存翻倍）。超时按照片数算：`max(600, 300 + 8×张数)` 秒；超时也算失败，网站改由 Claude 起名。

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
- 一次只建一个：同一个 worker 进程里建案子这一步用锁排队（`WORKER_SLOTS` 大于 1 也一样，计划 #150）。「按过 Next」标记用事务里的 advisory lock 加条件写入，第二个 worker 拿不到标记就到不了 Next。
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

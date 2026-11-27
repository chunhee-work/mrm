# APC bot 补充说明 3：worker 开始「进 Merimen 建案子」（Phase A 第 1 步）

适用：计划 issue #113 对应的 PR 合并之后。只有 worker 变了：不用迁移，不用改网站，没有新密钥。
只写环境变量的名字，不写任何值。

## 1. 你要做的（按顺序）
1. 在 worker 那台机器上拉最新 `main`，重启 worker。
2. 不需要新的数据库迁移（0013–0016 已经在生产里；这次不加）。
3. 唯一的新开关：`MERIMEN_DRYRUN`。其它开关沿用：`MERIMEN_WRITES`、`WORKER_SUBMIT`、`EXT_CONNECT`。

## 2. 开关顺序（一步一步来，不要跳）
| 步骤 | MERIMEN_DRYRUN | MERIMEN_WRITES | WORKER_SUBMIT | 会发生什么 |
|---|---|---|---|---|
| 现在 | 不设 | off | off | 和以前一样，建案子这一步提示「未移植」 |
| 第 1 步：干跑 | on | off | off | 在 Merimen 里打开建案表单、填好、读回检查，**不按 Next**，不会产生案子 |
| 第 2 步：真建 | off | on | on | 填好、检查通过后，在锁定工作坊的瞬间按 Next，真的建出案子 |

规则：DRYRUN=on 时，不管另外两个开关是什么，都不会保存任何东西。MERIMEN_WRITES 和 WORKER_SUBMIT 要两个都开才会真建。

## 3. 干跑怎么验收（过关标准）
用真实案子跑干跑，要覆盖这张表里的每一类（一个案子可以同时覆盖几类），**每类至少一个**：
- 保险公司：Allianz、Etiqa（保险）、Etiqa（Takaful，分行 ET HQ）、Zurich（保险）、Zurich Takaful、Takaful Ikhlas、Takaful Malaysia、其余有的就加（16 家里能找到真实案子的都跑）。
- Liberty：东海岸、东马、Klang Valley、北部、南部，每个地区各一个。
- 工作坊：1、2、3 各一个；再加一个名字是另一个工作坊名字开头的（如果有）。
- 对方（claimant）有保险的案子一个；没有的一个。
- 车型：有「绿色」有价格数据的一个；只有白色选项的一个（应提示「没有价格数据」）。
- Lonpac 案子一个（应停下，写明用备用案子）。
全部满足才算过：
- 每一行读回的内容都对：保险公司（COID）、车型、维修的 rep、车牌、车架号。
- 工作坊被正确认出（时间线里能看到工作坊的编号和 COID）。
- 干跑之后 Merimen 里**没有留下草稿，也没有扣费**（第一次干跑后请你去 Merimen 看一眼）。
- 没有出现「未知确认框」的停止；如果出现，把停止原因发回来。
- 全程只开一个 worker，`ORG_CONCURRENCY=1`。
- 把每个案子的结果记在一张表里（案子、保险公司、分行、工作坊、结果）发给老板；老板（Chun Hee）看过并同意**之前不要开写入开关**。

过了以后再进第 2 步。第一个真建的案子，建议用一份自己人的测试案子。

## 4. 请你发回来的东西（不要发密码、不要发地址里的 CFID/CFTOKEN/USID/RID）
- 每个案子的时间线那几行（「Create form filled and checked …」）。
- 读到的 rep / 工作坊 COID。
- 任何停止的原因代码。

## 5. 会停下来的情况，以及怎么办
| 代码 | 意思 | 你做什么 |
|---|---|---|
| profile_incomplete / workshop_missing | 用户资料没填全，或这个案子没有工作坊 | 让用户补资料，不要手动补 |
| insurer_unknown / insurer_lonpac / liberty_branch / client_insurance | 保险公司或地区认不出，或对方保险信息不能用 | 让用户或老板看文件 |
| form_not_ready | 表单读回有一项不对 | 把时间线发回来 |
| unexpected_dialog | 出现了 worker 不会回答的确认框 | 发回来，人来决定 |
| **create_unclear / duplicate_warning** | 已经按过 Next，但不确定有没有建出案子 | **先去 Merimen 工作清单（worklist）搜这个车牌，确认有没有案子，再决定。不要重跑。** |
| not_logged_in / form_not_open / form_error / workshop_changed | 按 Next 之前就停了，什么都没发生 | 自动会重试；多次失败再看 |

「已建好但经理/审核员没设上」的案子，worker 会提示：请手动设置经理和审核员，并检查对方保险公司和保单。worker 不会再建第二个案子。

## 5b. 回滚和善后
- 不想再建：把 `MERIMEN_WRITES` 或 `WORKER_SUBMIT` 关掉（或开 `MERIMEN_DRYRUN`），重启 worker。
- 案子被「按过 Next」的标记挡住：在 Merimen 工作清单（worklist）按车牌搜。搜到了 → 把案号填进该案子；没搜到 → 才由人在 case_events 里插一行 `create_cleared`。重复警告也是同样处理，先搜再决定，不要人工再建第二个。
- 工作坊被锁了但没建成：标记还在，案子停下；确认没有案子后同样插 `create_cleared`（工作坊那一格的锁要在后台处理，这次没做自动放开）。
- 出现 `concurrency_unsafe`：把 `ORG_CONCURRENCY` 改成 1 再重启。


## 5c. 第一次真建：有人盯着（写入开关之前必须做）
干跑不会按 Next，所以按 Next 之后的部分（重复警告的文字、跳到 adjclmref、读案号、经理/审核员下拉、OK 框白名单）干跑证明不了。所以：
1. 干跑表格签字之后，只开**一个案子**的真建：一个 worker、有人在看、建完马上在 Merimen 工作清单按车牌核对，结果记下来。
2. 这个结果记录好之前，写入开关再关回去；记录完、老板同意，才长期开。
3. 开写入期间，主人的旧脚本（createpar2_sinar.mjs）要停用或不要同时跑；任何人在 Merimen 里手动建过的案子，要先把案号填进该案子，再重新排队，否则 worker 看不到它。
4. 人工放行 `create_cleared` 或填案号只走一条路：由 APC bot 在后台用 worker 数据库角色执行，事件文字里必须写：已搜 worklist、车牌、搜的日期、结果。不要手打随意的 SQL。

## 6. 已知限制（不是 bug）
- 页面上的选择器还没在真实网站上验证：干跑证明按 Next 之前的部分，按 Next 之后的部分要靠第 5c 节那次有人盯着的真建。
- 现在案子建好后会停在「等用户」，Phase A 后面的步骤（调查报告等）还没做；网页上这种状态暂时显示为「进行中」，后面会补显示。
- 建案子时还不知道撞击方向，所以损失描述先用中性文字。
- 「按过 Next」的标记不是真正的锁；只支持一个 worker、ORG_CONCURRENCY=1。
- 第 2 步一次只开一个公司/账号试，稳了再扩大。

## 7. 安全提醒
Claude 不会登录 Merimen，也不会替你打开开关。所有开关都由你（或老板）来开。

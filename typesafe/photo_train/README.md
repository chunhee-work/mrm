# photo_train — Merimen 照片自动命名（Jev 照片模型）

把 Merimen 案件照片自动认出「照片中间（十字线）是哪个零件」，给出 Merimen 用的零件名称和把握 %。
把握 ≥ 60% 的直接用；< 60% 的送到「部位标注台」让人确认，人的答案再拿回来训练，模型越来越准。

> ⚠️ 规则：**Merimen 只读**。这个项目只读取照片和文字，不在 Merimen 改任何东西。

---

## 1. 整体流程

```
Merimen（只读）
   │ list_all.py      公司全部案件清单 → all_cases.json
   │ harvest.py       下载照片 + 照片说明（名称）→ data/<案件>/NNN_docid.jpg + index.jsonl
   ▼
name_map.py          Merimen 名称清洗 → name_map.tsv（错字、同义词、LH/RH、合并、排除）
build_big.py         组训练集 → big_paths.txt + big_meta.tsv（+ 人工答案 user_corrections.json）
finetune.py          训练 DINOv2 → models/dinov2_b_<tag>.pt + pred_<tag>.jsonl（测试结果）
   ▼
predict_case.py      新案件逐张命名（看车型、前后照片），输出 top-3 + 把握 %
   ▼
部位标注台（claude.ai Artifact）  < 60% 的照片 → 人点选/画形状 → user_corrections.json / user_regions.jsonl
   └──────────────► 回到 build_big.py，下一轮训练
```

辅助：
- `lamp_models.py` — 查每个案件的车型（Vehicle Model），给 Perodua / Lorry 规则用 → `lamp_models.json`
- `fetch_fullres.py` — 只读取原图（最大 1280 px），给标注台用
- `sam_segments.py` — SAM 2.1 自动把照片切成零件形状，标注台里点一下就能选
- `motor.py` — 找出摩托车案件（不训练、不标注）→ `motor_cases.json`
- `shrink.py` — 把已下载照片缩到 256 px 省空间

---

## 2. 需要的模型

| 模型 | 用途 | 大小 | 放哪里 |
|---|---|---|---|
| **DINOv2 ViT-B/14**（Meta） | 主模型的「眼睛」：看照片提特征，我们在上面训练最后 4 层 + 分类头 | ~350 MB/个 checkpoint | 程序代码自动缓存到 `~/.cache/torch/hub/facebookresearch_dinov2_main`；训练好的放 `models/dinov2_b_<tag>.pt` |
| **SAM 2.1 large**（Meta） | 把照片自动切成一块块零件形状（标注台用） | ~900 MB | `models/sam2/sam2.1_hiera_large.pt` |
| SAM 3（可选，以后） | 打字找零件，例如输入 "bumper" 自动圈出来 | ~3.4 GB（约 8.5 亿参数） | 需在 Hugging Face 申请：https://huggingface.co/facebook/sam3 |

当前最好的模型（批次 10）：
- `models/dinov2_b_big10a.pt` — 第 1 段：单张照片 + 位置题（车头/车尾/侧面/底盘、LH/RH、Front/Rear）+ 左右翻转（LH↔RH 互换）。
- `models/seq_best.pt` — 第 2 段：同一案件前后各 4 张一起看（远景告诉近拍在哪里）。
- `models/seq_best_crop.pt` — 同上，再加「十字线放大图」（照片中间一半放大）。
- 两个第 2 段模型平均：**top-1 81.4%**（3330 张测试照片）。
`predict_case.py` 自动使用两个 seq 模型（`SEQ=0` 关掉）。改名称规则或加标注后，只要重训第 2 段（`seqctx.py train`，约 30 分钟），不用重训 DINOv2。

---

## 3. 安装（新 Mac）

```bash
cd typesafe/photo_train

# 训练 / 预测环境（Python 3.9+）
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
# DINOv2 程序代码：第一次运行会从 GitHub 下载到 ~/.cache/torch/hub（之后离线可用）
# Python 3.9 需要把 hub 里的 dinov2 代码加上 `from __future__ import annotations`（已在本机打过补丁）

# SAM 2.1 环境（SAM 2 需要 Python ≥ 3.10，用 uv 装 3.11）
uv venv -p 3.11 .venv_sam2
uv pip install -p .venv_sam2/bin/python -r requirements-sam2.txt
mkdir -p models/sam2
curl -L -o models/sam2/sam2.1_hiera_large.pt \
  https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt
```

Merimen 连接：通过 `../driver.py`（AppleScript 控制已登录的 Chrome，在页面里用 XHR 读取）。
**`driver.py` 含登录资料，不放进 git**（见 `.gitignore`），新机器要自己放一份。

磁盘：照片约 7–12 GB（256 px），每个模型 checkpoint ~350 MB，只保留最好的一个。

---

## 4. 常用命令

```bash
# 下载（会自动跳过已下载案件；DEADLINE = 停止时间 epoch 秒）
DEADLINE=... python3 harvest.py all_cases.json >> harvest_all.log

# 训练一轮
python3 name_map.py
MIN=20 CAP=1000 STRONG_CAP=1000 python3 build_big.py
PATHS_FILE=big_paths.txt META_FILE=big_meta.tsv INIT=models/dinov2_b_big10a.pt \
  .venv/bin/python finetune.py 3 4 big7          # 3 轮，解冻最后 4 层，名字 big7

# 批次 10 第 2 段：先算全部照片特征，再训练「整组照片」模型
.venv/bin/python finetune2.py 3 4 big10a                     # 第 1 段（位置题 + 左右翻转）
.venv/bin/python seqctx.py extract models/dinov2_b_big10a.pt big10a
.venv/bin/python seqctx.py train   models/dinov2_b_big10a.pt big10a big10

# 认一个案件的照片（照片按拍摄顺序，整个案件一起给）
VEHICLE="PERODUA Myvi ..." .venv/bin/python predict_case.py models/dinov2_b_big10a.pt data/<案件>/*.jpg

# 标注台：原图 + 自动切形状
python3 fetch_fullres.py tasks.json full/
.venv_sam2/bin/python sam_segments.py segs.json full/t*.jpg
```

---

## 5. 它怎么运作

**训练**
- DINOv2 ViT-B/14 + 一层线性分类头；训练最后 4 层，AdamW + OneCycle，label smoothing 0.1，不做左右翻转（会搞乱 LH/RH），Mac MPS GPU。
- `INIT=` 从上一个最好的模型接着练（复制共同名称的分类权重）。
- 固定 44 个测试案件做比较；新模型要比旧的好才替换。
- **重点练弱项**：测试 ≥ 90% 的零件写在 `strong_labels.txt`，下载时跳过（训练不限量：限 300 张会忘记，big7 教训）；其他每个最多 1000 张。
- 名称至少 20 张照片才训练（`MIN=20`），太少的先靠人工标注。

**预测（predict_case.py）**
- 每张照片的 % 会跟前后照片平滑（权重 0.5），因为同一组照片通常拍同一处。
- 车型规则（`VEHICLE=`）：
  - **PERODUA**：不用 Front Panel Assembly → Front Panel Upper / Fender Inner / Front Crossmember / Front Panel Lower
  - **其他品牌**：一律 Front Panel Assembly
  - **Lorry**：Front Chassis Member 不分 LH/RH
- 不出现带「&」的名称（一张照片 = 1 个零件）。
- `sure = conf ≥ 0.60`；不 sure 的送标注台。

**名称规则（name_map.py，全部来自用户确认）**
- LHF/LHR/RHF/RHR 是错字 → 只用 LH/RH（F/R 变成 Front/Rear）
- 合并：Front Pillar Outer → Front Pillar；Quarter Panel Outer → Quarter Panel；Front Panel → Front Panel Assembly；Rear End Panel → Rear Panel；Outer Lamp LH → Rear Lamp Outer LH；所有 washer tank → Windscreen Washer Tank；所有车门镜 → Door Mirror LH/RH
- 排除：通用说明（"Photo of damaged parts" 等）、纯数字、多零件名称（&、and、" n "、逗号连两个零件）
- 更多看图规则（十字线中心、手指、拉远照片判断左右、底盘、反光片是红色……）记在 `../../memory/photo-center-crosshair-rule.md`

**部位标注台（人工确认）**
- 显示车型、前两张照片、选项（Merimen / 模型 %），最高 % 自动选好，Enter 保存。
- 可以点 SAM 切好的形状、拖白点调整、换颜色，再点选项给这个形状命名（1 个形状 = 1 个零件）。
- 答案 → `user_corrections.json`（覆盖 Merimen 原名称）；形状 → `user_regions.jsonl`（以后训练「按形状认零件」用）。

---

## 6. 常见问题

- **"Session not matched" / docview unavailable**：同一个 Merimen 账号在别处登录了。暂停 harvest，确认没人在用再继续。
- **GitHub 500 / 无法下载 dinov2**：程序已改成优先用本机缓存 `~/.cache/torch/hub/facebookresearch_dinov2_main`。
- **加了很多新名称后准确率反而下降**：照片少的名称会拖累模型，所以用 `MIN` 和 `STRONG_CAP` 控制。
- **不要提交到 git**：`driver.py`、`data/`、`models/`、`.venv*`、`*.json(l)`（有车牌）。

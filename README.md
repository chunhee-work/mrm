# MRM — Merimen motor-claim automation

An AI agent (Claude Code) keys third-party motor claims into Merimen e-Claims end-to-end:
- read the claim PDFs;
- create the case;
- fill the adjuster report, rates and narratives;
- upload the documents and the named photos;
- build the estimate (parts, labour, misc);
- log each case in the Google Sheet and report back.

The user only reviews and corrects. Every correction becomes a rule in this repo.

## Start here

| Read | For |
|---|---|
| [`TUTORIAL.md`](TUTORIAL.md) | Setup on a new machine, the start of every session, and the 12 steps with exact commands. |
| [`HANDOVER.md`](HANDOVER.md) | All the context: the job, accounts, history, cases done, **open items right now**. |
| [`CLAUDE.md`](CLAUDE.md) | The rule sheet, loaded in every Claude Code session. |
| [`playbook/`](playbook/README.md) | The user's rules, one file per step. Read the matching file before each step. |
| [`tools/mrm-bot/README.md`](tools/mrm-bot/README.md) | Every Merimen script: arguments, JSON inputs, checks. |

Quick check of a machine: `bash tools/mrm-bot/doctor.sh`

## Layout

```
CLAUDE.md, TUTORIAL.md, HANDOVER.md
playbook/            rules per step (00 start … 09 finish)
memory/              the source notes behind the playbook (index MEMORY.md), mistakes log, labour diff log
tools/mrm-bot/       Merimen CDP scripts (live copy: ~/mrm-bot), sync.sh, doctor.sh, relogin.example.mjs
tools/naming-desk/   the 照片命名台 page: template, builder, merge of the user's edits, upload plan
tools/               labour data (damage_to_ticks.md, labour_rules.json), part prices + price_lookup.py, rclick.swift
typesafe/            step2_plan.py (photo names -> parts/labour plan), partmatch.py, TypeSafe experiment
typesafe/photo_train photo-naming model (DINOv2), case_report.py, name_map.py (naming rules); weights are local only
```

Never commit credentials, session files or case data. The rules for that are in `.gitignore`, `CLAUDE.md` and
`TUTORIAL.md` Part F.

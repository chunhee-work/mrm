---
name: superpowers
description: "Use when starting any coding or creative-build task — building a feature, fixing a bug, writing a plan, reviewing code, creating a skill, or setting up a workspace. Establishes the disciplined engineering workflow (brainstorm → plan → execute → review → finish) and routes to the matching bundled process. Invoke BEFORE any response, including clarifying questions."
---

# Superpowers

A single skill bundling 14 engineering-discipline workflows. Each lives in its own folder under `workflows/` with its full guide (`SKILL.md`) plus any scripts and reference files it needs.

<EXTREMELY-IMPORTANT>
If you think there is even a 1% chance one of these workflows applies to what you are doing, you MUST use it. If a workflow applies, you do not have a choice. Invoke it BEFORE any response or action — including clarifying questions, exploring the codebase, or checking files.
</EXTREMELY-IMPORTANT>

<SUBAGENT-STOP>
If you were dispatched as a subagent to execute a specific task, ignore the dispatch rule above and just do your task (using the relevant workflow if one fits).
</SUBAGENT-STOP>

## How to use this skill

1. Match the task to a workflow in the table below.
2. **Read that workflow's file** — e.g. `workflows/brainstorming/SKILL.md` — and follow it exactly. If it has a checklist, create one todo per item.
3. Announce: "Using superpowers:<workflow> to <purpose>."

**Cross-references:** Inside the workflow files you'll see references like `superpowers:test-driven-development` or `superpowers:finishing-a-development-branch`. These are the OTHER workflows in this same skill — read `workflows/<name>/SKILL.md`. Relative links inside a workflow (e.g. `visual-companion.md`, `code-reviewer.md`, `../requesting-code-review/code-reviewer.md`, `scripts/review-package`) resolve within `workflows/` because the original folder layout is preserved.

**Priority when several apply:** process workflows first (they set the approach), then implementation. `brainstorming` and `systematic-debugging` are the most common entry points.
- "Let's build X" → `brainstorming` first, then plan → execute.
- "Fix this bug" → `systematic-debugging` first.

**User instructions win.** CLAUDE.md / AGENTS.md and direct requests override these workflows, which override default behavior. Only skip a workflow when the user explicitly tells you to.

## The workflows

| Workflow | Use when | Read |
|----------|----------|------|
| **brainstorming** | Before ANY creative work — new feature, component, or behavior change. Turns an idea into an approved design/spec. Hard gate before implementation. | `workflows/brainstorming/SKILL.md` |
| **writing-plans** | You have a spec/requirements for a multi-step task, before touching code. Produces a bite-sized, TDD-structured implementation plan. | `workflows/writing-plans/SKILL.md` |
| **subagent-driven-development** | Executing a plan with mostly-independent tasks in the current session — fresh implementer subagent per task, review after each. | `workflows/subagent-driven-development/SKILL.md` |
| **executing-plans** | Executing a written plan in a separate/inline session with review checkpoints (use when subagents aren't available). | `workflows/executing-plans/SKILL.md` |
| **dispatching-parallel-agents** | 2+ independent problems (different test files/subsystems/bugs) that can be worked concurrently without shared state. | `workflows/dispatching-parallel-agents/SKILL.md` |
| **test-driven-development** | Implementing any feature or bugfix, before writing implementation code. Red-green-refactor; no production code without a failing test first. | `workflows/test-driven-development/SKILL.md` |
| **systematic-debugging** | Any bug, test failure, or unexpected behavior, before proposing fixes. Find root cause first — no symptom fixes. | `workflows/systematic-debugging/SKILL.md` |
| **verification-before-completion** | About to claim work is complete/fixed/passing, or before committing/PR. Requires fresh verification evidence before any success claim. | `workflows/verification-before-completion/SKILL.md` |
| **requesting-code-review** | Completing a task/major feature or before merge — dispatch a code-reviewer subagent with crafted context. | `workflows/requesting-code-review/SKILL.md` |
| **receiving-code-review** | Receiving review feedback, before implementing it — verify before implementing, push back on what's wrong, no performative agreement. | `workflows/receiving-code-review/SKILL.md` |
| **using-git-worktrees** | Starting feature work that needs isolation, or before executing a plan — ensures an isolated workspace (native tool or git fallback). | `workflows/using-git-worktrees/SKILL.md` |
| **finishing-a-development-branch** | Implementation is done and tests pass — verify tests, then present merge/PR/keep/discard options and execute. | `workflows/finishing-a-development-branch/SKILL.md` |
| **writing-skills** | Creating, editing, or verifying a skill before deployment. Applies TDD (baseline → write → close loopholes) to process docs. | `workflows/writing-skills/SKILL.md` |
| **using-superpowers** | The meta-rule for finding and invoking skills before any response. This router folds in its guidance; read the file for the full red-flags table. | `workflows/using-superpowers/SKILL.md` |

## Typical end-to-end flow

```
brainstorming ──▶ writing-plans ──▶ using-git-worktrees ──▶ subagent-driven-development
                                                            (or executing-plans)
                                                                   │
                       test-driven-development ◀── (each task) ────┤
                       systematic-debugging   ◀── (on failures) ───┤
                       requesting-code-review ◀── (checkpoints) ───┤
                                                                   ▼
                    verification-before-completion ──▶ finishing-a-development-branch
```

## Red flags — you're rationalizing, STOP and use the workflow

| Thought | Reality |
|---------|---------|
| "This is just a simple question" | Questions are tasks. Check for a workflow. |
| "I need more context first" | The workflow check comes BEFORE clarifying questions. |
| "Let me explore the codebase first" | Workflows tell you HOW to explore. Check first. |
| "This is too simple to need a design" | Simple projects hide the worst assumptions. Brainstorm anyway. |
| "Quick fix now, investigate later" | No fixes without root cause — systematic-debugging. |
| "Should pass now / looks correct" | No completion claim without fresh evidence — verification. |
| "I'll write the test after" | No production code without a failing test first — TDD. |
| "I remember this workflow" | Read the current version; don't work from memory. |

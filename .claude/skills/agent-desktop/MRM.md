# agent-desktop in MRM
- Source: https://github.com/vercel-labs/agent-desktop (Apache-2.0, skills/ v1.2.0), copied 2026-11-09.
- Binary on this Mac: `~/.npm-global/bin/agent-desktop` (not on PATH). New machine: `npm install -g --prefix ~/.npm-global agent-desktop`, then `agent-desktop permissions --guide`.
- MRM use: non-Chrome apps (WhatsApp desktop `tools/whatsapp/wa_click.py`, system dialogs, Chrome profile picker). Merimen stays on playwright/CDP.
- Rules (playbook 00): never log in, never send a message without asking the user.

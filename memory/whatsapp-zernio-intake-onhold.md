---
name: whatsapp-zernio-intake-onhold
description: ON HOLD (2026-10-10) — plan to pull case files from WhatsApp via Zernio API; user will ping when ready
metadata:
  type: project
---

User proposed (2026-10-10) using Zernio (zernio.com, dashboard/api-keys) so Claude can download case files sent over WhatsApp and file them by plate. User said: hold, will ping when ready to set up.

Facts checked: Zernio uses Meta's official Cloud API only — needs a WhatsApp Business Account (personal WhatsApp cannot connect; "Coexistence" mode can attach a WhatsApp Business App number). Inbound via inbox webhooks; Zernio + Meta both bill; 24h window rule; group support limited.

**Open questions for the user when resumed:** what "track the number" means (plate from message → file into Desktop folder?), and which number/group workshops send to now.
**How to apply:** key goes into macOS Keychain via the user's own Terminal, never pasted in chat; flag that NRIC/address docs would pass through Zernio and Meta.

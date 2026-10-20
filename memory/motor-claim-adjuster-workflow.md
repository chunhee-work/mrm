---
name: motor-claim-adjuster-workflow
description: User is a motor claim adjuster; reads claim PDFs and keys data into Merimen e-Claims
metadata: 
  node_type: memory
  type: project
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

User is a **motor insurance claim adjuster**. Core workflow: read accident/claim document bundles (PDFs containing JPJ vehicle ownership certs, insurance schedules, police reports, investigation results, accident sketches, other-party vehicle/insurance details) and **key the data into the Merimen e-Claims system** at https://www.merimen.com.my/claims/index.cfm (login: Merimen e-Claims, agency Autoris Adjusters Sdn Bhd HQ).

As of 2026-06-28 the user is teaching Claude the end-to-end ("A to Z") process of producing a report from such a file. Chrome control is set up (chrome-control MCP) so Claude can drive the Merimen web forms directly.

**Standing rule (2026-06-28):** ALL cases the user sends are **Third Party (TPPD) claims** — the claim is lodged against the AT-FAULT other party's insurer. The relevant policy/insurer data comes from the "other party vehicle + insurance" page of the bundle (e.g. page 8 in the BKH9821 file: the at-fault party TCM9889 / <DRIVER_NAME>, insured by Takaful Ikhlas, policy <AT_FAULT_POLICY_ALT>). Our client is the not-at-fault claimant (third party). Fault is confirmed by the police investigation result (which party got the summons).

**Which party we claim against — the DIRECT HITTER (clarified 2026-07-03):** In a chain / multi-car collision, we claim against the vehicle that DIRECTLY struck our client (the car immediately behind/adjacent that physically contacted us), NOT necessarily the police-summoned initiator at the back of the chain. The tell is: **the party whose insurance ("JPJ SEARCH" file / I-SEARCH / vehicle-detail page) is PROVIDED in the bundle IS the one to claim against.** Examples: CCX3911 → claim vs WGQ4340 (direct rear-hitter, Zurich), not the summoned WRD9621. VFA1371 (3-car: VFA1371 ← TCP6855 ← MAV5225) → claim vs the middle car **TCP6855** (Honda City, Tokio Marine, policy <AT_FAULT_POLICY>, 05/10/2025–04/10/2026) which directly hit us, NOT the summoned MAV5225. So: if the summoned party's insurance is absent but another party's IS provided, claim against the provided (direct-hitter) party.

**Two trigger modes (2026-07-02):** "**create case**" → do the full A-Z Merimen data entry via chrome-control (see [[merimen-create-case-procedure]]); "**send me data**" (+PDF) → just extract & present the PDF's claim data (copy-box format, [[claim-extraction-output-format]]), don't touch Merimen. For workshop selection the user now pre-creates the Merimen page + picks the workshop himself; Claude fills the rest.

**Why:** Defines the recurring task this project exists for.
**How to apply:** When given a claim PDF, extract the structured fields (our client/claimant vehicle+owner, accident details, police fault finding, and especially the at-fault party's vehicle + insurer/policy) and key them into Merimen as a third-party claim. Run the whole workflow 0→100% without asking ([[merimen-batch-workflow]]); old 'wait for go-ahead' rule deleted by the user 2026-10-20. Related: [[use-repo-skills]].

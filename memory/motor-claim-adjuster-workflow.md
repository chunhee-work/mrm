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

**Standing rule (2026-06-28):** ALL cases the user sends are **Third Party (TPPD) claims** — the claim is lodged against the AT-FAULT other party's insurer. The relevant policy/insurer data comes from the "other party vehicle + insurance" page of the bundle (e.g. page 8 in the BKH9821 file: the at-fault party TCM9889 / Mohd Rodzaha, insured by Takaful Ikhlas, policy MV9560500). Our client is the not-at-fault claimant (third party). Fault is confirmed by the police investigation result (which party got the summons).

**Why:** Defines the recurring task this project exists for.
**How to apply:** When given a claim PDF, extract the structured fields (our client/claimant vehicle+owner, accident details, police fault finding, and especially the at-fault party's vehicle + insurer/policy) and key them into Merimen as a third-party claim. Do NOT start operating Merimen until the user gives the go-ahead / step-by-step. Related: [[use-repo-skills]].

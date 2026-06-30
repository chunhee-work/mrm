---
name: html-report-viewer
description: "How to show case photos back to the user (HTML report opened in Chrome) since the VS Code panel can't render inline images"
metadata: 
  node_type: memory
  type: reference
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

The VS Code Claude Code panel does NOT render inline markdown images (tested 2026-06-28 — relative path, file:// path all showed nothing). Images pasted into chat are visible to Claude but have no file path, so they can't be echoed back.

**Solution — HTML report opened in Chrome** (browsers render local images):
- Generator script: `make_report.py <case_folder> [plate]` in the mrm repo. Scans the folder for images, emits `report.html` inside it: 2-per-row grid, item-name caption centred under each image (mimics the Merimen print report). If a `captions.json` (`{"1001.JPG": "Boot Lid Hinge", ...}`) exists in the folder, captions use the identified item names; otherwise they fall back to the filename.
- Open with chrome-control: `open_url("file:///<folder>/report.html")`.

**Case photo folders** live on the user's Desktop, named by plate (e.g. ~/Desktop/JKB9348, WYA6216, BKH9821, CDC8989, CDH7006, TCY4799, WMA8262, CFC9893). Photos are raw, named numerically (1001.JPG, 1002.JPG, ...) — NO item names in filenames; item names must be identified by reading the images.

**Workflow to caption a case:** read each photo with the Read tool → identify the car part (see [[car-part-item-names]]) → write captions.json → run make_report.py → open report.html in Chrome for the user to review.

Related: [[car-part-item-names]], [[motor-claim-adjuster-workflow]].

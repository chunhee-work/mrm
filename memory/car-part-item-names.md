---
name: car-part-item-names
description: Reference of car-part item names learned from Merimen damage-report study PDFs
metadata: 
  node_type: memory
  type: reference
  originSessionId: c4f764b6-357a-4b5c-bb9b-9fce9774c2ae
---

User periodically sends "Damage Report Study / Handoff Briefing" PDFs (Merimen print-style adjuster reports, Autoris Adjusters Sdn Bhd HQ) so Claude learns the **car-part item names** used when keying damage into Merimen.

**How to read these PDFs:**
- Each photo's item name is the label centred DIRECTLY BELOW it (use the image's middle point). On-page format: `<n>/<total>: <Item Name>`.
- Repeated item names = SAME part at different zoom: first a zoom-out/context shot, then zoom-in detail shots of the damage.
- Chalk "X" marks (white or blue) and pointing fingers = adjuster-flagged damage points.
- RH = Right Hand (右), LH = Left Hand (左).
- Don't trust OCR for exact chassis/plate digits — zoom into the image if exact digits matter.
- The 8 case photo folders live on the user's Desktop (named by plate). If a briefing PDF is missing an image, open the Desktop folder and match by the photo number (对回相应的数字看照片). Photos are raw, numbered (1001.JPG… or 1/172…) — no item names in filenames.

**Case → vehicle index (learned so far):**
- WYA6216 (CCG1119) — Honda CR-V 4WD, rear-end collision, 73 photos.
- BKH9821 (TCM9889) — Perodua Myvi, LH side impact (front+rear doors), 74 photos.
- CDC8989 (CCN5478) — Mercedes-Benz C180 W203 sedan, front-left impact + suspension, 65 photos.
- CFC9893 (TBV5578) — Perodua Alza MPV (black), RH side-swipe, 58 photos.
- WMA8262 (TBT1939) — Proton sedan (dark red), heavy rear + front damage, 172 photos.
- JKB9348 (TAW7567) — purple/magenta Perodua Myvi, REAR + LH-side collision, 78 photos.
- CDH7006, TCY4799 — folders exist; briefings not yet provided.

**Merimen report-viewer cases (Newvest (M) Sdn Bhd HQ submitter; studied live in Chrome 2026-06-30 via fusebox=SVCdoc dsp_reports):**
- G6407 (VPE2708) — black Toyota Vellfire MPV, RH-side rear scrape+impact (rear door→quarter panel→rear bumper, into RH rear shock/crossmember), odo 154,305 km, tyres 235/50 R18. 78 photos — VISUALLY REVIEWED 2026-06-30 (canvas→base64→PIL montage→Read pipeline).
- BMT7280 (KGE2550) — white Chevrolet Sonic/Aveo (5-dr hatch, SPORT), rear-end collision (LH bias) with structural involvement (tailgate, rear bumper+reinforcement, rear panel inner, chassis member LH, wheelhouse LH, boot floor); red paint transfer from other vehicle, odo 266,538 km. 82 photos — VISUALLY REVIEWED 2026-06-30.
- WUQ4299 (WXV2366) — silver/grey Toyota Vios (2nd gen, 4-dr sedan), RH-side sideswipe (front mirror→front door→rear door→runningboard; front door stripped for regulator/hinge/lock inspection), odo ~295,709 km. 47 photos — VISUALLY REVIEWED 2026-06-30.
- WB656P (BJQ9930) — white Mercedes-Benz A-Class (W176, 5-dr, AMG-line), full LH-side sideswipe (front bumper→fender→both doors→quarter→rear bumper; Door Mirror LH total loss), odo ~61,486 km. Many undercarriage shots are routine inspection (no damage). 125 photos — VISUALLY REVIEWED 2026-06-30.
- XX8989 (PMR4857) — dark-blue Mazda CX-8 (3-row SUV), front-LEFT corner collision (headlamp LH shattered, front bumper torn, fender LH buckled; into bumper shock absorber/front chassis member LH + LH front suspension); yellow paint transfer from 3rd party, odo 93,779 km, tyres 225/55 R19. 137 photos — VISUALLY REVIEWED 2026-06-30.
- BRC9439 (WUV313) — silver Honda City (5th-gen GN, 4-dr sedan), rear-end collision (RH bias): rear bumper torn/holed, rear panel + bumper reinforcement buckled (structural), boot lid + rear lamps RH scuffed, odo 64,226 km. 90 photos — VISUALLY REVIEWED 2026-06-30.
- BLJ892 (KFQ88) — white HINO light-duty box lorry (cab-over truck, NOT a 4WD), front + front-RIGHT cab-corner collision: Kangaroo Bar Front snapped, Headlamp RH smashed, Front Panel + Front Pillar RH (A-pillar) buckled (structural), Door Front RH crushed; front steering linkage inspected. 87 photos — VISUALLY REVIEWED 2026-06-30.
- VJH1633 (VLL6641) — white Toyota Alphard (luxury MPV), rear-end impact: rear panel deformed (structural), tailgate dented, rear bumper/mouldings/sensors dismantled, odo 123,204 km. 67 photos — VISUALLY REVIEWED 2026-06-30.
- WUA1638 (VPB9616) — dark-grey Nissan Sylphy (G11, 4-dr sedan), heavy front-RIGHT corner impact (front bumper/grille→fender RH/headlamp RH→front chassis member RH + bumper reinforcement + RH front suspension/driveshaft teardown; carried into Door Front RH/A-pillar/runningboard, Door Mirror RH sheared), odo 260,537 km, likely total-loss. 125 photos — VISUALLY REVIEWED 2026-06-30.

**CANONICAL WORD ORDER (user-confirmed 2026-06-30 — ALWAYS output this order, NOT the Newvest reordered form):** The correct pattern is `<Zone> <Part> <Sub-part> <LH/RH>`. Confirmed canonical examples:
- **Front Bumper** (NOT "Bumper Front")
- **Door Front RH** (NOT "Front Door RH")
- **Front Shock Absorber RH** (NOT "Shock Absorber Front RH")
- **Front Stabiliser Bar Link Rod RH** (NOT "Stabilizer Bar Link Rod Front RH")
- **Door Front Regulator Motor RH** (NOT "Front Door Window Regulator RH")

Apply the same canonical ordering to all equivalents: "Driveshaft Front RH" → **Driveshaft RH**; "Front Door Side Mirror RH" → **Door Mirror RH**; "Front Door Trim Board RH" → **Door Front Trimboard RH**; "Front Door Check Strap RH" → **Door Front Check Strap RH**; "Wheel House Front RH" → **Wheelhouse RH**; "Front Door Upper/Lower Hinge RH" → **Door Front Hinge Upper/Lower RH**. Brand/trim badges: "Grille Front Badge (MAZDA)", "Fender Badge (SPORT) LH".

## MASTER ITEM-NAME LIST (grouped by zone; grows as more studies arrive)

**Identification / general:** Front View Right, Front View Left, Rear View Right, Rear View Left, Front View, Rear View, Side View, Interior View, Road Tax, Odometer Reading, Chassis Number, Engine Number, Engine Compartment.

**Front end:** Bonnet, Bonnet Lock, Bonnet Hinge LH, Bonnet Hinge RH, Bonnet Striker, Headlamp LH, Headlamp RH, Headlamp Panel RH, Front Bumper (a.k.a. Bumper Front), Front Bumper Moulding LH, Front Bumper Spoiler, Front Bumper Sensor LH, Front Bumper Reinforcement, Front Bumper Shock Absorber, Front Bumper Fog Lamp LH, Front Bumper Fog Lamp Finisher LH, Fog Lamp RH, Grille Front, Grille Front Lower, Grille Front Moulding, Grille Front Badge (MAZDA), Front Panel Assembly, Front Panel, Front Panel Upper, Front Panel Upper Cover, Radiator, Radiator Air Deflector Lower, A/C Condenser, A/C Condenser Pipe Lower, Air Filter Pick Up Hose, Air Filter Outlet Pipe, Engine Lower Splash Shield, Engine Mounting RH, Wiring Assembly, Washer Tank Screen, Battery Cover, Subframe Front.

**Front corner / suspension / running gear:** Fender LH, Fender RH, Fender Inner LH, Fender Liner LH, Fender Liner RH, Fender Badge (SPORT) LH, Fender Signal Lamp RH, Front Wheel Arc Finisher LH, Front Mudflap LH, Front Wheel Rim LH, Front Wheel RH, Front Tyre LH, Front Shock Absorber LH (a.k.a. Shock Absorber Front RH), Shock Absorber Top Mount RH, Steering Tie Rod LH, Steering Tie Rod RH, Steering Control Arm LH, Steering Control Arm RH, Front Stabiliser Bar Link Rod LH (a.k.a. Stabilizer Bar Link Rod Front RH), Driveshaft LH (a.k.a. Driveshaft Front RH), Front Suspension Lower Arm LH, Front Suspension Lower Arm RH, Knuckle Arm Front RH, Front Suspension View RH, Front Chassis Member, Front Chassis Member LH, Front Chassis Member RH, Wheel House Front RH, Floor Panel.

**Front doors:** Door Front LH, Door Front RH (a.k.a. Front Door RH), Door Front Handle Outer Release LH, Door Front Handle Outer Release RH (a.k.a. Door Front Outer Handle Release RH), Door Front Regulator Motor LH, Door Front Regulator Motor RH (a.k.a. Front Door Window Regulator RH), Door Mirror LH, Door Mirror RH (a.k.a. Front Door Side Mirror RH), Front Mirror RH, Door Front Lock LH, Door Front Lock RH, Door Front Trimboard LH, Door Front Trimboard RH, Door Front Hinge Upper LH/RH (a.k.a. Front Door Upper Hinge), Door Front Hinge Lower LH (a.k.a. Front Door Lower Hinge RH), Door Front Striker LH, Door Front Outer Weatherstrip LH, Door Front Tread Plate RH, Front Door Check Strap RH.

**Rear doors:** Door Rear LH, Door Rear RH, Door Rear Handle Outer Release LH, Door Rear Moulding RH, Door Rear Weatherstrip Outer LH, Door Rear Hinge Upper LH, Door Rear Hinge Upper RH, Door Rear Hinge Lower LH, Door Rear Trimboard LH, Door Rear Trimboard RH, Door Rear Lock LH, Door Rear Striker LH, Door Rear Aperture Weatherstrip RH.

**Pillars / sills:** Front Pillar, Front Pillar RH, Front Pillar Moulding RH, Centre Pillar LH, Centre Pillar RH, Runningboard Panel LH, Runningboard Panel RH, Runningboard Spoiler LH, Runningboard Spoiler RH.

**Rear end — tailgate (hatchback):** Tailgate, Tailgate Hinge RH, Tailgate Hinge LH, Tailgate Finisher, Tailgate Moulding, Tailgate Trimboard, Tailgate Lock, Tailgate Support Strut RH, Tailgate Support Strut LH, Tailgate Striker, Tailgate Aperture Weatherstrip.

**Rear end — boot lid (sedan):** Boot Lid, Boot Lid Hinge RH, Boot Lid Hinge LH, Boot Lid Lock, Boot Lid Aperture Weatherstrip.

**Rear end — bumper / lamps:** Rear Bumper, Rear Bumper Moulding LH, Rear Bumper Moulding RH, Rear Bumper Reflector LH, Rear Bumper Reflector RH, Rear Bumper Reinforcement, Rear Lamp RH, Rear Lamp LH, Rear Lamp Outer RH, Rear Lamp Outer LH, Rear Lamp Inner RH, Rear Lamp Inner LH, Rear Lamp Panel LH, Rear Lamp Panel RH, Rear Bumper Bracket RH, Rear Bumper Bracket LH, Rear Bumper Sensor LH, Rear Bumper Sensor RH, Rear Number Plate.

**Rear structural / internal:** Rear Panel, Rear Panel Upper Section RH, Rear Panel Inner Trim, Quarter Panel RH, Quarter Panel LH, Quarter Panel Moulding RH, Quarter Liner LH, Quarter Liner RH, Boot Floor, Boot Lower Cover, Spare Wheel Cover Board, Spare Wheel Well, Rear Chassis Member RH, Rear Chassis Member LH, Rear Wheel Arc Finisher RH, Rear Wheelhouse LH, Rear Wheel Rim RH, Rear Wheel Rim LH, Rear Exhaust Pipe.

**Rear suspension / running gear:** Rear Suspension Crossmember, Rear Suspension Upper Arm LH, Rear Suspension Lower Arm LH, Rear Shock Absorber LH, Rear Shock Absorber RH.

**Accessories / commercial:** Kangaroo Bar Front (front tubular bull bar — seen on the HINO lorry BLJ892). **Truck/cab-over parts (from BLJ892):** Front Panel (cab front), Front Pillar (cab A-pillar), Front Pillar Moulding RH, Door Front Tread Plate RH, Steering Control Arm LH/RH (steering drag link/pitman), Floor Panel (cab floor).

Related: [[motor-claim-adjuster-workflow]], [[claim-extraction-output-format]], [[html-report-viewer]].

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

**Added 2026-10-10 (user-approved, frequent names found in Merimen photo captions; user-confirmed synonyms: Fender Front LH/RH = Fender LH/RH, Manifold Cover = Exhaust Manifold Cover):** Rear Bumper Moulding, Rear Bumper Bracket Upper RH, Rear Bumper Bracket Upper LH, Rear Windscreen, Rear Bumper Bracket Side RH, Roof Panel, Front Windscreen, Rear Bumper Bracket Side LH, Boot Lid Finisher, Door Front Lower Moulding LH, Fender Inner Wheelhouse LH, Rear Number Plate Lamp, Rear Bumper Shock Absorber, Door Front Aperture Weatherstrip RH, Firewall Panel, Door Front Aperture Weatherstrip LH, Door Front Lower Moulding RH, Door Rear Lower Moulding LH, Tailgate Badge (PERODUA), Exhaust Assembly, Quarter Panel Inner Trim RH, Door Rear Lower Moulding RH, Grille Front Badge (PERODUA), Boot Extractor Vent, Front Suspension Upper Arm RH, Spare Wheel Retainer, Door Front Moulding RH, Door Rear Regulator Motor RH, Emergency Reflector, Door Rear Window LH, Rear Bumper Centre Guide, Tailgate Badge (AXIA), Spare Wheel Rim, Boot Side Trim RH, Door Front Window RH, Rear Roll Over (Safety) Bar.

## STUDY 2026-07-04 — our own 16 submitted-case reports (fusebox=SVCdoc dsp_reports, Autoris HQ)
Studied the photo-report item captions of all 16 cases we built (CBT3040, CCX3911, CDN5619, CFG3362, WLW551, WUG466, WUN7241, JUV7234, TBK95, TBW8887, TCL730, VAS763, VFA1371, WC8313L, WC8911N). The report viewer captions each uploaded photo `<n>/<total>: <Item Name>` — these ARE the authoritative Merimen part names. This study CONFIRMED the master list above and adds the items/rules below.

**Confirmed conventions:**
- Every report opens with the same identification shots: Front View Right/Left, Rear View Right/Left, Interior View (or Road Tax), Odometer Reading, Chassis Number, Engine Compartment.
- **Hatchback ⇒ "Tailgate"** (+ Tailgate Hinge/Lock/Striker/Support Strut LH/RH, Tailgate Aperture Weatherstrip, Tailgate Badge). **Sedan ⇒ "Boot Lid"** (+ Boot Lid Hinge/Lock/Striker LH/RH, Boot Lid Aperture Weatherstrip, Boot Lid Badge).
- **Badge format = `<Part> Badge (<MODEL/BRAND>)`**: e.g. Tailgate Badge (MYVI), Tailgate Badge (VIVA), Tailgate Badge (VALVE MATIC), Boot Lid Badge (CIVIC), Grille Front Badge (PERODUA), Grille Front Badge (PROTON).
- LH/RH always at the END. Sensors can carry Outer/Inner: `Rear Bumper Sensor Outer LH`, `Rear Bumper Sensor Inner LH`.

**New items added by this study:** Front Bumper Finisher RH; Front Bumper Bracket LH/RH; Front Crossmember; Cooling Fan Motor Cover; Horn Cover; Windscreen Washer Tank; A/C Pipe Fender Inner RH; Headlamp Panel LH; Rear Bumper Spoiler (LH); Rear Bumper Sensor Outer/Inner LH/RH; Rear Bumper RH; Rear Lower Extractor RH; Rear Extractor Vent; Rear Mudflap RH; Rear Tyre RH; Rear Suspension View RH/LH; Rear Wheelhouse RH; Rear Panel Upper Section LH; Runningboard Tread Plate RH; Boot Lid Striker; Spare Wheel Carrier.

## USER'S GOOGLE SLIDES PART-NAME NOTES (studied 2026-07-04) — 5 decks: Front, Side, Undercarriage, Interior/Notice, Lori
The user keeps Google Slides decks of captioned part photos (`<n>/<total>: <Part Name>`, aggregated from many Autoris case reports) as his authoritative part-name reference. Extracted via export/pdf → PyMuPDF render → read (captions are baked into images; not text-extractable).

### FRONT deck (engine bay + front end) — vocabulary
- **Engine / mechanical:** Oil Filter, Engine Oil Dipstick, Alternator, Starter Motor, Oxygen Sensor, Cylinder Head Cover, Exhaust Manifold, Exhaust Manifold Cover, Engine Mounting RH, Engine Moulding LH, Cowl Panel Grille, Transmission ECU, Gear Selector Lever, Wiring Front Auto Gearbox, Front Wiring Assembly, ABS Control Module, Brake ABS Modulator, Ambient Sensor.
- **Cooling / A-C / power steering:** A/C Condenser, A/C Compressor, A/C Pipe Inner Fender LH/RH, A/C Pipe Discharge Hose, A/C Discharge Hose, A/C Suction Hose, Air Conditioning Hose, Air Conditioning Evaporator Cover, Radiator Hose, Radiator Bracket, Radiator Expansion Tank, Radiator Air Deflector (RH), Cooling Fan Cover, Cooling Fan Motor LH, Cooling Fan Viscous Unit, PAS Return Hose, PAS Container, Pas Oil Cooler, Oil Cooler Gearbox, Transmission Oil Cooler (+ Hose).
- **Air intake:** Air Filter Cover, Air Filter Outlet Pipe, Air Filter Pick Up Hose, Air Pipe Inner Fender LH.
- **Electrical:** Fuse Box, Relay Box Cover, Battery Tray, Battery Positive Cable, Battery Retaining Clamp, Headlamp Bulb.
- **Front panel / bumper / grille:** Front Panel (comes as **"Assembly"** OR **"Separate (PERODUA)"** pieces), Front Panel Lower, Front Panel Support Panel LH/RH, Front Panel Upper Cover, Front Bumper, Front Bumper Cover, Front Bumper Spoiler, Front Bumper Fixings Cover, Front Bumper Shock Absorber (Upper), Front Bumper Reinforcement (Lower), Front Bumper Fog Lamp Chrome Moulding LH, Bumper Front Fog Lamp Bezel LH, Front Grille Moulding, Front Grille Backing, Grille Front Moulding Lower/Upper, Grille Panel/Headlamp Mask.
- **Lamps:** Headlamp LH, Headlamp Assy LH/RH, Headlamp Bezel LH/RH, Headlamp Lower Bracket RH, Headlamp Mounting Bracket Lower RH, Lamp Daytime Running LH, Front Indicator Lamp RH.
- **Bonnet:** Bonnet Lock, Bonnet Latch Stud Plate, Bonnet Safety Release Lever, Bonnet Insulation, Bonnet Finisher.
- **Fender / structure:** Fender LH, Fender Inner LH, Fender Inner Bracket LH, Fender Liner LH, Front Wheelhouse LH/RH, Front Pillar Outer LH (note: **"no need select — only repair or renew"**), Front Pillar Outer Trim LH.
- **Washer / misc:** Windscreen Washer Tank, Windscreen Washer Pump, Roof Windscreen, Door Front LH, Front Panel Upper Cover.

### SIDE deck (doors / pillars / sills) — vocabulary
- **Front door:** Door Front Lock LH, Door Front Handle Outer Release Front LH, Door Window Regulator Front LH, Front Door Hinge Upper LH, Front Door Visor RH, Door Glass Front Window LH, Front Door Weatherstrip Outer RH, Door Check Strap Front RH, Front Door Run Felt LH, Front Door Mirror Inner Trim RH, Door Mirror.
- **Rear door:** Door Rear LH, Door Rear Lock / Striker, Door Rear Striker LH, Door Rear Aperture Weatherstrip LH, Rear Door Hinge Upper / Lower, Rear Door Trimboard, Door Rear Chrome Moulding LH, Rear Door Tread Plate LH, Moulding Door Frame Outer Rear LH.
- **Sliding door (van/MPV):** Sliding Door LH Upper Roller, Sliding Door LH Rear Roller, Sliding Door LH Lower Roller.
- **Pillar / sill / side:** Front Pillar Outer LH, Front Pillar Outer Trim LH, Front Pillar Inner Trim LH, Side Step LH, Runningboard Panel Tread Plate Rear LH, Rear Mudflap RH, Fender LH, Fender Liner LH, Cowl Panel Grille, Dashboard Panel.
- **KEY DISTINCTION (user note):** **Runningboard Spoiler** = plastic, has a raised protrusion (有凸起) and a black-rubber seal running along the skirting/spoiler; **Runningboard Panel** = metal, flat (平整). The black rubber seal on the skirting is how you tell it's the SPOILER (plastic), not the metal PANEL.

### UNDERCARRIAGE deck (suspension / drivetrain / underside) — vocabulary
- **Front suspension/steering:** Front Shock Absorber LH, Front Strut Damper, Suspension Knuckle, Ball Joint, Lower Control Arm, Hub/Bearing Assembly, Stub Axle, Outer Tie Rod, Knuckle Clamp Bolt, Steering Tie Rod RH, Front Stabilizer Bar, Front Stabilizer Bar Link Rod LH, Front Suspension Arm Bracket RH, Front Suspension Crossmember, Front Suspension Cross Member Bracket.
- **Rear suspension:** Rear Suspension Lower Arm RH, Rear Suspension Lower RH, Trailing Arm Rear RH (**"Rear Only"**), Rear Trailing Arm RH, Rear Stabiliser Bar Link Rod RH, Suspension Spring Rear Leaf RH, Rear Wheel Rim RH.
- **Brakes:** Brake Caliper Front LH, Brake Disc Cover LH.
- **Drivetrain / underside:** Undercarriage View, Transmission Assy, Propeller Shaft Rear, Engine Mounting Front, Engine Support Member, Engine Oil Sump, Transmission Oil Sump, Radiator Hose, Oil Filter, Spare Wheel Carrier. (Drivetrain terms: transaxle, transfer case, front/rear drive axle, drive shaft, rear differential.)
- **KEY NOTE (user):** **Rear Crossmember** = the straight metal member UNDER the boot floor that supports the boot floor (not a suspension arm). "Front stabilizer bar link rod" is the small link at the front suspension connecting the stabilizer bar.

### INTERIOR / NOTICE deck (cabin / airbags / HVAC) — vocabulary
- **Seats:** Front Seat Back RH, Seat Cushion Rear, Headrest Assembly Third Row LH.
- **Airbags:** Driver Side Airbag (RH), Passenger Side Airbag, Front Curtain Air Bag RH.
- **Dashboard / console / trim:** Dashboard Panel, Center Console (Centre Console), Front Panel Wiring, Keyless Entry Buzzer, Heater Control Assy, Rooflining, Centre Pillar Inner Lower Trim LH.
- **HVAC:** A/C Blower, A/C Evaporator.
- **Misc:** Mudflap (sold as a FRONT AND REAR 4PCS set — left/right front + left/right rear), Rear Mudflap RH.

### LORI (LORRY / TRUCK) deck — vocabulary + reference prices
- **Cargo body — Wooden Carrier (open lorry):** Wooden Carrier Rear Door, Wooden Carrier Rear Support (also "…Stainless Steel"), Wooden Carrier Step Panel, Wooden Carrier Back Door, Rear Wooden Carrier Floor Support, Rear Wooden Carrier Front Steel Door Lock RH.
- **Cargo body — Bonded Box (box lorry):** Bonded Box Rear RH Pillar, Bonded Box Rear RH Lower Reinforcement, Bonded Box Rear Door Opener Rod, Bonded Box Lower Reinforcement.
- **Truck front / cab:** Kangaroo Bar Front (often "Kangaroo Bar Front & Bumper Front Cover"), Bumper Front Cover, Bumper Front Bracket LH, Bumper Front Fog Lamp Support LH, Bumper Front Lower Grille, Bumper Front Number Plate Holder, Bumper Front Reinforcement Panel, Fog Lamp Front LH/RH, Front Panel Inner LH, Front Panel Radiator Support LH/RH, Front Chassis Member, Headlamp Inner RH, Grille Front, Grille Badge, Grille Front Moulding (Badge support), Front Cabin Torsion Bar, Bonnet Weatherstrip (Front), Turbo Intercooler.
- **Truck mechanical / suspension:** Axle Case Rear, Leaf Spring Rear RH, Steering Box, Steering Control Arm RH.
- **Interior / rear:** Dashboard, Door Lock, Seat Belt Reel Front RH/LH, Rear Panel, Rear Mudflap, Rear Reflector.
- **USER'S LORRY REFERENCE PRICES (RM):** Rear Panel 2600 · Rear Mudflap 280 · Rear Reflector 300 · Grille Front 985 · Door Lock 415 · Dashboard 1985 · Wooden Carrier Rear Door 1200 · Wooden Carrier Rear Support Stainless Steel 600 · Wooden Carrier Step Panel 450.

Related: [[motor-claim-adjuster-workflow]], [[claim-extraction-output-format]], [[html-report-viewer]].

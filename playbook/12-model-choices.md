# 12 · Which Merimen model to choose for the RC (ddlbMan → ddlbModel)

Read with playbook 02 "Vehicle model" before every create. **The RC always wins** (02). Built 2026-11-01 from:
- **559 RCs read by opening each case's DOC in Merimen** (111 TC0607 + 73 Newvest + 375 Aman Kepong), set against the model chosen in that case. The table at the end lists them all; ✗ = the choice does not fit the RC (made by someone else, don't copy it).
- **What adjusters chose in 7,239 cases** (TC0607, Newvest, Aman Kepong; `tools/batch/model_choice_stats.json`). Aman cases open only from the Aman login (CHONGAIAI); the counts below show which spelling or variant is normal.

## Rules
1. **Date bracket.** Use the RC **Tarikh Pendaftaran** to choose the generation ("YYYY On" / "YYYY To YYYY") and the `[mm/yy-mm/yy]` bracket that contains it, not the newest bracket.
   - For a **used import** (Status Asal "KENDERAAN IMPORT TERPAKAI", e.g. MINI, Mercedes, Alphard/Vellfire), the bracket must hold the **Tahun Dibuat** (year made).
   - Mistakes seen:
     - Myvi 1.5 SE registered 2016 was given [09/11-12/14]; it should be [01/15-10/17].
     - Alza 1.5 SE registered 2014 was given [09/18-07/22].
     - Saga 1.3 Automatik Premium registered 2022 and 2024 were given "Saga 2016 To 2019"; they should be "Saga 2022 On".
     - X-Trail registered 2019 was given "X-Trail 2003 On"; it should be "2015 On (T32)".
     - Waja 1.6 Manual registered 2006 was given "CPS [02/08-]"; it should be "(CF1) [08/00-12/05]".
2. **Transmission must match the RC**: AUTO, AUTOMATIK, A/T, AT, CVT → (A); MANUAL, M/T, MT, (M) → (M).
   - Mistakes seen: Grand Livina 1.6L M/T was given (A); Saga FL 1.3 MANUAL was given FLX (Executive) (A); it should be FL (Standard) (M).
3. **Body must match the RC**: Hilux S/C (single cab) → "2 DR Pickup", never "Dbl.Cab". Mistake seen: Hilux S/C 2.4 MT 4X4 was given a Dbl.Cab.
4. **The RC trim word wins.** Don't take a higher or lower grade. Mistake seen: Persona 1.6 CVT **STANDARD** was given **Executive**.
5. **RC with no trim word → the base trim of that generation**:

   | RC | Merimen |
   |---|---|
   | Saga 1.3 AUTOMATIK / MANUAL (2008–10) | B-Line |
   | Saga 1.3L CVT (2016–19) | Standard |
   | Saga FL 1.3 MANUAL | FL (Standard) (M) |
   | Persona 1.6 AUTOMATIK (2007–10) | Base Line |
   | Preve 1.6L CVT | Executive |
   | Iriz 1.3L CVT | Standard |
   | Ertiga 1.4L AUTOMATIK | Executive |
   | Swift 1.5L A/T | GLX |
   | Xpander | 1.5 |
   | Grand Starex 2.5 | Royale |
   | Hilux DOUBLE CAB 2.5 AT | G |
   | Civic 2.0L i-VTEC (2006–09) | 2 S |

   - **Saga FL 1.3 AUTOMATIK (2011–14), no grade:** other adjusters chose FLX (Executive) 2 times and FLX (Standard) once (ours, accepted by the user). Follow this rule (Standard) unless the RC or the photos show Executive.
6. **RC trim word → Merimen word** (all confirmed on real RCs):

| Model | RC | Merimen option |
|---|---|---|
| Perodua Myvi 2005–11 | 1.3 EZ / EZI / SXI | `1.3 EZ` / `1.3 EZi` / `1.3 SXi` |
| Perodua Myvi 2011–17 | 1.5 SE / 1300 X | `1.5 SE (A)` or `(M)` / `1.3 X (A)` |
| Perodua Myvi 2017–20 | 1300 X / 1500 H / AV | `1.3 Premium X` / `1.5 High` / `1.5 Advanced` |
| Perodua Myvi 2021+ | 1300 G / 1500 X / AV | `1.3 1.3 G` / `1.5 1.5 X` / `1.5 1.5 AV` |
| Perodua Bezza | 1300 X | 2016–19 `1.3 Premium X`, 2020+ `1.3 X`; AV 2020+ = `1.3 AV`, AV 2016–19 = `1.3 Advance` |
| Perodua Axia | 1000 E / G / SE | `1.0 E` / `G` / `SE` (2014–19 `1 SE (A)`, 2023+ `1.0 SE`) |
| Perodua Alza | 1500 EZ / EZI / SE / AV | `1.5 EZ` / `EZi` / `SE` / `Advance` (2018–22) |
| Perodua Aruz / Ativa | 1500 X / 1000 TURBO AV | `1.5 X` / `1.0 AV` |
| Perodua Viva / Kelisa / Kenari | 1000 EZ, 850 EX, 1.0 GX | `1 EZ`, `0.85 EX`, `1 GX` (engine written `1` / `0.85`) |
| Proton Saga | AUTOMATIK PREMIUM / AT STANDARD LITE / FL | `Premium` / `Standard Lite` / `FL…` (`FLX` only when the RC or the car says FLX) |
| Proton Exora / S70 | 1.6 CVT PREMIUM / 1.5T FLAGSHIP | `Premium CVT` / `1.5T Flagship` |
| Proton Satria Neo / Wira | SATRIA NEO 1.6 (M) / WIRA 1.5 GL(M), 1.3GL | `1.6 Neo (M)` / `1.5 GL (M)`, `1.3 GL` |
| Honda City 2014+ | E / V | `1.5 E` / `1.5 V` (bracket [04/14-02/17] or [03/17-]) |
| Honda Jazz 2014–17 | 1.5L E / V | `1.5 i-VTEC (Grade E)` / `(Grade V)` |
| Honda Civic 2016–20 | 1.5 TC | `1.5 TC` |
| Mazda CX-5 | 2.5G 2WD HIGH / 2.0G 2WD HIGH | 2019–24 `2.5 GLS SkyActiv-G`; 2024+ `2.0 High 2WD` |
| Toyota Vios / Altis / Camry / Innova | 1.5G, 1.5E, 1.8E, 2.0G, 2.0 E (M) | the same letter with the chassis code: `1.5G (NGC102R…)`, `E (NSP151R…)`, `1.8 E (ZRE172R…)`, `2 G (ACV41R…)`, `2 E (M)` |
| Toyota Vios 2026 | 1.5 HEV AT | `1.5 HEV (NYC100R…)` |
| Toyota Corolla Cross | 1.8V A/T | `1.8V (ZSG10R…)` |
| Toyota Alphard / Vellfire / Wish (import) | DBA-AGH30W, CBA-ZNE10G, DBA-ZGE20G | the `(Grey Import)` option or `WISH MPV 1.8 <code> (A)`, matched on the model code |
| Ford Fiesta | 1.6L SPORT AUTO | `1.6 S (A)` |
| Mitsubishi Lancer / ASX | 2.0 GT / 2WD | `2 GT` / `2 2WD` |
| Subaru XV | XV2.0I | `2.0i-Premium` |
| Mercedes (import) | E300 | `E300 AMG Line`, body as in the photos |

7. **The make on the RC is not always the Merimen make.** "BMW / MINI COOPER S" → make `MINI`, `Cooper 2021 On 3 Dr Hatch 2 Cooper S`. "MERCEDES BENZ" → `MERCEDES-BENZ`. Inokom and Naza rebadges: see 11.
8. **Two options mean the same variant** (e.g. `1.30 Premium X AUTO` and `1.3 Premium X`) → take the green one; if both are green, take the normal spelling, which is also the one most adjusters chose.
9. **When pick_model says UNSURE**, use the lists below to see which option adjusters normally choose. Check the RC trim word, transmission, body and bracket first.
10. **Old-format card** ("Perakuan Pendaftaran Kenderaan") prints make and model on separate lines; read them as "MAKE / MODEL". The cc can carry "S.P" or "SP": ignore it.

11. **Imports and commercial vehicles: match the chassis/model code on the RC, not the name.**
   - Mistakes seen (Newvest):
     - Mercedes C180 with chassis WDD205 (W205) was given W203.
     - Isuzu TFS87 (1.9 RZ4E) was given TFS55 2.8.
     - Hino WU410R was given WU300R.
     - A Ford Mustang built in 2016 was given the MY20 option.
   - Mercedes W205 is the saloon and C205 is the coupe. Check the body against the photos.
12. **More bracket mistakes (registration date outside the chosen bracket).** All seen on Newvest cases:

    | RC | Registered | Was given | Should be |
    |---|---|---|---|
    | Vios 1.5G | 2010 | [07/12-09/13] Limited | NCP93R bracket covering 2010 |
    | Altis 1.6E | 2002 | [02/04-02/08] | the older bracket |
    | Mazda6 | 2013 | [07/10-02/13] | the newer GJ generation |
    | Persona 1.6 CVT Executive | 04/2021 | bracket from 08/21 | the earlier bracket |
    | Preve 1.6 | 2013 | [04/18-] | the earlier bracket |
    | NV350 | 2016 | [17-] | the earlier bracket |

    Iriz 1.3L CVT was given (M). Hilux 2.4G was given L-Edition.
13. **Bundle without an RC** (invoice only, police papers only, password-protected PDF): use the insurance schedule's model, cc and year, and say so in the report. If nothing names the model, the case is pending the RC (00). The same bundle can be uploaded to two cases (WWD5547 had WA510U's documents), so check the plate on the RC.

14. **Plain RC trim → plain Merimen option, never a special edition.** Don't choose Limited, Exclusive, Black Series, TRD Sportivo, "EZi Advanced" or "G Limited" unless the RC says it.
    - Mistakes seen (Aman):
      - Alza 1500 EZI was given EZi Advanced.
      - Kelisa EZ was given EZ Limited Edition.
      - Myvi 1.3 EZi was given EZi Exclusive Edition.
      - Vios 1.5G was given G Limited.
      - Vios 1.5S was given TRD Sportivo.
15. **Engine size and drive must match the RC (cc, 2WD/4WD).**
    - Confirmed mistakes (the right option exists):
      - Myvi 1.5 SE was given the 1.3 SE; Merimen has `1.5 SE (A)`.
      - CLA 250 was given CLA 45 AMG.
    - Not proven, check the option list first:
      - X-Trail 2.5L 4WD (2012–2014) was given `X-Trail 2010 On 2 137Bhp`. In 7,239 cases nobody chose a 2.5 option for that generation, so Merimen may only list the 2.0. If no 2.5 / 4WD option exists, the closest same-generation option is acceptable; note it.
      - CR-V 2.0 i-VTEC (2015) was given 4WD. The RC does not say 2WD/4WD; the "RM1 = 2WD" reading came from the chassis number only. Both `2WD` and `4WD` options exist, so decide from the RC or insurance (4WD/AWD written?) or the photos (AWD badge).
16. **Grey imports (KENDERAAN IMPORT TERPAKAI) use the import option with the Japanese chassis code on the RC** (DBA-ANH20W, DBA-AGH30W, DBA-XG20, MXUA80-), and the bracket for the year made. Don't use the local "R" model (ANH20R, AGH30R, MXUA80R) or a newer bracket.
    - Mistakes seen: Alphard, Vellfire, Harrier, BMW 520i.
17. **Facelift brackets — check the exact month.**
    - Axia 2019 On starts [09/19-]: a car registered before that is "Axia 2014 To 2019".
    - Saga 2019 On starts [08/19-]: SAGA 1.3L CVT registered 06/2019 is the 2016–2019 Saga.
    - Accord 2.0 made 2008 with chassis CP… is the 8th generation, not "2006 On".

## All RCs read → model chosen in the case
### TC0607
| RC (Buatan / Nama Model) | cc | Made | Registered | Chosen in Merimen | |
|---|---|---|---|---|---|
| BMW / MINI COOPER S (3BA-XR20MW) | 1998 | 2022 | 05/05/2026 | MINI Cooper 2021 On 3 Dr Hatch 2 Cooper S 192Bhp [06/21-] | ✓ |
| FORD / FIESTA 1.6L SPORT AUTO | 1596 | 2012 | 11/01/2013 | FORD Fiesta 2010 On 5 Dr Hatch 1.6 S 118Bhp (A) [10/10-09/13] | ✓ |
| HONDA / CITY 1.5L V | 1497 | 2019 | 22/07/2019 | HONDA City 2014 On 4 Dr Sal 1.5 V 118Bhp [03/17-] | ✓ |
| HONDA / CITY E 1.5L I-VTEC | 1497 | 2016 | 05/12/2016 | HONDA City 2014 On 4 Dr Sal 1.5 E 118Bhp (A) [04/14-02/17] | ✓ |
| HONDA / CITY E 1.5L I-VTEC | 1497 | 2014 | 08/07/2014 | HONDA City 2014 On 4 Dr Sal 1.5 E 118Bhp (A) [04/14-02/17] | ✓ |
| HONDA / CITY E 1.5L I-VTEC | 1497 | 2015 | 11/09/2015 | HONDA City 2014 On 4 Dr Sal 1.5 E 118Bhp (A) [04/14-02/17] | ✓ |
| HONDA / CIVIC 1.5 TC | 1498 | 2018 | 17/05/2018 | HONDA Civic 2016 To 2020 4 Dr Sal 1.5 TC 171Bhp [06/16-02/20] | ✓ |
| HONDA / CIVIC 2.0L I-VTEC (A) | 2354 | 2007 | 19/06/2007 | HONDA Civic 2006 On 4 Dr Sal 2 S 153Bhp (A) [04/07-02/09] | ✓ |
| HONDA / JAZZ (A) | 1496 | 2003 | 19/02/2004 | HONDA Jazz 2003 To 2008 5 Dr Hatch 1.4 i-DSI 82Bhp (A) [03/03-] | ✓ |
| HONDA / JAZZ 1.5L E | 1497 | 2017 | 20/04/2017 | HONDA Jazz 2014 On 5 Dr Hatch 1.5 i-VTEC (Grade E) 118Bhp (A) [07/14-05/17] | ✓ |
| HONDA / JAZZ 1.5L V | 1497 | 2016 | 19/10/2016 | HONDA Jazz 2014 On 5 Dr Hatch 1.5 i-VTEC (Grade V) 118Bhp (A) [07/14-05/17] | ✓ |
| HYUNDAI / GRAND STAREX 2.5 | 2497 | 2013 | 05/12/2013 | HYUNDAI Grand Starex 2008 On MPV 2.5 Royale 168Bhp (A) [08/11-03/14] | ✓ |
| HYUNDAI / GRAND STAREX 2.5 | 2497 | 2018 | 19/09/2018 | HYUNDAI Grand Starex 2008 On MPV 2.5 Royale 168Bhp (A) [11/17-] | ✓ |
| MAZDA / CX-5 2.0G 2WD HIGH | 1998 | 2025 | 06/02/2025 | MAZDA CX-5 2024 On 5 Dr SUV 2 2.0 High 2WD 162Bhp (A) [01/24-] | ✓ |
| MAZDA / MAZDA CX-5 2.5G 2WD HIGH | 2488 | 2020 | 26/11/2020 | MAZDA CX-5 2019 To 2024 5 Dr SUV 2.5 GLS SkyActiv-G 192Bhp (A) [09/19-01/24] | ✓ |
| MERCEDES BENZ / E300 | 1991 | 2019 | 08/09/2022 | MERCEDES-BENZ E-Class 2017 On 2 Dr Coupe 2 E300 AMG Line 245Bhp (A) [07/17-] | ✓ |
| MITSUBISHI / ASX 2WD | 1998 | 2015 | 31/01/2016 | MITSUBISHI ASX 2010 On 5 Dr SUV 2 2WD 148Bhp [02/14-] | ✓ |
| MITSUBISHI / LANCER 2.0 GT | 1998 | 2011 | 08/09/2011 | MITSUBISHI Lancer 2007 On 4 Dr Sal 2 GT 153Bhp [08/09-07/12] | ✓ |
| MITSUBISHI / XPANDER | 1499 | 2023 | 12/08/2023 | MITSUBISHI Xpander 2020 To 2024 5 Dr SUV 1.5 1.5 104Bhp [11/20-09/24] | ✓ |
| NISSAN / GRAND LIVINA 1.6L A/T | 1598 | 2012 | 23/02/2012 | NISSAN Grand Livina 2007 On MPV 1.6 104Bhp (A) [06/11-08/13] | ✓ |
| NISSAN / GRAND LIVINA 1.6L M/T | 1598 | 2008 | 12/02/2008 | NISSAN Grand Livina 2007 On MPV 1.6 104Bhp (A) [12/07-05/11] | ✗ |
| NISSAN / NISSAN X-TRAIL 2.0L CVT | 1997 | 2019 | 26/02/2019 | NISSAN X-Trail 2003 On 5 Dr SUV 2 146Bhp (A) [06/03-03/05] | ✗ |
| NISSAN / NISSAN X-TRAIL 2.0L CVT | 1997 | 2016 | 29/02/2016 | NISSAN X-Trail 2015 On 5 Dr SUV 2 2WD (T32) 142Bhp (A) [02/15-] | ✓ |
| PERODUA / ALZA - 1500 AV (AUTO) | 1495 | 2019 | 19/02/2019 | PERODUA Alza 2009 On MPV 1.5 Advance 102Bhp (A) [09/18-07/22] | ✓ |
| PERODUA / ALZA - 1500 EZ (AUTO) | 1495 | 2014 | 27/08/2014 | PERODUA Alza 2009 On MPV 1.5 EZ 103Bhp (A) [01/14-10/18] | ✓ |
| PERODUA / ALZA - 1500 EZI (AUTO) | 1495 | 2011 | 30/05/2011 | PERODUA Alza 2009 On MPV 1.5 EZi 102Bhp (A) [11/09-12/13] | ✓ |
| PERODUA / ALZA - 1500 SE (AUTO) | 1495 | 2014 | 10/04/2014 | PERODUA Alza 2009 On MPV 1.5 SE 102Bhp (A) [09/18-07/22] | ✗ |
| PERODUA / ALZA 1500 EZ (AUTO) | 1495 | 2013 | 20/06/2013 | PERODUA Alza 2009 On MPV 1.5 EZ 102Bhp (A) [11/09-12/13] | ✓ |
| PERODUA / ARUZ - 1500 X (AUTO) | 1496 | 2020 | 13/01/2020 | PERODUA Aruz 2019 To 2021 5 Dr SUV 1.5 1.5 X 104Bhp (A) [01/19-05/21] | ✓ |
| PERODUA / ATIVA - 1000 TURBO AV (CVT) | 998 | 2024 | 16/05/2024 | PERODUA Ativa 2021 On 5 Dr SUV 1 1.0 AV 97Bhp [03/21-] | ✓ |
| PERODUA / ATIVA - 1000 TURBO AV (CVT) | 998 | 2024 | 29/02/2024 | PERODUA Ativa 2021 On 5 Dr SUV 1 1.0 AV 97Bhp [03/21-] | ✓ |
| PERODUA / AXIA - 1000 E (MANUAL) | 998 | 2026 | 29/05/2026 | PERODUA Axia 2019 On 5 Dr Hatch 1 1.0 E 67Bhp (M) [06/23-] | ✓ |
| PERODUA / AXIA - 1000 SE (AUTO) | 998 | 2017 | 30/10/2017 | PERODUA Axia 2014 To 2019 5 Dr Hatch 1 SE (A) 67Bhp (A) [01/17-08/19] | ✓ |
| PERODUA / AXIA - 1000 SE (CVT) | 998 | 2024 | 29/07/2024 | PERODUA Axia 2023 On 5 Dr Hatch 1 1.0 SE 67Bhp [02/23-] | ✓ |
| PERODUA / BEZZA - 1300 AV (AUTO) | 1329 | 2020 | 31/05/2020 | PERODUA Bezza 2020 On 4 Dr Sal 1.3 AV 94Bhp (A) [01/20-] | ✓ |
| PERODUA / BEZZA - 1300 X (AUTO) | 1329 | 2017 | 23/02/2017 | PERODUA Bezza 2016 On 4 Dr Sal 1.3 Premium X 94Bhp (A) [07/16-05/17] | ✓ |
| PERODUA / BEZZA - 1300 X (AUTO) | 1329 | 2023 | 20/12/2023 | PERODUA Bezza 2020 On 4 Dr Sal 1.3 X 94Bhp (A) [01/20-] | ✓ |
| PERODUA / KELISA 1.0 EZ (AUTO) | 989 | 2004 | 13/05/2004 | PERODUA Kelisa 2001 On 5 Dr Hatch 1 EZ 54Bhp (A) [10/03-] | ✓ |
| PERODUA / KELISA 1.0 GX (MANUAL) | 989 | 2004 | 18/03/2004 | PERODUA Kelisa 2001 On 5 Dr Hatch 1 GX 54Bhp (M) [10/03-] | ✓ |
| PERODUA / KENARI EZ (AUTO) | 659 | 2004 | 07/04/2004 | PERODUA Kenari 2000 On Mini Van 1 EZ 54Bhp (A) [04/03-] | ✓ |
| PERODUA / MYVI - 1.3 EZ (AUTO) | 1298 | 2009 | 19/08/2009 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 EZ 86Bhp (A) [08/08-05/11] | ✓ |
| PERODUA / MYVI - 1.3 EZI (AUTO) | 1298 | 2006 | 15/06/2006 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 EZi 86Bhp (A) [05/05-07/08] | ✓ |
| PERODUA / MYVI - 1.3 SXI (MANUAL) | 1298 | 2006 | 19/10/2006 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 SXi 86Bhp (M) [05/05-07/08] | ✓ |
| PERODUA / MYVI - 1300 G (CVT) | 1329 | 2022 | 30/11/2022 | PERODUA Myvi 2021 On 5 Dr Hatch 1.3 1.3 G 94Bhp [11/21-] | ✓ |
| PERODUA / MYVI - 1300 X (AUTO) | 1298 | 2015 | 10/07/2015 | PERODUA Myvi 2011 On 5 Dr Hatch 1.3 X (A) 89Bhp (A) [01/15-10/17] | ✓ |
| PERODUA / MYVI - 1300 X (AUTO) | 1329 | 2020 | 30/05/2020 | PERODUA Myvi 2017 To 2020 5 Dr Hatch 1.3 Premium X 94Bhp (A) [11/17-07/20] | ✓ |
| PERODUA / MYVI - 1500 H (AUTO) | 1496 | 2019 | 24/03/2019 | PERODUA Myvi 2017 To 2020 5 Dr Hatch 1.5 High 102Bhp (A) [11/17-07/20] | ✓ |
| PERODUA / MYVI - 1500 SE (AUTO) | 1495 | 2015 | 24/11/2015 | PERODUA Myvi 2011 On 5 Dr Hatch 1.5 SE (A) 102Bhp (A) [01/15-10/17] | ✓ |
| PERODUA / MYVI - 1500 SE (AUTO) | 1495 | 2016 | 29/08/2016 | PERODUA Myvi 2011 On 5 Dr Hatch 1.5 SE (A) 102Bhp (A) [09/11-12/14] | ✗ |
| PERODUA / MYVI - 1500 X (CVT) | 1496 | 2022 | 18/01/2022 | PERODUA Myvi 2021 On 5 Dr Hatch 1.5 1.5 X 102Bhp [11/21-] | ✓ |
| PERODUA / MYVI 1.5 SE (AUTO) | 1495 | 2013 | 30/12/2013 | PERODUA Myvi 2011 On 5 Dr Hatch 1.5 SE (A) 102Bhp (A) [09/11-12/14] | ✓ |
| PERODUA / MYVI 1.5 SE (AUTO) | 1495 | 2013 | 11/04/2013 | PERODUA Myvi 2011 On 5 Dr Hatch 1.5 SE (A) 102Bhp (A) [09/11-12/14] | ✓ |
| PERODUA / MYVI 1.5 SE (AUTO) | 1495 | 2012 | 04/09/2012 | PERODUA Myvi 2011 On 5 Dr Hatch 1.5 SE (A) 102Bhp (A) [09/11-12/14] | ✓ |
| PERODUA / MYVI 1.5 SE (MANUAL) | 1495 | 2013 | 09/01/2013 | PERODUA Myvi 2011 On 5 Dr Hatch 1.5 SE (M) 102Bhp (M) [09/11-12/14] | ✓ |
| PERODUA / VIVA - 1000 EZ (AUTO) | 989 | 2014 | 29/04/2014 | PERODUA Viva 2007 On 5 Dr Hatch 1 EZ 60Bhp (A) [05/07-] | ✓ |
| PERODUA / VIVA - 1000 EZ (AUTO) | 989 | 2007 | 30/11/2007 | PERODUA Viva 2007 On 5 Dr Hatch 1 EZ 60Bhp (A) [05/07-] | ✓ |
| PERODUA / VIVA - 1000 EZ (AUTO) | 989 | 2010 | 30/07/2010 | PERODUA Viva 2007 On 5 Dr Hatch 1 EZ 60Bhp (A) [05/07-] | ✓ |
| PERODUA / VIVA - 850 EX (MANUAL) | 847 | 2009 | 17/11/2009 | PERODUA Viva 2007 On 5 Dr Hatch 0.85 EX 52Bhp (M) [05/07-] | ✓ |
| PROTON / ERTIGA 1.4L AUTOMATIK | 1373 | 2017 | 08/12/2017 | PROTON Ertiga 2016 On MPV 1.4 Executive 91Bhp (A) [11/16-07/18] | ✓ |
| PROTON / EXORA 1.6 CVT PREMIUM | 1561 | 2023 | 16/05/2023 | PROTON Exora 2022 On MPV 1.6 Premium CVT 138Bhp [08/22-] | ✓ |
| PROTON / IRIZ 1.3L CVT | 1332 | 2015 | 20/10/2015 | PROTON Iriz 2014 To 2021 5 Dr Hatch 1.3 Standard 94Bhp (A) [09/14-05/17] | ✓ |
| PROTON / PERSONA 1.6 AUTOMATIK | 1597 | 2009 | 06/07/2009 | PROTON Persona 2007 To 2016 4 Dr Sal 1.6 Base Line 109Bhp (A) [08/07-02/10] | ✓ |
| PROTON / PERSONA 1.6 AUTOMATIK | 1597 | 2011 | 06/10/2011 | PROTON Persona 2007 To 2016 4 Dr Sal 1.6 High Line 109Bhp (A) [03/10-05/16] | ✓ |
| PROTON / PERSONA 1.6 CVT STANDARD | 1597 | 2019 | 03/10/2019 | PROTON Persona 2016 To 2021 4 Dr Sal 1.6 Executive 107Bhp [04/19-08/21] | ✗ |
| PROTON / PREVE 1.6L CVT | 1597 | 2015 | 29/03/2015 | PROTON Preve 2012 On 4 Dr Sal 1.6 Executive 108Bhp (A) [04/12-03/18] | ✓ |
| PROTON / PREVE 1.6L CVT | 1561 | 2015 | 14/05/2015 | PROTON Preve 2012 On 4 Dr Sal 1.6 Executive 108Bhp (A) [04/12-03/18] | ✓ |
| PROTON / S70 1.5T FLAGSHIP | 1477 | 2025 | 23/03/2025 | PROTON S70 2023 To 2026 4 Dr Sal 1.5 1.5T Flagship 148Bhp [11/23-02/26] | ✓ |
| PROTON / SAGA 1.3 AT STANDARD LITE | 1332 | 2022 | 14/10/2022 | PROTON Saga 2022 On 4 Dr Sal 1.3 Standard Lite 94Bhp (A) [08/22-11/25] | ✓ |
| PROTON / SAGA 1.3 AUTOMATIK | 1332 | 2010 | 20/07/2010 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 B-Line 94Bhp (A) [01/08-11/10] | ✓ |
| PROTON / SAGA 1.3 AUTOMATIK PREMIUM | 1332 | 2021 | 30/03/2021 | PROTON Saga 2019 To 2022 4 Dr Sal 1.3 Premium 94Bhp (A) [08/19-08/22] | ✓ |
| PROTON / SAGA 1.3 AUTOMATIK PREMIUM | 1332 | 2020 | 17/07/2020 | PROTON Saga 2019 To 2022 4 Dr Sal 1.3 Premium 94Bhp (A) [08/19-08/22] | ✓ |
| PROTON / SAGA 1.3 AUTOMATIK PREMIUM | 1332 | 2023 | 29/11/2023 | PROTON Saga 2022 On 4 Dr Sal 1.3 Premium 94Bhp (A) [05/22-11/25] | ✓ |
| PROTON / SAGA 1.3 AUTOMATIK PREMIUM | 1332 | 2022 | 28/07/2022 | PROTON Saga 2016 To 2019 4 Dr Sal 1.3 Premium 94Bhp [09/16-07/19] | ✗ |
| PROTON / SAGA 1.3 AUTOMATIK PREMIUM | 1332 | 2021 | 17/03/2021 | PROTON Saga 2019 To 2022 4 Dr Sal 1.3 Premium 94Bhp (A) [08/19-08/22] | ✓ |
| PROTON / SAGA 1.3 AUTOMATIK PREMIUM | 1332 | 2024 | 03/07/2024 | PROTON Saga 2016 To 2019 4 Dr Sal 1.3 Premium 94Bhp [09/16-07/19] | ✗ |
| PROTON / SAGA 1.3 MANUAL | 1332 | 2009 | 26/02/2009 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 B-Line 94Bhp (M) [01/08-11/10] | ✓ |
| PROTON / SAGA 1.3L CVT | 1332 | 2019 | 25/02/2019 | PROTON Saga 2016 To 2019 4 Dr Sal 1.3 Standard 94Bhp [09/16-07/19] | ✓ |
| PROTON / SAGA FL 1.3 AUTOMATIK | 1332 | 2013 | 17/04/2013 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FLX (Executive) 94Bhp (A) [07/11-06/14] | ✓ |
| PROTON / SAGA FL 1.3 AUTOMATIK | 1332 | 2012 | 27/12/2012 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FLX (Executive) 94Bhp (A) [07/11-06/14] | ✓ |
| PROTON / SAGA FL 1.3 AUTOMATIK | 1332 | 2012 | 29/01/2012 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FLX (Standard) 94Bhp (A) [07/11-06/14] | ✓ |
| PROTON / SAGA FL 1.3 CVT | 1332 | 2014 | 16/01/2015 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FLX (Executive) 94Bhp (A) [07/14-09/16] | ✓ |
| PROTON / SAGA FL 1.3 MANUAL | 1332 | 2011 | 26/04/2011 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FL (Standard) 94Bhp (M) [12/10-04/11] | ✓ |
| PROTON / SAGA FL 1.3 MANUAL | 1332 | 2011 | 11/08/2011 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FLX (Executive) 94Bhp (A) [07/11-06/14] | ✗ |
| PROTON / SATRIA NEO 1.6 (M) | 1597 | 2010 | 05/04/2010 | PROTON Satria 2004 On 3 Dr Hatch 1.6 Neo 108Bhp (M) [06/06-] | ✓ |
| PROTON / WAJA 1.6 MANUAL | 1597 | 2006 | 30/06/2006 | PROTON Waja 2000 On 4 Dr Sal 1.6 CPS 125Bhp (M) [02/08-] | ✗ |
| PROTON / WAJA 1.6 MT | 1584 | 2001 | 02/11/2001 | PROTON Waja 2000 On 4 Dr Sal 1.6 (CF1) 102Bhp (M) [08/00-12/05] | ✓ |
| PROTON / WIRA 1.3GL | 1834 | 1996 | 05/03/1996 | PROTON Wira 1993 On 4 Dr Sal 1.3 GL 81Bhp (M) [09/95-] | ✓ |
| PROTON / WIRA 1.5 GL(M) | 1468 | 1996 | 26/09/1996 | PROTON Wira 1993 On 4 Dr Sal 1.5 GL 86Bhp (M) [09/95-] | ✓ |
| PROTON / WIRA 1.5GL(M) | 1468 | 1997 | 25/01/1997 | PROTON Wira 1993 On 4 Dr Sal 1.5 GL 86Bhp (M) [09/95-] | ✓ |
| SUBARU / SUBARU XV2.0I | 1995 | 2015 | 19/07/2016 | SUBARU XV 2012 On 5 Dr SUV 2 2.0i-Premium 148Bhp [01/16-] | ✓ |
| SUZUKI / SWIFT 1.5L A/T | 1490 | 2011 | 25/10/2011 | SUZUKI Swift 2005 On 5 Dr Hatch 1.5 GLX 102Bhp (A) [07/11-12/12] | ✓ |
| TOYOTA / ALPHARD DBA-AGH30W (A) | 2493 | 2018 | 24/07/2019 | TOYOTA Alphard (Grey Import) MPV 2.5 AGH30R-PFXGK [01/15-] | ✓ |
| TOYOTA / CAMRY 2.0G (A) | 1998 | 2007 | 04/02/2008 | TOYOTA Camry 2006 To 2009 4 Dr Sal 2 G (ACV41R-JEPEKE) 145Bhp (A) [10/06-08/09] | ✓ |
| TOYOTA / COROLLA CROSS 1.8V A/T | 1798 | 2024 | 20/12/2024 | TOYOTA Corolla Cross 2024 On 5 Dr SUV 1.8 1.8V (ZSG10R-JHXEKE 3A) 138Bhp [12/24-] | ✓ |
| TOYOTA / HILUX S/C 2.4 MT 4X4 | 2393 | 2022 | 23/08/2022 | TOYOTA Hilux 2016 To 2020 4 Dr Pickup Dbl.Cab 2.4 (GUN135R-DEFLHECP) 148Bhp (M) [05/16-10/20] | ✗ |
| TOYOTA / INNOVA 2.0 E (M) | 1998 | 2008 | 28/02/2008 | TOYOTA Innova 2005 On MPV 2 E 134Bhp (M) [05/05-09/08] | ✓ |
| TOYOTA / INNOVA 2.0G AT | 1998 | 2017 | 17/04/2017 | TOYOTA Innova 2016 On MPV 2 G (TGN140R-METMKEEL) 137Bhp (A) [12/16-02/21] | ✓ |
| TOYOTA / TOYOTA AVANZA 1.3 (M) | 1298 | 2006 | 15/05/2006 | TOYOTA Avanza 2004 On MPV 1.3 89Bhp (M) [10/04-09/06] | ✓ |
| TOYOTA / TOYOTA AVANZA 1.5G A/T | 1495 | 2008 | 05/12/2008 | TOYOTA Avanza 2004 On MPV 1.5 G 108Bhp (A) [10/08-11/10] | ✓ |
| TOYOTA / TOYOTA COROLLA ALTIS 1.8E (A) | 1798 | 2014 | 28/03/2014 | TOYOTA Corolla Altis 2014 On 4 Dr Sal 1.8 E (ZRE172R-GEXEKE) 137Bhp (A) [01/14-11/16] | ✓ |
| TOYOTA / TOYOTA HILUX DOUBLE CAB 2.5 AT | 2494 | 2011 | 27/04/2011 | TOYOTA Hilux 2005 To 2016 4 Dr Pickup Dbl.Cab 2.5 G (KUN25R-PRPSHE) 101Bhp (A) [10/08-08/11] | ✓ |
| TOYOTA / TOYOTA HILUX SINGLE CAB 2.5 MT | 2494 | 2014 | 11/09/2014 | TOYOTA Hilux 2005 To 2016 2 DR Pickup 2.5 (KUN25R-TRMDHE) 142Bhp (M) [10/12-10/13] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5E (AT) | 1496 | 2018 | 23/08/2018 | TOYOTA Vios 2016 To 2020 4 Dr Sal 1.5 E (NSP151R-BEXRKE E2) 106Bhp [10/16-12/18] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G (A) | 1496 | 2005 | 03/10/2005 | TOYOTA Vios 2003 To 2007 4 Dr Sal 1.5 G (NCP42R) 108Bhp (A) [06/03-11/05] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G A/T | 1496 | 2019 | 16/05/2019 | TOYOTA Vios 2019 To 2020 4 Dr Sal 1.5 G (NSP151R-BEXGKE V3) 105Bhp [01/19-12/20] | ✓ |
| TOYOTA / VELLFIRE DBA-AGH30W | 2493 | 2015 | 21/03/2017 | TOYOTA Vellfire (Grey Import) MPV 2.5 AGH30W-NRXQK [01/15-01/18] | ✓ |
| TOYOTA / VIOS 1.5 HEV AT | 1496 | 2026 | 25/03/2026 | TOYOTA Vios 2026 On 4 Dr Sal 1.5 1.5 HEV (NYC100R-EEXHBE 1E) 90Bhp [01/26-] | ✓ |
| TOYOTA / VIOS 1.5G AT | 1496 | 2023 | 10/07/2023 | TOYOTA Vios 2023 To 2026 4 Dr Sal 1.5 1.5G (NGC102R-EEXHKE 1B) 104Bhp [03/23-01/26] | ✓ |
| TOYOTA / VIOS 1.5G AT | 1496 | 2024 | 02/04/2024 | TOYOTA Vios 2023 To 2026 4 Dr Sal 1.5 1.5G (NGC102R-EEXHKE 1B) 104Bhp [03/23-01/26] | ✓ |
| TOYOTA / WISH CBA-ZNE10G (A) | 1794 | 2004 | 23/02/2009 | TOYOTA WISH MPV 1.8 CBA-ZNE10G (A) | ✓ |
| TOYOTA / WISH DBA-ZGE20G (A) | 1797 | 2010 | 25/07/2013 | TOYOTA WISH MPV 1.8 DBA-ZGE20G (A) | ✓ |


### Newvest (NVISSAC) — RCs read 2026-11-01
| RC (Buatan / Nama Model) | cc | Made | Registered | Chosen in Merimen | |
|---|---|---|---|---|---|
| AUDI / A4 1.8 TFSI | 1798 | 2015 | 28/03/2016 | AUDI A4 2009 To 2016 4 Dr Sal 1.8 TFSI (B8) 161Bhp (A) [04/12-08/16] | ✓ |
| BMW / BMW 330E | 1998 | 2017 | 08/12/2017 | BMW 3-Series 2012 To 2019 4 Dr Sal 2 330e M Sport 184Bhp (A) [02/17-02/19] | ✓ |
| BMW / X5 XDRIVE45E | 2998 | 2020 | 27/08/2020 | BMW X5 5 DR SUV 3.0 xDrive45e (G05) (A) [18-] | ✓ |
| CAM / KINGO XMQ6552 | 2982 | 2020 | 29/09/2020 | KING LONG CAM KINGO PLUS VAN 3.0 D (XMQ6552) (M) | ✓ |
| CHEVROLET / SONIC 1.4L AT LTZ (HB) | 1398 | 2013 | 25/07/2014 | CHEVROLET Sonic 2012 On 5 Dr Hatch 1.4 LTZ 99Bhp (A) [12/12-] | ✓ |
| FORD / MUSTANG 2.3 (import) | 2261 | 2016 | 13/03/2020 | FORD MUSTANG 2 DR COUPE 2.3 GTDI FN MY20 (A) | ✗ |
| FORD / RANGER 2.0L BIT WT 4WD AT | 1996 | 2019 | 20/05/2020 | FORD Ranger 2018 To 2019 4 Dr Pickup Dbl.Cab 2 Bi-Turbo WildTrak 4X4 210Bhp (A) [10/18-] | ✓ |
| HINO / WU410R-HKMMS3 (UBS) | 4009 | 2011 | 03/08/2011 | HINO WU300R-HBMLS3 LORRY 4.0 D (M) | ✗ |
| HONDA / BR-V 1.5L V | 1497 | 2019 | 18/03/2019 | HONDA BR-V 2017 On 5 Dr SUV 1.5 V 119Bhp [01/17-] | ✓ |
| HONDA / CITY 1.5L RS | 1498 | 2023 | 22/11/2023 | HONDA City 2023 On 4 Dr Sal 1.5 1.5 RS 119Bhp [08/23-] | ✓ |
| HONDA / CITY 1.5L V | 1498 | 2021 | 19/05/2021 | HONDA City 2020 To 2023 4 Dr Sal 1.5 1.5 V 119Bhp [10/20-08/23] | ✓ |
| HONDA / CITY 1.5L V-SEN | 1498 | 2022 | 28/10/2022 | HONDA City 2021 On 4 Dr Sal 1.5 1.5 V Sensing 119Bhp [11/21-08/23] | ✓ |
| HONDA / CITY V 1.5L I-VTEC | 1497 | 2014 | 12/09/2014 | HONDA City 2014 On 4 Dr Sal 1.5 V 118Bhp (A) [04/14-02/17] | ✓ |
| HONDA / CIVIC 1.5 TC | 1498 | 2020 | 06/08/2020 | HONDA Civic 2020 To 2022 4 Dr Sal 1.5 TC 171Bhp [02/20-01/22] | ✓ |
| HONDA / CIVIC 1.5 TC-P | 1498 | 2016 | 26/09/2016 | HONDA Civic 2016 To 2020 4 Dr Sal 1.5 TC-P 171Bhp [06/16-02/20] | ✓ |
| HONDA / CIVIC 1.8L I-VTEC (A) | 1799 | 2016 | 27/12/2016 | HONDA Civic 2016 To 2020 4 Dr Sal 1.8 S 139Bhp [06/16-02/20] | ✓ |
| HONDA / CIVIC 1.8L I-VTEC (A) | 1799 | 2009 | 05/06/2009 | HONDA Civic 2006 On 4 Dr Sal 1.8 S 138Bhp (A) [03/09-06/12] | ✓ |
| HONDA / CR-V 1.5 TC | 1498 | 2018 | 29/08/2018 | HONDA CR-V 2017 To 2020 5 Dr SUV 1.5 1.5TC 4WD 190Bhp [07/17-11/20] | ✓ |
| HONDA / CR-V 2.0L I-VTEC (A) | 1997 | 2015 | 21/09/2015 | HONDA CR-V 2015 To 2017 5 Dr SUV 2 2WD i-VTEC 153Bhp (A) [02/15-06/17] | ✓ |
| HONDA / HR-V 1.8L V | 1799 | 2016 | 31/03/2016 | HONDA HR-V 2015 To 2022 5 Dr SUV 1.8 V 140Bhp (A) [02/15-12/18] | ✓ |
| HYUNDAI / GETZ 1.6 (A) | 1594 | 2004 | 12/11/2004 | HYUNDAI Getz 2003 On 5 Dr Hatch 1.6 GLS 104Bhp (A) [02/03-] | ✓ |
| INOKOM CORPORATION SDN. BHD. / LORIMAS AU26 | 2607 | 2012 | 10/08/2012 | INOKOM LORIMAS LORRY 2.6 D (3.6T) AU26 (M) | ✓ |
| ISUZU / TFS87JDR-TCPH | 1898 | 2022 | 27/07/2022 | ISUZU TFS55HP 2.8 Space Cab | ✗ |
| LEXUS / IS300 (3BA-ASE30) (import) | 1998 | 2021 | 03/10/2024 | LEXUS IS300 4 DR SAL 2.0 F Sport (3BA-ASE30) (A) | ✓ |
| MAZDA / MAZDA6 2.0SDN (A) | 1998 | 2013 | 03/10/2013 | MAZDA 6 2010 To 2013 4 Dr Sal 2 147Bhp (A) [07/10-02/13] | ✗ |
| MERCEDES BENZ / C180 (import) | 1595 | 2018 | 09/08/2021 | MERCEDES-BENZ C180 4 DR SAL 1.8 W203 (A) | ✗ |
| MERCEDES BENZ / GLC200-X253 | 1991 | 2018 | 15/02/2018 | MERCEDES-BENZ GLC 200 5 DR SUV 2.0 (X253) (A) [16-] | ✓ |
| MERCEDES BENZ / MB C200 (W205) | 1991 | 2014 | 04/03/2015 | MERCEDES-BENZ C200 2 DR COUPE 2.0 (W205) (A) [15-] | ✗ |
| MODENAS / KRISS MJ110 | 107 | 2020 | 28/09/2020 | MODENAS KRISS 107cc MJ110 | ✓ |
| NISSAN / NISSAN NV350 URVAN S/LONG H/ROOF | 2488 | 2016 | 20/04/2016 | NISSAN NV350 URVAN VAN 2.5 D (Facelift) (M) [17-] | ✗ |
| NISSAN / NISSAN X-TRAIL 2.0L CVT | 1997 | 2015 | 30/11/2015 | NISSAN X-Trail 2015 On 5 Dr SUV 2 2WD (T32) 142Bhp (A) [02/15-] | ✓ |
| NISSAN / SERENA2.0L CVT H/STAR S-HYBRID | 1997 | 2016 | 20/10/2016 | NISSAN Serena 2011 To 2018 MPV 2 S-Hybrid Highway Star 143Bhp [11/14-04/18] | ✓ |
| NISSAN / SYLPHY 2.0 CVTC | 1997 | 2010 | 11/06/2010 | NISSAN Sylphy 2008 On 4 Dr Sal 2 131Bhp (A) [06/08-02/12] | ✓ |
| NISSAN / SYLPHY 2.0 CVTC | 1997 | 2013 | 04/02/2013 | NISSAN Sylphy 2008 On 4 Dr Sal 2 XV 131Bhp (A) [03/12-04/14] | ✓ |
| PERODUA / ALZA - 1500 AV (CVT) | 1496 | 2023 | 30/10/2023 | PERODUA Alza 2022 On MPV 1.5 1.5 AV 105Bhp [07/22-] | ✓ |
| PERODUA / ALZA - 1500 H (CVT) | 1496 | 2023 | 20/11/2023 | PERODUA Alza 2022 On MPV 1.5 1.5 H 105Bhp [07/22-] | ✓ |
| PERODUA / AXIA - 1000 SE (CVT) | 998 | 2024 | 21/06/2024 | PERODUA Axia 2023 On 5 Dr Hatch 1 1.0 SE 67Bhp [02/23-] | ✓ |
| PERODUA / BEZZA - 1300 AV (AUTO) | 1329 | 2016 | 21/12/2016 | PERODUA Bezza 2016 On 4 Dr Sal 1.3 Advance 94Bhp (A) [07/16-05/17] | ✓ |
| PERODUA / BEZZA - 1300 X (AUTO) | 1329 | 2022 | 07/07/2022 | PERODUA Bezza 2020 On 4 Dr Sal 1.3 X 94Bhp (A) [01/20-] | ✓ |
| PERODUA / MYVI - 1.3 EZ (AUTO) | 1298 | 2006 | 28/07/2006 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 EZ 86Bhp (A) [05/05-07/08] | ✓ |
| PERODUA / MYVI - 1.3 EZ (AUTO) | 1298 | 2008 | 19/08/2008 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 EZ 86Bhp (A) [08/08-05/11] | ✓ |
| PERODUA / MYVI - 1.3 EZI (AUTO) | 1298 | 2013 | 30/01/2013 | PERODUA Myvi 2011 On 5 Dr Hatch 1.3 EZi Premium 89Bhp (A) [06/11-12/14] | ✓ |
| PERODUA / MYVI - 1300 G (AUTO) | 1298 | 2016 | 25/07/2016 | PERODUA Myvi 2011 On 5 Dr Hatch 1.3 G (A) 89Bhp (A) [01/15-10/17] | ✓ |
| PERODUA / MYVI - 1300 X (AUTO) | 1329 | 2019 | 24/07/2019 | PERODUA Myvi 2017 To 2020 5 Dr Hatch 1.3 Premium X 94Bhp (A) [11/17-07/20] | ✓ |
| PERODUA / MYVI - 1500 SE (AUTO) | 1495 | 2016 | 16/02/2016 | PERODUA Myvi 2011 On 5 Dr Hatch 1.5 SE (A) 102Bhp (A) [01/15-10/17] | ✓ |
| PROTON / IRIZ 1.3L CVT | 1332 | 2016 | 30/05/2016 | PROTON Iriz 2014 To 2021 5 Dr Hatch 1.3 E 94Bhp (M) [09/14-05/17] | ✗ |
| PROTON / IRIZ 1.6 CVT EXECUTIVE | 1597 | 2021 | 03/11/2021 | PROTON Iriz 2014 To 2021 5 Dr Hatch 1.6 Executive 107Bhp [04/19-] | ✓ |
| PROTON / IRIZ 1.6L CVT | 1597 | 2015 | 23/10/2015 | PROTON Iriz 2014 To 2021 5 Dr Hatch 1.6 E 107Bhp (A) [09/14-05/17] | ✓ |
| PROTON / PERSONA 1.6 CVT EXECUTIVE | 1597 | 2021 | 28/04/2021 | PROTON Persona 2021 On 4 Dr Sal 1.6 Executive 107Bhp [08/21-] | ✗ |
| PROTON / PREVE 1.6L CVT | 1561 | 2012 | 07/01/2013 | PROTON Preve 2012 On 4 Dr Sal 1.6 Executive (CVT) 138Bhp [04/18-] | ✗ |
| PROTON / SAGA 1.3 AUTOMATIK STANDARD | 1332 | 2022 | 30/06/2022 | PROTON Saga 2022 On 4 Dr Sal 1.3 Standard 94Bhp (A) [05/22-] | ✓ |
| PROTON / X70 1.8 TGDI PREMIUM 2WD | 1799 | 2019 | 30/05/2019 | PROTON X70 2018 On 5 Dr SUV 1.8 TGDI Premium 182Bhp (A) [12/18-] | ✓ |
| SSANGYONG / STAVIC SV200 (A) | 1998 | 2014 | 24/11/2014 | SSANGYONG STAVIC MPV 2.0 D SV200 eXDi (A) [13-] | ✓ |
| TOYOTA / ALPHARD (import) | 2493 | 2021 | 05/07/2023 | TOYOTA ALPHARD MPV 2.5 AGH30 (A) | ✓ |
| TOYOTA / ALPHARD (import) | 3456 | 2015 | 24/11/2017 | TOYOTA Alphard (Grey Import) MPV 3.5 GGH30R-NFTQK (A) [01/15-01/18] | ✓ |
| TOYOTA / ALPHARD 3BA-AGH30W (A) (import) | 2493 | 2020 | 20/07/2022 | TOYOTA ALPHARD MPV 2.5 3BA-AGH30W (A) | ✓ |
| TOYOTA / COROLLA ALTIS 1.6E(A) | 1598 | 2002 | 23/04/2002 | TOYOTA Corolla Altis 2001 On 4 Dr Sal 1.6 E (ZZE121R-GEPNKE) 108Bhp (A) [02/04-02/08] | ✗ |
| TOYOTA / COROLLA ALTIS 1.8G A/T | 1798 | 2023 | 25/10/2023 | TOYOTA Corolla Altis 2023 On 4 Dr Sal 1.8 G (ZRE211R-GEXEKE C2) 137Bhp [08/23-] | ✓ |
| TOYOTA / HIACE PANEL VAN 2.5 (D) | 2494 | 2023 | 27/02/2023 | TOYOTA HIACE PANEL VAN 2.5 D Facelift (M) [15-] | ✓ |
| TOYOTA / HILUX DOUBLE CAB 2.4G AT 4X4 | 2393 | 2018 | 06/04/2018 | TOYOTA Hilux 2018 To 2020 4 Dr Pickup Dbl.Cab 2.4 L-Edition (GUN125R-DETSHE) 148Bhp (A) [03/18-10/20] | ✗ |
| TOYOTA / TOYOTA HIACE PANEL VAN 2.5(D) | 2494 | 2010 | 16/08/2010 | TOYOTA Hiace 2006 On Van 2.5 High Roof (KDH202R-EDMDYE) 101Bhp (M) [01/06-08/10] | ✓ |
| TOYOTA / TOYOTA HILUX DOUBLE CAB 2.5L | 2494 | 2006 | 04/05/2006 | TOYOTA Hilux 2005 To 2016 4 Dr Pickup Dbl.Cab 2.5 G (KUN25R-PRPSHE) 101Bhp (A) [03/05-09/08] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5E (AT) | 1497 | 2010 | 29/11/2010 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 E (NCP93R) 108Bhp (A) [04/10-06/12] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G (A) | 1496 | 2007 | 04/06/2007 | TOYOTA Vios 2003 To 2007 4 Dr Sal 1.5 G (NCP42R) 108Bhp (A) [12/05-09/07] | ? |
| TOYOTA / TOYOTA VIOS 1.5G (AT) | 1497 | 2009 | 07/01/2010 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 G Limited (NCP93R) 108Bhp (A) [07/12-09/13] | ✗ |
| TOYOTA / TOYOTA VIOS 1.5G (AT) | 1497 | 2008 | 25/09/2008 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 G (NCP93R) 108Bhp (A) [10/07-03/10] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G (AT) | 1497 | 2014 | 23/06/2014 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 G (NCP150R) 108Bhp (A) [10/13-09/16] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G (AT) | 1497 | 2012 | 03/07/2012 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 G (NCP93R) 108Bhp (A) [07/12-09/13] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G A/T | 1496 | 2019 | 19/06/2019 | TOYOTA Vios 2019 To 2020 4 Dr Sal 1.5 G (NSP151R-BEXGKE V3) 105Bhp [01/19-12/20] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G A/T | 1496 | 2021 | 14/09/2021 | TOYOTA Vios 2020 To 2023 4 Dr Sal 1.5 G (NSP151R-BEXGKE W3) 105Bhp [12/20-] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5J (AT) | 1497 | 2012 | 29/02/2012 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 J (NCP93R) 108Bhp (A) [04/10-06/12] | ✓ |
| TOYOTA / VELLFIRE (import) | 2493 | 2020 | 28/12/2022 | TOYOTA Vellfire (Grey Import) MPV 2.5 AGH30W-NFXGK [01/15-] | ✓ |
| TOYOTA / VELLFIRE DBA-ANH20W (import) | 2362? (very blurry) | 201? (last digit unreadable) | 2?/0?/201? (unreadable) | TOYOTA VELLFIRE MPV 2.4 DBA-ANH20W (A) | ✓ |


### Aman Kepong (CHONGAIAI) — RCs read 2026-11-01 (one case per chosen variant, the 500 most used variants)
| RC (Buatan / Nama Model) | cc | Made | Registered | Chosen in Merimen | |
|---|---|---|---|---|---|
| AUDI / Q5 2.0 TFSI QUATTRO | 1984 | 2014 | 11/12/2014 | AUDI Q5 2009 On 5 Dr SUV 2 TFSI Quattro 225Bhp [10/12-] | ✓ |
| AUDI / TT FSI (A) | 1984 | 2007 | 04/11/2011 | AUDI TT 2007 On 2 Dr Coupe 2 TFSI 197Bhp (A) [06/07-04/15] | ✓ |
| BMW / 520I DBA-XG20 (import) | 1997 | 2013 | 04/07/2018 | BMW 5-Series 2010 To 2017 4 Dr Sal 2 520i (F10) 184Bhp (A) [10/13-03/17] | ✗ |
| BMW / 523I DBA-FP25 (A) (import) | 2497 | 2011 | 26/09/2014 | BMW 5-Series 2010 To 2017 4 Dr Sal 2.5 523i (F10) N52 204Bhp (A) [05/10-03/17] | ✓ |
| BMW / 528I (import) | 2996 | 2011 | 01/06/2012 | BMW 5-Series 2010 To 2017 4 Dr Sal 3 528i (F10) N52B30 258Bhp (A) [10/10-09/13] | ✗ |
| BMW / BMW 320I | 1997 | 2013 | 09/10/2013 | BMW 3-Series 2012 To 2019 4 Dr Sal 2 320i Luxury (F30) N20 184Bhp (A) [09/12-10/15] | ✓ |
| BMW / BMW 330E | 1998 | 2017 | 19/05/2017 | BMW 3-Series 2012 To 2019 4 Dr Sal 2 330e M Sport 184Bhp (A) [02/17-02/19] | ✓ |
| BMW / BMW 330E | 1998 | 2017 | 22/11/2017 | BMW 3-Series 2012 To 2019 4 Dr Sal 2 330e Sport 184Bhp (A) [08/16-02/19] | ✓ |
| BMW / BMW 525I SPORTS E60 | 2497 | 2008 | 24/02/2009 | BMW 5-Series 2003 To 2010 4 Dr Sal 2.5 525i Sports (E60) N52B25 215Bhp (A) [08/07-04/10] | ✓ |
| BMW / X3 XDRIVE30I | 1998 | 2021 | 28/10/2021 | BMW X3 2018 On 5 Dr SUV 2 xDrive30i M Sport 252Bhp (A) [09/19-] | ✓ |
| CHERY / OMODA 5 (H) | 1498 | 2023 | 02/10/2023 | CHERY Omoda 5 2023 On 5 Dr SUV 1.5 H 156Bhp [07/23-] | ✓ |
| FORD / FIESTA 1.6L SPORT AUTO | 1596 | 2012 | 19/07/2012 | FORD Fiesta 2010 On 5 Dr Hatch 1.6 S 118Bhp (A) [10/10-09/13] | ✓ |
| FORD / FIESTA SPORT 1.5L | 1498 | 2013 | 05/06/2014 | FORD Fiesta 2010 On 5 Dr Hatch 1.5 Sport 110Bhp (A) [10/13-] | ✓ |
| FORD / RANGER 2.2L XLT 4WD AT | 2198 | 2014 | 15/01/2015 | FORD Ranger 2012 To 2013 4 Dr Pickup Dbl.Cab 2.2 XLT 4X4 148Bhp (A) [06/12-09/15] | ✓ |
| HONDA / ACCORD 2.0L I-VTEC (A) | 1997 | 2009 | 27/05/2009 | HONDA Accord 2007 On 4 Dr Sal 2 VTi 154Bhp (A) [04/08-02/11] | ✓ |
| HONDA / ACCORD 2.0L I-VTEC (A) | 1997 | 2008 | 27/08/2008 | HONDA Accord 2007 On 4 Dr Sal 2.00 VTi AUTO 154Bhp (A) [04/08-02/11] | ✓ |
| HONDA / ACCORD 2.0L I-VTEC (A) | 1997 | 2008 | 13/11/2008 | HONDA Accord 2006 On 4 Dr Sal 2 VTi 148Bhp (A) [07/06-03/08] | ✗ |
| HONDA / ACCORD 2.0L VTI-L (A) | 1997 | 2016 | 15/07/2016 | HONDA Accord 2013 On 4 Dr Sal 2 VTi-L 153Bhp (A) [09/13-08/16] | ✓ |
| HONDA / ACCORD 2.4L I-VTEC (A) | 2354 | 2011 | 18/05/2011 | HONDA Accord 2007 On 4 Dr Sal 2.4 VTi-L 178Bhp (A) [03/11-08/13] | ✓ |
| HONDA / ACCORD 2.4L I-VTEC (A) | 2354 | 2004 | 26/10/2004 | HONDA Accord 2003 On 4 Dr Sal 2.4 VTi-L 158Bhp (A) [11/03-06/06] | ✓ |
| HONDA / BR-V 1.5L V | 1497 | 2019 | 28/02/2019 | HONDA BR-V 2017 On 5 Dr SUV 1.5 V 119Bhp [01/17-] | ✓ |
| HONDA / BR-V E | 1497 | 2020 | 15/10/2020 | HONDA BR-V 2020 On 5 Dr SUV 1.5 E 119Bhp [06/20-] | ✓ |
| HONDA / BR-V V | 1497 | 2020 | 13/08/2020 | HONDA BR-V 2020 On 5 Dr SUV 1.5 V 119Bhp [06/20-] | ✓ |
| HONDA / CITY 1.5 I-DSI (A) | 1497 | 2005 | 30/12/2005 | HONDA City 2005 On 4 Dr Sal 1.5 i-DSI 87Bhp (A) [10/05-07/07] | ✓ |
| HONDA / CITY 1.5 I-DSI (A) | 1497 | 2008 | 24/03/2008 | HONDA City 2005 On 4 Dr Sal 1.5 i-DSI 87Bhp (A) [08/07-11/08] | ✓ |
| HONDA / CITY 1.5 VTEC (A) | 1497 | 2006 | 15/11/2006 | HONDA City 2005 On 4 Dr Sal 1.5 VTEC 108Bhp (A) [10/05-07/07] | ✓ |
| HONDA / CITY 1.5 VTEC (A) | 1497 | 2004 | 16/09/2004 | HONDA City 2004 To 2005 4 Dr Sal 1.5 VTEC 108Bhp (A) [07/04-09/05] | ✓ |
| HONDA / CITY 1.5L (A) | 1497 | 2003 | 28/05/2003 | HONDA City 2003 To 2005 4 Dr Sal 1.5 i-DSI 87Bhp (A) [04/03-09/05] | ✓ |
| HONDA / CITY 1.5L E | 1497 | 2019 | 02/05/2019 | HONDA City 2014 On 4 Dr Sal 1.5 E 118Bhp [03/17-] | ✓ |
| HONDA / CITY 1.5L E | 1498 | 2021 | 19/03/2021 | HONDA City 2020 To 2023 4 Dr Sal 1.5 1.5 E 119Bhp [10/20-08/23] | ✓ |
| HONDA / CITY 1.5L E | 1498 | 2021 | 11/03/2021 | HONDA City 2020 On 4 Dr Sal 1.5 1.5 E 119Bhp [10/20-] | ✓ |
| HONDA / CITY 1.5L HYBRID | 1498 | 2024 | 31/01/2024 | HONDA City 2023 On 4 Dr Sal 1.5 1.5 e:HEV RS 97Bhp [08/23-] | ✓ |
| HONDA / CITY 1.5L I-VTEC | 1497 | 2009 | 28/10/2009 | HONDA City 2008 On 4 Dr Sal 1.50 i-VTEC (Grade S) AUTO 118Bhp (A) [12/08-05/12] | ✓ |
| HONDA / CITY 1.5L I-VTEC | 1497 | 2012 | 20/07/2012 | HONDA City 2008 On 4 Dr Sal 1.5 i-VTEC (Grade S) 118Bhp (A) [06/12-03/14] | ✓ |
| HONDA / CITY 1.5L I-VTEC | 1497 | 2009 | 01/07/2009 | HONDA City 2008 On 4 Dr Sal 1.5 i-VTEC (Grade S) 118Bhp (A) [12/08-05/12] | ✓ |
| HONDA / CITY 1.5L I-VTEC | 1497 | 2012 | 04/07/2012 | HONDA City 2008 On 4 Dr Sal 1.50 i-VTEC (Grade S) AUTO 118Bhp (A) [06/12-03/14] | ✓ |
| HONDA / CITY 1.5L V | 1497 | 2019 | 01/01/2020 | HONDA City 2014 On 4 Dr Sal 1.50 V 118Bhp [03/17-] | ✓ |
| HONDA / CITY 1.5L V | 1498 | 2023 | 29/12/2023 | HONDA City 2023 On 4 Dr Sal 1.5 1.5 V 119Bhp [08/23-] | ✓ |
| HONDA / CITY 1.5L V | 1498 | 2021 | 27/04/2021 | HONDA City 2020 On 4 Dr Sal 1.50 1.5 V 119Bhp [10/20-] | ✓ |
| HONDA / CITY 1.5L V | 1498 | 2022 | 16/03/2022 | HONDA City 2020 On 4 Dr Sal 1.5 1.5 V 119Bhp [10/20-] | ✓ |
| HONDA / CITY E 1.5L I-VTEC | 1497 | 2013 | 30/11/2013 | HONDA City 2008 On 4 Dr Sal 1.5 i-VTEC (Grade E) 118Bhp (A) [06/12-03/14] | ✓ |
| HONDA / CITY E 1.5L I-VTEC | 1497 | 2015 | 06/07/2015 | HONDA City 2014 On 4 Dr Sal 1.50 E AUTO 118Bhp (A) [04/14-02/17] | ✓ |
| HONDA / CITY E 1.5L I-VTEC | 1497 | 2015 | 03/12/2015 | HONDA City 2014 On 4 Dr Sal 1.5 E 118Bhp (A) [04/14-02/17] | ✓ |
| HONDA / CITY S 1.5L I-VTEC |  | 2015 | 19/06/2015 | HONDA City 2014 On 4 Dr Sal 1.5 S 118Bhp (A) [04/14-02/17] | ✓ |
| HONDA / CITY V 1.5L I-VTEC | 1497 | 2014 | 22/07/2014 | HONDA City 2014 On 4 Dr Sal 1.5 V 118Bhp (A) [04/14-02/17] | ✓ |
| HONDA / CITY V 1.5L I-VTEC | 1497 | 2014 | 28/10/2014 | HONDA City 2014 On 4 Dr Sal 1.50 V AUTO 118Bhp (A) [04/14-02/17] | ✓ |
| HONDA / CITY V 1.5L I-VTEC | 1497 | 2017 | 04/07/2017 | HONDA City 2014 On 4 Dr Sal 1.5 V 118Bhp [03/17-] | ✓ |
| HONDA / CIVIC 1.5 TC | 1498 | 2018 | 23/08/2018 | HONDA Civic 2016 On 4 Dr Sal 1.5 TC 171Bhp [06/16-02/20] | ✓ |
| HONDA / CIVIC 1.5 TC-P | 1498 | 2017 | 29/05/2017 | HONDA Civic 2016 On 4 Dr Sal 1.5 TC-P 171Bhp [06/16-02/20] | ✓ |
| HONDA / CIVIC 1.5 TC-P | 1498 | 2016 | 27/06/2016 | HONDA Civic 2016 To 2020 4 Dr Sal 1.5 TC-P 171Bhp [06/16-02/20] | ✓ |
| HONDA / CIVIC 1.8L I-VTEC (A) | 1799 | 2006 | 28/0?/2006 | HONDA Civic 2006 On 4 Dr Sal 1.8 S 138Bhp (A) [03/06-02/09] | ✓ |
| HONDA / CIVIC 1.8L I-VTEC (A) | 1799 | 2017 | 20/04/2017 | HONDA Civic 2016 On 4 Dr Sal 1.8 S 139Bhp [06/16-02/20] | ✓ |
| HONDA / CIVIC 1.8L I-VTEC (A) | 1799 | 2007 | 15/01/2007 | HONDA Civic 2006 On 4 Dr Sal 1.80 S AUTO 138Bhp (A) [03/06-02/09] | ✓ |
| HONDA / CIVIC 1.8L I-VTEC (A) | 1799 | 2011 | 10/03/2011 | HONDA Civic 2006 On 4 Dr Sal 1.8 S 138Bhp (A) [03/09-06/12] | ✓ |
| HONDA / CIVIC 2.0L I-VTEC (A) | 1998 | 2008 | 16/01/2009 | HONDA Civic 2006 On 4 Dr Sal 2 S 153Bhp (A) [04/07-02/09] | ✓ |
| HONDA / CIVIC 2.0L I-VTEC (A) | 1998 | 2010 | 07/09/2010 | HONDA Civic 2006 On 4 Dr Sal 2 S 153Bhp (A) [03/09-06/12] | ✓ |
| HONDA / CR-V 1.5TC 2WD | 1498 | 2019 | 03/06/2019 | HONDA CR-V 2017 To 2020 5 Dr SUV 1.5 1.5TC 2WD 190Bhp [07/17-11/20] | ✓ |
| HONDA / CR-V 2.0L I-VTEC (A) | 1997 | 2011 | 19/01/2011 | HONDA CR-V 2007 To 2013 5 Dr SUV 2 i-VTEC 148Bhp (A) [03/10-02/13] | ✓ |
| HONDA / CR-V 2.0L I-VTEC (A) | 1997 | 2007 | 30/07/2007 | HONDA CR-V 2007 To 2013 5 Dr SUV 2 i-VTEC 148Bhp (A) [03/07-02/10] | ✓ |
| HONDA / CR-V 2.0L I-VTEC (A) | 1997 | 2015 | 17/02/2015 | HONDA CR-V 2015 To 2017 5 Dr SUV 2 4WD i-VTEC 153Bhp (A) [02/15-06/17] | ✗ |
| HONDA / CR-V 2.0L I-VTEC (A) | 1997 | 2018 | 22/01/2018 | HONDA CR-V 2017 To 2020 5 Dr SUV 2 2.0 2WD 153Bhp [07/17-11/20] | ✓ |
| HONDA / CR-V 2.4L | 2354 | 2014 | 23/06/2014 | HONDA CR-V 2013 To 2015 5 Dr SUV 2.4 i-VTEC 187Bhp (A) [07/13-01/15] | ✓ |
| HONDA / HONDA CIVIC 2.0S | 1997 | 2014 | 17/09/2014 | HONDA Civic 2012 On 4 Dr Sal 2 S 153Bhp (A) [11/14-05/16] | ✗ |
| HONDA / HR-V 1.8L E | 1799 | 2020 | 10/02/2020 | HONDA HR-V 2015 To 2022 5 Dr SUV 1.8 E 140Bhp [01/19-07/22] | ✓ |
| HONDA / HR-V 1.8L S | 1799 | 2015 | 18/03/2015 | HONDA HR-V 2015 To 2022 5 Dr SUV 1.8 S 140Bhp (A) [02/15-12/18] | ✓ |
| HONDA / HR-V 1.8L V | 1799 | 2017 | 25/05/2017 | HONDA HR-V 2015 On 5 Dr SUV 1.80 V AUTO 140Bhp (A) [02/15-12/18] | ✓ |
| HONDA / HR-V 1.8L V | 1799 | 2015 | 29/09/2015 | HONDA HR-V 2015 On 5 Dr SUV 1.8 V 140Bhp (A) [02/15-12/18] | ✓ |
| HONDA / HR-V 1.8L V | 1799 | 2015 | 25/06/2015 | HONDA HR-V 2015 To 2022 5 Dr SUV 1.8 V 140Bhp (A) [02/15-12/18] | ✓ |
| HONDA / HR-V 1.8L V | 1799 | 2021 | 18/11/2021 | HONDA HR-V 2015 To 2022 5 Dr SUV 1.8 V 140Bhp [01/19-07/22] | ✓ |
| HONDA / INSIGHT HYBRID 1.3L (A) | 1339 | 2011 | 18/04/2011 | HONDA Insight 2010 On 5 Dr Hatch 1.3 101Bhp (A) [12/10-02/12] | ✓ |
| HONDA / JAZZ 1.5L E | 1497 | 2015 | 22/04/2015 | HONDA Jazz 2014 On 5 Dr Hatch 1.5 i-VTEC (Grade E) 118Bhp (A) [07/14-05/17] | ✓ |
| HONDA / JAZZ 1.5L S | 1497 | 2014 | 15/09/2014 | HONDA Jazz 2014 On 5 Dr Hatch 1.5 i-VTEC (Grade S) 118Bhp (A) [07/14-05/17] | ✓ |
| HONDA / JAZZ 1.5L V | 1497 | 2015 | 25/03/2015 | HONDA Jazz 2014 On 5 Dr Hatch 1.5 i-VTEC (Grade V) 118Bhp (A) [07/14-05/17] | ✓ |
| HONDA / JAZZ HYBRID | 1339 | 2014 | 14/07/2014 | HONDA Jazz 2008 On 5 Dr Hatch 1.30 HYBRID AUTO 101Bhp (A) [03/12-06/14] | ✗ |
| HONDA / JAZZ S | 1497 | 2019 | 26/07/2019 | HONDA Jazz 2014 On 5 Dr Hatch 1.5 1.5 S 118Bhp [06/17-] | ✓ |
| INOKOM CORPORATION SDN. BHD. / ELANTRA 1.6 AUTO | 1591 | 2013 | 04/12/2013 | INOKOM Elantra 2012 On 4 Dr Sal 1.6 128Bhp (A) [04/12-02/15] | ✓ |
| ISUZU / NPR81UKH | 4778 | 2018 | 19/11/2018 | ISUZU NPR81 LORRY 4.8 D (M) | ✓ |
| KIA / CERATO YD | 1999 | 2016 | 06/10/2017 | KIA Cerato 2013 On 4 Dr Sal 2 L 160Bhp (A) [12/16-] | ✓ |
| KIA / CERATO YD | 1591 | 2013 | 02/05/2014 | KIA Cerato 2013 On 4 Dr Sal 1.6 SX 128Bhp (A) [07/13-11/16] | ✓ |
| KIA / OPTIMA TF 2.0 AT | 1998 | 2012 | 05/06/2012 | KIA Optima 2012 On 4 Dr Sal 2 K5 163Bhp (A) [01/12-12/13] | ✓ |
| KIA / SPORTAGE (SL) 2.0 AT | 1998 | 2013 | 30/10/2013 | KIA Sportage 2010 On 5 Dr SUV 2 164Bhp (A) [06/11-02/14] | ✓ |
| MAZDA / CX-5 2.0G 2WD HIGH | 1998 | 2023 | 02/06/2023 | MAZDA CX-5 2019 To 2024 5 Dr SUV 2 SkyActiv-G (High) 162Bhp (A) [09/19-01/24] | ✓ |
| MAZDA / CX5 2.0L 2WD (A) | 1998 | 2013 | 17/06/2013 | MAZDA CX-5 2012 On 5 Dr SUV 2 2WD 153Bhp (A) [05/12-02/16] | ✓ |
| MAZDA / CX5 2.0L 2WD (A) | 1998 | 2013 | 02/10/2013 | MAZDA CX-5 2012 To 2017 5 Dr SUV 2 2WD 153Bhp (A) [05/12-02/16] | ✓ |
| MAZDA / CX5 2.5L 2WD SKYACTIV (A) | 2488 | 2015 | 24/07/2015 | MAZDA CX-5 2012 On 5 Dr SUV 2.5 2WD 184Bhp (A) [03/14-01/16] | ✓ |
| MAZDA / MAZDA2 1.5SDN (A) | 1498 | 2011 | 13/07/2011 | MAZDA 2 2010 On 4 Dr Sal 1.5 V 103Bhp (A) [04/10-01/15] | ✓ |
| MAZDA / MAZDA2 1.5SDN SKYACTIV (A) | 1496 | 2015 | 24/04/2015 | MAZDA 2 2015 To 2020 4 Dr Sal 1.5 SkyActiv-G 114Bhp (A) [02/15-03/16] | ✓ |
| MERCEDES BENZ / C 200 | 1496 | 2023 | 30/05/2023 | MERCEDES-BENZ C-Class 2018 On 4 Dr Sal 1.5 C200 Avantgarde 184Bhp (A) [11/18-] | ✗ |
| MERCEDES BENZ / C 300 | 1991 | 2020 | 18/09/2020 | MERCEDES-BENZ C-Class 2018 On 4 Dr Sal 2 C300 AMG Line 258Bhp (A) [11/18-] | ✓ |
| MERCEDES BENZ / C200-W205A | 1991 | 2018 | 13/04/2018 | MERCEDES-BENZ C-Class 2014 On 4 Dr Sal 2 C200 Avantgarde (W205) 184Bhp (A) [04/15-10/18] | ✓ |
| MERCEDES BENZ / C200-W205A | 1991 | 2018 | 31/07/2018 | MERCEDES-BENZ C-Class 2014 On 4 Dr Sal 2 C200 Avantgarde (W205) 184Bhp (A) [04/15-] | ✓ |
| MERCEDES BENZ / CLA 250 SPORT 4MATIC COUPE | 1991 | 2016 | 29/09/2016 | MERCEDES-BENZ CLA-Class 2014 On 4 Dr Sal 2 CLA 45 AMG 360Bhp (A) [04/14-] | ✗ |
| MERCEDES BENZ / E250 CGI-W212C | 1991 | 2013 | 27/02/2014 | MERCEDES-BENZ E-Class 2009 On 4 Dr Sal 2 E250 Avantgarde (W212) 211Bhp (A) [08/13-05/16] | ✓ |
| MERCEDES BENZ / GLA 200 | 1595 | 2016 | 12/10/2016 | MERCEDES-BENZ GLA 2014 On 5 Dr SUV 1.6 GLA 200 (X156) 156Bhp [11/14-] | ✓ |
| MITSUBISHI / ASX 2WD | 1998 | 2016 | 16/03/2016 | MITSUBISHI ASX 2010 On 5 Dr SUV 2 2WD GL 148Bhp [09/15-] | ✓ |
| MITSUBISHI / L200 TRITON VGT AMG AT | 2477 | 2012 | 26/04/2012 | MITSUBISHI Triton 2006 To 2015 4 Dr Pickup Dbl.Cab 2.5 VGT 176Bhp (A) [03/12-02/14] | ✓ |
| NAZA / FORTE | 1591 | 2012 | 22/02/2012 | NAZA Forte 2009 On 4 Dr Sal 1.6 SX 124Bhp (A) [11/09-] | ✓ |
| NISSAN / ALMERA 1.5E AT | 1498 | 2016 | 30/06/2016 | NISSAN Almera 2015 On 4 Dr Sal 1.5 E 101Bhp (A) [01/15-04/16] | ✗ |
| NISSAN / ALMERA 1.5E AT | 1498 | 2013 | 31/05/2013 | NISSAN Almera 2012 On 4 Dr Sal 1.50 E AUTO 101Bhp (A) [10/12-12/14] | ✓ |
| NISSAN / ALMERA 1.5E AT | 1498 | 2014 | 10/06/2014 | NISSAN Almera 2012 On 4 Dr Sal 1.5 E 101Bhp (A) [10/12-12/14] | ✓ |
| NISSAN / ALMERA 1.5E AT | 1498 | 2016 | 21/07/2016 | NISSAN Almera 2015 On 4 Dr Sal 1.5 E 101Bhp (A) [04/16-] | ✓ |
| NISSAN / ALMERA 1.5E AT | 1499 | 2015 | 28/05/2015 | NISSAN Almera 2015 On 4 Dr Sal 1.50 E AUTO 101Bhp (A) [01/15-04/16] | ✓ |
| NISSAN / ALMERA 1.5L (A) | 1498 | 2018 | 31/07/2018 | NISSAN Almera 2018 On 4 Dr Sal 1.5 VL (Black Series) 101Bhp (A) [11/18-] | ✗ |
| NISSAN / ALMERA 1.5V AT | 1498 | 2013 | 21/10/2013 | NISSAN Almera 2012 On 4 Dr Sal 1.5 V 101Bhp (A) [10/12-12/14] | ✓ |
| NISSAN / ALMERA 1.5VL AT | 1498 | 2013 | 17/02/2014 | NISSAN Almera 2012 On 4 Dr Sal 1.5 VL 101Bhp (A) [10/12-12/14] | ✓ |
| NISSAN / ALMERA 1.5VL AT | 1498 | 2016 | 30/01/2016 | NISSAN Almera 2015 On 4 Dr Sal 1.5 VL 101Bhp (A) [01/15-04/16] | ✓ |
| NISSAN / GRAND LIVINA 1.6L A/T | 1598 | 2014 | 28/08/2014 | NISSAN Grand Livina 2007 On MPV 1.60 AUTO 104Bhp (A) [09/13-] | ✓ |
| NISSAN / GRAND LIVINA 1.8L A/T | 1798 | 2008 | 22/01/2008 | NISSAN Grand Livina 2007 On MPV 1.8 124Bhp (A) [12/07-05/11] | ✓ |
| NISSAN / LATIO 1.6L SPORTS ST-L A/T | 1598 (faint) | 2007 | 08/08/2007 | NISSAN Latio 2007 On 5 Dr Hatch 1.6 Sport ST-L 108Bhp (A) [06/07-08/11] | ✓ |
| NISSAN / NISSAN X-TRAIL 2.0L CVT | 1997 | 2016 | 28/01/2016 | NISSAN X-Trail 2015 On 5 Dr SUV 2 2WD (T32) 142Bhp (A) [02/15-] | ✓ |
| NISSAN / NP300 NAVARA 2.5VL AT 4WD | 2488 | 2018 | 28/05/2019 | NISSAN Navara 2017 On 4 Dr Pickup Dbl.Cab 2.5 VL Plus 187Bhp (A) [08/18-] | ✗ |
| NISSAN / NV200 1.6L PANEL VAN | 1598 | 2013 | 17/04/2013 | NISSAN NV200 2012 On Van 1.6 108Bhp (M) [02/12-] | ✓ |
| NISSAN / SENTRA 4DR SEDAN 1.6L SG A/T | 1597 | 2010 | 31/01/2010 | NISSAN Sentra 1995 On 4 Dr Sal 1.6 SG (N16) 116Bhp (A) [10/05-] | ✓ |
| NISSAN / SENTRA NOR SEDAN 1.6L SG A/T | 1597 | 2006 | 05/10/2006 | NISSAN Sentra 1995 On 4 Dr Sal 1.60 SG (N16) AUTO 116Bhp (A) [10/05-] | ✓ |
| NISSAN / SERENA 2.0L CVT HWS S-HEV | 1997 | 2019 | 09/12/2019 | NISSAN Serena 2018 To 2022 MPV 2 S-Hybrid Highway Star (C27) 148Bhp [05/18-07/22] | ✓ |
| NISSAN / SERENA 2.0L CVT HWS S-HEV | 1997 | 2018 | 28/05/2018 | NISSAN Serena 2018 To 2022 MPV 2 S-Hybrid Premium Highway Star (C27) 148Bhp [05/18-07/22] | ? |
| NISSAN / SYLPHY 2.0 CVTC | 1997 | 2010 | 17/09/2010 | NISSAN Sylphy 2008 On 4 Dr Sal 2 131Bhp (A) [06/08-02/12] | ✓ |
| NISSAN / TEANA 200 XE | 1997 | 2011 | 16/11/2011 | NISSAN Teana 2007 On 4 Dr Sal 2 200XE 134Bhp (A) [11/10-02/13] | ✓ |
| NISSAN / VANETTE VPC22EFUP | 1488 | 1999 | 31/07/1999 | NISSAN Vanette 1989 On Van 1.5 C22 82Bhp (M) [06/99-] | ✓ |
| NISSAN / X-TRAIL 4WD 2.5L A/T | 2488 | 2013 | 19/02/2014 | NISSAN X-Trail 2010 On 5 Dr SUV 2 137Bhp (A) [04/13-01/15] | ✗ |
| NISSAN / X-TRAIL 4WD 2.5L A/T | 2488 | 2012 | 18/12/2012 | NISSAN X-Trail 2010 On 5 Dr SUV 2 137Bhp (A) [08/10-03/13] | ✗ |
| PERODUA / ALZA - 1500 AV (AUTO) | 1495 | 2014 | 15/12/2014 | PERODUA Alza 2009 On MPV 1.5 Advanced 103Bhp (A) [01/14-10/18] | ✓ |
| PERODUA / ALZA - 1500 AV (CVT) | 1496 | 2023 | 27/02/2023 | PERODUA Alza 2022 On MPV 1.5 1.5 AV 105Bhp [07/22-] | ✓ |
| PERODUA / ALZA - 1500 EZ (AUTO) | 1495 | 2014 | 21/11/2014 | PERODUA Alza 2009 On MPV 1.50 EZ AUTO 103Bhp (A) [01/14-10/18] | ✓ |
| PERODUA / ALZA - 1500 EZ (AUTO) | 1495 | 2018 | 31/12/2018 | PERODUA Alza 2009 On MPV 1.5 Advance 102Bhp (A) [09/18-07/22] | ✗ |
| PERODUA / ALZA - 1500 EZ (AUTO) | 1495 | 2012 | 24/05/2012 | PERODUA Alza 2009 On MPV 1.5 EZ 102Bhp (A) [11/09-12/13] | ✓ |
| PERODUA / ALZA - 1500 EZ (AUTO) | 1495 | 2014 | 29/01/2014 | PERODUA Alza 2009 On MPV 1.5 EZ 103Bhp (A) [01/14-10/18] | ✓ |
| PERODUA / ALZA - 1500 EZ (AUTO) | 1495 | 2013 | 29/05/2013 | PERODUA Alza 2009 On MPV 1.50 EZ AUTO 102Bhp (A) [11/09-12/13] | ✓ |
| PERODUA / ALZA - 1500 EZI (AUTO) | 1495 | 2011 | 11/05/2011 | PERODUA Alza 2009 On MPV 1.5 EZi Advanced 102Bhp (A) [11/09-12/13] | ✗ |
| PERODUA / ALZA - 1500 EZI (AUTO) | 1495 | 2012 | 26/06/2012 | PERODUA Alza 2009 On MPV 1.5 EZi Advanced 102Bhp (A) [11/09-06/12] | ✗ |
| PERODUA / ALZA - 1500 EZI (AUTO) | 1495 | 2010 | 10/02/2010 | PERODUA Alza 2009 On MPV 1.50 EZi AUTO 102Bhp (A) [11/09-12/13] | ✓ |
| PERODUA / ALZA - 1500 EZi (AUTO) | 1495 | 2012 | 14/08/2012 | PERODUA Alza 2009 On MPV 1.5 EZi 102Bhp (A) [11/09-12/13] | ✓ |
| PERODUA / ALZA - 1500 SE (AUTO) | 1495 | 2021 | 26/04/2021 | PERODUA Alza 2009 On MPV 1.5 SE 102Bhp (A) [09/18-07/22] | ✓ |
| PERODUA / ALZA - 1500 SE (AUTO) | 1495 | 2015 | 13/01/2016 | PERODUA Alza 2009 On MPV 1.5 SE 103Bhp (A) [01/14-10/18] | ✓ |
| PERODUA / ALZA - 1500 SE (AUTO) | 1495 | 2014 | 09/07/2014 | PERODUA Alza 2009 On MPV 1.50 SE AUTO 103Bhp (A) [01/14-10/18] | ✓ |
| PERODUA / ALZA - 1500 SE (MANUAL) | 1495 | 2015 | 05/02/2016 | PERODUA Alza 2009 On MPV 1.5 SE 103Bhp (M) [01/14-10/18] | ✓ |
| PERODUA / ALZA - 1500 X (CVT) | 1496 | 2022 | 31/10/2022 | PERODUA Alza 2022 On MPV 1.5 1.5 X 105Bhp [07/22-] | ✓ |
| PERODUA / ARUZ - 1500 AV (AUTO) | 1496 | 2019 | 24/06/2019 | PERODUA Aruz 2019 On 5 Dr SUV 1.5 1.5 AV 104Bhp (A) [01/19-] | ✓ |
| PERODUA / ARUZ - 1500 AV (AUTO) | 1496 | 2019 | 30/10/2019 | PERODUA Aruz 2019 To 2021 5 Dr SUV 1.5 1.5 AV 104Bhp (A) [01/19-05/21] | ✓ |
| PERODUA / ARUZ - 1500 AV (AUTO) | 1496 | 2021 | 22/10/2021 | PERODUA Aruz 2021 On 5 Dr SUV 1.5 1.5 AV 101Bhp (A) [05/21-] | ✓ |
| PERODUA / ATIVA - 1000 TURBO AV (CVT) | 998 | 2022 | 11/02/2022 | PERODUA Ativa 2021 On 5 Dr SUV 1 1.0 AV 97Bhp [03/21-] | ✓ |
| PERODUA / ATIVA - 1000 TURBO H (CVT) | 998 | 2022 | 28/04/2022 | PERODUA Ativa 2021 On 5 Dr SUV 1 1.0 H 97Bhp [03/21-] | ✓ |
| PERODUA / AXIA - 1000 AV (AUTO) | 998 | 2016 | 15/06/2016 | PERODUA Axia 2014 To 2019 5 Dr Hatch 1 Advance 67Bhp (A) [09/14-01/17] | ✓ |
| PERODUA / AXIA - 1000 AV (AUTO) | 998 | 2017 | 27/11/2017 | PERODUA Axia 2014 To 2019 5 Dr Hatch 1 Advance 67Bhp (A) [01/17-08/19] | ✓ |
| PERODUA / AXIA - 1000 AV (CVT) | 998 | 2023 | 30/11/2023 | PERODUA Axia 2023 On 5 Dr Hatch 1 1.0 AV 67Bhp [02/23-] | ✓ |
| PERODUA / AXIA - 1000 E (MANUAL) | 998 | 2022 | 30/09/2022 | PERODUA Axia 2019 On 5 Dr Hatch 1 E 67Bhp (M) [09/19-] | ✓ |
| PERODUA / AXIA - 1000 G (AUTO) | 998 | 2022 | 28/04/2022 | PERODUA Axia 2019 On 5 Dr Hatch 1 G 67Bhp (A) [09/19-] | ✓ |
| PERODUA / AXIA - 1000 G (AUTO) | 998 | 2016 | 07/06/2016 | PERODUA Axia 2014 To 2019 5 Dr Hatch 1 G (A) 67Bhp (A) [09/14-01/17] | ✓ |
| PERODUA / AXIA - 1000 G (AUTO) | 998 | 2015 | 19/03/2015 | PERODUA Axia 2014 To 2019 5 Dr Hatch 1.00 G (A) AUTO 67Bhp (A) [09/14-01/17] | ✓ |
| PERODUA / AXIA - 1000 G (AUTO) | 998 | 2018 | 29/11/2018 | PERODUA Axia 2014 To 2019 5 Dr Hatch 1.00 G (A) AUTO 67Bhp (A) [01/17-08/19] | ✓ |
| PERODUA / AXIA - 1000 G (AUTO) - XTRA | 998 | 2019 | 31/12/2019 | PERODUA Axia 2019 On 5 Dr Hatch 1 GXtra 67Bhp (A) [09/19-] | ✓ |
| PERODUA / AXIA - 1000 G (AUTO) - XTRA | 998 | 2020 | 25/02/2020 | PERODUA Axia 2019 On 5 Dr Hatch 1.00 G AUTO 67Bhp (A) [09/19-] | ✗ |
| PERODUA / AXIA - 1000 SE (AUTO) | 998 | 2019 | 22/03/2019 | PERODUA Axia 2019 On 5 Dr Hatch 1 SE 67Bhp (A) [09/19-] | ✗ |
| PERODUA / AXIA - 1000 SE (AUTO) | 998 | 2017 | 25/01/2017 | PERODUA Axia 2014 To 2019 5 Dr Hatch 1 SE (A) 67Bhp (A) [01/17-08/19] | ✓ |
| PERODUA / AXIA - 1000 SE (AUTO) | 998 | 2019 | 23/01/2019 | PERODUA Axia 2019 On 5 Dr Hatch 1.00 SE AUTO 67Bhp (A) [09/19-] | ✗ |
| PERODUA / AXIA - 1000 SE (AUTO) | 998 | 2014 | 24/12/2014 | PERODUA Axia 2014 To 2019 5 Dr Hatch 1 SE (A) 67Bhp (A) [09/14-01/17] | ✓ |
| PERODUA / AXIA - 1000 SE (AUTO) | 998 | 2018 | 23/10/2018 | PERODUA Axia 2014 To 2019 5 Dr Hatch 1.00 SE (A) AUTO 67Bhp (A) [01/17-08/19] | ✓ |
| PERODUA / AXIA - 1000 X (CVT) | 998 | 2024 | 30/10/2024 | PERODUA Axia 2023 On 5 Dr Hatch 1 1.0 X 67Bhp [02/23-] | ✓ |
| PERODUA / BEZZA - 1000 G (AUTO) | 998 | 2020 | 31/12/2020 | PERODUA Bezza 2020 On 4 Dr Sal 1 G (A) 67Bhp (A) [01/20-] | ✓ |
| PERODUA / BEZZA - 1000 G (AUTO) | 998 | 2017 | 23/02/2017 | PERODUA Bezza 2016 On 4 Dr Sal 1 Standard G 67Bhp (A) [05/17-03/18] | ✗ |
| PERODUA / BEZZA - 1000 G (AUTO) | 998 | 2018 | 17/01/2018 | PERODUA Axia 2014 To 2019 5 Dr Hatch 1 G (A) 67Bhp (A) [01/17-08/19] | ✗ |
| PERODUA / BEZZA - 1000 G (AUTO) | 998 | 2018 | 31/10/2018 | PERODUA Bezza 2016 On 4 Dr Sal 1 GXtra 67Bhp (A) [04/18-12/19] | ✓ |
| PERODUA / BEZZA - 1300 AV (AUTO) | 1329 | 2017 | 27/09/2017 | PERODUA Bezza 2016 On 4 Dr Sal 1.3 Advance 94Bhp (A) [05/17-12/19] | ✓ |
| PERODUA / BEZZA - 1300 X (AUTO) | 1329 | 2021 | 22/02/2021 | PERODUA Bezza 2020 On 4 Dr Sal 1.3 X 94Bhp (A) [01/20-] | ✓ |
| PERODUA / BEZZA - 1300 X (AUTO) | 1329 | 2019 | 17/09/2019 | PERODUA Bezza 2016 On 4 Dr Sal 1.30 Premium X AUTO 94Bhp (A) [05/17-12/19] | ✗ |
| PERODUA / BEZZA - 1300 X (AUTO) | 1329 | 2021 | 12/11/2021 | PERODUA Bezza 2020 On 4 Dr Sal 1.30 X AUTO 94Bhp (A) [01/20-] | ✓ |
| PERODUA / BEZZA - 1300 X (AUTO) | 1329 | 2018 | 29/03/2018 | PERODUA Bezza 2016 On 4 Dr Sal 1.3 Premium X 94Bhp (A) [05/17-12/19] | ✓ |
| PERODUA / BEZZA - 1300 X (AUTO) | 1329 | 2016 | 27/09/2016 | PERODUA Bezza 2016 On 4 Dr Sal 1.30 Premium X AUTO 94Bhp (A) [07/16-05/17] | ✓ |
| PERODUA / BEZZA - 1300 X (MANUAL) | 1329 | 2018 | 30/04/2018 | PERODUA Bezza 2016 On 4 Dr Sal 1.3 Premium X 94Bhp (M) [05/17-12/19] | ✓ |
| PERODUA / KANCIL 660 EX (MANUAL) | 659 | 2002 | 02/05/2002 | PERODUA Kancil 1994 On 5 Dr Hatch 0.66 EX 660 31Bhp (M) [11/99-09/02] | ✓ |
| PERODUA / KELISA 1.0 EZ (AUTO) | 989 | 2006 | 04/12/2006 | PERODUA Kelisa 2001 On 5 Dr Hatch 1 EZ 54Bhp (A) [10/03-] | ✓ |
| PERODUA / KELISA 1.0 EZ (AUTO) | 989 | 2002 | 14/11/2002 | PERODUA Kelisa 2001 On 5 Dr Hatch 1 EZ 54Bhp (A) [08/01-09/03] | ✓ |
| PERODUA / KELISA 1.0 EZ (AUTO) | 989 | 2005 | 07/07/2005 | PERODUA Kelisa 2001 On 5 Dr Hatch 1 EZ Limited Edition 54Bhp (A) [04/04-] | ✗ |
| PERODUA / KELISA GX | 989 | 2001 | 27/09/2001 | PERODUA Kelisa 2001 On 5 Dr Hatch 1 GX 54Bhp (M) [08/01-09/03] | ✓ |
| PERODUA / MYVI - 1.3 EZ (AUTO) | 1298 | 2012 | 27/11/2012 | PERODUA Myvi 2011 On 5 Dr Hatch 1.30 EZ Standard AUTO 89Bhp (A) [06/11-12/14] | ✓ |
| PERODUA / MYVI - 1.3 EZ (AUTO) | 1298 | 2009 | 12/02/2010 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 EZ 86Bhp (A) [08/08-05/11] | ✓ |
| PERODUA / MYVI - 1.3 EZ (AUTO) | 1298 | 2005 | 22/07/2005 | PERODUA Myvi 2005 On 5 Dr Hatch 1.30 EZ AUTO 86Bhp (A) [05/05-07/08] | ✓ |
| PERODUA / MYVI - 1.3 EZ (AUTO) | 1298 | 2008 | 28/07/2008 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 EZ 86Bhp (A) [05/05-07/08] | ✓ |
| PERODUA / MYVI - 1.3 EZI (AUTO) | 1298 | 2010 | 02/02/2010 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 SE (ZHS) 86Bhp (A) [10/08-05/11] | ✗ |
| PERODUA / MYVI - 1.3 EZI (AUTO) | 1298 | 2013 | 31/10/2013 | PERODUA Myvi 2011 On 5 Dr Hatch 1.3 SE (A) 89Bhp (A) [03/13-12/14] | ✗ |
| PERODUA / MYVI - 1.3 EZI (AUTO) | 1298 | 2010 | 28/12/2010 | PERODUA Myvi 2005 On 5 Dr Hatch 1.30 SE (ZHS) AUTO 86Bhp (A) [10/08-05/11] | ✗ |
| PERODUA / MYVI - 1.3 EZi (AUTO) | 1298 | 2010 | 15/10/2010 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 EZi Exclusive Edition 86Bhp (A) [11/09-05/11] | ✗ |
| PERODUA / MYVI - 1.3 EZi (AUTO) | 1298 | 2009 | 20/02/2009 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 EZi 86Bhp (A) [08/08-05/11] | ✓ |
| PERODUA / MYVI - 1.3 SX (MANUAL) | 1298 | 2006 | 11/08/2006 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 SX 86Bhp (M) [05/05-07/08] | ✓ |
| PERODUA / MYVI - 1.3 SX (MANUAL) | 1298 | 2011 | 21/01/2011 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 SXi 86Bhp (M) [08/08-05/11] | ✓ |
| PERODUA / MYVI - 1.3 SXI (MANUAL) | 1298 | 2008 | 29/02/2008 | PERODUA Myvi 2005 On 5 Dr Hatch 1.3 SXi 86Bhp (M) [05/05-07/08] | ✓ |
| PERODUA / MYVI - 1.3 SXI (MANUAL) | 1298 | 2007 | 24/01/2007 | PERODUA Myvi 2005 On 5 Dr Hatch 1.30 SXi 86Bhp (M) [05/05-07/08] | ✓ |
| PERODUA / MYVI - 1300 G (AUTO) | 1298 | 2015 | 29/05/2015 | PERODUA Myvi 2011 On 5 Dr Hatch 1.30 G (A) AUTO 89Bhp (A) [01/15-10/17] | ✓ |
| PERODUA / MYVI - 1300 G (AUTO) | 1329 | 2021 | 27/01/2021 | PERODUA Myvi 2020 To 2021 5 Dr Hatch 1.3 Standard G 94Bhp (A) [07/20-11/21] | ✓ |
| PERODUA / MYVI - 1300 G (CVT) | 1329 | 2023 | 01/02/2023 | PERODUA Myvi 2021 On 5 Dr Hatch 1.3 1.3 G 94Bhp [11/21-] | ✓ |
| PERODUA / MYVI - 1300 X (AUTO) | 1298 | 2015 | 28/09/2015 | PERODUA Myvi 2011 On 5 Dr Hatch 1.3 X (A) 89Bhp (A) [01/15-10/17] | ✓ |
| PERODUA / MYVI - 1300 X (AUTO) | 1329 | 2019 | 22/08/2019 | PERODUA Myvi 2017 To 2020 5 Dr Hatch 1.3 Premium X 94Bhp (A) [11/17-07/20] | ✓ |
| PERODUA / MYVI - 1300 X (AUTO) | 1297 | 2015 | 14/12/2015 | PERODUA Myvi 2011 On 5 Dr Hatch 1.30 X (A) AUTO 89Bhp (A) [01/15-10/17] | ✓ |
| PERODUA / MYVI - 1500 AV (AUTO) | 1496 | 2020 | 21/10/2020 | PERODUA Myvi 2020 On 5 Dr Hatch 1.50 Advance AUTO 102Bhp (A) [07/20-11/21] | ✓ |
| PERODUA / MYVI - 1500 AV (AUTO) | 1495 | 2016 | 28/12/2016 | PERODUA Myvi 2011 On 5 Dr Hatch 1.5 Advance (A) 102Bhp (A) [01/15-10/17] | ✓ |
| PERODUA / MYVI - 1500 AV (AUTO) | 1496 | 2020 | 26/06/2020 | PERODUA Myvi 2017 On 5 Dr Hatch 1.50 Advanced AUTO 102Bhp (A) [11/17-07/20] | ✓ |
| PERODUA / MYVI - 1500 AV (CVT) | 1496 | 2022 | 21/10/2022 | PERODUA Myvi 2021 On 5 Dr Hatch 1.5 1.5 AV 102Bhp [11/21-] | ✓ |
| PERODUA / MYVI - 1500 H (AUTO) | 1496 | 2021 | 30/11/2021 | PERODUA Myvi 2021 On 5 Dr Hatch 1.5 1.5 H 102Bhp [11/21-] | ✓ |
| PERODUA / MYVI - 1500 H (AUTO) | 1496 | 2020 | 30/10/2020 | PERODUA Myvi 2020 To 2021 5 Dr Hatch 1.5 High 102Bhp (A) [07/20-11/21] | ✓ |
| PERODUA / MYVI - 1500 H (AUTO) | 1496 | 2018 | 30/01/2018 | PERODUA Myvi 2017 To 2020 5 Dr Hatch 1.5 High 102Bhp (A) [11/17-07/20] | ✓ |
| PERODUA / MYVI - 1500 H (AUTO) | 1496 | 2018 | 19/11/2018 | PERODUA Myvi 2017 On 5 Dr Hatch 1.50 High AUTO 102Bhp (A) [11/17-07/20] | ✓ |
| PERODUA / MYVI - 1500 SE (AUTO) | 1495 | 2017 | 30/10/2017 | PERODUA Myvi 2011 On 5 Dr Hatch 1.50 SE (A) AUTO 102Bhp (A) [01/15-10/17] | ✓ |
| PERODUA / MYVI - 1500 SE (AUTO) | 1495 | 2016 | 18/01/2016 | PERODUA Myvi 2011 On 5 Dr Hatch 1.5 SE (A) 102Bhp (A) [01/15-10/17] | ✓ |
| PERODUA / MYVI - 1500 X (CVT) | 1496 | 2025 | 20/05/2025 | PERODUA Myvi 2021 On 5 Dr Hatch 1.5 1.5 X 102Bhp [11/21-] | ✓ |
| PERODUA / MYVI 1.5 SE (AUTO) | 1495 | 2013 | 25/07/2013 | PERODUA Myvi 2011 On 5 Dr Hatch 1.30 SE (A) AUTO 89Bhp (A) [03/13-12/14] | ✗ |
| PERODUA / MYVI 1.5 SE (AUTO) | 1495 | 2013 | 31/12/2013 | PERODUA Myvi 2011 On 5 Dr Hatch 1.5 SE (A) 102Bhp (A) [09/11-12/14] | ✓ |
| PERODUA / MYVI 1.5 SE (MANUAL) | 1495 | 2011 | 28/12/2011 | PERODUA Myvi 2011 On 5 Dr Hatch 1.5 SE (M) 102Bhp (M) [09/11-12/14] | ✓ |
| PERODUA / VIVA - 1000 EZ (AUTO) | 989 | 2012 | 18/12/2012 | PERODUA Viva 2007 On 5 Dr Hatch 1 ELITE EZi 60Bhp (A) [07/09-] | ✗ |
| PERODUA / VIVA - 1000 EZ (AUTO) | 989 | 2012 | 06/12/2012 | PERODUA Viva 2007 On 5 Dr Hatch 1 ELITE (A) 60Bhp (A) [07/09-] | ✗ |
| PERODUA / VIVA - 1000 EZI (AUTO) | 989 | 2011 | 23/03/2012 | PERODUA Viva 2007 On 5 Dr Hatch 1 EZi 60Bhp (A) [05/07-] | ✓ |
| PERODUA / VIVA - 660 EX (MANUAL) | 659 | 2011 | 25/10/2011 | PERODUA Viva 2007 On 5 Dr Hatch 0.66 EX 47Bhp (M) [05/07-] | ✓ |
| PERODUA / VIVA - 850 EX (MANUAL) | 847 | 2007 | 29/06/2007 | PERODUA Viva 2007 On 5 Dr Hatch 0.85 EX 52Bhp (M) [05/07-] | ✓ |
| PROTON / ERTIGA 1.4L AUTOMATIK | 1373 | 2018 | 25/10/2018 | PROTON Ertiga 2016 On MPV 1.4 Executive 91Bhp (A) [11/16-07/18] | ✗ |
| PROTON / EXORA 1.6 CVT PREMIUM | 1561 | 2019 | 19/09/2019 | PROTON Exora 2009 On MPV 1.6 Premium CVT (RC) 138Bhp [05/19-08/22] | ✓ |
| PROTON / EXORA FL 1.6L CVT | 1561 | 2013 | 18/07/2013 | PROTON Exora 2009 On MPV 1.6 Bold Premium (CFE) 138Bhp (A) [01/12-01/15] | ✗ |
| PROTON / GEN 2 1.6 AUTOMATIK | 1597 | 2006 | 20/06/2007 | PROTON Gen-2 2004 On 5 Dr Hatch 1.6 108Bhp (A) [05/04-02/08] | ✓ |
| PROTON / IRIZ 1.6 CVT EXECUTIVE | 1597 | 2022 | 08/08/2022 | PROTON Iriz 2021 On 5 Dr Hatch 1.6 Executive 107Bhp [08/21-] | ✓ |
| PROTON / IRIZ 1.6L CVT | 1597 | 2014 | 10/12/2014 | PROTON Iriz 2014 To 2021 5 Dr Hatch 1.6 PREMIUM 107Bhp (A) [09/14-05/17] | ✓ |
| PROTON / IRIZ 1.6L CVT | 1597 | 2019 | 29/07/2019 | PROTON Iriz 2014 To 2021 5 Dr Hatch 1.6 Premium 107Bhp [04/19-] | ✓ |
| PROTON / ISWARA (old card, print too faded to read exactly) |  |  |  | PROTON Iswara 1992 On 5 Dr Hatch 1.3 S 83Bhp (M) [08/92-11/03] | ✓ |
| PROTON / ISWARA SEDAN 1.5 MANUAL | 1468 | 2004 | 05/01/2005 | PROTON Iswara 1992 On 4 Dr Sal 1.5 S 90Bhp (M) [08/92-] | ✓ |
| PROTON / PERSONA (rest unreadable) | 1597? | 2020 | 30/09/2020? | PROTON Persona 2016 To 2021 4 Dr Sal 1.6 Executive 107Bhp [04/19-08/21] | ✓ |
| PROTON / PERSONA 1.6 AUTOMATIK | 1597 | 2011 | 11/11/2011 | PROTON Persona 2007 To 2016 4 Dr Sal 1.6 Medium Line 109Bhp (A) [03/10-05/16] | ✓ |
| PROTON / PERSONA 1.6 AUTOMATIK | 1597 | 2008 | 16/01/2008 | PROTON Persona 2007 To 2016 4 Dr Sal 1.6 High Line 109Bhp (A) [08/07-02/10] | ✓ |
| PROTON / PERSONA 1.6 AUTOMATIK | 1597 | 2008 | 05/01/2009 | PROTON Persona 2007 To 2016 4 Dr Sal 1.6 Base Line 109Bhp (A) [08/07-02/10] | ✓ |
| PROTON / PERSONA 1.6 AUTOMATIK | 1597 | 2012 | 15/06/2012 | PROTON Persona 2007 To 2016 4 Dr Sal 1.6 High Line 109Bhp (A) [03/10-05/16] | ✓ |
| PROTON / PERSONA 1.6 CVT EXECUTIVE | 1597 | 2021 | 29/03/2021 | PROTON Persona 2021 On 4 Dr Sal 1.6 Executive 107Bhp [08/21-] | ✗ |
| PROTON / PERSONA 1.6 CVT STANDARD | 1597 | 2020 | 24/09/2020 | PROTON Persona 2016 To 2021 4 Dr Sal 1.6 Standard 107Bhp [04/19-08/21] | ✓ |
| PROTON / PERSONA 1.6 MANUAL | 1597 | 2010 | 21/04/2010 | PROTON Persona 2007 To 2016 4 Dr Sal 1.6 Base Line 109Bhp (M) [03/10-05/16] | ✓ |
| PROTON / PERSONA 1.6 MANUAL | 1597 | 2007 | 06/09/2007 | PROTON Persona 2007 To 2016 4 Dr Sal 1.6 Base Line 109Bhp (M) [08/07-02/10] | ✓ |
| PROTON / PERSONA 1.6L AUTOMATIK | 1597 | 2012 | 12/11/2012 | PROTON Persona 2007 To 2016 4 Dr Sal 1.6 Base Line 109Bhp (A) [03/10-05/16] | ✓ |
| PROTON / PERSONA 1.6L CVT | 1597 | 2017 | 20/11/2017 | PROTON Persona 2016 To 2021 4 Dr Sal 1.6 Executive 107Bhp [08/16-03/19] | ✓ |
| PROTON / PERSONA 1.6L CVT | 1597 | 2018 | 20/07/2018 | PROTON Persona 2016 To 2021 4 Dr Sal 1.6 Premium 107Bhp [08/16-03/19] | ✓ |
| PROTON / PERSONA 1.6L CVT | 1597 | 2016 | 17/02/2017 | PROTON Persona 2016 To 2021 4 Dr Sal 1.6 Standard 107Bhp [08/16-03/19] | ✓ |
| PROTON / PREVE 1.6L CVT | 1597 | 2013 | 27/03/2013 | PROTON Preve 2012 On 4 Dr Sal 1.6 Executive 108Bhp (A) [04/12-03/18] | ✓ |
| PROTON / PREVE 1.6L CVT | 1561 | 2013 | 30/08/2013 | PROTON Preve 2012 On 4 Dr Sal 1.60 Premium (CFE) AUTO 138Bhp (A) [04/12-03/18] | ✓ |
| PROTON / PREVE 1.6L CVT | 1561 | 2014 | 23/01/2014 | PROTON Preve 2012 On 4 Dr Sal 1.6 Executive (CVT) 138Bhp [04/18-] | ✗ |
| PROTON / PROTON INSPIRA 1.8L CVT | 1798 | 2011 | 25/05/2011 | PROTON Inspira 2010 On 4 Dr Sal 1.8 E 140Bhp (A) [11/10-] | ✓ |
| PROTON / PROTON INSPIRA 2.0L CVT | 1998 | 2011 | 08/02/2011 | PROTON Inspira 2010 On 4 Dr Sal 2 P 150Bhp (A) [11/10-] | ✓ |
| PROTON / PROTON SAGA 1.3(A) | 1332 | 2008 | 16/07/2008 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 B-Line 94Bhp (A) [01/08-11/10] | ✓ |
| PROTON / PROTON WIRA 1.5 M SE A/BACK | 1468 | 2005 | 04/02/2005 | PROTON Wira 1993 On 5 Dr Hatch 1.5 GLi Special Edition 86Bhp (M) [08/03-] | ✓ |
| PROTON / SAGA 1.3 AT STANDARD LITE | 1332 | 2022 | 30/08/2022 | PROTON Saga 2022 On 4 Dr Sal 1.3 Standard Lite 94Bhp (A) [08/22-] | ✓ |
| PROTON / SAGA 1.3 AT STANDARD LITE | 1332 | 2022 | 26/10/2022 | PROTON Saga 2022 On 4 Dr Sal 1.3 Standard 94Bhp (A) [05/22-] | ✓ |
| PROTON / SAGA 1.3 AUTOMATIK | 1332 | 2010 | 27/04/2010 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 M-Line 94Bhp (A) [01/08-11/10] | ✓ |
| PROTON / SAGA 1.3 AUTOMATIK PREMIUM | 1332 | 2020 | 08/01/2021 | PROTON Saga 2019 On 4 Dr Sal 1.3 Premium 94Bhp (A) [08/19-] | ✓ |
| PROTON / SAGA 1.3 AUTOMATIK PREMIUM | 1332 | 2020 | 22/06/2020 | PROTON Saga 2022 On 4 Dr Sal 1.3 Premium 94Bhp (A) [05/22-] | ✗ |
| PROTON / SAGA 1.3 AUTOMATIK PREMIUM S | 1332 | 2022 | 30/06/2022 | PROTON Saga 2022 On 4 Dr Sal 1.3 Premium S 94Bhp (A) [05/22-] | ✓ |
| PROTON / SAGA 1.3 AUTOMATIK STANDARD | 1332 | 2019 | 22/10/2019 | PROTON Saga 2019 On 4 Dr Sal 1.30 Standard AUTO 94Bhp (A) [08/19-] | ✓ |
| PROTON / SAGA 1.3 AUTOMATIK STANDARD | 1332 | 2022 | 30/06/2022 | PROTON Saga 2022 On 4 Dr Sal 1.30 Standard AUTO 94Bhp (A) [05/22-] | ✓ |
| PROTON / SAGA 1.3 AUTOMATIK STANDARD | 1332 | 2020 | 14/05/2020 | PROTON Saga 2019 On 4 Dr Sal 1.3 Standard 94Bhp (A) [08/19-] | ✓ |
| PROTON / SAGA 1.3 MANUAL | 1332 | 2009 | 11/09/2009 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 B-Line 94Bhp (M) [01/08-11/10] | ✓ |
| PROTON / SAGA 1.3L CVT | 1332 | 2017 | 30/08/2017 | PROTON Saga 2016 On 4 Dr Sal 1.3 Premium 94Bhp [09/16-] | ✓ |
| PROTON / SAGA 1.3L CVT | 1332 | 2019 | 19/06/2019 | PROTON Saga 2019 On 4 Dr Sal 1.30 Premium AUTO 94Bhp (A) [08/19-] | ✗ |
| PROTON / SAGA 1.3L CVT | 1332 | 2017 | 02/03/2017 | PROTON Saga 2016 To 2019 4 Dr Sal 1.3 Executive 94Bhp [09/16-07/19] | ✓ |
| PROTON / SAGA FL 1.3 AUTOMATIK | 1332 | 2011 | 08/03/2011 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FL (Executive) 94Bhp (A) [12/10-04/11] | ✓ |
| PROTON / SAGA FL 1.3 AUTOMATIK | 1332 | 2011 | 25/10/2011 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FLX (Standard) 94Bhp (A) [07/11-06/14] | ✗ |
| PROTON / SAGA FL 1.3 AUTOMATIK | 1332 | 2011 | 18/02/2011 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FL (Standard) 94Bhp (A) [12/10-04/11] | ✓ |
| PROTON / SAGA FL 1.3 AUTOMATIK | 1332 | 2012 | 06/07/2012 | PROTON Saga 2008 To 2016 4 Dr Sal 1.30 FLX (Executive) AUTO 94Bhp (A) [07/11-06/14] | ✗ |
| PROTON / SAGA FL 1.3 CVT | 1332 | 2014 | 29/01/2014 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FLX (Executive) 94Bhp (A) [07/11-06/14] | ✓ |
| PROTON / SAGA FL 1.3 CVT | 1332 | 2015 | 29/07/2015 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FLX SV 94Bhp (A) [06/13-09/16] | ✓ |
| PROTON / SAGA FL 1.3 MANUAL | 1332 | 2011 | 25/08/2011 | PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FLX (Executive) 94Bhp (M) [07/11-06/14] | ? |
| PROTON / SAGA FL 1.6 AUTOMATIK | 1597 | 2012 | 12/01/2012 | PROTON Saga 2008 To 2016 4 Dr Sal 1.6 FL (Executive) 109Bhp (A) [05/11-09/16] | ✓ |
| PROTON / SAGA ISWARA 1.3S | 1298 | 1999 | 18/12/1999 | PROTON Iswara 1992 On 4 Dr Sal 1.30 S 83Bhp (M) [08/92-] | ✓ |
| PROTON / WAJA 1.6 AUTOMATIK | 1584 | 2005 | 13/09/2005 | PROTON Waja 2000 On 4 Dr Sal 1.6 (CF1) 102Bhp (A) [08/00-12/05] | ✓ |
| PROTON / WIRA 1.50LI(A) | 1468 | 2001 | 29/12/2001 | PROTON Wira 1993 On 4 Dr Sal 1.5 GLi 86Bhp (A) [02/98-] | ✓ |
| PROTON / WIRA 1.5GL(A) | 1468 | 2000 | 11/02/2000 | PROTON Wira 1993 On 4 Dr Sal 1.5 GL 86Bhp (A) [09/95-] | ✓ |
| PROTON / WIRA 1.5GL(M) | 1468 | 1995 | 14/07/1995 | PROTON Wira 1993 On 4 Dr Sal 1.5 GL 86Bhp (M) [09/95-] | ✗ |
| PROTON / WIRA AB 1.3 MET | 1298 | 2002 | 14/11/2002 | PROTON Wira 1993 On 5 Dr Hatch 1.3 GLi 81Bhp (M) [02/98-] | ✓ |
| PROTON / WIRA AB 1.5 AT | 1468 | 2001 | 24/01/2002 | PROTON Wira 1993 On 5 Dr Hatch 1.5 GLi 86Bhp (A) [02/98-] | ✓ |
| PROTON / X50 1.5T PREMIUM | 1477 | 2022 | 18/02/2022 | PROTON X50 2020 To 2024 5 Dr SUV 1.5 1.5T Premium 148Bhp [10/20-06/24] | ✓ |
| PROTON / X50 1.5T PREMIUM | 1477 | 2022 | 21/11/2022 | PROTON X50 2020 To 2024 5 Dr SUV 1.5 1.5T Executive 148Bhp [10/20-06/24] | ✗ |
| PROTON / X70 1.8 TGDI EXECUTIVE 2WD | 1799 | 2019 | 15/07/2019 | PROTON X70 2018 On 5 Dr SUV 1.8 TGDI Executive (2WD) 182Bhp (A) [12/18-] | ✓ |
| PROTON / X70 1.8 TGDI PREMIUM 2WD | 1799 | 2019 | 21/05/2019 | PROTON X70 2018 On 5 Dr SUV 1.8 TGDI Premium 182Bhp (A) [12/18-] | ✓ |
| PROTON / X70 1.8 TGDI PREMIUM 2WD | 1799 | 2021 | 22/10/2021 | PROTON X70 2020 On 5 Dr SUV 1.8 TGDI Premium 181Bhp [02/20-] | ✓ |
| SUBARU / SUBARU XV2.0I | 1995 | 2015 | 08/11/2015 | SUBARU XV 2012 On 5 Dr SUV 2 2.0 STI 148Bhp [07/14-03/17] | ? |
| SUZUKI / SWIFT 1.5L A/T | 1490 | 2008 | 20/08/2008 | SUZUKI Swift 2005 On 5 Dr Hatch 1.5 102Bhp (A) [05/06-06/11] | ✓ |
| TOYOTA / ALPHARD (import) | 2493 | 2015 | 04/12/2020 | TOYOTA Alphard (Grey Import) MPV 2.5 AGH30R-PFXGK [01/15-] | ✓ |
| TOYOTA / ALPHARD (import) | 2493 | 2017 | 02/04/2021 | TOYOTA ALPHARD MPV 2.5 DBA-AGH30W (A) [15-] | ✓ |
| TOYOTA / ALPHARD (import) | 2493 | 2019 | 12/08/2022 | TOYOTA ALPHARD MPV 2.5 (DBA-AGH30W) (A) [20-] | ✗ |
| TOYOTA / ALPHARD 3.5 AT | 3456 | 2021 | 31/03/2021 | TOYOTA Alphard 2020 To 2023 MPV 3.5 3.5 (GGH30R-PFZLK) 296Bhp (A) [02/20-10/23] | ✓ |
| TOYOTA / ALPHARD DBA-AGH30W(A) (import) | 2493 | 2016 | 22/03/2019 | TOYOTA Alphard (Grey Import) MPV 2.5 AYH30R-NFXVB [07/19-] | ✗ |
| TOYOTA / CAMRY 2.0G (A) | 1998 | 2009 | 17/03/2009 | TOYOTA Camry 2006 To 2009 4 Dr Sal 2 G (ACV41R-JEPEKE) 145Bhp (A) [10/06-08/09] | ✓ |
| TOYOTA / CAMRY ACV40R-JEAGKE | 2362 | 2009 | 19/08/2009 | TOYOTA Camry 2006 To 2009 4 Dr Sal 2.4 V (ACV40R-JEAGKE) 165Bhp (A) [10/06-08/09] | ✓ |
| TOYOTA / COROLLA ALTIS 1.8 (A) | 1794 | 2002 |  | TOYOTA Corolla Altis 2001 On 4 Dr Sal 1.8 G (ZZE122R-GEPEKE) 134Bhp (A) [08/01-01/04] | ✓ |
| TOYOTA / COROLLA ALTIS 1.8G A/T | 1798 | 2021 | 24/02/2021 | TOYOTA Corolla Altis 2019 On 4 Dr Sal 1.8 G (ZRE211R-GEXEKE SS) 137Bhp [10/19-] | ✓ |
| TOYOTA / COROLLA CROSS 1.8V A/T | 1798 | 2022 | 23/05/2022 | TOYOTA Corolla Cross 2022 On 5 Dr SUV 1.8 V (ZSG10R-JHXEKE X2) 138Bhp [01/22-] | ✓ |
| TOYOTA / COROLLA CROSS 1.8V A/T | 1798 | 2022 | 05/02/2022 | TOYOTA Corolla Cross 2022 To 2024 5 Dr SUV 1.8 V (ZSG10R-JHXEKE X2) 138Bhp [01/22-12/24] | ✓ |
| TOYOTA / ESTIMA 2.4 (import) | 2362 | 2013 | 19/05/2016 | TOYOTA Estima (Grey Import) MPV 2.4 ACR50W-GFXEK [01/06-05/16] | ✓ |
| TOYOTA / ESTIMA CBA-ACR30W(A) | 2362 | 2004 | 22/08/2007 | TOYOTA ESTIMA MPV 2.4 ACR30W (A) | ✓ |
| TOYOTA / ESTIMA DBA-ACR50W (A) (import) | 2362 | 2011 | 01/07/2016 | TOYOTA ESTIMA MPV 2.4 ACR50 (DBA-ACR50W) (A) | ✓ |
| TOYOTA / ESTIMA DBA-ACR50W(A) (import) | 2362 | 2013 | 07/08/2018 | TOYOTA Estima (Grey Import) MPV 2.4 ACR50W-GFXPK [05/06-10/19] | ✓ |
| TOYOTA / HARRIER (import) | 1986 | 2020 | 30/06/2023 | TOYOTA Harrier 2021 On 5 Dr SUV 2 2.0 Luxury (MXUA80R ANXSB) 171Bhp [04/21-] | ✗ |
| TOYOTA / HARRIER 2.0T LUXURY | 1998 | 2018 | 03/01/2019 | TOYOTA Harrier 2018 To 2021 5 Dr SUV 2 2.0T Luxury (ASU60R-ANTGT GT) 227Bhp (A) [01/18-04/21] | ✓ |
| TOYOTA / HARRIER CBA-ACU30W (A) (import) | 2362 | 2007 | 21/06/2012 | TOYOTA HARRIER 5 DR SUV 2.4 CBA-ACU30W (A) | ✓ |
| TOYOTA / HARRIER CBA-ACU30W(A) (import) | 2362 | 2008 | 07/02/2013 | TOYOTA HARRIER 5 DR SUV 2.4 ACU30 (A) | ✓ |
| TOYOTA / HARRIER DBA-ZSU60W (A) (import) | 1986 | 2014 | 24/03/2016 | TOYOTA HARRIER 5 DR SUV 2.0 DBA-ZSU60W (A) | ✓ |
| TOYOTA / HIACE PANEL VAN 2.5(D) | 2494 | 2012 | 20/06/2012 | TOYOTA Hiace 2006 On Van 2.5 (KDH200R-RBMDYE) 101Bhp (M) [09/10-12/13] | ✓ |
| TOYOTA / HILUX D/C 2.4E AT 4X4 | 2393 | 2021 | 04/03/2021 | TOYOTA Hilux 2020 On 4 Dr Pickup Dbl.Cab 2.4 E (GUN125R-DETSXE A3) 148Bhp (A) [10/20-] | ✓ |
| TOYOTA / HILUX DOUBLE CAB 2.4G AT 4X4 | 2393 | 2017 | 05/03/2018 | TOYOTA Hilux 2016 To 2020 4 Dr Pickup Dbl.Cab 2.4 G (GUN125R-DETSHECK) 148Bhp (A) [05/16-03/18] | ✓ |
| TOYOTA / HILUX DOUBLE CAB 2.4LE 4X4 | 2393 | 2018 | 09/07/2018 | TOYOTA Hilux 2018 To 2020 4 Dr Pickup Dbl.Cab 2.4 L-Edition (GUN125R-DETSHE) 148Bhp (A) [03/18-10/20] | ✓ |
| TOYOTA / HILUX DOUBLE CAB 2.8G AT 4X4 | 2755 | 2016 | 01/09/2016 | TOYOTA Hilux 2016 To 2020 4 Dr Pickup Dbl.Cab 2.8 G (GUN126R-DETHHECM) 175Bhp (A) [05/16-03/18] | ✓ |
| TOYOTA / INNOVA 2.0 E (AT) | 1998 | 2012 | 26/06/2012 | TOYOTA Innova 2005 On MPV 2 E 134Bhp (A) [10/11-03/14] | ✓ |
| TOYOTA / INNOVA 2.0 G (A) | 1998 | 2007 | 13/08/2007 | TOYOTA Innova 2005 On MPV 2 G 134Bhp (A) [05/05-09/08] | ✓ |
| TOYOTA / INNOVA 2.0 G (AT) | 1998 | 2013 | 23/08/2013 | TOYOTA Innova 2005 On MPV 2 G 134Bhp (A) [10/11-03/14] | ✓ |
| TOYOTA / INNOVA 2.0G AT | 1998 | 2018 | 23/01/2018 | TOYOTA Innova 2016 On MPV 2 G (TGN140R-METMKEEL) 137Bhp (A) [12/16-02/21] | ✓ |
| TOYOTA / INNOVA 2.0X AT | 1998 | 2019 | 05/04/2019 | TOYOTA Innova 2016 On MPV 2 X (TGN140R-METHKE SM) 137Bhp (A) [10/17-02/21] | ✓ |
| TOYOTA / MARK X (DBA-GRX120 (A) (import) | 2499 | 2005 | 14/03/2008 | TOYOTA MARK X 4 DR SAL 2.5 DBA-GRX120 (A) [05-] | ✓ |
| TOYOTA / RUSH 1.5S (A/T) | 1495 | 2009 | 19/10/2009 | TOYOTA Rush 2008 On 5 Dr SUV 1.5 S (F700RE-GQMFM) 108Bhp (A) [01/08-11/10] | ✓ |
| TOYOTA / TOYOTA AVANZA 1.3 (A) | 1298 | 2005 | 16/01/2006 | TOYOTA Avanza 2004 On MPV 1.3 89Bhp (A) [10/04-09/06] | ✓ |
| TOYOTA / TOYOTA AVANZA 1.3 (A) | 1298 | 2004 | 10/11/2004 | TOYOTA Avanza 2004 On MPV 1.30 AUTO 89Bhp (A) [10/04-09/06] | ✓ |
| TOYOTA / TOYOTA AVANZA 1.5G A/T | 1496 | 2016 | 22/09/2016 | TOYOTA Avanza 2012 On MPV 1.5 G (F654RM-GQMFMKX) 104Bhp (A) [10/15-] | ✓ |
| TOYOTA / TOYOTA AVANZA 1.5G A/T | 1495 | 2014 | 20/03/2014 | TOYOTA Avanza 2012 On MPV 1.5 G (F652RM-GQMFM) 102Bhp (A) [01/12-09/15] | ✓ |
| TOYOTA / TOYOTA AVANZA 1.5G A/T | 1495 | 2012 | 31/01/2013 | TOYOTA Avanza 2012 On MPV 1.50 G (F652RM-GQMFM) AUTO 102Bhp (A) [01/12-09/15] | ✓ |
| TOYOTA / TOYOTA CAMRY 2.0E (A) | 1998 | 2011 | 25/04/2011 | TOYOTA Camry 2009 To 2012 4 Dr Sal 2 E (ACV41R-JEPNKE) 145Bhp (A) [09/09-05/12] | ✓ |
| TOYOTA / TOYOTA CAMRY 2.0G (A) | 1998 | 2014 | 28/11/2014 | TOYOTA Camry 2012 To 2018 4 Dr Sal 2 G (ACV51R-JEPEKEFL) 146Bhp (A) [06/12-03/15] | ✓ |
| TOYOTA / TOYOTA CAMRY 2.5L HYBRID (A) | 2494 | 2015 | 29/??/2015 | TOYOTA Camry 2012 To 2018 4 Dr Sal 2.5 HYBRID (AVV50R-JEXGBE HS) 158Bhp [04/15-11/16] | ? |
| TOYOTA / TOYOTA COROLLA ALTIS 1.6E (A) | 1598 | 2007 | 30/05/2007 | TOYOTA Corolla Altis 2001 On 4 Dr Sal 1.6 E (ZZE121R-GEPNKE) 108Bhp (A) [02/04-02/08] | ✓ |
| TOYOTA / TOYOTA COROLLA ALTIS 1.8E (A) | 1798 | 2012 | 27/02/2012 | TOYOTA Corolla Altis 2008 On 4 Dr Sal 1.8 E (ZRE142R-GEXEKT) 138Bhp (A) [09/10-12/13] | ✓ |
| TOYOTA / TOYOTA COROLLA ALTIS 1.8E (A) | 1798 | 2014 | 20/06/2014 | TOYOTA Corolla Altis 2014 On 4 Dr Sal 1.8 E (ZRE172R-GEXEKE) 137Bhp (A) [01/14-11/16] | ✓ |
| TOYOTA / TOYOTA COROLLA ALTIS 1.8G (A) | 1798 | 2016 | 31/05/2016 | TOYOTA Corolla Altis 2014 On 4 Dr Sal 1.8 G (ZRE172R-GEXEKE) 137Bhp [11/14-11/16] | ✓ |
| TOYOTA / TOYOTA COROLLA ALTIS 1.8G (A) | 1798 | 2018 | 05/06/2018 | TOYOTA Corolla Altis 2014 On 4 Dr Sal 1.8 G (ZRE172R-GEXEKE) 137Bhp [12/16-10/19] | ✓ |
| TOYOTA / TOYOTA COROLLA ALTIS 1.8G (A) | 1798 | 2010 | 01/03/2011 | TOYOTA Corolla Altis 2008 On 4 Dr Sal 1.8 G (ZRE142R-GEXGKE) 138Bhp (A) [09/10-12/13] | ✓ |
| TOYOTA / TOYOTA COROLLA ALTIS 2.0V (A) | 1987 | 2014 | 21/03/2014 | TOYOTA Corolla Altis 2014 On 4 Dr Sal 2 V (ZRE173R-GEXVKE) 143Bhp (A) [01/14-11/16] | ✓ |
| TOYOTA / TOYOTA FORTUNER 2.7V (P) A/T | 2694 | 2013 | 25/04/2013 | TOYOTA Fortuner 2005 On 5 Dr SUV 2.7 V (TGN51R NKPSKE) 158Bhp (A) [10/11-01/16] | ✓ |
| TOYOTA / TOYOTA HIACE PANEL VAN 2.5(D) | 2494 | 2015 | 04/09/2015 | TOYOTA Hiace 2006 On Van 2.5 (KDH200R-RBMDYE) 101Bhp (M) [01/14-] | ✓ |
| TOYOTA / TOYOTA HILUX DOUBLE CAB 2.5 AT | 2494 | 2012 | 29/03/2012 | TOYOTA Hilux 2005 To 2016 4 Dr Pickup Dbl.Cab 2.5 G (KUN25R-PRPSHE) 142Bhp (A) [10/12-10/13] | ✗ |
| TOYOTA / TOYOTA HILUX DOUBLE CAB 2.5 AT | 2494 | 2015 | 23/07/2015 | TOYOTA Hilux 2005 To 2016 4 Dr Pickup Dbl.Cab 2.5 G (KUN25R-PRPSHEHH) 142Bhp (A) [01/15-04/16] | ✓ |
| TOYOTA / TOYOTA PRIUS C 1.5L (A) | 1497 | 2013 | 10/02/2014 | TOYOTA Prius C 2012 On 5 Dr Hatch 1.5 HYBRID SYNERGY DRIVE (NHP10R) 100Bhp (A) [02/12-] | ✓ |
| TOYOTA / TOYOTA RUSH 1.5S A/T | 1496 | 2022 | 23/08/2022 | TOYOTA Rush 2018 On 5 Dr SUV 1.5 S (F850RE-GQQFMGM) 104Bhp (A) [10/18-] | ✓ |
| TOYOTA / TOYOTA VELLFIRE 2.5 ZA (import) | 2493 | 2018 | 02/01/2024 | TOYOTA Vellfire (Grey Import) MPV 2.5 AGH30R-NFXRK [05/21-] | ✗ |
| TOYOTA / TOYOTA VELLFIRE DBA-ANH20W (import) | 2362 | 2008 | 10/12/2010 | TOYOTA Vellfire (Grey Import) MPV 2.4 ANH20R-PRXSK [06/09-01/15] | ✗ |
| TOYOTA / TOYOTA VIOS 1.5E (A) | 1496 | 2004 | 30/04/2004 | TOYOTA Vios 2003 To 2007 4 Dr Sal 1.5 E (NCP42R) 108Bhp (A) [06/03-11/05] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5E (A) | 1496 | 2006 | 19/09/2006 | TOYOTA Vios 2003 On 4 Dr Sal 1.5 E (NCP42R) 108Bhp (A) [12/05-09/07] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5E (AT) | 1497 | 2012 | 05/04/2012 | TOYOTA Vios 2007 On 4 Dr Sal 1.5 E (NCP93R) 108Bhp (A) [04/10-06/12] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5E (AT) | 1497 | 2012 | 22/06/2012 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 E (NCP93R) 108Bhp (A) [04/10-06/12] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5E (AT) | 1497 | 2009 | 19/11/2009 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 E (NCP93R) 108Bhp (A) [10/07-03/10] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5E (AT) | 1496 | 2017 | 26/07/2017 | TOYOTA Vios 2016 To 2020 4 Dr Sal 1.5 E (NSP151R-BEXRKE E2) 106Bhp [10/16-12/18] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5E (AT) | 1497 | 2014 | 14/03/2014 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 E (NCP150R) 108Bhp (A) [10/13-09/16] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5E (AT) | 1497 | 2012 | 13/08/2012 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 E (NCP93R) 108Bhp (A) [07/12-09/13] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5E (AT) | 1497 | 2016 | 29/09/2016 | TOYOTA Vios 2007 On 4 Dr Sal 1.50 E (NCP150R) AUTO 108Bhp (A) [10/13-09/16] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G (A) | 1496 | 2007 | 04/09/2007 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 G (NCP93R) 108Bhp (A) [10/07-03/10] | ✗ |
| TOYOTA / TOYOTA VIOS 1.5G (A) | 1496 | 2006 | 16/06/2006 | TOYOTA Vios 2003 To 2007 4 Dr Sal 1.5 G (NCP42R) 108Bhp (A) [12/05-09/07] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G (AT) | 1497 | 2011 | 21/03/2011 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 G (NCP93R) 108Bhp (A) [04/10-06/12] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G (AT) | 1497 | 2016 | 15/04/2016 | TOYOTA Vios 2007 On 4 Dr Sal 1.5 G (NCP150R) 108Bhp (A) [10/13-09/16] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G (AT) | 1497 | 2012 | 03/01/2013 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 G Limited (NCP93R) 108Bhp (A) [07/12-09/13] | ✗ |
| TOYOTA / TOYOTA VIOS 1.5G (AT) | 1497 | 2013 | 28/05/2013 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 G (NCP93R) 108Bhp (A) [07/12-09/13] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G (AT) | 1497 | 2008 | 25/09/2008 | TOYOTA Vios 2007 On 4 Dr Sal 1.50 G (NCP93R) AUTO 108Bhp (A) [10/07-03/10] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G A/T | 1496 | 2019 | 14/05/2019 | TOYOTA Vios 2019 To 2020 4 Dr Sal 1.5 G (NSP151R-BEXGKE V3) 105Bhp [01/19-12/20] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5G A/T | 1496 | 2021 | 16/11/2021 | TOYOTA Vios 2020 To 2023 4 Dr Sal 1.5 G (NSP151R-BEXGKE W3) 105Bhp [12/20-] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5J (AT) | 1497 | 2014 | 15/10/2014 | TOYOTA Vios 2007 On 4 Dr Sal 1.50 J (NCP150R) AUTO 108Bhp (A) [10/13-09/16] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5J (AT) | 1496 | 2017 | 03/08/2017 | TOYOTA Vios 2016 To 2020 4 Dr Sal 1.5 J (NSP151R-BEXDKE E1) 106Bhp [10/16-12/18] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5J (AT) | 1497 | 2013 | 09/07/2013 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 J (NCP93R) 108Bhp (A) [07/12-09/13] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5J (AT) | 1497 | 2015 | 30/11/2015 | TOYOTA Vios 2007 On 4 Dr Sal 1.5 J (NCP150R) 108Bhp (A) [10/13-09/16] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5S (AT) | 1497 | 2014 | 28/01/2014 | TOYOTA Vios 2007 On 4 Dr Sal 1.5 TRD Sportivo (NCP150R) 108Bhp (A) [10/13-09/16] | ✓ |
| TOYOTA / TOYOTA VIOS 1.5S (AT) | 1497 | 2015 | 10/03/2016 | TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 TRD Sportivo (NCP150R) 108Bhp (A) [10/13-09/16] | ✗ |
| TOYOTA / TOYOTA YARIS 1.5E A/T | 1496 | 2022 | 27/04/2022 | TOYOTA Yaris 2020 On 5 Dr Hatch 1.5 E (NSP151R-BHXRKE ZR) 105Bhp [12/20-05/23] | ✓ |
| TOYOTA / TOYOTA YARIS 1.5G AT | 1496 | 2023 | 12/07/2023 | TOYOTA Yaris 2023 On 5 Dr Hatch 1.5 G (NSP151R-BHXGKE 2B) 105Bhp [05/23-] | ✓ |
| TOYOTA / VELLFIRE (import) | 2493 | 2020 | 09/06/2023 | TOYOTA Vellfire 2020 To 2023 MPV 2.5 2.5 (AGH30R-NFXLK) 177Bhp [02/20-10/23] | ✓ |
| TOYOTA / VELLFIRE DBA-AGH30W (import) | 2493 | 2018 | 22/03/2023 | TOYOTA Vellfire (Grey Import) MPV 2.5 AGH30W-NFXSK [01/15-] | ✓ |
| TOYOTA / VELLFIRE DBA-AGH30W (A) (import) | 2493 | 2019 | 24/09/2021 | TOYOTA VELLFIRE MPV 2.5 DBA-AGH30W (A) | ✓ |
| TOYOTA / VELLFIRE DBA-ANH20W (A) (import) | 2362 | 2008 | 19/11/2013 | TOYOTA VELLFIRE MPV 2.4 DBA-ANH20W (A) | ✓ |
| TOYOTA / VELLFIRE DBA-ANH20W (A/T) (import) | 2362 | 2011 | 03/09/2015 | TOYOTA Vellfire (Grey Import) MPV 2.4 ANH20W-NFXGK [04/08-01/15] | ✓ |
| TOYOTA / VELOZ 1.5AT | 1496 | 2023 | 27/07/2023 | TOYOTA Veloz 2022 On MPV 1.5 1.5 (W151RE-LBQFM HK) 105Bhp [10/22-] | ✓ |
| TOYOTA / VIOS 1.5E AT | 1496 | 2017 | 28/03/2017 | TOYOTA Vios 2016 On 4 Dr Sal 1.5 E (NSP151R-BEXRKE E2) 106Bhp [10/16-12/18] | ✓ |
| TOYOTA / VIOS 1.5E AT | 1496 | 2017 | 12/04/2017 | TOYOTA Vios 2016 On 4 Dr Sal 1.50 E (NSP151R-BEXRKE E2) 106Bhp [10/16-12/18] | ✓ |
| TOYOTA / VOXY (import) | 1986 | 2015 | 16/03/2020 | TOYOTA VOXY MPV 2.0 DBA-ZRR80G (A) | ✓ |
| TOYOTA / WISH DBA-ZGE20W (import) | 1797 | 2013 | 13/07/2018 | TOYOTA WISH MPV 1.8 DBA-ZGE20W (A) [09-] | ✓ |
| TOYOTA / WISH DBA-ZGE20W (faint, partly unreadable) (import) | 1797 (faint) | 2012 (faint) | 22/02/2017 (faint) | TOYOTA WISH MPV 1.8 DBA-ZGE20G (A) | ✗ |
| TOYOTA / WISH DBA-ZNE10G (A) (import) | 1794 | 2007 | 15/10/2012 | TOYOTA WISH MPV 1.8 CBA-ZNE10G (A) | ✗ |
| VOLKSWAGEN / BEETLE 1.2 | 1197 | 2014 | 17/04/2014 | VOLKSWAGEN Beetle 2014 On 3 Dr Hatch 1.2 TSI Design 103Bhp [08/14-04/17] | ✗ |
| VOLKSWAGEN / JETTA 1.4 (A) | 1390 | 2011 | 30/03/2012 | VOLKSWAGEN Jetta 2011 On 4 Dr Sal 1.4 TSI 158Bhp (A) [10/11-08/16] | ✓ |
| VOLKSWAGEN / PASSAT 1.8 | 1798 | 2014 | 22/04/2014 | VOLKSWAGEN Passat 2011 On 4 Dr Sal 1.8 TSI (B7) 158Bhp (A) [10/11-10/16] | ✓ |
| VOLKSWAGEN / POLO 1.2 | 1198 | 2012 | 04/09/2012 | VOLKSWAGEN Polo 2010 On 5 Dr Hatch 1.2 TSI (MK 5) 104Bhp (A) [10/10-04/15] | ✓ |
| VOLKSWAGEN / POLO NB | 1598 | 2013 | 03/12/2013 | VOLKSWAGEN Polo 2010 On 4 Dr Sal 1.6 104Bhp (A) [04/12-04/16] | ✓ |
| VOLKSWAGEN / TIGUAN 1.4 | 1395 | 2019 | 06/09/2019 | VOLKSWAGEN Tiguan 2017 On 5 Dr SUV 1.4 TSI Highline 148Bhp [04/17-] | ✓ |

## What adjusters chose most (7,239 cases; models with 10+ cases, top 8 variants each)
Number = cases that chose that option. Full list for every model: `tools/batch/model_choice_stats.json`. These include other adjusters' mistakes (see the ✗ rows above), so they only show which option is normal.

**PERODUA MYVI** — 821 cases, 69 variants
- 73 × PERODUA Myvi 2011 On 5 Dr Hatch 1.5 SE (A) 102Bhp (A) [01/15-10/17]
- 57 × PERODUA Myvi 2017 To 2020 5 Dr Hatch 1.5 Advanced 102Bhp (A) [11/17-07/20]
- 54 × PERODUA Myvi 2011 On 5 Dr Hatch 1.3 EZi Premium 89Bhp (A) [06/11-12/14]
- 50 × PERODUA Myvi 2011 On 5 Dr Hatch 1.5 SE (A) 102Bhp (A) [09/11-12/14]
- 35 × PERODUA Myvi 2017 To 2020 5 Dr Hatch 1.5 High 102Bhp (A) [11/17-07/20]
- 34 × PERODUA Myvi 2021 On 5 Dr Hatch 1.5 1.5 AV 102Bhp [11/21-]
- 33 × PERODUA Myvi 2005 On 5 Dr Hatch 1.3 EZi 86Bhp (A) [08/08-05/11]
- 31 × PERODUA Myvi 2011 On 5 Dr Hatch 1.3 EZ Standard 89Bhp (A) [06/11-12/14]

**HONDA CITY** — 488 cases, 66 variants
- 43 × HONDA City 2014 On 4 Dr Sal 1.5 E 118Bhp (A) [04/14-02/17]
- 38 × HONDA City 2014 On 4 Dr Sal 1.5 V 118Bhp (A) [04/14-02/17]
- 38 × HONDA City 2008 On 4 Dr Sal 1.5 i-VTEC (Grade S) 118Bhp (A) [12/08-05/12]
- 37 × HONDA City 2014 On 4 Dr Sal 1.5 E 118Bhp [03/17-]
- 30 × HONDA City 2008 On 4 Dr Sal 1.5 i-VTEC (Grade E) 118Bhp (A) [06/12-03/14]
- 23 × HONDA City 2008 On 4 Dr Sal 1.5 i-VTEC (Grade S) 118Bhp (A) [06/12-03/14]
- 23 × HONDA City 2014 On 4 Dr Sal 1.5 S+ 118Bhp (A) [04/14-02/17]
- 20 × HONDA City 2014 On 4 Dr Sal 1.5 V 118Bhp [03/17-]

**TOYOTA VIOS** — 461 cases, 91 variants
- 21 × TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 J (NCP150R) 108Bhp (A) [10/13-09/16]
- 20 × TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 E (NCP93R) 108Bhp (A) [04/10-06/12]
- 19 × TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 G (NCP150R) 108Bhp (A) [10/13-09/16]
- 19 × TOYOTA Vios 2023 On 4 Dr Sal 1.5 1.5G (NGC102R-EEXHKE 1B) 104Bhp [03/23-]
- 17 × TOYOTA Vios 2019 To 2020 4 Dr Sal 1.5 G (NSP151R-BEXGKE V3) 105Bhp [01/19-12/20]
- 16 × TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 G (NCP93R) 108Bhp (A) [10/07-03/10]
- 16 × TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 J (NCP93R) 108Bhp (A) [04/10-06/12]
- 15 × TOYOTA Vios 2007 To 2016 4 Dr Sal 1.5 E (NCP93R) 108Bhp (A) [10/07-03/10]

**PROTON SAGA** — 420 cases, 62 variants
- 38 × PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FLX (Executive) 94Bhp (A) [07/11-06/14]
- 31 × PROTON Saga 2019 On 4 Dr Sal 1.3 Premium 94Bhp (A) [08/19-]
- 27 × PROTON Saga 2019 On 4 Dr Sal 1.3 Standard 94Bhp (A) [08/19-]
- 23 × PROTON Saga 2022 On 4 Dr Sal 1.3 Standard 94Bhp (A) [05/22-]
- 18 × PROTON Saga 2016 On 4 Dr Sal 1.3 Premium 94Bhp [09/16-]
- 15 × PROTON Saga 2019 To 2022 4 Dr Sal 1.3 Premium 94Bhp (A) [08/19-08/22]
- 15 × PROTON Saga 2008 To 2016 4 Dr Sal 1.3 FLX (Executive) 94Bhp (A) [07/14-09/16]
- 13 × PROTON Saga 2022 On 4 Dr Sal 1.3 Premium 94Bhp (A) [05/22-11/25]

**PERODUA BEZZA** — 366 cases, 23 variants
- 104 × PERODUA Bezza 2020 On 4 Dr Sal 1.3 X 94Bhp (A) [01/20-]
- 52 × PERODUA Bezza 2016 On 4 Dr Sal 1.3 Premium X 94Bhp (A) [05/17-12/19]
- 39 × PERODUA Bezza 2020 On 4 Dr Sal 1.3 AV 94Bhp (A) [01/20-]
- 25 × PERODUA Bezza 2016 On 4 Dr Sal 1.30 Premium X AUTO 94Bhp (A) [05/17-12/19]
- 24 × PERODUA Bezza 2016 On 4 Dr Sal 1.3 Advance 94Bhp (A) [05/17-12/19]
- 21 × PERODUA Bezza 2016 On 4 Dr Sal 1.3 Premium X 94Bhp (A) [07/16-05/17]
- 16 × PERODUA Bezza 2016 On 4 Dr Sal 1.3 Advance 94Bhp (A) [07/16-05/17]
- 16 × PERODUA Bezza 2020 On 4 Dr Sal 1 G (A) 67Bhp (A) [01/20-]

**PERODUA ALZA** — 272 cases, 27 variants
- 41 × PERODUA Alza 2009 On MPV 1.5 EZ 103Bhp (A) [01/14-10/18]
- 33 × PERODUA Alza 2009 On MPV 1.5 EZi 102Bhp (A) [11/09-12/13]
- 29 × PERODUA Alza 2009 On MPV 1.5 EZ 102Bhp (A) [11/09-12/13]
- 29 × PERODUA Alza 2009 On MPV 1.5 SE 103Bhp (A) [01/14-10/18]
- 29 × PERODUA Alza 2009 On MPV 1.5 Advanced 103Bhp (A) [01/14-10/18]
- 16 × PERODUA Alza 2009 On MPV 1.5 SE 102Bhp (A) [09/18-07/22]
- 14 × PERODUA Alza 2009 On MPV 1.5 Advance 102Bhp (A) [09/18-07/22]
- 12 × PERODUA Alza 2022 On MPV 1.5 1.5 AV 105Bhp [07/22-]

**PERODUA AXIA** — 244 cases, 36 variants
- 47 × PERODUA Axia 2014 To 2019 5 Dr Hatch 1 G (A) 67Bhp (A) [09/14-01/17]
- 28 × PERODUA Axia 2014 To 2019 5 Dr Hatch 1 G (A) 67Bhp (A) [01/17-08/19]
- 19 × PERODUA Axia 2014 To 2019 5 Dr Hatch 1 SE (A) 67Bhp (A) [01/17-08/19]
- 13 × PERODUA Axia 2023 On 5 Dr Hatch 1 1.0 SE 67Bhp [02/23-]
- 11 × PERODUA Axia 2019 On 5 Dr Hatch 1 GXtra 67Bhp (A) [09/19-]
- 10 × PERODUA Axia 2019 On 5 Dr Hatch 1 SE 67Bhp (A) [09/19-]
- 10 × PERODUA Axia 2014 To 2019 5 Dr Hatch 1 Advance 67Bhp (A) [09/14-01/17]
- 8 × PERODUA Axia 2023 On 5 Dr Hatch 1 1.0 X 67Bhp [02/23-]

**PROTON PERSONA** — 170 cases, 37 variants
- 17 × PROTON Persona 2016 To 2021 4 Dr Sal 1.6 Executive 107Bhp [08/16-03/19]
- 15 × PROTON Persona 2016 To 2021 4 Dr Sal 1.6 Premium 107Bhp [08/16-03/19]
- 14 × PROTON Persona 2016 To 2021 4 Dr Sal 1.6 Executive 107Bhp [04/19-08/21]
- 13 × PROTON Persona 2007 To 2016 4 Dr Sal 1.6 High Line 109Bhp (A) [03/10-05/16]
- 11 × PROTON Persona 2021 On 4 Dr Sal 1.6 Executive 107Bhp [08/21-]
- 9 × PROTON Persona 2016 To 2021 4 Dr Sal 1.6 Premium 107Bhp [04/19-08/21]
- 8 × PROTON Persona 2007 To 2016 4 Dr Sal 1.6 Base Line 109Bhp (M) [03/10-05/16]
- 8 × PROTON Persona 2016 To 2021 4 Dr Sal 1.6 Standard 107Bhp [04/19-08/21]

**HONDA CIVIC** — 136 cases, 50 variants
- 10 × HONDA Civic 2016 On 4 Dr Sal 1.5 TC-P 171Bhp [06/16-02/20]
- 9 × HONDA Civic 2006 On 4 Dr Sal 1.8 S 138Bhp (A) [03/06-02/09]
- 8 × HONDA Civic 2016 To 2020 4 Dr Sal 1.8 S 139Bhp [06/16-02/20]
- 7 × HONDA Civic 2016 To 2020 4 Dr Sal 1.5 TC-P 171Bhp [06/16-02/20]
- 7 × HONDA Civic 2016 On 4 Dr Sal 1.8 S 139Bhp [06/16-02/20]
- 6 × HONDA Civic 2016 To 2020 4 Dr Sal 1.5 TC 171Bhp [06/16-02/20]
- 6 × HONDA Civic 2006 On 4 Dr Sal 2 S 153Bhp (A) [04/07-02/09]
- 5 × HONDA Civic 2006 On 4 Dr Sal 1.8 S 138Bhp (A) [03/09-06/12]

**NISSAN ALMERA** — 123 cases, 21 variants
- 26 × NISSAN Almera 2012 On 4 Dr Sal 1.5 E 101Bhp (A) [10/12-12/14]
- 17 × NISSAN Almera 2015 On 4 Dr Sal 1.5 E 101Bhp (A) [04/16-]
- 14 × NISSAN Almera 2012 On 4 Dr Sal 1.5 VL 101Bhp (A) [10/12-12/14]
- 13 × NISSAN Almera 2015 On 4 Dr Sal 1.5 E 101Bhp (A) [01/15-04/16]
- 9 × NISSAN Almera 2012 On 4 Dr Sal 1.50 E AUTO 101Bhp (A) [10/12-12/14]
- 6 × NISSAN Almera 2012 On 4 Dr Sal 1.5 V 101Bhp (A) [10/12-12/14]
- 5 × NISSAN Almera 2015 On 4 Dr Sal 1.5 VL 101Bhp (A) [01/15-04/16]
- 4 × NISSAN Almera 2018 On 4 Dr Sal 1.5 VL (Black Series) 101Bhp (A) [11/18-]

**TOYOTA COROLLA** — 122 cases, 42 variants
- 10 × TOYOTA Corolla Altis 2014 On 4 Dr Sal 1.8 G (ZRE172R-GEXEKE) 137Bhp [11/14-11/16]
- 9 × TOYOTA Corolla Altis 2001 On 4 Dr Sal 1.8 G (ZZE122R-GEPEKE) 134Bhp (A) [02/04-02/08]
- 8 × TOYOTA Corolla Altis 2014 On 4 Dr Sal 1.8 G (ZRE172R-GEXEKE) 137Bhp [12/16-10/19]
- 8 × TOYOTA Corolla Altis 2001 On 4 Dr Sal 1.8 G (ZZE122R-GEPEKE) 134Bhp (A) [08/01-01/04]
- 7 × TOYOTA Corolla Altis 2014 On 4 Dr Sal 1.8 E (ZRE172R-GEXEKE) 137Bhp (A) [01/14-11/16]
- 7 × TOYOTA Corolla Altis 2008 On 4 Dr Sal 1.8 E (ZRE142R-GEXEKT) 138Bhp (A) [09/10-12/13]
- 6 × TOYOTA Corolla Altis 2019 On 4 Dr Sal 1.8 G (ZRE211R-GEXEKE SS) 137Bhp [10/19-]
- 6 × TOYOTA Corolla Altis 2008 On 4 Dr Sal 1.8 G (ZRE142R-GEXGKE) 138Bhp (A) [09/10-12/13]

**HONDA JAZZ** — 118 cases, 30 variants
- 19 × HONDA Jazz 2014 On 5 Dr Hatch 1.5 i-VTEC (Grade E) 118Bhp (A) [07/14-05/17]
- 15 × HONDA Jazz 2014 On 5 Dr Hatch 1.5 i-VTEC (Grade V) 118Bhp (A) [07/14-05/17]
- 13 × HONDA Jazz 2014 On 5 Dr Hatch 1.5 i-VTEC (Grade S) 118Bhp (A) [07/14-05/17]
- 12 × HONDA Jazz 2014 On 5 Dr Hatch 1.5 1.5 E 118Bhp [06/17-]
- 10 × HONDA Jazz 2014 On 5 Dr Hatch 1.5 1.5 S 118Bhp [06/17-]
- 8 × HONDA Jazz 2014 On 5 Dr Hatch 1.5 1.5 V 118Bhp [06/17-]
- 6 × HONDA Jazz 2008 On 5 Dr Hatch 1.5 i-VTEC (Grade S) 118Bhp (A) [08/12-06/14]
- 3 × HONDA Jazz 2003 On 5 Dr Hatch 1.5 VTEC 108Bhp (A) [04/04-07/06]

**TOYOTA ALPHARD** — 115 cases, 32 variants
- 16 × TOYOTA Alphard (Grey Import) MPV 2.5 AGH30R-NFXSK [08/19-]
- 14 × TOYOTA Alphard (Grey Import) MPV 2.5 AGH30R-PFXGK [01/15-]
- 13 × TOYOTA Alphard (Grey Import) MPV 2.5 AGH30R-NFXRK [05/21-]
- 9 × TOYOTA ALPHARD MPV 2.5 DBA-AGH30W (A) [15-]
- 8 × TOYOTA Alphard (Grey Import) MPV 2.5 AYH30R-NFXVB [07/19-]
- 5 × TOYOTA Alphard (Grey Import) MPV 2.5 AGH30R-PFXLK [01/15-]
- 5 × TOYOTA ALPHARD MPV 2.4 DBA-ANH10W (A)
- 4 × TOYOTA Alphard 2020 To 2023 MPV 3.5 3.5 (GGH30R-PFZLK) 296Bhp (A) [02/20-10/23]

**HONDA HR-V** — 114 cases, 21 variants
- 33 × HONDA HR-V 2015 To 2022 5 Dr SUV 1.8 V 140Bhp (A) [02/15-12/18]
- 15 × HONDA HR-V 2015 To 2022 5 Dr SUV 1.8 E 140Bhp (A) [02/15-12/18]
- 8 × HONDA HR-V 2015 To 2022 5 Dr SUV 1.8 S 140Bhp (A) [02/15-12/18]
- 8 × HONDA HR-V 2022 On 5 Dr SUV 1.5 1.5 V 174Bhp [07/22-]
- 8 × HONDA HR-V 2015 On 5 Dr SUV 1.80 V AUTO 140Bhp (A) [02/15-12/18]
- 7 × HONDA HR-V 2015 On 5 Dr SUV 1.8 V 140Bhp (A) [02/15-12/18]
- 6 × HONDA HR-V 2015 To 2022 5 Dr SUV 1.8 E 140Bhp [01/19-07/22]
- 5 × HONDA HR-V 2015 To 2022 5 Dr SUV 1.8 V 140Bhp [01/19-07/22]

**TOYOTA VELLFIRE** — 111 cases, 38 variants
- 15 × TOYOTA VELLFIRE MPV 2.4 DBA-ANH20W (A)
- 11 × TOYOTA VELLFIRE MPV 2.5 DBA-AGH30W (A)
- 7 × TOYOTA Vellfire (Grey Import) MPV 2.4 ANH20R-PFXGK [06/09-01/15]
- 7 × TOYOTA Vellfire (Grey Import) MPV 2.5 AGH30W-NFXSK [01/15-]
- 5 × TOYOTA Vellfire (Grey Import) MPV 2.5 AGH30W-NRXQK [01/15-01/18]
- 5 × TOYOTA Vellfire (Grey Import) MPV 2.4 ANH20W-NFXGK [04/08-01/15]
- 4 × TOYOTA Vellfire 2020 To 2023 MPV 2.5 2.5 (AGH30R-NFXLK) 177Bhp [02/20-10/23]
- 4 × TOYOTA Vellfire (Grey Import) MPV 2.4 ANH20W-NFXSK [04/08-01/15]

**TOYOTA HILUX** — 93 cases, 39 variants
- 9 × TOYOTA Hilux 2018 To 2020 4 Dr Pickup Dbl.Cab 2.4 L-Edition (GUN125R-DETSHE) 148Bhp (A) [03/18-10/20]
- 8 × TOYOTA Hilux 2016 To 2020 4 Dr Pickup Dbl.Cab 2.4 G (GUN125R-DETSHECK) 148Bhp (A) [05/16-03/18]
- 6 × TOYOTA Hilux 2005 To 2016 4 Dr Pickup Dbl.Cab 2.5 G (KUN25R-PRPSHE) 101Bhp (A) [10/08-08/11]
- 6 × TOYOTA Hilux 2005 To 2016 4 Dr Pickup Dbl.Cab 2.5 G (KUN25R-PRPSHE) 142Bhp (A) [10/12-10/13]
- 5 × TOYOTA Hilux 2005 To 2016 4 Dr Pickup Dbl.Cab 2.5 G (KUN25R-PRPSHE) 101Bhp (A) [09/11-09/12]
- 4 × TOYOTA Hilux 2005 To 2016 4 Dr Pickup Dbl.Cab 2.5 G (KUN25R-PRPSHE) 101Bhp (A) [03/05-09/08]
- 4 × TOYOTA Hilux 2020 On 4 Dr Pickup Dbl.Cab 2.4 E (GUN125R-DETSXE A3) 148Bhp (A) [10/20-]
- 4 × TOYOTA Hilux 2005 To 2016 4 Dr Pickup Dbl.Cab 2.5 G (KUN25R-PRPSHEHH) 142Bhp (A) [01/15-04/16]

**PERODUA VIVA** — 90 cases, 13 variants
- 35 × PERODUA Viva 2007 On 5 Dr Hatch 1 EZ 60Bhp (A) [05/07-]
- 18 × PERODUA Viva 2007 On 5 Dr Hatch 0.85 EX 52Bhp (M) [05/07-]
- 8 × PERODUA Viva 2007 On 5 Dr Hatch 1 ELITE (A) 60Bhp (A) [07/09-]
- 6 × PERODUA Viva 2007 On 5 Dr Hatch 1 ELITE EZi 60Bhp (A) [07/09-]
- 6 × PERODUA Viva 2007 On 5 Dr Hatch 0.66 EX 47Bhp (M) [05/07-]
- 4 × PERODUA Viva 2007 On 5 Dr Hatch 1 EZi 60Bhp (A) [05/07-]
- 3 × PERODUA Viva 2007 On 5 Dr Hatch 1 SX 60Bhp (M) [05/07-]
- 2 × PERODUA Viva 2007 On 5 Dr Hatch 1 ELITE (M) 60Bhp (M) [07/09-]

**BMW 3-SERIES** — 77 cases, 34 variants
- 7 × BMW 3-Series 2012 To 2019 4 Dr Sal 2 330e M Sport 184Bhp (A) [02/17-02/19]
- 7 × BMW 3-Series 2012 To 2019 4 Dr Sal 1.5 318i Luxury (F30) LCI 136Bhp (A) [11/15-02/19]
- 7 × BMW 3-Series 2012 To 2019 4 Dr Sal 2 320i Luxury (F30) N20 184Bhp (A) [09/12-10/15]
- 4 × BMW 3-Series 2012 To 2019 4 Dr Sal 2 330e Sport 184Bhp (A) [08/16-02/19]
- 4 × BMW 3-Series 2012 On 4 Dr Sal 1.50 318i Luxury (F30) LCI AUTO 136Bhp (A) [11/15-]
- 3 × BMW 3-Series 2023 On 4 Dr Sal 2 320i M Sport 184Bhp (A) [01/23-]
- 3 × BMW 3-Series 2020 On 4 Dr Sal 2 320i Sport 181Bhp (A) [01/20-]
- 3 × BMW 3-Series 2005 To 2012 4 Dr Sal 2 320i (E90) N46N 150Bhp (A) [11/08-02/12]

**TOYOTA CAMRY** — 74 cases, 27 variants
- 11 × TOYOTA Camry 2012 To 2018 4 Dr Sal 2 G (ACV51R-JEPEKEFL) 146Bhp (A) [06/12-03/15]
- 9 × TOYOTA Camry 2006 To 2009 4 Dr Sal 2.4 V (ACV40R-JEAGKE) 165Bhp (A) [10/06-08/09]
- 7 × TOYOTA Camry 2006 To 2009 4 Dr Sal 2 G (ACV41R-JEPEKE) 145Bhp (A) [10/06-08/09]
- 6 × TOYOTA Camry 2009 To 2012 4 Dr Sal 2 G (ACV41R-JEPEKE) 145Bhp (A) [09/09-05/12]
- 4 × TOYOTA Camry 2012 To 2018 4 Dr Sal 2.5 HYBRID (AVV50R-JEXGBE HS) 158Bhp [04/15-11/16]
- 4 × TOYOTA Camry 2009 To 2012 4 Dr Sal 2 E (ACV41R-JEPNKE) 145Bhp (A) [09/09-05/12]
- 3 × TOYOTA Camry 2012 To 2018 4 Dr Sal 2 G X(ASV51R-JETEHE QX) 165Bhp (A) [12/16-10/18]
- 3 × TOYOTA Camry 1994 To 2006 4 Dr Sal 2 E (ACV31R-JEPNKE) (A) [07/02-07/04]

**PROTON WIRA** — 73 cases, 29 variants
- 9 × PROTON Wira 1993 On 4 Dr Sal 1.5 GLi 86Bhp (A) [02/98-]
- 6 × PROTON Wira 1993 On 5 Dr Hatch 1.5 GLi Special Edition 86Bhp (M) [08/03-]
- 5 × PROTON Wira 1993 On 4 Dr Sal 1.5 GL 86Bhp (M) [09/95-]
- 5 × PROTON Wira 1993 On 5 Dr Hatch 1.5 GLi 86Bhp (M) [01/02-]
- 4 × PROTON Wira 1993 On 5 Dr Hatch 1.5 GLi 86Bhp (A) [02/98-]
- 4 × PROTON Wira 1993 On 5 Dr Hatch 1.3 GLi 81Bhp (M) [02/98-]
- 3 × PROTON Wira 1993 On 4 Dr Sal 1.3 GL 81Bhp (M) [09/95-]
- 3 × PROTON Wira 1993 On 4 Dr Sal 1.5 GL 86Bhp (A) [09/95-]

**MAZDA CX-5** — 72 cases, 30 variants
- 16 × MAZDA CX-5 2012 On 5 Dr SUV 2 2WD 153Bhp (A) [05/12-02/16]
- 9 × MAZDA CX-5 2019 To 2024 5 Dr SUV 2 SkyActiv-G (High) 162Bhp (A) [09/19-01/24]
- 7 × MAZDA CX-5 2012 On 5 Dr SUV 2.5 2WD 184Bhp (A) [03/14-01/16]
- 5 × MAZDA CX-5 2012 To 2017 5 Dr SUV 2 2WD 153Bhp (A) [05/12-02/16]
- 3 × MAZDA CX-5 2017 To 2018 5 Dr SUV 2 GLS SkyActiv-G (GVC) 162Bhp (A) [10/17-10/18]
- 3 × MAZDA CX-5 2017 On 5 Dr SUV 2 GLS SkyActiv-G (GVC) 162Bhp (A) [10/17-]
- 3 × MAZDA CX-5 2012 On 5 Dr SUV 2.00 2WD AUTO 153Bhp (A) [05/12-02/16]
- 2 × MAZDA CX-5 2012 To 2017 5 Dr SUV 2 GL SkyActiv-G 153Bhp (A) [02/16-09/17]

**HONDA CR-V** — 69 cases, 22 variants
- 10 × HONDA CR-V 2013 To 2015 5 Dr SUV 2 i-VTEC 153Bhp (A) [03/13-01/15]
- 6 × HONDA CR-V 2017 To 2020 5 Dr SUV 1.5 1.5TC-P 2WD 190Bhp [07/17-11/20]
- 5 × HONDA CR-V 2017 To 2020 5 Dr SUV 2 2.0 2WD 153Bhp [07/17-11/20]
- 5 × HONDA CR-V 2007 To 2013 5 Dr SUV 2 i-VTEC 148Bhp (A) [03/10-02/13]
- 5 × HONDA CR-V 2017 To 2020 5 Dr SUV 1.5 1.5TC 2WD 190Bhp [07/17-11/20]
- 5 × HONDA CR-V 2007 To 2013 5 Dr SUV 2 i-VTEC 148Bhp (A) [03/07-02/10]
- 4 × HONDA CR-V 2015 To 2017 5 Dr SUV 2 2WD i-VTEC 153Bhp (A) [02/15-06/17]
- 4 × HONDA CR-V 2020 To 2023 5 Dr SUV 2 2.0 2WD 153Bhp [11/20-12/23]

**MERCEDES-BENZ C-CLASS** — 69 cases, 32 variants
- 9 × MERCEDES-BENZ C-Class 2014 On 4 Dr Sal 2 C200 Avantgarde (W205) 184Bhp (A) [04/15-10/18]
- 6 × MERCEDES-BENZ C-Class 2018 On 4 Dr Sal 1.5 C200 Avantgarde 184Bhp (A) [11/18-]
- 5 × MERCEDES-BENZ C-Class 2007 On 4 Dr Sal 1.8 C200K Avantgarde (W204) 181Bhp (A) [11/07-]
- 5 × MERCEDES-BENZ C-Class 2014 On 4 Dr Sal 2 C200 Avantgarde (W205) 184Bhp (A) [04/15-]
- 4 × MERCEDES-BENZ C-Class 2018 On 4 Dr Sal 2 C300 AMG Line 258Bhp (A) [11/18-]
- 3 × MERCEDES-BENZ C-Class 2007 On 4 Dr Sal 1.8 C250CGI BlueEfficiency (W204) 201Bhp (A) [03/10-06/11]
- 3 × MERCEDES-BENZ C-Class 2007 On 4 Dr Sal 1.8 C200CGI BlueEfficiency-Avantgarde (W204) 181Bhp (A) [03/10-06/11]
- 2 × MERCEDES-BENZ C-Class 2018 On 2 Dr Coupe 1.5 C200 AMG Line 184Bhp (A) [11/18-]

**HONDA ACCORD** — 68 cases, 28 variants
- 13 × HONDA Accord 2013 On 4 Dr Sal 2 VTi-L 153Bhp (A) [09/13-08/16]
- 7 × HONDA Accord 2007 On 4 Dr Sal 2 VTi 154Bhp (A) [04/08-02/11]
- 6 × HONDA Accord 2007 On 4 Dr Sal 2.4 VTi-L 178Bhp (A) [03/11-08/13]
- 4 × HONDA Accord 2003 On 4 Dr Sal 2.4 VTi-L 158Bhp (A) [11/03-06/06]
- 4 × HONDA Accord 2007 On 4 Dr Sal 2.00 VTi AUTO 154Bhp (A) [04/08-02/11]
- 3 × HONDA Accord 2007 On 4 Dr Sal 2 VTi-L 154Bhp (A) [07/09-02/11]
- 3 × HONDA Accord 2006 On 4 Dr Sal 2 VTi 148Bhp (A) [07/06-03/08]
- 3 × HONDA Accord 2013 On 4 Dr Sal 2.4 VTi-L 173Bhp (A) [09/13-08/16]

**TOYOTA AVANZA** — 66 cases, 23 variants
- 11 × TOYOTA Avanza 2004 On MPV 1.3 89Bhp (A) [10/04-09/06]
- 6 × TOYOTA Avanza 2012 On MPV 1.5 G (F654RM-GQMFMKX) 104Bhp (A) [10/15-]
- 5 × TOYOTA Avanza 2012 On MPV 1.5 G (F652RM-GQMFM) 102Bhp (A) [01/12-09/15]
- 5 × TOYOTA Avanza 2004 On MPV 1.30 AUTO 89Bhp (A) [10/04-09/06]
- 4 × TOYOTA Avanza 2004 On MPV 1.3 E 91Bhp (M) [10/06-09/08]
- 4 × TOYOTA Avanza 2012 On MPV 1.50 G (F652RM-GQMFM) AUTO 102Bhp (A) [01/12-09/15]
- 3 × TOYOTA Avanza 2004 On MPV 1.3 89Bhp (M) [10/04-09/06]
- 3 × TOYOTA Avanza 2004 On MPV 1.5 G 108Bhp (A) [10/08-11/10]

**TOYOTA INNOVA** — 63 cases, 19 variants
- 11 × TOYOTA Innova 2016 On MPV 2 G (TGN140R-METMKEEL) 137Bhp (A) [12/16-02/21]
- 9 × TOYOTA Innova 2005 On MPV 2 G 134Bhp (A) [05/05-09/08]
- 5 × TOYOTA Innova 2005 On MPV 2 E 134Bhp (A) [10/11-03/14]
- 5 × TOYOTA Innova 2005 On MPV 2 E 134Bhp (A) [04/14-11/16]
- 5 × TOYOTA Innova 2005 On MPV 2 G 134Bhp (A) [10/11-03/14]
- 4 × TOYOTA Innova 2016 On MPV 2 X (TGN140R-METHKE SM) 137Bhp (A) [10/17-02/21]
- 4 × TOYOTA Innova 2005 On MPV 2 G 134Bhp (A) [10/08-09/11]
- 3 × TOYOTA Innova 2005 On MPV 2 E 134Bhp (M) [05/05-09/08]

**TOYOTA HARRIER** — 63 cases, 16 variants
- 18 × TOYOTA HARRIER 5 DR SUV 2.0 DBA-ZSU60W (A)
- 10 × TOYOTA HARRIER 5 DR SUV 2.4 CBA-ACU30W (A)
- 9 × TOYOTA HARRIER 5 DR SUV 2.4 ACU30 (A)
- 8 × TOYOTA Harrier 2018 To 2021 5 Dr SUV 2 2.0T Luxury (ASU60R-ANTGT GT) 227Bhp (A) [01/18-04/21]
- 3 × TOYOTA Harrier 2021 On 5 Dr SUV 2 2.0 Luxury (MXUA80R ANXSB) 171Bhp [04/21-]
- 2 × TOYOTA Harrier 2018 To 2021 5 Dr SUV 2 2.0T Premium (ASU60R-ANTMT MT) 227Bhp (A) [01/18-04/21]
- 2 × TOYOTA HARRIER 5 DR SUV 2.4 TA-ACU10W (A)
- 2 × TOYOTA HARRIER 5 DR SUV 2.4 UA-ACU30W (A)

**PROTON EXORA** — 58 cases, 26 variants
- 7 × PROTON Exora 2009 On MPV 1.6 Bold Executive (CPS) 125Bhp (A) [01/12-01/15]
- 6 × PROTON Exora 2009 On MPV 1.6 Bold Premium (CFE) 138Bhp (A) [01/12-01/15]
- 5 × PROTON Exora 2009 On MPV 1.6 Premium CVT (RC) 138Bhp [05/19-08/22]
- 5 × PROTON Exora 2009 On MPV 1.6 Bold Standard (CFE) 138Bhp (A) [01/13-01/15]
- 3 × PROTON Exora 2009 On MPV 1.6 Bold Premium (CFE) 138Bhp (A) [02/15-06/17]
- 3 × PROTON Exora 2009 On MPV 1.60 High Line AUTO 125Bhp (A) [07/10-12/11]
- 2 × PROTON Exora 2022 On MPV 1.6 Premium CVT 138Bhp [08/22-]
- 2 × PROTON Exora 2009 On MPV 1.6 Executive CVT (RC) 138Bhp [05/19-08/22]

**PERODUA ARUZ** — 53 cases, 11 variants
- 15 × PERODUA Aruz 2019 On 5 Dr SUV 1.5 1.5 AV 104Bhp (A) [01/19-]
- 12 × PERODUA Aruz 2019 To 2021 5 Dr SUV 1.5 1.5 AV 104Bhp (A) [01/19-05/21]
- 9 × PERODUA Aruz 2021 On 5 Dr SUV 1.5 1.5 AV 101Bhp (A) [05/21-]
- 5 × PERODUA Aruz 2021 To 2025 5 Dr SUV 1.5 1.5 AV 101Bhp (A) [05/21-08/25]
- 3 × PERODUA Aruz 2019 To 2021 5 Dr SUV 1.5 1.5 X 104Bhp (A) [01/19-05/21]
- 2 × PERODUA Aruz 2021 On 5 Dr SUV 1.5 1.5 X 101Bhp (A) [05/21-]
- 2 × PERODUA Aruz 2019 On 5 Dr SUV 1.50 1.5 AV AUTO 104Bhp (A) [01/19-]
- 2 × PERODUA Aruz 2021 On 5 Dr SUV 1.50 1.5 AV AUTO 101Bhp (A) [05/21-]

**TOYOTA YARIS** — 50 cases, 15 variants
- 14 × TOYOTA Yaris 2020 On 5 Dr Hatch 1.5 G (NSP151R-BHXGKE ZS) 105Bhp [12/20-05/23]
- 9 × TOYOTA Yaris 2019 To 2020 5 Dr Hatch 1.5 E (NSP151R-BHXRKE YR) 105Bhp [04/19-12/20]
- 5 × TOYOTA Yaris 2020 On 5 Dr Hatch 1.5 E (NSP151R-BHXRKE ZR) 105Bhp [12/20-05/23]
- 5 × TOYOTA Yaris 2023 On 5 Dr Hatch 1.5 G (NSP151R-BHXGKE 2B) 105Bhp [05/23-]
- 3 × TOYOTA Yaris 2019 To 2020 5 Dr Hatch 1.5 G (NSP151R-BHXGKE YS) 105Bhp [04/19-12/20]
- 3 × TOYOTA Yaris 2019 On 5 Dr Hatch 1.50 E (NSP151R-BHXRKE YR) 105Bhp [04/19-12/20]
- 2 × TOYOTA Yaris 2020 On 5 Dr Hatch 1.5 E (NSP151R-BHXRKE ZR) 105Bhp [12/20-]
- 2 × TOYOTA Yaris 2019 On 5 Dr Hatch 1.50 G (NSP151R-BHXGKE YS) 105Bhp [04/19-12/20]

**FORD RANGER** — 45 cases, 32 variants
- 4 × FORD Ranger 2012 To 2013 4 Dr Pickup Dbl.Cab 2.2 XLT 4X4 148Bhp (A) [06/12-09/15]
- 3 × FORD Ranger 2015 To 2018 4 Dr Pickup Dbl.Cab 2.2 XLT 4X4 158Bhp (A) [10/15-]
- 3 × FORD Ranger 2019 On 4 Dr Pickup Dbl.Cab 2 XLT Plus 178Bhp (A) [09/20-07/22]
- 2 × FORD Ranger 2018 To 2019 4 Dr Pickup Dbl.Cab 2 Bi-Turbo WildTrak 4X4 210Bhp (A) [10/18-]
- 2 × FORD Ranger 2022 On 4 Dr Pickup Dbl.Cab 2 XLT Plus 207Bhp (A) [07/22-]
- 2 × FORD Ranger 2012 To 2013 4 Dr Pickup Dbl.Cab 3.2 WILDTRAK 4X4 197Bhp (A) [06/12-09/15]
- 2 × FORD Ranger 2015 To 2018 4 Dr Pickup Dbl.Cab 2.2 WILDTRAK 4X4 158Bhp (A) [04/18-]
- 2 × FORD Ranger 2019 On 4 Dr Pickup Dbl.Cab 2 Wildtrak 2.0 EcoBlue 210Bhp (A) [08/20-]

**BMW 5-SERIES** — 45 cases, 25 variants
- 10 × BMW 5-Series 2010 To 2017 4 Dr Sal 2.5 523i (F10) N52 204Bhp (A) [05/10-03/17]
- 4 × BMW 5-Series 2010 To 2017 4 Dr Sal 3 528i (F10) N52B30 258Bhp (A) [10/10-09/13]
- 3 × BMW 5-Series PHEV 2017 To 2019 4 Dr Sal 2 530e Sport (G30) 181Bhp (A) [01/18-04/19]
- 3 × BMW 5-Series 2003 To 2010 4 Dr Sal 2.5 525i Sports (E60) N52B25 215Bhp (A) [08/07-04/10]
- 3 × BMW 5-Series 2010 To 2017 4 Dr Sal 2 520i (F10) 184Bhp (A) [10/13-03/17]
- 2 × BMW 5-Series 2017 To 2019 4 Dr Sal 2 530i M Sport (G30) 252Bhp (A) [04/17-04/19]
- 2 × BMW 5-Series 2010 To 2017 4 Dr Sal 2 520d (F10) N47D20 184Bhp (A) [03/11-09/13]
- 1 × BMW 5-Series PHEV 2019 On 4 Dr Sal 2 530e M Sport 181Bhp (A) [04/19-]

**PROTON WAJA** — 44 cases, 11 variants
- 23 × PROTON Waja 2000 On 4 Dr Sal 1.6 (CF1) 102Bhp (A) [08/00-12/05]
- 6 × PROTON Waja 2000 On 4 Dr Sal 1.6 (CF1) 102Bhp (M) [08/00-12/05]
- 3 × PROTON Waja 2000 On 4 Dr Sal 1.6 Enhanced Version 102Bhp (A) [06/04-12/05]
- 3 × PROTON Waja 2000 On 4 Dr Sal 1.6 CPS 125Bhp (A) [02/08-]
- 2 × PROTON Waja 2000 On 4 Dr Sal 1.6 CAMPRO 108Bhp (A) [01/07-]
- 2 × PROTON Waja 2000 On 4 Dr Sal 1.60 (CF1) AUTO 102Bhp (A) [08/00-12/05]
- 1 × PROTON Waja 2000 On 4 Dr Sal 1.6 CPS 125Bhp (M) [02/08-]
- 1 × PROTON Waja 2000 On 4 Dr Sal 1.6 X (CF1) 102Bhp (A) [10/01-12/05]

**NISSAN X-TRAIL** — 44 cases, 14 variants
- 18 × NISSAN X-Trail 2015 On 5 Dr SUV 2 2WD (T32) 142Bhp (A) [02/15-]
- 4 × NISSAN X-Trail 2010 On 5 Dr SUV 2 137Bhp (A) [04/13-01/15]
- 3 × NISSAN X-Trail 2015 On 5 Dr SUV 2.5 4WD (T32) 169Bhp (A) [02/15-]
- 3 × NISSAN X-Trail 2005 On 5 Dr SUV 2 146Bhp (A) [04/05-03/07]
- 2 × NISSAN X-Trail 2003 On 5 Dr SUV 2 146Bhp (A) [06/03-03/05]
- 2 × NISSAN X-Trail 2010 On 5 Dr SUV 2 137Bhp (A) [08/10-03/13]
- 2 × NISSAN X-Trail 2019 On 5 Dr SUV 2.5 2.5L 4WD 169Bhp [04/19-]
- 2 × NISSAN X-Trail 2005 On 5 Dr SUV 2 146Bhp (A) [04/07-07/10]

**MERCEDES-BENZ E-CLASS** — 44 cases, 29 variants
- 7 × MERCEDES-BENZ E-Class 2009 On 4 Dr Sal 2 E250 Avantgarde (W212) 211Bhp (A) [08/13-05/16]
- 5 × MERCEDES-BENZ E-Class 2009 On 4 Dr Sal 2 E200 Avantgarde (W212) 184Bhp (A) [08/13-05/16]
- 2 × MERCEDES-BENZ E-Class 2009 On 4 Dr Sal 1.8 E200CGI BlueEfficiency - Elegance (W212) 181Bhp (A) [11/09-07/13]
- 2 × MERCEDES-BENZ E-Class 2017 On 2 Dr Coupe 2 E200 AMG Line 184Bhp (A) [07/17-]
- 2 × MERCEDES-BENZ E-Class 2016 On 4 Dr Sal 2 E250 Avantgarde (W213) 211Bhp (A) [06/16-]
- 2 × MERCEDES-BENZ E-Class 2009 On 4 Dr Sal 2.00 E200 Avantgarde (W212) AUTO 184Bhp (A) [08/13-05/16]
- 2 × MERCEDES-BENZ E-Class 2009 On 2 Dr Coupe 1.80 E250 Sport BlueEfficiency (C207) AUTO 204Bhp (A) [06/09-02/14]
- 1 × MERCEDES-BENZ E-Class 2017 On 2 Dr Coupe 2 E300 AMG Line 245Bhp (A) [07/17-]

**PERODUA KELISA** — 43 cases, 14 variants
- 9 × PERODUA Kelisa 2001 On 5 Dr Hatch 1 EZ 54Bhp (A) [10/03-]
- 9 × PERODUA Kelisa 2001 On 5 Dr Hatch 1 EZ 54Bhp (A) [08/01-09/03]
- 5 × PERODUA Kelisa 2001 On 5 Dr Hatch 1 GX 54Bhp (M) [08/01-09/03]
- 4 × PERODUA Kelisa 2001 On 5 Dr Hatch 1 GX 54Bhp (M) [10/03-]
- 4 × PERODUA Kelisa 2001 On 5 Dr Hatch 1 EZ Limited Edition 54Bhp (A) [04/04-]
- 2 × PERODUA Kelisa 2001 On 5 Dr Hatch 1 EZ Special Edition 54Bhp (A) [04/04-]
- 2 × PERODUA Kelisa 2001 On 5 Dr Hatch 1.00 EZ AUTO 54Bhp (A) [10/03-]
- 2 × PERODUA Kelisa 2001 On 5 Dr Hatch 1.00 EZ AUTO 54Bhp (A) [08/01-09/03]

**PROTON X50** — 43 cases, 9 variants
- 11 × PROTON X50 2020 To 2024 5 Dr SUV 1.5 1.5T Premium 148Bhp [10/20-06/24]
- 9 × PROTON X50 2020 To 2024 5 Dr SUV 1.5 1.5 TGDi Flagship 175Bhp [10/20-06/24]
- 8 × PROTON X50 2020 To 2024 5 Dr SUV 1.5 1.5T Executive 148Bhp [10/20-06/24]
- 5 × PROTON X50 2020 On 5 Dr SUV 1.5 1.5 TGDi Flagship 175Bhp [10/20-]
- 3 × PROTON X50 2020 To 2024 5 Dr SUV 1.5 1.5T Standard 148Bhp [10/20-06/24]
- 3 × PROTON X50 2020 On 5 Dr SUV 1.5 1.5T Premium 148Bhp [10/20-]
- 2 × PROTON X50 2024 To 2025 5 Dr SUV 1.5 1.5T Executive 148Bhp [06/24-07/25]
- 1 × PROTON X50 2024 To 2025 5 Dr SUV 1.5 1.5 TGDi Flagship 175Bhp [06/24-07/25]

**NISSAN GRAND** — 42 cases, 11 variants
- 12 × NISSAN Grand Livina 2007 On MPV 1.6 104Bhp (A) [12/07-05/11]
- 9 × NISSAN Grand Livina 2007 On MPV 1.8 124Bhp (A) [12/07-05/11]
- 5 × NISSAN Grand Livina 2007 On MPV 1.6 104Bhp (A) [06/11-08/13]
- 3 × NISSAN Grand Livina 2007 On MPV 1.8 124Bhp (A) [06/11-08/13]
- 3 × NISSAN Grand Livina 2007 On MPV 1.60 AUTO 104Bhp (A) [09/13-]
- 2 × NISSAN Grand Livina 2007 On MPV 1.6 104Bhp (A) [09/13-]
- 2 × NISSAN Grand Livina 2007 On MPV 1.8 124Bhp (A) [09/13-]
- 2 × NISSAN Grand Livina 2007 On MPV 1.60 AUTO 104Bhp (A) [06/11-08/13]

**PERODUA ATIVA** — 42 cases, 3 variants
- 31 × PERODUA Ativa 2021 On 5 Dr SUV 1 1.0 AV 97Bhp [03/21-]
- 8 × PERODUA Ativa 2021 On 5 Dr SUV 1 1.0 H 97Bhp [03/21-]
- 3 × PERODUA Ativa 2021 On 5 Dr SUV 1 1.0 X 97Bhp [03/21-]

**PROTON IRIZ** — 38 cases, 20 variants
- 4 × PROTON Iriz 2014 To 2021 5 Dr Hatch 1.6 PREMIUM 107Bhp (A) [09/14-05/17]
- 3 × PROTON Iriz 2014 To 2021 5 Dr Hatch 1.3 Standard 94Bhp (A) [09/14-05/17]
- 3 × PROTON Iriz 2014 To 2021 5 Dr Hatch 1.6 E 107Bhp (A) [09/14-05/17]
- 3 × PROTON Iriz 2014 To 2021 5 Dr Hatch 1.6 Premium 107Bhp [04/19-]
- 3 × PROTON Iriz 2021 On 5 Dr Hatch 1.6 Executive 107Bhp [08/21-]
- 3 × PROTON Iriz 2014 To 2021 5 Dr Hatch 1.6 PREMIUM 107Bhp [06/17-03/19]
- 3 × PROTON Iriz 2014 To 2021 5 Dr Hatch 1.3 Executive 94Bhp [04/19-]
- 2 × PROTON Iriz 2014 To 2021 5 Dr Hatch 1.6 Executive 107Bhp [04/19-]

**PROTON X70** — 35 cases, 13 variants
- 9 × PROTON X70 2018 On 5 Dr SUV 1.8 TGDI Premium 182Bhp (A) [12/18-]
- 6 × PROTON X70 2020 On 5 Dr SUV 1.8 TGDI Premium 181Bhp [02/20-]
- 5 × PROTON X70 2018 On 5 Dr SUV 1.8 TGDI Executive (2WD) 182Bhp (A) [12/18-]
- 4 × PROTON X70 2020 On 5 Dr SUV 1.8 TGDI Executive 181Bhp [02/20-]
- 2 × PROTON X70 2020 On 5 Dr SUV 1.8 TGDI Premium X 181Bhp [02/20-]
- 2 × PROTON X70 2020 On 5 Dr SUV 1.80 TGDI Executive 181Bhp [02/20-]
- 1 × PROTON X70 2020 On 5 Dr SUV 1.8 TGDI Standard 181Bhp [02/20-]
- 1 × PROTON X70 2022 To 2024 5 Dr SUV 1.5 TGDI Executive (2WD) 175Bhp [06/22-08/24]

**PROTON PREVE** — 34 cases, 5 variants
- 15 × PROTON Preve 2012 On 4 Dr Sal 1.6 Executive 108Bhp (A) [04/12-03/18]
- 8 × PROTON Preve 2012 On 4 Dr Sal 1.6 Premium (CFE) 138Bhp (A) [04/12-03/18]
- 5 × PROTON Preve 2012 On 4 Dr Sal 1.6 Executive (CVT) 138Bhp [04/18-]
- 5 × PROTON Preve 2012 On 4 Dr Sal 1.60 Premium (CFE) AUTO 138Bhp (A) [04/12-03/18]
- 1 × PROTON Preve 2012 On 4 Dr Sal 1.60 Executive AUTO 108Bhp (A) [04/12-03/18]

**MAZDA 2** — 34 cases, 19 variants
- 6 × MAZDA 2 2015 To 2020 4 Dr Sal 1.5 SkyActiv-G 114Bhp (A) [02/15-03/16]
- 4 × MAZDA 2 2010 On 4 Dr Sal 1.5 V 103Bhp (A) [04/10-01/15]
- 3 × MAZDA 2 2010 To 2015 4 Dr Sal 1.5 R 103Bhp (A) [04/10-01/15]
- 3 × MAZDA 2 2015 To 2020 4 Dr Sal 1.5 SkyActiv-G (High) 114Bhp (A) [09/17-03/20]
- 2 × MAZDA 2 2015 On 4 Dr Sal 1.5 SkyActiv-G 114Bhp (A) [02/15-03/16]
- 2 × MAZDA 2 2015 On 5 Dr Hatch 1.5 SkyActiv-G 114Bhp (A) [02/15-03/16]
- 2 × MAZDA 2 2010 On 4 Dr Sal 1.50 V AUTO 103Bhp (A) [04/10-01/15]
- 1 × MAZDA 2 2015 To 2020 4 Dr Sal 1.5 SkyActiv-G 114Bhp (A) [03/16-08/17]

**HONDA BR-V** — 33 cases, 6 variants
- 19 × HONDA BR-V 2017 On 5 Dr SUV 1.5 V 119Bhp [01/17-]
- 4 × HONDA BR-V 2020 On 5 Dr SUV 1.5 E 119Bhp [06/20-]
- 4 × HONDA BR-V 2020 On 5 Dr SUV 1.5 V 119Bhp [06/20-]
- 3 × HONDA BR-V 2017 On 5 Dr SUV 1.50 V 119Bhp [01/17-]
- 2 × HONDA BR-V 2020 On 5 Dr SUV 1.50 V 119Bhp [06/20-]
- 1 × HONDA BR-V 2020 On 5 Dr SUV 1.50 E 119Bhp [06/20-]

**MITSUBISHI TRITON** — 33 cases, 21 variants
- 4 × MITSUBISHI Triton 2006 To 2015 4 Dr Pickup Dbl.Cab 2.5 VGT 176Bhp (A) [03/12-02/14]
- 3 × MITSUBISHI Triton 2021 On 4 Dr Pickup Dbl.Cab 2.4 VGT Athlete 178Bhp (A) [04/21-]
- 2 × MITSUBISHI Triton 2006 To 2015 4 Dr Pickup Dbl.Cab 2.5 134Bhp (A) [11/06-08/09]
- 2 × MITSUBISHI Triton 2019 To 2024 4 Dr Pickup Dbl.Cab 2.4 VGT 178Bhp (A) [01/19-10/24]
- 2 × MITSUBISHI Triton 2015 To 2019 4 Dr Pickup Dbl.Cab 2.4 VGT 179Bhp (A) [09/16-01/19]
- 2 × MITSUBISHI Triton 2015 To 2019 4 Dr Pickup Dbl.Cab 2.4 VGT Adventure X 179Bhp (A) [09/16-01/19]
- 2 × MITSUBISHI Triton 2019 On 4 Dr Pickup Dbl.Cab 2.5 Quest 107Bhp (M) [11/19-]
- 2 × MITSUBISHI Triton 2015 On Dr Pickup Dbl.Cab 2.40 TD VGT GL AUTO 179Bhp (A) [09/17-]

**TOYOTA HIACE** — 32 cases, 14 variants
- 10 × TOYOTA Hiace 2006 On Van 2.5 (KDH200R-RBMDYE) 101Bhp (M) [01/14-]
- 6 × TOYOTA Hiace 2006 On Van 2.5 (KDH200R-RBMDYE) 101Bhp (M) [09/10-12/13]
- 3 × TOYOTA Hiace 2006 On Van 2.5 High Roof (KDH202R-EDMDYE) 101Bhp (M) [01/06-08/10]
- 2 × TOYOTA Hiace 1996 On Van 2.4 LH112R-RBMRS (M) [01/96-12/05]
- 2 × TOYOTA Hiace 2006 On Van 2.50 TD (KDH200R-RBMDYE) 101Bhp (M) [01/14-]
- 1 × TOYOTA HIACE PANEL VAN 2.5 D Facelift (M) [15-]
- 1 × TOYOTA Hiace 2006 On Van 2.7 VVTi - High Roof (TRH203R-EDMDKE) 149Bhp (M) [01/14-]
- 1 × TOYOTA Hiace 2006 On Van 2.7 VVTi - High Roof (TRH203R-EDMDKE) 149Bhp (M) [09/10-12/13]

**NISSAN SERENA** — 31 cases, 13 variants
- 6 × NISSAN Serena 2018 To 2022 MPV 2 S-Hybrid Highway Star (C27) 148Bhp [05/18-07/22]
- 5 × NISSAN Serena 2011 To 2018 MPV 2 S-Hybrid Highway Star 143Bhp [11/14-04/18]
- 4 × NISSAN Serena 2018 To 2022 MPV 2 S-Hybrid Premium Highway Star (C27) 148Bhp [05/18-07/22]
- 3 × NISSAN Serena 2011 On MPV 2 S-Hybrid Highway Star 143Bhp [11/14-04/18]
- 2 × NISSAN Serena 2011 To 2018 MPV 2 S-Hybrid (C26) 145Bhp (A) [07/13-10/14]
- 2 × NISSAN Serena 2011 To 2018 MPV 2 (C26) 145Bhp (A) [01/11-06/13]
- 2 × NISSAN Serena 2018 On MPV 2 S-Hybrid Highway Star (C27) 148Bhp [05/18-]
- 2 × NISSAN Serena 2011 On MPV 2.00 S-Hyrid Premium Highway Star 143Bhp [11/14-04/18]

**TOYOTA ESTIMA** — 31 cases, 12 variants
- 5 × TOYOTA Estima (Grey Import) MPV 2.4 ACR50W-GFXEK [01/06-05/16]
- 5 × TOYOTA ESTIMA MPV 2.4 ACR50 (DBA-ACR50W) (A)
- 4 × TOYOTA ESTIMA MPV 2.4 ACR30W (A)
- 3 × TOYOTA Estima (Grey Import) MPV 2.4 ACR50W-GFXPK [05/06-10/19]
- 3 × TOYOTA Estima (Grey Import) MPV 2.4 ACR50W-GRXSK [01/06-10/19]
- 3 × TOYOTA ESTIMA MPV 2.4 DBA-ACR50W (A) [16-]
- 2 × TOYOTA Estima (Grey Import) MPV 2.4 ACR30W-MRSSK (A) [02/00-01/06]
- 2 × TOYOTA Estima (Grey Import) MPV 2.4 ACR30W-MFSQK (A) [02/00-01/06]

**TOYOTA WISH** — 30 cases, 9 variants
- 11 × TOYOTA WISH MPV 1.8 CBA-ZNE10G (A)
- 6 × TOYOTA WISH MPV 1.8 DBA-ZGE20G (A)
- 4 × TOYOTA WISH MPV 1.8 DBA-ZGE20W (A) [09-]
- 3 × TOYOTA WISH MPV 1.8 DBA-ZNE10G (A)
- 2 × TOYOTA WISH MPV 2.0 ANE11R-JPPQKT (A)
- 1 × TOYOTA WISH MPV 2.0 S (A) [06-]
- 1 × TOYOTA WISH MPV 2.0 DBA-ANE10G (A)
- 1 × TOYOTA Wish ZNE10 1.8 (A)

**MAZDA 3** — 28 cases, 22 variants
- 3 × MAZDA 3 2011 On 4 Dr Sal 2 GLS 145Bhp (A) [09/12-03/14]
- 2 × MAZDA 3 2019 To 2022 5 Dr Hatch 2 SkyActiv-G (High Plus) 162Bhp (A) [07/19-10/23]
- 2 × MAZDA 3 2006 To 2012 4 Dr Sal 1.6 104Bhp (A) [11/06-05/09]
- 2 × MAZDA 3 2014 To 2019 4 Dr Sal 2 SkyActiv-G 162Bhp (A) [04/14-03/17]
- 2 × MAZDA 3 2006 On 4 Dr Sal 1.6 104Bhp (A) [06/09-08/12]
- 1 × MAZDA 3 2022 To 2025 4 Dr Sal 2 High Plus 162Bhp (A) [10/23-]
- 1 × MAZDA 3 2022 To 2025 5 Dr Hatch 2 High Plus 162Bhp (A) [10/23-]
- 1 × MAZDA 3 2019 To 2022 5 Dr Hatch 1.5 SkyActiv-G 118Bhp (A) [07/19-10/23]

**NISSAN SYLPHY** — 26 cases, 6 variants
- 18 × NISSAN Sylphy 2008 On 4 Dr Sal 2 131Bhp (A) [06/08-02/12]
- 3 × NISSAN Sylphy 2008 On 4 Dr Sal 2 XV 131Bhp (A) [03/12-04/14]
- 2 × NISSAN Sylphy 2008 On 4 Dr Sal 2 XL 131Bhp (A) [03/12-04/14]
- 1 × NISSAN SYLPHY 4 DR SAL 2.0 (B17) (A)
- 1 × NISSAN Sylphy 2014 On 4 Dr Sal 1.8 E (B17) 129Bhp (A) [05/14-]
- 1 × NISSAN Sylphy 2008 On 4 Dr Sal 2.00 AUTO 131Bhp (A) [06/08-02/12]

**ISUZU D-MAX** — 26 cases, 22 variants
- 2 × ISUZU D-MAX 2021 To 2023 4 Dr Pickup Dbl.Cab 1.9 4X4 Premium 148Bhp (A) [04/21-]
- 2 × ISUZU D-MAX 2013 To 2019 4 Dr Pickup Dbl.Cab 3 V-Cross 4X4 AT 175Bhp (A) [10/16-08/19]
- 2 × ISUZU D-MAX 2021 On 4 Dr Pickup Dbl.Cab 1.9 4X2 Plus 148Bhp (A) [10/21-]
- 2 × ISUZU D-MAX 2013 To 2019 2 DR Pickup 2.5 4x4 MT 134Bhp (M) [05/13-09/16]
- 1 × ISUZU D-MAX 2021 To 2023 4 Dr Pickup Dbl.Cab 3 4X4 Premium 187Bhp (A) [04/21-]
- 1 × ISUZU D-MAX 2005 To 2013 4 Dr Pickup Dbl.Cab 3 Hi-DEF (4X4) 134Bhp (A) [09/08-]
- 1 × ISUZU D-MAX 2013 To 2019 4 Dr Pickup Dbl.Cab 2.5 4x4 AT 134Bhp (A) [10/16-08/19]
- 1 × ISUZU D-MAX 2013 To 2019 4 Dr Pickup Dbl.Cab 3 V-Cross 4X4 AT Z-Prestige 175Bhp (A) [10/16-08/19]

**SUBARU XV** — 25 cases, 9 variants
- 6 × SUBARU XV 2012 On 5 Dr SUV 2 2.0 148Bhp [12/12-12/15]
- 5 × SUBARU XV 2012 On 5 Dr SUV 2 2.0 STI 148Bhp [07/14-03/17]
- 5 × SUBARU XV 2019 On 5 Dr SUV 2 2.0i-P 154Bhp [05/19-]
- 3 × SUBARU XV 2017 On 5 Dr SUV 2 2.0i-P 154Bhp [11/17-]
- 2 × SUBARU XV 2012 On 5 Dr SUV 2 2.0i-Premium 148Bhp [01/16-]
- 1 × SUBARU XV 2012 On 5 Dr SUV 2 2.0i 148Bhp [01/16-]
- 1 × SUBARU XV 2019 On 5 Dr SUV 2 2.0i-P GT 154Bhp [05/19-]
- 1 × SUBARU XV 2019 On 5 Dr SUV 2 2.0i 154Bhp [05/19-]

**HYUNDAI ELANTRA** — 25 cases, 9 variants
- 16 × HYUNDAI Elantra 2019 To 2020 4 Dr Sal 2 Executive 150Bhp (A) [04/19-12/20]
- 2 × HYUNDAI Elantra 2015 To 2017 4 Dr Sal 1.6 Elegance 128Bhp (A) [03/15-05/17]
- 1 × HYUNDAI Elantra 2017 To 2019 4 Dr Sal 2 Executive 150Bhp (A) [06/17-]
- 1 × HYUNDAI Elantra 2001 To 2008 4 Dr Sal 1.8 GLS (A) [08/01-02/04]
- 1 × HYUNDAI Elantra 2015 To 2017 4 Dr Sal 1.6 Premium 128Bhp (A) [03/15-05/17]
- 1 × HYUNDAI Elantra 2017 To 2019 4 Dr Sal 1.6 Turbo 201Bhp [06/17-]
- 1 × HYUNDAI Elantra 2001 To 2008 4 Dr Sal 1.6 GLS [03/04-]
- 1 × HYUNDAI Elantra 2001 To 2008 4 Dr Sal 1.80 GLS AUTO (A) [08/01-02/04]

**PROTON ISWARA** — 25 cases, 12 variants
- 5 × PROTON Iswara 1992 On 5 Dr Hatch 1.3 S 83Bhp (M) [08/92-11/03]
- 4 × PROTON Iswara 1992 On 4 Dr Sal 1.5 S 90Bhp (M) [08/92-]
- 4 × PROTON Iswara 1992 On 4 Dr Sal 1.30 S 83Bhp (M) [08/92-]
- 2 × PROTON Iswara 1992 On 4 Dr Sal 1.5 i 90Bhp (A) [08/92-]
- 2 × PROTON Iswara 1992 On 5 Dr Hatch 1.30 LMST 83Bhp (M) [12/03-]
- 2 × PROTON Iswara 1992 On 5 Dr Hatch 1.30 Special Edition LMSS 83Bhp (M) [03/03-]
- 1 × PROTON Iswara 1992 On 5 Dr Hatch 1.3 LMST 83Bhp (M) [12/03-]
- 1 × PROTON Iswara 1992 On 5 Dr Hatch 1.3 Special Edition LMST 83Bhp (M) [04/06-]

**VOLKSWAGEN POLO** — 23 cases, 7 variants
- 7 × VOLKSWAGEN Polo 2010 On 4 Dr Sal 1.6 104Bhp (A) [04/12-04/16]
- 6 × VOLKSWAGEN Polo 2010 On 5 Dr Hatch 1.6 MPI (MK 5) 103Bhp (A) [05/15-]
- 5 × VOLKSWAGEN Polo 2010 On 5 Dr Hatch 1.2 TSI (MK 5) 104Bhp (A) [10/10-04/15]
- 2 × VOLKSWAGEN Polo 2018 On 5 Dr Hatch 1.6 MPI Comfortline Vienna 103Bhp (A) [08/18-]
- 1 × VOLKSWAGEN Polo 2010 On 5 Dr Hatch 1.4 GTI (MK 5) 178Bhp (A) [09/11-04/15]
- 1 × VOLKSWAGEN POLO SEDAN 4 DR SAL 1.6 MPI (CBU) (A) [12-]
- 1 × VOLKSWAGEN Polo 2010 On 4 Dr Sal 1.60 AUTO 104Bhp (A) [04/12-04/16]

**SUZUKI SWIFT** — 22 cases, 9 variants
- 7 × SUZUKI Swift 2005 On 5 Dr Hatch 1.5 102Bhp (A) [05/06-06/11]
- 4 × SUZUKI Swift 2011 On 5 Dr Hatch 1.4 GLX 94Bhp (A) [01/13-]
- 3 × SUZUKI Swift 2011 On 5 Dr Hatch 1.40 RR Limited Edition AUTO 94Bhp (A) [11/13-]
- 2 × SUZUKI Swift 2005 On 5 Dr Hatch 1.5 GLX 102Bhp (A) [07/11-12/12]
- 2 × SUZUKI Swift 2005 On 5 Dr Hatch 1.5 GX 102Bhp (A) [10/11-12/12]
- 1 × SUZUKI Swift 2011 On 5 Dr Hatch 1.4 RR Limited Edition 94Bhp (A) [11/13-]
- 1 × SUZUKI Swift 2005 On 5 Dr Hatch 1.5 102Bhp (A) [05/05-04/06]
- 1 × SUZUKI Swift 2011 On 5 Dr Hatch 1.40 GLX AUTO 94Bhp (A) [01/13-]

**PROTON INSPIRA** — 21 cases, 4 variants
- 11 × PROTON Inspira 2010 On 4 Dr Sal 2 E 150Bhp (A) [04/12-]
- 5 × PROTON Inspira 2010 On 4 Dr Sal 2 P 150Bhp (A) [11/10-]
- 3 × PROTON Inspira 2010 On 4 Dr Sal 1.8 E 140Bhp (A) [11/10-]
- 2 × PROTON Inspira 2010 On 4 Dr Sal 1.8 E 140Bhp (M) [11/10-]

**NISSAN SENTRA** — 18 cases, 11 variants
- 4 × NISSAN Sentra 1995 On 4 Dr Sal 1.6 SG (N16) 116Bhp (A) [10/05-]
- 3 × NISSAN Sentra 1995 On 4 Dr Sal 1.60 SG (N16) AUTO 116Bhp (A) [10/05-]
- 2 × NISSAN Sentra 1995 On 4 Dr Sal 1.6 SG (N16) 116Bhp (A) [09/03-09/05]
- 2 × NISSAN Sentra 1995 On 4 Dr Sal 1.6 SG (N16) 116Bhp (M) [10/05-]
- 1 × NISSAN Sentra 1995 On 4 Dr Sal 1.8 XG-L (N16) 126Bhp (A) [09/03-09/05]
- 1 × NISSAN Sentra 1995 On 4 Dr Sal 1.8 GXE (N16) 126Bhp (A) [11/00-08/03]
- 1 × NISSAN Sentra 1995 On 4 Dr Sal 1.6 XE (N16) 116Bhp (A) [11/00-08/03]
- 1 × NISSAN Sentra 1995 On 4 Dr Sal 1.60 SG (N16) AUTO 116Bhp (A) [09/03-09/05]

**PERODUA KENARI** — 17 cases, 9 variants
- 5 × PERODUA Kenari 2000 On Mini Van 1 EZ 54Bhp (A) [04/03-]
- 4 × PERODUA Kenari 2000 On Mini Van 1 EZ 54Bhp (A) [06/00-03/03]
- 2 × PERODUA Kenari 2000 On Mini Van 1 EZ AERO 54Bhp (A) [04/03-]
- 1 × PERODUA Kenari 2000 On Mini Van 1 GX 54Bhp (M) [06/00-03/03]
- 1 × PERODUA Kenari 2000 On Mini Van 1 GX AERO 54Bhp (M) [04/03-]
- 1 × PERODUA Kenari 2000 On Mini Van 1 GX 54Bhp (M) [04/03-]
- 1 × PERODUA Kenari 2000 On Mini Van 1.00 GX AERO 54Bhp (M) [04/03-]
- 1 × PERODUA Kenari 2000 On Mini Van 1.00 EZS AUTO 54Bhp (A) [04/03-]

**PERODUA KANCIL** — 17 cases, 8 variants
- 5 × PERODUA Kancil 1994 On 5 Dr Hatch 0.66 EX 660 31Bhp (M) [11/99-09/02]
- 3 × PERODUA Kancil 2002 On 5 Dr Hatch 0.66 EX 660 31Bhp (M) [10/02-]
- 3 × PERODUA Kancil 2002 On 5 Dr Hatch 0.85 EX 850 36Bhp (M) [10/02-]
- 2 × PERODUA Kancil 1994 On 5 Dr Hatch 0.85 EX 850 36Bhp (M) [11/99-09/02]
- 1 × PERODUA Kancil 1994 On 5 Dr Hatch 0.85 EX 850 36Bhp (M) [08/97-10/99]
- 1 × PERODUA Kancil 2002 On 5 Dr Hatch 0.85 EZi 850 49Bhp (A) [02/03-]
- 1 × PERODUA Kancil 1994 On 5 Dr Hatch 0.85 EZ 850 36Bhp (A) [08/97-10/99]
- 1 × PERODUA Kancil 1994 On 5 Dr Hatch 0.66 EZ 660 31Bhp (A) [01/95-07/97]

**TOYOTA PRIUS** — 17 cases, 7 variants
- 6 × TOYOTA Prius C 2012 On 5 Dr Hatch 1.5 HYBRID SYNERGY DRIVE (NHP10R) 100Bhp (A) [02/12-]
- 4 × TOYOTA Prius 2009 On 5 Dr Hatch 1.8 Luxury - HYBRID SYNERGY DRIVE (ZVW30R) 134Bhp (A) [02/12-]
- 3 × TOYOTA Prius 2009 On 5 Dr Hatch 1.8 HYBRID SYNERGY DRIVE (ZVW30R) 134Bhp (A) [08/09-01/12]
- 1 × TOYOTA Prius 2009 On 5 Dr Hatch 1.8 HYBRID SYNERGY DRIVE (ZVW30R) 134Bhp (A) [02/12-]
- 1 × TOYOTA Prius 2009 On 5 Dr Hatch 1.80 Luxury - HYBRID SYNERGY DRIVE (ZVW30R) AUTO 134Bhp (A) [02/12-]
- 1 × TOYOTA Prius 2009 On 5 Dr Hatch 1.80 HYBRID SYNERGY DRIVE (ZVW30R) AUTO 134Bhp (A) [08/09-01/12]
- 1 × TOYOTA Prius C 2012 On 5 Dr Hatch 1.50 HYBRID SYNERGY DRIVE (NHP10R) AUTO 100Bhp (A) [02/12-]

**NISSAN NAVARA** — 17 cases, 14 variants
- 4 × NISSAN Navara 2017 On 4 Dr Pickup Dbl.Cab 2.5 VL Plus 187Bhp (A) [08/18-]
- 1 × NISSAN Navara 2021 On 4 Dr Pickup Dbl.Cab 2.5 NP300 VL 2.5 (A) 187Bhp (A) [04/21-]
- 1 × NISSAN Navara 2017 On 4 Dr Pickup Dbl.Cab 2.5 SE 161Bhp (A) [12/17-]
- 1 × NISSAN Navara 2008 On 4 Dr Pickup Dbl.Cab 2.5 LE 172Bhp (A) [11/13-10/15]
- 1 × NISSAN Navara 2021 On 4 Dr Pickup Dbl.Cab 2.5 NP300 PRO-4X 2.5 (A) 187Bhp (A) [04/21-]
- 1 × NISSAN Navara 2017 On 4 Dr Pickup Dbl.Cab 2.5 VL 187Bhp (A) [12/17-]
- 1 × NISSAN Navara 2008 On 4 Dr Pickup Dbl.Cab 2.5 LE 172Bhp (A) [11/08-10/13]
- 1 × NISSAN Navara 2008 On 4 Dr Pickup Dbl.Cab 2.5 SE 172Bhp (M) [11/09-10/13]

**FORD FIESTA** — 15 cases, 7 variants
- 5 × FORD Fiesta 2010 On 5 Dr Hatch 1.6 S 118Bhp (A) [10/10-09/13]
- 4 × FORD Fiesta 2010 On 5 Dr Hatch 1.5 Sport 110Bhp (A) [10/13-]
- 2 × FORD Fiesta 2010 On 5 Dr Hatch 1 EcoBoost 123Bhp (A) [05/14-]
- 1 × FORD Fiesta 2010 On 4 Dr Sal 1.6 LX 118Bhp (A) [06/11-09/13]
- 1 × FORD FIESTA 5 DR HATCH 998cc Sport EcoBoost (Facelift) (A) [13-]
- 1 × FORD Fiesta 2010 On 5 Dr Hatch 1.4 LX 95Bhp (M) [10/10-09/13]
- 1 × FORD Fiesta 2010 On 5 Dr Hatch 1.50 Sport AUTO 110Bhp (A) [10/13-]

**KIA CERATO** — 15 cases, 7 variants
- 4 × KIA Cerato 2013 On 4 Dr Sal 1.6 SX 128Bhp (A) [07/13-11/16]
- 3 × KIA Cerato 2013 On 4 Dr Sal 2 L 160Bhp (A) [12/16-]
- 2 × KIA Cerato 2013 On 4 Dr Sal 1.6 SX 128Bhp (A) [12/16-]
- 2 × KIA Cerato 2013 On 4 Dr Sal 1.6 KX 128Bhp (A) [07/14-11/16]
- 2 × KIA CERATO 4 DR SAL 1.6 YD (A) [13-]
- 1 × KIA Cerato 2013 On 4 Dr Sal 2 L 159Bhp (A) [07/13-11/16]
- 1 × KIA Cerato 2013 On 4 Dr Sal 1.6 KX 128Bhp (A) [12/16-]

**BMW X1** — 15 cases, 8 variants
- 3 × BMW X1 2015 To 2019 5 Dr SUV 2 sDrive20i (F48) 192Bhp (A) [10/15-01/20]
- 3 × BMW X1 2010 On 5 Dr SUV 2 sDrive20i (E84) 184Bhp (A) [11/12-09/15]
- 3 × BMW X1 2015 On 5 Dr SUV 2 sDrive20i (F48) 192Bhp (A) [10/15-]
- 2 × BMW X1 2010 To 2015 5 Dr SUV 2 sDrive20i (E84) 184Bhp (A) [11/12-09/15]
- 1 × BMW X1 2010 To 2015 5 Dr SUV 2 sDrive18i (E84) 148Bhp (A) [06/10-10/12]
- 1 × BMW X1 2020 To 2023 5 Dr SUV 1.5 sDrive18i 138Bhp [07/20-10/23]
- 1 × BMW X1 2020 To 2023 5 Dr SUV 2 sDrive20i M Sport 189Bhp [01/20-10/23]
- 1 × BMW X1 5 DR SUV 2.0 sDrive20i xLine (U11) (A) [23-]

**TOYOTA FORTUNER** — 14 cases, 8 variants
- 3 × TOYOTA Fortuner 2005 On 5 Dr SUV 2.7 V (TGN51R NKPSKE) 158Bhp (A) [10/11-01/16]
- 3 × TOYOTA Fortuner 2016 On 5 Dr SUV 2.7 SRZ (TGN156R-SETMKE KR) 164Bhp (A) [09/17-02/21]
- 2 × TOYOTA Fortuner 2016 On 5 Dr SUV 2.4 2.4 (GUN155R-SETLHE KQ) 148Bhp (A) [09/17-02/21]
- 2 × TOYOTA Fortuner 2016 On 5 Dr SUV 2.7 SRZ (TGN156R-SETMKE CR) 164Bhp (A) [02/16-08/17]
- 1 × TOYOTA Fortuner 2005 On 5 Dr SUV 2.5 G (KUN50R-NKPDHE) 101Bhp (A) [10/08-09/11]
- 1 × TOYOTA Fortuner 2021 On 5 Dr SUV 2.7 SRZ (TGN156R-SETHKE B3) 164Bhp (A) [02/21-]
- 1 × TOYOTA Fortuner 2005 On 5 Dr SUV 2.7 V (TGN51R-NKPSKE) 158Bhp (A) [10/08-09/11]
- 1 × TOYOTA Fortuner 2016 On 5 Dr SUV 2.40 TD VRZ (GUN155R-SETLHE CQ) AUTO 148Bhp (A) [02/16-08/17]

**VOLKSWAGEN GOLF** — 14 cases, 11 variants
- 2 × VOLKSWAGEN Golf 2013 On 5 Dr Hatch 2 GTI (MK7) 217Bhp [08/13-02/16]
- 2 × VOLKSWAGEN Golf 2010 On 5 Dr Hatch 1.4 TSI (MK 6) 138Bhp (A) [10/10-02/13]
- 2 × VOLKSWAGEN GOLF 5 DR HATCH 2.0 GTI (MK 5) (A) [05-]
- 1 × VOLKSWAGEN GOLF 5 DR HATCH 2.0 GTI (MK 8) (A) [22-]
- 1 × VOLKSWAGEN Golf 2013 On 5 Dr Hatch 1.4 TSI Highline 148Bhp [03/16-]
- 1 × VOLKSWAGEN Golf 2013 On 5 Dr Hatch 2 R (Mk7.5) 287Bhp [03/18-]
- 1 × VOLKSWAGEN Golf 2013 On 5 Dr Hatch 2 GTI (Mk7.5) 227Bhp [03/18-]
- 1 × VOLKSWAGEN Golf 2013 On 5 Dr Hatch 1.4 TSI (MK7) Highline 148Bhp [03/13-02/16]

**NAZA FORTE** — 14 cases, 4 variants
- 8 × NAZA Forte 2009 On 4 Dr Sal 1.6 SX 124Bhp (A) [11/09-]
- 3 × NAZA Forte 2009 On 4 Dr Sal 2 SX 154Bhp (A) [11/09-]
- 2 × NAZA Forte 2009 On 4 Dr Sal 1.6 EX 124Bhp (A) [11/09-]
- 1 × NAZA Forte 2009 On 4 Dr Sal 2.00 SX AUTO 154Bhp (A) [11/09-]

**MITSUBISHI ASX** — 13 cases, 5 variants
- 5 × MITSUBISHI ASX 2010 On 5 Dr SUV 2 2WD GL 148Bhp [09/15-]
- 4 × MITSUBISHI ASX 2010 On 5 Dr SUV 2 2WD 148Bhp [02/14-]
- 2 × MITSUBISHI ASX 2010 On 5 Dr SUV 2 4WD 148Bhp [02/14-]
- 1 × MITSUBISHI ASX 2010 On 5 Dr SUV 2 148Bhp (A) [11/10-12/11]
- 1 × MITSUBISHI ASX 2010 On 5 Dr SUV 2.00 AUTO 148Bhp (A) [11/10-12/11]

**MERCEDES-BENZ GLA** — 13 cases, 6 variants
- 5 × MERCEDES-BENZ GLA 2014 On 5 Dr SUV 2 GLA 250 4MATIC (X156) 211Bhp [11/14-]
- 4 × MERCEDES-BENZ GLA 2014 On 5 Dr SUV 1.6 GLA 200 (X156) 156Bhp [11/14-]
- 1 × MERCEDES-BENZ GLA 45 AMG CROSSOVER 2.0 4MATIC (X156) (A) [14-]
- 1 × MERCEDES-BENZ GLA 180 5 DR SUV 1.6 AMG Line (X156) (A)
- 1 × MERCEDES-BENZ GLA 2014 On 5 Dr SUV 1.60 GLA 200 (X156) 156Bhp [11/14-]
- 1 × MERCEDES-BENZ GLA 180 CROSSOVER 1.6 X156 (A) [14-]

**MAZDA 6** — 13 cases, 12 variants
- 2 × MAZDA 6 2010 To 2013 4 Dr Sal 2.5 170Bhp (A) [07/10-02/13]
- 1 × MAZDA 6 2010 To 2013 4 Dr Sal 2 147Bhp (A) [07/10-02/13]
- 1 × MAZDA 6 2013 To 2018 4 Dr Sal 2 SkyActiv-G (GVC) 153Bhp (A) [02/17-07/18]
- 1 × MAZDA 6 2013 To 2018 5 Dr Estate 2.5 SkyActiv-G (Touring) 185Bhp (A) [04/15-01/17]
- 1 × MAZDA 6 2013 To 2018 4 Dr Sal 2 SkyActiv-G 153Bhp (A) [04/15-01/17]
- 1 × MAZDA 6 2013 To 2018 4 Dr Sal 2 153Bhp (A) [03/13-03/15]
- 1 × MAZDA 6 2013 To 2018 4 Dr Sal 2.5 185Bhp (A) [03/13-03/15]
- 1 × MAZDA 6 2013 To 2018 4 Dr Sal 2.00 SkyActiv-G AUTO 153Bhp (A) [04/15-01/17]

**HYUNDAI GRAND** — 12 cases, 9 variants
- 3 × HYUNDAI Grand Starex 2008 On MPV 2.5 Royale 168Bhp (A) [08/11-03/14]
- 2 × HYUNDAI Grand Starex 2020 On MPV 2.5 Executive Plus 168Bhp (A) [05/20-]
- 1 × HYUNDAI Grand Starex 2008 On MPV 2.5 Royale 168Bhp (A) [11/17-]
- 1 × HYUNDAI Grand Starex 2018 On MPV 2.5 Executive Plus 168Bhp (A) [11/18-05/20]
- 1 × HYUNDAI Grand Starex 2008 On MPV 2.5 168Bhp (A) [05/08-07/11]
- 1 × HYUNDAI Grand Starex 2008 On MPV 2.5 Royale 168Bhp (A) [04/14-10/17]
- 1 × HYUNDAI Grand Starex 2008 On MPV 2.5 Royale Premium 168Bhp (A) [11/17-]
- 1 × HYUNDAI Grand Starex 2008 On MPV 2.50 TD Royale AUTO 168Bhp (A) [04/14-10/17]

**TOYOTA RUSH** — 12 cases, 5 variants
- 4 × TOYOTA Rush 2018 On 5 Dr SUV 1.5 S (F850RE-GQQFMGM) 104Bhp (A) [10/18-]
- 4 × TOYOTA Rush 2008 On 5 Dr SUV 1.5 S (F700RE-GQMFM) 108Bhp (A) [01/08-11/10]
- 2 × TOYOTA Rush 2008 On 5 Dr SUV 1.5 G (F700RE-GQDFM) 108Bhp (A) [01/08-11/10]
- 1 × TOYOTA Rush 2008 On 5 Dr SUV 1.5 S (F700RE-GQMFM) 108Bhp (A) [12/10-04/15]
- 1 × TOYOTA Rush 2008 On 5 Dr SUV 1.5 G (F700RE-GQDFM) 108Bhp (A) [12/10-04/15]

**HONDA INSIGHT** — 12 cases, 4 variants
- 6 × HONDA Insight 2010 On 5 Dr Hatch 1.3 101Bhp (A) [12/10-02/12]
- 3 × HONDA Insight 2010 On 5 Dr Hatch 1.3 101Bhp (A) [03/12-]
- 2 × HONDA Insight 2010 On 5 Dr Hatch 1.30 AUTO 101Bhp (A) [03/12-]
- 1 × HONDA Insight 2010 On 5 Dr Hatch 1.30 AUTO 101Bhp (A) [12/10-02/12]

**TOYOTA UNSER** — 11 cases, 6 variants
- 3 × TOYOTA Unser 1998 On MPV 1.8 LGX (KF80R) 82Bhp (A) [01/03-12/05]
- 3 × TOYOTA Unser 1998 On MPV 1.8 GLi (KF80R) 82Bhp (M) [04/98-03/01]
- 2 × TOYOTA Unser 1998 On MPV 1.8 GLi (KF80R) 82Bhp (A) [04/01-12/02]
- 1 × TOYOTA Unser 1998 On MPV 1.8 LGX (KF80R) 82Bhp (M) [01/03-12/05]
- 1 × TOYOTA Unser 1998 On MPV 1.8 GLi (KF80R) 82Bhp (M) [04/01-12/02]
- 1 × TOYOTA Unser 1998 On MPV 1.80 GLi (KF80R) AUTO 82Bhp (A) [04/01-12/02]

**BMW X5** — 11 cases, 9 variants
- 2 × BMW X5 2016 To 2019 5 Dr SUV 2 xDrive40e M Sport (F15) 245Bhp (A) [06/16-07/19]
- 2 × BMW X5 Hybrid 2020 On 5 Dr SUV 3 xDrive45e M Sport 281Bhp (A) [06/20-]
- 1 × BMW X5 5 DR SUV 3.0 xDrive45e (G05) (A) [18-]
- 1 × BMW X5 PHEV 2020 On 5 Dr SUV 3 xDrive45e M Sport 281Bhp (A) [06/20-]
- 1 × BMW X5 5 DR SUV 3.0 xDrive35i (F15) (A) [14-]
- 1 × BMW X5 2016 On 5 Dr SUV 2 xDrive40e M Sport (F15) 245Bhp (A) [06/16-07/19]
- 1 × BMW X5 2007 On 5 Dr SUV 3 d (E70) 218Bhp (A) [05/07-]
- 1 × BMW X5 2007 On 5 Dr SUV 3 si (E70) 272Bhp (A) [05/07-]

**HYUNDAI SONATA** — 11 cases, 8 variants
- 3 × HYUNDAI Sonata 2006 To 2012 4 Dr Sal 2.4 YF 176Bhp (A) [07/10-12/12]
- 2 × HYUNDAI Sonata 2013 To 2020 4 Dr Sal 2 YF 164Bhp (A) [01/13-11/14]
- 1 × HYUNDAI Sonata 2002 To 2005 4 Dr Sal 2 GLS 131Bhp (A) [01/02-12/05]
- 1 × HYUNDAI Sonata 2013 To 2020 4 Dr Sal 2.4 YF 176Bhp (A) [01/13-11/14]
- 1 × HYUNDAI SONATA 4 DR SAL 1.8 Y3 (M)
- 1 × HYUNDAI Sonata 2006 To 2012 4 Dr Sal 2 NF 156Bhp (A) [01/07-06/10]
- 1 × HYUNDAI Sonata 2006 On 4 Dr Sal 2.00 YF AUTO 163Bhp (A) [07/10-12/12]
- 1 × HYUNDAI Sonata 2013 On 4 Dr Sal 2.40 YF AUTO 176Bhp (A) [01/13-11/14]

**LEXUS NX** — 11 cases, 8 variants
- 3 × LEXUS NX 2015 To 2017 5 Dr SUV 2 200t Luxury 235Bhp (A) [01/15-12/17]
- 2 × LEXUS NX 2018 On 5 Dr SUV 2 300 F Sport 235Bhp (A) [01/18-]
- 1 × LEXUS NX 2018 On 5 Dr SUV 2 300 Urban 235Bhp (A) [01/18-]
- 1 × LEXUS NX 2015 To 2017 5 Dr SUV 2 200t F Sport 235Bhp (A) [01/15-12/17]
- 1 × LEXUS NX 2015 To 2017 5 Dr SUV 2 200t 235Bhp (A) [01/15-12/17]
- 1 × LEXUS NX 300 5 DR SUV 2.0 DBA-AGZ10 (AZ10) (A)
- 1 × LEXUS NX 2015 To 2017 5 Dr SUV 2 200t Premium 235Bhp (A) [01/15-12/17]
- 1 × LEXUS NX 2018 On 5 Dr SUV 2 300 Premium 235Bhp (A) [01/18-]

**MITSUBISHI XPANDER** — 10 cases, 4 variants
- 4 × MITSUBISHI Xpander 2020 To 2024 5 Dr SUV 1.5 1.5 104Bhp [11/20-09/24]
- 3 × MITSUBISHI Xpander 2020 On 5 Dr SUV 1.5 1.5 104Bhp [11/20-]
- 2 × MITSUBISHI Xpander 2024 On 5 Dr SUV 1.5 Plus 104Bhp (A) [09/24-]
- 1 × MITSUBISHI Xpander 2020 On 5 Dr SUV 1.50 1.5 104Bhp [11/20-]

**PROTON ERTIGA** — 10 cases, 5 variants
- 5 × PROTON Ertiga 2016 On MPV 1.4 Executive 91Bhp (A) [11/16-07/18]
- 2 × PROTON Ertiga 2016 On MPV 1.4 Executive Plus 91Bhp (A) [11/16-07/18]
- 1 × PROTON Ertiga 2016 On MPV 1.4 Xtra Premium 91Bhp (A) [08/18-]
- 1 × PROTON Ertiga 2016 On MPV 1.40 Executive AUTO 91Bhp (A) [11/16-07/18]
- 1 × PROTON Ertiga 2016 On MPV 1.40 Xtra Premium AUTO 91Bhp (A) [08/18-]

**SUBARU FORESTER** — 10 cases, 3 variants
- 7 × SUBARU Forester 2013 To 2019 5 Dr SUV 2 2.0i-P 148Bhp [04/16-04/19]
- 2 × SUBARU Forester 2013 To 2019 5 Dr SUV 2 2.0i 148Bhp [04/16-04/19]
- 1 × SUBARU Forester 2013 On 5 Dr SUV 2.00 2.0i-P 148Bhp [04/16-]

**MERCEDES-BENZ GLC** — 10 cases, 6 variants
- 3 × MERCEDES-BENZ GLC 2016 On 5 Dr SUV 2 250 4Matic AMG Line (X253) 211Bhp (A) [01/16-]
- 2 × MERCEDES-BENZ GLC 200 5 DR SUV 2.0 (X253) (A) [16-]
- 2 × MERCEDES-BENZ GLC 2016 On 5 Dr SUV 3 AMG GLC 43 4Matic (X253) 367Bhp (A) [05/17-]
- 1 × MERCEDES-BENZ GLC 2016 On 5 Dr SUV 3 AMG GLC 43 4Matic Coupe (C253) 367Bhp (A) [05/17-]
- 1 × MERCEDES-BENZ GLC 300 5 DR SUV 2.0 4Matic AMG Line (X253) Facelift (A) [20-]
- 1 × MERCEDES-BENZ GLC 2016 On 5 Dr SUV 2.00 250 4Matic AMG Line (X253) AUTO 211Bhp (A) [01/16-]

**MERCEDES-BENZ E** — 10 cases, 8 variants
- 2 × MERCEDES-BENZ E Class 2002 To 2009 5 Dr Estate 2 E200 Kompressor Avangarde 184Bhp (A) [10/03-]
- 2 × MERCEDES-BENZ E Class 2009 On 2 Dr Cabriolet 2.1 E250CDi Sport Blue Efficiency 204Bhp (A) [03/10-]
- 1 × MERCEDES-BENZ E Class 2009 On 4 Dr Sal 2.1 E250Cdi SE Blue Efficiency 204Bhp (A) [06/09-]
- 1 × MERCEDES-BENZ E Class 2009 On 5 Dr Estate 1.8 E250 Sport Blue Efficiency 204Bhp (A) [01/10-]
- 1 × MERCEDES-BENZ E Class 2009 On 2 Dr Cabriolet 1.8 E250 SE Blue Efficiency 204Bhp (A) [03/10-]
- 1 × MERCEDES-BENZ E Class 2002 To 2009 4 Dr Sal 5 E500 Elegance 306Bhp (A) [09/02-]
- 1 × MERCEDES-BENZ E Class 2009 On 5 Dr Estate 1.8 E200 SE Blue Efficiency 184Bhp (A) [01/10-]
- 1 × MERCEDES-BENZ E Class 2002 To 2009 5 Dr Estate 2 E200 Kompressor Elegance 184Bhp (A) [10/03-]

**ISUZU N-SERIES** — 10 cases, 7 variants
- 3 × ISUZU N-Series 2010 On Truck 3 NLR77UEE-2E (4.8 Ton) 108Bhp (M) [01/16-]
- 2 × ISUZU N-SERIES LORRY 4.6 D NPR71ULHT (M) [12-]
- 1 × ISUZU N-Series 2010 On Tipper 3 NLR85UEE-2E (4.8 Ton) 128Bhp (M) [01/16-]
- 1 × ISUZU N-Series 2010 On Truck 3 NLR77UEEW-2E (4.1 Ton) 108Bhp (M) [01/16-]
- 1 × ISUZU N-Series 2010 On Truck 3 NLR85UEE-2E (4.8 Ton) 128Bhp (M) [01/16-]
- 1 × ISUZU N-Series 2010 On Truck 4.30 D NPR66UPH (5.0Ton) 118Bhp (M) [12/10-]
- 1 × ISUZU N-Series 2010 On Truck 3.00 TD NLR85UEE-2E (4.8 Ton) 128Bhp (M) [01/16-]

**VOLKSWAGEN PASSAT** — 10 cases, 4 variants
- 5 × VOLKSWAGEN Passat 2011 On 4 Dr Sal 1.8 TSI (B7) 158Bhp (A) [10/11-10/16]
- 3 × VOLKSWAGEN Passat CC 2009 On 4 Dr Sal 2 197Bhp (A) [10/09-]
- 1 × VOLKSWAGEN PASSAT 4 DR SAL 2.0 D TDI (B6) (A)
- 1 × VOLKSWAGEN Passat CC 2009 On 4 Dr Sal 2.00 AUTO 197Bhp (A) [10/09-]

**NISSAN VANETTE** — 10 cases, 6 variants
- 5 × NISSAN Vanette 1989 On Van 1.5 C22 82Bhp (M) [06/99-]
- 1 × NISSAN Vanette 1989 On Van 1.5 C22 82Bhp (M) [01/89-12/92]
- 1 × NISSAN Vanette 1989 On Van 1.5 C22 82Bhp (M) [01/93-05/99]
- 1 × NISSAN VANETTE VAN 1.5 VPC22EFUP (M)
- 1 × NISSAN Vanette Pick-Up 1997 On Truck 1.5 C22 [01/97-]
- 1 × NISSAN Vanette 1989 On Van 1.50 C22 82Bhp (M) [06/99-]

**MERCEDES-BENZ CLA-CLASS** — 10 cases, 3 variants
- 5 × MERCEDES-BENZ CLA-Class 2014 On 4 Dr Sal 1.6 CLA 200 154Bhp (A) [04/14-]
- 4 × MERCEDES-BENZ CLA-Class 2014 On 4 Dr Sal 2 CLA 45 AMG 360Bhp (A) [04/14-]
- 1 × MERCEDES-BENZ CLA-Class 2014 On 4 Dr Sal 1.60 CLA 200 AUTO 154Bhp (A) [04/14-]

**NISSAN LATIO** — 10 cases, 7 variants
- 4 × NISSAN Latio 2007 On 5 Dr Hatch 1.6 Sport ST-L 108Bhp (A) [06/07-08/11]
- 1 × NISSAN Latio 2007 On 4 Dr Sal 1.6 108Bhp (A) [09/11-]
- 1 × NISSAN Latio 2007 On 4 Dr Sal 1.6 ST-L 108Bhp (A) [06/07-08/11]
- 1 × NISSAN Latio 2007 On 4 Dr Sal 1.6 ST 108Bhp (A) [06/07-08/11]
- 1 × NISSAN Latio 2007 On 5 Dr Hatch 1.8 124Bhp (A) [09/11-]
- 1 × NISSAN Latio 2007 On 4 Dr Sal 1.8 Ti 124Bhp (A) [06/07-08/11]
- 1 × NISSAN Latio 2007 On 5 Dr Hatch 1.60 Sport ST-L AUTO 108Bhp (A) [06/07-08/11]

**KIA SPORTAGE** — 10 cases, 3 variants
- 7 × KIA Sportage 2010 On 5 Dr SUV 2 164Bhp (A) [06/11-02/14]
- 2 × KIA Sportage 2010 On 5 Dr SUV 2 164Bhp (A) [03/14-08/15]
- 1 × KIA Sportage 2010 On 5 Dr SUV 2.00 AUTO 164Bhp (A) [06/11-02/14]

**NISSAN TEANA** — 10 cases, 4 variants
- 4 × NISSAN Teana 2014 On 4 Dr Sal 2 XL (L33) 134Bhp (A) [06/14-]
- 4 × NISSAN Teana 2007 On 4 Dr Sal 2 200XE 134Bhp (A) [11/10-02/13]
- 1 × NISSAN Teana 2007 On 4 Dr Sal 2 200XE 134Bhp (A) [03/13-05/14]
- 1 × NISSAN Teana 2007 On 4 Dr Sal 2.50 250XV AUTO 180Bhp (A) [03/13-05/14]

**VOLKSWAGEN BEETLE** — 10 cases, 5 variants
- 4 × VOLKSWAGEN Beetle 2014 On 3 Dr Hatch 1.2 TSI Design 103Bhp [08/14-04/17]
- 3 × VOLKSWAGEN BEETLE 3 DR HATCH 1.2 TSI (A) [12-]
- 1 × VOLKSWAGEN Beetle 2014 On 3 Dr Hatch 1.2 TSI Sport 103Bhp [05/17-]
- 1 × VOLKSWAGEN Beetle 2014 On 3 Dr Hatch 1.4 Dune 1.4 TSI 148Bhp [11/16-]
- 1 × VOLKSWAGEN BEETLE 3 DR HATCH 2.0 TSI (A) [12-]

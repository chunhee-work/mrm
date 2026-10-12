# Batch 2026-10-05.  ws: 72619=Extreme Auto Car Care, 29709=Bengkel Kereta Sinar Gemilang
# model_filter is passed to the TypeSafe variant judgment (it narrows the ddlbModel list);
# the judgment picks the exact option, so no regex here.
CASES = {
"BNN6055": dict(ws=29709, ins="35",            # Allianz
  accdate="07/09/2026", acchour="21",
  clmnm="AZEYAM BINTI RAMLI", clmid="770124115274",
  regno="BNN6055", chano="PM2M603S002140821",
  lossdesc="COLLISION- HEAD TO REAR (INSURED HIT TP)",
  polno="AEKT1268872", polcover="1", polfrom="23/08/2026", polto="22/08/2027",
  inm="MUHAMMAD RAKHIMIE BIN MUHAMMAD RIDHWAN JOHNATAN", iid="060907110019",
  tpregno="TAY6075", clmins="9616", clmpol="562160030165-00",   # Zurich General Takaful
  man="60", model_filter="MYVI",
  rc_line="PERODUA / MYVI - 1500 SE (AUTO)",
  ins_line="PERODUA MYVI SE ZHS 4-SP AUTOMATIC, 4D HATCHBACK",
  regdate="24/11/2015", cc=1495, odo="253546", colour="Blue"),

"CDD5894": dict(model_exact='Saga 2008 To 2016 4 Dr Sal 1.3 FLX (Executive) 94Bhp (A) [07/11-06/14]', ws=72619, ins="70",            # Zurich General Insurance
  accdate="14/09/2026", acchour="13",
  clmnm="ABDUL QUDDUS BIN ABIREAH", clmid="890103125779",
  regno="CDD5894", chano="PL1BT3STRDB353686",
  lossdesc="COLLISION- HEAD TO SIDE (INSURED HIT TP)",
  polno="88260009082800", polcover="1", polfrom="21/05/2026", polto="20/05/2027",
  inm="RUBIATUN BINTI MD YUSUF", iid="800822065192",
  tpregno="VRA2280", clmins="9616", clmpol="TS22-00512095",
  man="64", model_filter="SAGA",
  rc_line="PROTON / SAGA FL 1.3 AUTOMATIK",
  ins_line="PROTON SAGA FLX, 4 DR SALOON, automatic",
  regdate="27/12/2012", cc=1332, odo="0", colour="Beige"),

"KFY775": dict(model_exact='CX-5 2024 On 5 Dr SUV 2 2.0 High 2WD 162Bhp (A) [01/24-]', ws=72619, ins="35",             # Allianz
  accdate="04/09/2026", acchour="17",
  clmnm="YAP KEAT SENG", clmid="880524065189",
  regno="KFY775", chano="PP1KFA2715M204327",
  lossdesc="COLLISION- HEAD TO SIDE (INSURED HIT TP)",
  polno="19VTHI00230236", polcover="2", polfrom="28/11/2025", polto="27/11/2026",
  inm="ROSLI BIN ABD GHANI", iid="550801115067",
  tpregno="CBJ7829", clmins="32", clmpol="ME265451",            # Berjaya Sompo
  man="48", model_filter="CX-?5",
  rc_line="MAZDA / CX-5 2.0G 2WD HIGH",
  ins_line="MAZDA CX-5 / 4D WAGON, 1998 CC, year 2025",
  regdate="06/02/2025", cc=1998, odo="21519", colour="Grey"),

"VER3630": dict(model_exact='Myvi 2017 To 2020 5 Dr Hatch 1.3 Premium X 94Bhp (A) [11/17-07/20]', ws=72619, ins="35",            # Allianz
  accdate="16/09/2026", acchour="09",
  clmnm="NOR SABRINA BINTI MAT YASIN", clmid="910302065874",
  regno="VER3630", chano="PM2M804S002040296",
  lossdesc="COLLISION- HEAD TO REAR (INSURED HIT TP)",
  polno="20VVN0D1329600", polcover="1", polfrom="21/04/2026", polto="20/04/2027",
  inm="HARIS SALAHUDDIN BIN MOHD ZAKARI", iid="050925060407",
  tpregno="JHK3756", clmins="50", clmpol="VER3630-CHUBB",       # Chubb
  man="60", model_filter="MYVI",
  rc_line="PERODUA / MYVI - 1300 X (AUTO)",
  ins_line="PERODUA MYVI 1.3 X, automatic",
  regdate="30/05/2020", cc=1329, odo="69309", colour="White"),

"WB5585A": dict(model_exact='Saga 2008 To 2016 4 Dr Sal 1.3 FLX (Executive) 94Bhp (A) [07/14-09/16]', ws=72619, ins="9516",          # Etiqa General Takaful
  accdate="11/09/2026", acchour="19",
  clmnm="LEONG OI MEE @ LEONG AI MEI", clmid="541128065244",
  regno="WB5585A", chano="PL1BT3STRFB488056",
  lossdesc="COLLISION- HEAD TO SIDE (INSURED HIT TP)",
  polno="KOH77182", polcover="1", polfrom="16/04/2026", polto="15/04/2027",
  inm="MUHAMMAD AZLAN BIN UJI", iid="840411135033",
  tpregno="QAB1104J", clmins="32", clmpol="ME616791",           # Berjaya Sompo
  man="64", model_filter="SAGA",
  rc_line="PROTON / SAGA FL 1.3 CVT",
  ins_line="PROTON SAGA / 4D SEDAN, 1332 CC, year 2014, CVT automatic",
  regdate="16/01/2015", cc=1332, odo="45322", colour="Beige"),

"WUD4394": dict(model_exact='Saga 2008 To 2016 4 Dr Sal 1.3 B-Line 94Bhp (A) [01/08-11/10]', ws=72619, ins="35",            # Allianz
  accdate="05/07/2026", acchour="11",
  clmnm="NUR AZURA BINTI KAMARUDIN", clmid="770303025076",
  regno="WUD4394", chano="PL1BT3SRRBB186587",
  lossdesc="COLLISION- HEAD TO SIDE (INSURED HIT TP)",
  polno="18VKN0D7137309", polcover="1", polfrom="24/02/2026", polto="23/02/2027",
  inm="MOHD HAFIZUL BIN CHE ROSLAN", iid="930731115145",
  tpregno="CS74", clmins="1713", clmpol="MV9440393",            # Takaful Ikhlas
  man="64", model_filter="SAGA",
  rc_line="PROTON / SAGA 1.3 AUTOMATIC",
  ins_line="PROTON SAGA, 1332 CC, year 2010, automatic",
  regdate="20/03/2010", cc=1332, odo="114624", colour="Silver"),
}

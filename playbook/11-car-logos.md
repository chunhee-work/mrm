# 11 · Car logos and badges (how to name a badge photo)

## Naming format (user 2026-10-31)
- Use only these three names:
  - **Grille Badge (BRAND)**: logo on the front grille or bonnet nose.
  - **Boot Lid Badge (BRAND)**: logo on the boot lid of a saloon.
  - **Tailgate Badge (BRAND)**: logo on the tailgate or back door of a hatchback, MPV or SUV.
- **The text in brackets is ALWAYS CAPITAL LETTERS**: (PERODUA), (PROTON), (TOYOTA), (MERCEDES-BENZ). Never write (proton), (P), (T), (logo) or (LOGO).
- If the photo shows the brand LOGO, the bracket is the BRAND name from the table below, even when the logo is only a letter or a picture. Examples:
  - Perodua "P2" mark → (PERODUA)
  - Toyota ellipses → (TOYOTA)
  - Proton tiger → (PROTON)
- If the badge is a written MODEL name or grade (MYVI, SAGA, VIOS, CITY, JAZZ, I-VTEC, ELITE, ECO IDLE), the bracket is that text in CAPITALS (playbook 03 and 08). Comment on the estimate row = the same bracket text.
- **A grade badge (EZI, SE, AV, ADVANCE, ELITE, PREMIUM…) is named with the MODEL**: Tailgate Badge (EZI) on a Myvi → Tailgate Badge (MYVI) (user 2026-10-31; naming.py does it from the car model).
- Old names that must never appear again:
  - Grille Front Badge, Badge Boot Lid, Emblem Boot/Tailgate, Badge [P]
  - lower-case brackets
- `naming.py` turns these into the format above. When the bracket is only a single letter (P, T, H) or "logo", it puts the case's brand there.
- Check the brand against the vehicle model in the RC/Merimen. A logo that does not match the car's brand (a rebadged car or an aftermarket badge) → name what is on the car and flag it.

## Brand logos (every brand in our price data; tier as in playbook 08)
| Brand | What the logo looks like | Name |
|---|---|---|
| PERODUA | Green "P" plus red "2" in an oval (1998–2008). From 2008: chrome oval with a stylised "P" swoosh, and the wordmark PERODUA. | (PERODUA) |
| PROTON | From 2019: a round badge with a geometric tiger head entering from the left, no shield. Before 2019: a tiger head inside a shield-shaped badge. Very old cars: a star and crescent. | (PROTON) |
| INOKOM | Locally assembled rebadged Hyundai (Atos/Getz/Matrix/i10) and Lorimas lorry. Often still carries the Hyundai slanted "H"; otherwise the INOKOM wordmark. | (INOKOM) if it says INOKOM, (HYUNDAI) if the Hyundai H |
| NAZA | Rebadged Kia/Peugeot (Ria, Citra, Sorento). The NAZA wordmark or an "N" mark; may still show KIA or the Peugeot lion. | what is on the car |
| HICOM | Perkasa/Handalan lorries; HICOM wordmark. | (HICOM) |
| TOYOTA | Three overlapping ellipses forming a "T" inside an oval. | (TOYOTA) |
| HONDA | A wide, upright "H" (cars). The motorbike version is a wing. | (HONDA) |
| NISSAN | The word NISSAN across a circle. The 2020 logo is a thin open circle with a bar. | (NISSAN) |
| MAZDA | Stylised "M" shaped like wings inside an oval. | (MAZDA) |
| MITSUBISHI | Three red or chrome diamonds meeting in the centre. Fuso lorries use the same mark. | (MITSUBISHI) |
| HYUNDAI | Slanted, italic "H" in an oval. | (HYUNDAI) |
| KIA | New (2021+): the joined handwritten-style KIA wordmark with no oval. Old: KIA letters inside a red or chrome oval. | (KIA) |
| SUZUKI | Red or chrome stylised "S" (two arrows). | (SUZUKI) |
| DAIHATSU | Stylised "D" inside an oval. | (DAIHATSU) |
| SUBARU | Six stars (Pleiades) in a blue oval. | (SUBARU) |
| ISUZU | The ISUZU wordmark in block capitals, with no picture mark. | (ISUZU) |
| VOLKSWAGEN | "V" over "W" inside a circle. | (VOLKSWAGEN) |
| FORD | The word "Ford" in script inside a blue oval. | (FORD) |
| PEUGEOT | Lion standing on its back legs. The 2021 version is a lion head inside a shield. | (PEUGEOT) |
| CHEVROLET | Gold or chrome "bowtie" (a stretched cross). | (CHEVROLET) |
| CITROEN | Two stacked upward chevrons. The 2022 version is the chevrons inside a vertical oval. | (CITROEN) |
| RENAULT | Diamond (rhombus); the 2021 version is two interlocking outline diamonds. | (RENAULT) |
| SSANGYONG | Two-wing ring like a stylised bird or yin-yang in an oval. KGM from 2023. | (SSANGYONG) |
| BYD | The letters BYD. Old: inside a horizontal oval. New: the BYD wordmark alone. | (BYD) |
| DENZA | Blue water-drop shape above the DENZA wordmark. | (DENZA) |
| CHERY | Oval with a pointed "A"-shaped triangle inside. | (CHERY) |
| GREAT WALL | Oval with a wall-battlement shape. HAVAL and ORA cars carry the HAVAL or ORA wordmark. | (GREAT WALL), (HAVAL), (ORA) |
| CHANGAN | Blue "V"-shaped mark inside a circle, or the CHANGAN wordmark. | (CHANGAN) |
| JAECOO | The JAECOO wordmark in wide, geometric capitals, with no picture mark. | (JAECOO) |
| OMODA | The OMODA wordmark. | (OMODA) |
| NETA | Red round mark made of "N" and "EA" (Nezha's wind-fire wheels). | (NETA) |
| MG | The letters MG inside an octagon. | (MG) |
| MERCEDES-BENZ | Three-pointed star inside a circle. | (MERCEDES-BENZ) |
| BMW | Round badge in four quarters (blue and white) with BMW in a black ring. | (BMW) |
| LEXUS | Stylised "L" inside an oval. | (LEXUS) |
| AUDI | Four interlocking rings. | (AUDI) |
| VOLVO | Circle with an arrow at the top right (the iron mark) and a diagonal bar across the grille. | (VOLVO) |
| MINI | The MINI wordmark in a circle with wings on both sides. | (MINI) |
| LAND ROVER | Green oval with LAND ROVER. Range Rover cars carry the RANGE ROVER wordmark. | (LAND ROVER), (RANGE ROVER) |
| TESLA | Stylised "T" (shaped like a motor cross-section). | (TESLA) |
| PORSCHE | Crest with a black horse on gold, red and black stripes, and antlers. The bonnet can also carry the PORSCHE wordmark. | (PORSCHE) |
| BENTLEY | A "B" with wings. | (BENTLEY) |
| MASERATI | Trident (Neptune's fork). | (MASERATI) |
| HINO | Stylised "H" made of two curved strokes, like a wing. | (HINO) |
| UD | The letters UD (UD Trucks). | (UD) |
| KING LONG | Red stylised mark with the KING LONG wordmark (bus). | (KING LONG) |
| DONG FENG | Two swallows in a circle, like a yin-yang. | (DONG FENG) |
| FOTON | Triangle split by a diagonal line (silver or blue). | (FOTON) |
| YANGTSE, SKS (bus), FARID (Placer X van), LMG (Trekker pickup) | Small or rare brands; logo not confirmed. Name from the wordmark on the vehicle and add the logo to this table the first time we see it. | (YANGTSE), (SKS), (FARID), (LMG) |
| YAMAHA, MODENAS, SYM (motorcycles) | Yamaha: three crossed tuning forks in a circle. Modenas and SYM: their wordmarks. | (YAMAHA), (MODENAS), (SYM) |

## Common traps
- **Perodua and Daihatsu:** a Perodua (Myvi, Axia, Bezza, Alza, Ativa) carries the PERODUA mark, never the Daihatsu "D". A Daihatsu badge on a Perodua = an aftermarket badge, so flag it.
- **Inokom, Naza and other rebadged cars:** write the logo that is on the car.
- **Grade badges are model or grade text, not brand logos:** Toyota "G", Honda "i-VTEC", Proton "ELITE" and the like. Write them in CAPITALS: (G), (I-VTEC), (ELITE).
- **A lone letter "P" on a Perodua is the PERODUA logo** → (PERODUA). On a Proton or Peugeot, use their own brand.

Sources: [Perodua logo history (Wikipedia)](https://en.wikipedia.org/wiki/Perodua), [Proton 2019 logo (paultan.org)](https://paultan.org/2019/09/24/proton-officially-reveals-new-corporate-logo-tagline/), [Inokom (Wikipedia)](https://en.wikipedia.org/wiki/Inokom), [Denza logo](https://logos-world.net/denza-logo/), [JAECOO logo](https://motomarks.io/logos/jaecoo), [Neta logo](https://seeklogo.com/vector-logo/454777/neta-neta); all other logos from general knowledge.

# Beauty Template Pack — 레퍼런스 좌표/레이어 재현 스펙 (BP-1)

> 목적: 업로드된 고퀄 레퍼런스를 **"비슷한 감성"이 아니라 좌표/레이어 단위 editable 복제**로 재현하기 위한 구현 스펙. 원본 PNG 통삽입·AI 재생성 금지. 배경·프레임·배지·CTA·장식은 **캔버스 코드 레이어**, 텍스트는 **slotValues**, 사진은 **imageSlots**(+ before는 `state.secondImg`)로만 분리.
>
> 좌표계: **캔버스 1080×1350 (4:5)**. 모든 좌표/크기는 px. 색은 HEX. 폰트크기는 px.
> 상태: BP-1(문서 전용). 코드 0. 구현은 BP-2부터.

---

## 0. 공통 기반

### 0.1 렌더 계약 (기존 무수정 재사용)
- 진입: `premium-templates.js`의 `_premiumHook`에 `meta[0]==='beautyPack' → window.PhotoEditorBeautyPack.draw(ctx, dw, dh, state, tpl, data)` 위임 1분기만 추가(baCompose 분기 직후). **TOP5/onSave/S4/ba-compose 무수정.**
- `data`는 hook이 이미 slotValues 우선 병합해 전달(headline/shop/services/cta/photo/focal/zoom 등).
- 사진:
  - `main_photo` = `state.tplV2.imageSlots.main_photo.{src,focal,zoom}` → `_coverCrop` 방식으로 그림.
  - `before` = `state.secondImg`(edit-sheet "시술 전 사진" 픽), focal/zoom = `imageSlots.before_photo.{focal,zoom}`.
  - `after` = `imageSlots.after_photo.src`(없으면 베이스 캔버스=현재 편집 사진), focal/zoom = `imageSlots.after_photo.{focal,zoom}`.
- 저장: `peCanvas.toDataURL()`가 그려진 전부 캡처 → 신규 렌더 자동 저장. **onSave 무수정.**

### 0.2 폰트 (번들 기존 자산 — 추가 0)
`index.html`에 이미 로드됨:
| 용도 | 폰트 |
|---|---|
| 골드 영문 디스플레이 | `Playfair Display` (700/900) |
| 한글 세리프 헤드라인 | `Noto Serif KR` (500/700) |
| 헤비 한글 헤드라인(SNS "전후") | `Black Han Sans` |
| 손글씨(마커톤) | `Gaegu` (400/700) |
| 손글씨(펜톤: BEFORE/AFTER·메모·감사문구) | `Nanum Pen Script` |
| 라운드 본문 | `Gowun Dodum` |
| 산스 본문/가격 | `Noto Sans KR` |

> **핵심:** 손글씨(Gaegu/Nanum Pen)·헤비헤드라인(Black Han Sans)이 이미 있어 TOP3-2의 손글씨 갭이 자산 추가 없이 대부분 해결됨.

### 0.3 z-order 규약
작은 수 = 아래. 각 템플릿 §의 "레이어 순서" 표 기준으로 `ctx` 순차 드로잉.

---

## TOP3-1 · 블랙골드 프리미엄 가격표
**레퍼런스:** ⑲ 에끌레르 에스테틱(주) / ⑨ PREMIUM(시술시간 분 컬럼 변형) / ⑤ Lumière(크림골드 변형)
**카테고리/업종:** price / skin·common · **id 후보:** `bp-price-blackgold`

### 팔레트 (HEX)
| 토큰 | 값 |
|---|---|
| bg-base | `#14110E` |
| bg-edge | `#0C0A07` |
| gold | `#C9A24B` |
| gold-light | `#E3C77A` |
| gold-deep | `#9C7A33` |
| ink/cream | `#F3E9D6` |
| sub | `#B9A98C` |
| line | `#3A3024` |
| strike(정상가) | `#6E6354` |

> palette 시드 = 기존 `v3-price-luxe-dark` 그대로 재사용.

### 레이아웃 (px, 1080×1350)
| 요소 | 위치(x,y,w,h) | 폰트/크기/색 | 정렬 | 출처 |
|---|---|---|---|---|
| 배경 그라데이션 | 0,0,1080,1350 | radial `#14110E`→`#0C0A07` | — | code |
| 골드 광선 | 0,0,1080,180 | linear gold α0.10→0 (대각) | — | code |
| 인셋 프레임 | inset 24, r16 | stroke `#3A3024` 1.5 + inner `#C9A24B` 1 (inset 30) | — | code |
| 엠블럼(goldEmblem) | 중심(330,120), 110×110 | 머리글자 Playfair 48 `#C9A24B` | center | code + `shop_name[0]` |
| 샵명 | 중심(330,200) | Noto Serif KR 30 `#F3E9D6` | center | **slot** shop_name |
| 영문 태그 | 중심(330,234) | Playfair 16 `#B9A98C` letter+2 | center | slot shop_name_en |
| 헤드라인 | x40–700, y250–345 | Noto Serif KR 700, 56(오토핏 2줄) `#F3E9D6` | center(좌존) | **slot** headline |
| 서브(◆…◆) | 중심(330,378) | Noto Serif KR 20 `#B9A98C` + `diamondDivider` 좌우 | center | **slot** subtitle |
| **인물사진** | 626,80,454,756 (좌모서리 arch r60) | `_coverCrop(focal,zoom)` | — | **img** main_photo |
| 사진 세로선 | x620, y80–836 | `#3A3024`/gold 1px | — | code |
| 컬럼헤더 | "정상가"@right470 / "이벤트가"@right620, y470 | Noto Sans KR 16 `#B9A98C`/`#C9A24B` letter+1 | right | code(고정) |
| 가격 4행 | 좌존 x60–630, y500–1080, 행h=145 | (아래 행 스펙) | — | **slot** services[] |
| └ 번호 | x60, 행중앙 | Playfair italic 34 `#C9A24B` | left | `0{i+1}` 자동 |
| └ 시술명 | x120, yi+58 | Noto Serif KR 700 30 `#F3E9D6` | left | services[i].name |
| └ 설명 | x120, yi+92 | Noto Sans KR 17 `#B9A98C` | left | services[i].desc |
| └ 정상가(취소선) | right470, 행중앙 | Noto Sans KR 22 `#6E6354` strike | right | services[i].**origPrice** |
| └ 이벤트가 | right620, 행중앙 | Noto Sans KR 700 32 `#C9A24B` | right | services[i].price |
| └ 행구분선 | x60–620, y=yi+145, 중앙◆ | `goldRowDivider` `#3A3024`+gold◆ | — | code |
| └ 리본(0행) | x120, yi+10 | `ribbonBadge` 14 dark on gold | left | services[0].**badge** |
| CTA 알약 | 190,1130,700,100, r50 | `goldPill` grad `#E3C77A→#C9A24B→#9C7A33` | center | code |
| └ 카톡칩 | 원 r22 @(300,1180) | `kakaoChip` "TALK" 14 | — | code |
| └ CTA 문구 | 중심(560,1180) | Noto Sans KR 700 30 `#1B140A` | center | **slot** cta |
| 전화 | 중심(540,1290) | Noto Sans KR 24 `#C9A24B` | center | **slot** phone |

> 행수 3~6 가변: 행h = (1080−500)/n. ⑨형(시술시간) 지원 시 `services[i].duration` 우측 보조컬럼(이벤트가 아래 작은 분 표기).

### 레이어 순서
bg그라데이션 → 골드광선 → 인셋프레임 → **사진** → 사진세로선 → 엠블럼/샵명/태그 → 헤드라인/서브 → 컬럼헤더 → 가격행(설명/취소선/이벤트가/구분선/리본) → CTA알약/칩/문구 → 전화

### slot/img 정리
- **slotValues:** shop_name, shop_name_en, headline, subtitle, services[{name, desc, origPrice, price, badge, (duration)}], cta, phone
- **imageSlots:** main_photo {src, focal, zoom}
- **고정(code):** 배경/광선/프레임/엠블럼틀/◆/행구분선/리본형태/CTA알약/카톡칩/컬럼헤더 라벨

---

## TOP3-2 · 네일 SNS 전후 폴라로이드 — **최고 난이도 (게이트 핵심)**
**레퍼런스:** ㉒ 루미네일 (변형 ⑫ 라운드 2분할)
**카테고리/업종:** before_after / nail · **id 후보:** `bp-ba-nail-polaroid`

### 팔레트 (HEX)
| 토큰 | 값 |
|---|---|
| bg-top | `#FFF1F6` |
| bg-bottom | `#FCDDE9` |
| blob(워터컬러) | `#FFFFFF` α0.5 |
| brush pink | `#F2789F` |
| hot pink | `#EC4E86` |
| deep pink | `#E0356F` |
| ink | `#4A3B3B` |
| sub | `#9B7E86` |
| polaroid 흰 | `#FFFFFF` |
| frame shadow | rgba(0,0,0,0.12) |
| washi tape | rgba(242,140,170,0.55) |
| paperclip | `#B9C0C9` |
| gem-heart | `#F48FB1` |

### 레이어 순서 (z 낮음→높음)
1. 배경 그라데이션 + 워터컬러 블롭
2. 산포 장식(스파클·하트·보석하트)
3. 로고 + 헤드라인 + 서브(상단존, 사진과 미겹침)
4. 찢긴 메모 + 불릿 칩(좌측)
5. **BEFORE 폴라로이드** (−5°)
6. **AFTER 폴라로이드** (+5°, before 위에 겹침)
7. CTA 알약
8. 코너 손글씨

### 배경/산포 (z1–2)
| 요소 | 좌표/크기 | 색/폰트 | 출처 |
|---|---|---|---|
| 그라데이션 | 0,0,1080,1350 vertical | `#FFF1F6`→`#FCDDE9` | code |
| 워터컬러 블롭 ×4 | (180,300,r260)(820,520,r300)(300,1050,r280)(900,1150,r240) | 흰 α0.5 radial | code |
| gemHeart ×2 | (90,150,70) (980,1180,80) | `#F48FB1` 패싯 | code |
| sparkle ×7 | (150,120)(420,150)(960,430)(120,560)(980,760)(560,250)(940,980), 18–34 | 흰/핑크 4각별 | code |
| heart ×4 | (250,110)(900,300)(150,980)(840,1080) | 핑크 outline | code |

### 로고/헤드라인/서브 (z3)
| 요소 | 좌표 | 폰트/크기/색 | 정렬 | 출처 |
|---|---|---|---|---|
| 로고 알약 | 중심(540,120), 300×72 outline | `outlinePill` 핑크 2px; "루미네일" Gaegu 700 30 `#F2789F` + "LUMI NAIL" Playfair 16 letter+2 | center | **slot** shop_name(+_en) |
| 헤드라인 강조어 | baseline≈300, x150~ | "네일" **Black Han Sans** 92 `#F2789F` | left | **slot** headline_accent |
| 헤드라인 본문 | x330~, baseline≈300 | "전후 변화" Black Han Sans 92 `#4A3B3B` | left | **slot** headline |
| 브러시 밑줄 | x330–820, y320 | `brushUnderline` `#F2789F` rough | — | code |
| 헤드라인 악센트 | heart(900,210) sparkle(120,180)(870,150) | code | — | code |
| 서브 하이라이트 | x250–830, y350–400 | `brushHighlight` 핑크 α | — | code |
| 서브 문구 | 중심(540,382) | Gowun Dodum 30 `#4A3B3B` "…순간 ♡" | center | **slot** subtitle |

### **BEFORE 폴라로이드 (z5) — 정밀 스펙**
- **중심 (xc,yc) = (300, 620)**. 프레임 **W×H = 420×470** (사진영역 380×380, 패딩: 상/좌/우 20, 하단 70).
- **회전 −5° (−0.0873 rad)** : `ctx.save(); ctx.translate(300,620); ctx.rotate(-0.0873);` 후 로컬좌표(−210,−235~)로 드로잉, `ctx.restore()`.
- 드로잉 순서(로컬):
  1. 그림자: offset(6,10) blur18 rgba(0,0,0,0.12)
  2. 흰 프레임 roundRect(−210,−235,420,470,r10) `#FFFFFF`
  3. 사진 clip rect(−190,−215,380,380) → `_coverCrop(state.secondImg, before.focal, before.zoom)` (없으면 placeholder "＋ 시술 전 사진")
  4. "BEFORE" 라벨: **Nanum Pen Script** 36 `#4A3B3B` 중앙(0,+205) + 짧은 핑크 밑줄
- **종이클립(paperclip):** 폴라로이드 상단중앙 로컬(0,−235) 은색 클립 형상, 살짝 회전.

### **AFTER 폴라로이드 (z6) — 정밀 스펙**
- **중심 (xc,yc) = (770, 820)**. 프레임 **W×H = 440×490** (사진 400×400).
- **회전 +5° (+0.0873 rad)**. before 위에 그려 중앙밴드에서 겹침.
- 드로잉 순서(로컬):
  1. 그림자 → 2. 흰 프레임 roundRect(−220,−245,440,490,r10)
  3. 사진 clip rect(−200,−225,400,400) → `_coverCrop(after_img, after.focal, after.zoom)` · after_img = `imageSlots.after_photo.src` 없으면 **베이스 캔버스(현재 사진)**
  4. **washiTape**: 좌상 코너 로컬(−170,−250) 각도 −20°, 150×56 rgba(242,140,170,0.55), 위 "♥ LUMI NAIL" Nanum Pen 18
  5. "AFTER" **Nanum Pen Script** 64 `#EC4E86` 중앙(0,+215) + 핑크 밑줄

### 찢긴 메모 / 불릿 칩 (z4, 좌측)
| 요소 | 좌표 | 폰트/색 | 출처 |
|---|---|---|---|
| tornPaper 메모 | x40–250, y560–680, 찢긴 상/하단 | 크림 `#FBF3EE`; "밋밋한 손끝,\n생기 없는 컬러 :(" Nanum Pen 24 `#4A3B3B` | **slot** before_caption |
| 불릿칩 ×3 | x50–360, y=900/965/1030, 각 300×52 r26 | 흰+핑크보더; 하트/스파클 아이콘 + Gowun Dodum 22 | **slot** tags[0..2] |

### CTA / 코너 (z7–8)
| 요소 | 좌표 | 폰트/색 | 출처 |
|---|---|---|---|
| CTA 알약 | 360,1150,360,90, r45 | `pinkPill` `#F2789F→#EC4E86`; "DM / 예약문의 ♡" Gowun Dodum 700 30 흰 | **slot** cta |
| 코너 좌 | (60,1290) 회전−4° | Nanum Pen 22 `#F2789F` | **slot** footer_left |
| 코너 우 | (1020,1300) right 회전+4° | Nanum Pen 22 `#F2789F` | **slot** footer_right |

### S4 focal/zoom 연결 방식 (BEFORE/AFTER 독립)
- **BEFORE:** edit-sheet `_imgSlot('before_photo')` → `imageSlots.before_photo.{focal,zoom}` 기록. 사진 소스 = `state.secondImg`(edit-sheet "시술 전 사진" 픽으로 세팅). 렌더 = 회전된 clip rect 내부에서 `_coverCrop(secondImg, before.focal, before.zoom)`.
- **AFTER:** `_imgSlot('after_photo')` → `imageSlots.after_photo.{src,focal,zoom}`. src 비면 베이스 캔버스(현재 사진)=after 기본. 렌더 = 회전 clip 내부 `_coverCrop`.
- 회전은 **프레임 transform**에만 적용, focal/zoom은 회전된 로컬 clip 안에서 적용 → 시각 일관. (S4 드래그축은 slot 공간 기준 — 허용.)
- **ba-compose.js 미사용/미수정** — beautyPack이 2사진을 직접 배치.

### slot/img 정리
- **slotValues:** shop_name, shop_name_en, headline, headline_accent, subtitle, before_caption, tags[3], cta, footer_left, footer_right
- **imageSlots:** before_photo{focal,zoom}+`state.secondImg`, after_photo{src,focal,zoom}(없으면 베이스)
- **고정(code):** 워터컬러/스파클/하트/보석하트/폴라로이드틀/클립/테이프/찢김/칩틀/알약/브러시

---

## TOP3-3 · 속눈썹 후기 카드
**레퍼런스:** ⑱ 모어래쉬(블루) · **카테고리/업종:** review / lash · **id 후보:** `bp-review-lash-blue`

### 팔레트 (HEX)
| 토큰 | 값 |
|---|---|
| bg-top | `#FBFCFE` |
| bg-bottom | `#EAF1F8` |
| blue ink(헤드) | `#4E6E8E` |
| accent | `#6E93B4` |
| soft | `#9DB4CC` |
| card | rgba(255,255,255,0.86) |
| card shadow | rgba(80,110,140,0.18) |
| flower | `#AFC6DE` / `#C9D9EA` |
| sub | `#8A98A8` |

### 레이아웃 (px)
| 요소 | 좌표(x,y,w,h) | 폰트/크기/색 | 정렬 | 출처 |
|---|---|---|---|---|
| 배경 | 0,0,1080,1350 | `#FBFCFE`→`#EAF1F8` | — | code |
| 워터컬러 블롭 | (120,1180,r300)(980,1220,r260)(80,180,r200)(1000,160,r180) | `#C9D9EA` α0.5 | — | code |
| 플라워 ×2~3 | 좌하(160,1150,120) 우(980,760,100) | `flower` 5-petal `#AFC6DE` | — | code |
| 로고 | 중심(540,128) | "모어래쉬" Noto Serif KR 26 `#4E6E8E` + "MORE LASH" Playfair 14 | center | **slot** shop_name(+_en) |
| 헤드라인 | 중심(540,250) | Noto Serif KR 700 70 `#4E6E8E` | center | **slot** headline |
| "Review" 스크립트 | (740,210) | Nanum Pen 34 `#6E93B4` + sparkle(790,205) | — | code(고정) |
| 서브 | 중심(540,330) | Noto Sans KR 22 `#8A98A8` + 좌우 라인 | center | **slot** subtitle |
| **카드** | 70,380,940,680, r28 | `softCard` 흰 α0.86 + shadow | — | code |
| **서클포토** | 중심(300,640) r175 | clip circle + `_coverCrop(focal,zoom)` + 보더`#DCE6F0`3 | — | **img** main_photo |
| 따옴표 열기 | (560,440) | `quoteMark` Noto Serif KR 90 `#6E93B4` | — | code |
| 후기문구 | 560,470,400,290 | `drawFitText` Noto Sans KR 30 `#4E6E8E` maxLines4 lh1.5 ellipsis | left | **slot** review_text |
| 따옴표 닫기 | (940,770) | quoteMark 90 | — | code |
| 3컬럼 구분선 | x400, x700, y900–1000 | `vDivider` `#DCE6F0` | — | code |
| 컬럼1 | 중심235, y900–1000 | personIcon28 + customer_label 24 `#4E6E8E` + "고객님" 15 `#8A98A8` | center | **slot** customer_label |
| 컬럼2 | 중심550 | lashIcon + service_name 24 + "시술 항목" 15 | center | **slot** service_name |
| 컬럼3 | 중심865 | calendarIcon + date 24 + "시술 날짜" 15 | center | **slot** date |
| 별점 | 중심(540,1110) ★×5 gap44 | `stars` 34 `#6E93B4` | center | slot rating(기본5) |
| 감사문구 | 중심(540,1165) | Nanum Pen 26 `#6E93B4` | center | **slot** thanks |
| CTA 알약 | 360,1210,360,90, r45 | `bluePill` `#6E93B4→#587E9F`; chatIcon+ "상담 / 예약" Gowun Dodum 700 28 흰 | center | **slot** cta |

### 레이어 순서
bg → 블롭/플라워 → 로고/헤드라인/Review/서브 → 카드 → 서클포토 → 따옴표/후기문구 → 3컬럼(아이콘/값/라벨/구분선) → 별점/감사 → CTA

### slot/img 정리
- **slotValues:** shop_name, shop_name_en, headline, subtitle, review_text, customer_label, service_name, date, rating, thanks, cta
- **imageSlots:** main_photo{src,focal,zoom} (서클 clip)
- **고정(code):** 배경/블롭/플라워/카드/따옴표/구분선/라인아이콘/별/알약/Review스크립트

---

## 추가 optional slot 확정안 (모두 `[HF1]` 패턴 — slotValues 주입, 기존 렌더 무시 → 무회귀)
| kind | 신규 optional key | 용도 |
|---|---|---|
| price | `services[].origPrice` | 정상가 취소선 |
| price | `services[].badge` | PREMIUM/BEST 리본 |
| price | `services[].duration` | 시술시간(분) — ⑨형 |
| price | `shop_name_en`, `notice` | 영문 태그/하단 유의 |
| review | `service_name`, `date` | 3컬럼 시술/날짜 |
| review | `rating`(기본5), `thanks`, `shop_name_en` | 별점/감사/영문 |
| before_after | `tags[]`(칩), `headline_accent`, `footer_left`, `footer_right` | 칩/강조어/코너 |

> SLOTS 정의(`template-slots.js:20-58`)는 **불변**. `getDefaultValues` 컨텍스트로만 노출, edit-sheet 미노출 키는 기본값 유지. 향후 sample-catalog/matcher 연결 시 키명을 기존과 동일하게 유지(연결 호환).

---

## beautyPack renderer 필요 프리미티브 목록
**공통:** `roundRect`, `softShadow`, `coverCropDraw(img,rect,focal,zoom)`(=`_coverCrop` 이식), `linearGrad`, `radialBlob`, `drawFitText`(재사용), `formatPrice`(재사용), `clipCircle`.
**골드팩:** `goldEmblem`, `diamondDivider(◆)`, `goldRowDivider`, `ribbonBadge`, `goldPill`, `kakaoChip`, `lightStreak`, `insetFrame`, `strikePrice`.
**핑크 SNS팩:** `watercolorBlobs`, `sparkle(4각)`, `heart(채움/외곽)`, `gemHeart`, `outlinePill`, `brushUnderline`, `brushHighlight`, `polaroidFrame(회전)`, `paperclip`, `washiTape`, `tornPaper`, `chipPill`, `pinkPill`.
**블루 리뷰팩:** `watercolorBlob`, `flower(5-petal)`, `softCard`, `quoteMark`, `vDivider`, `lineIcon(person/lash/calendar/chat)`, `stars`, `bluePill`.

---

## 80~90% 유사도 검증 체크리스트 (수용 기준)
각 항목 **Y/N**. 템플릿별 Y ≥ 90% 시 통과. Playwright로 캔버스 캡처 후 원본과 나란히 대조.

### 공통
- [ ] 캔버스 1080×1350, 저장 dataURL = 화면 preview 동일
- [ ] 모든 텍스트 slot 편집 시 즉시 반영, 긴 텍스트 ellipsis/clamp
- [ ] 사진 교체 + S4 focal/zoom 반영, 사진 없을 때 placeholder
- [ ] 모바일 390×844 overflow 0, pageerror 0
- [ ] 팔레트 HEX 일치(스포이드 ±10)

### TOP3-1 블랙골드
- [ ] 근검정 배경 + 상단 골드 광선 + 인셋 프레임
- [ ] 엠블럼(머리글자) + 샵명/영문태그
- [ ] 가격 4행: 번호·시술명·설명·**정상가 취소선**·**이벤트가 골드볼드**
- [ ] 행 사이 ◆ 골드 구분선 + 0행 PREMIUM 리본
- [ ] 우측 아치 인물사진(좌모서리 둥근)
- [ ] 골드 그라데이션 CTA + 카톡칩 + 골드 전화

### TOP3-2 네일 폴라로이드 (가장 엄격)
- [ ] 핑크 워터컬러 배경 + 스파클/하트/보석하트 산포
- [ ] 헤드라인 "네일"(핑크)+"전후 변화"(다크) Black Han Sans + 브러시 밑줄
- [ ] **BEFORE 폴라로이드 −5°** (클립 + Nanum Pen "BEFORE")
- [ ] **AFTER 폴라로이드 +5°**, before 위 겹침 (워시테이프 + "AFTER")
- [ ] 종이클립 + 찢긴 메모(before_caption) + 불릿칩 3
- [ ] BEFORE=secondImg / AFTER=after_photo(또는 베이스), 각 focal/zoom 독립
- [ ] 핑크 CTA 알약 + 코너 손글씨 2
- [ ] 손글씨 톤(Gaegu/Nanum Pen)로 마커 감성 재현

### TOP3-3 속눈썹 후기
- [ ] 흰→연블루 배경 + 코너 워터컬러/플라워
- [ ] 헤드라인(블루 세리프)+ "Review" 스크립트 + sparkle
- [ ] 반투명 라운드 카드 + 좌측 서클포토(보더)
- [ ] 따옴표 2 + 후기문구 오토핏
- [ ] 3컬럼(고객/시술/날짜) 아이콘+값+라벨+세로구분선
- [ ] 별점 5 + 감사문구 + 블루 CTA 알약

---

## 구현 리스크 순위 & 솔직 평가
| 순위 | 템플릿 | 리스크 | 핵심 난점 | 도달 예상 |
|---|---|---|---|---|
| 1(최고) | TOP3-2 네일 폴라로이드 | 高 | 폴라로이드 2장 회전·겹침, 워시테이프/클립/찢김, 손글씨, 워터컬러 질감 | **~85%** (손글씨는 Gaegu/Nanum Pen으로 해결, **워터컬러 종이질감만 소프트블롭 근사 → 갭**) |
| 2 | TOP3-1 블랙골드 | 中 | 골드 그라데이션 발색, 2가격 컬럼 정렬, ◆/리본/아치사진 | **~88%** (벡터로 충실 재현 가능) |
| 3(최저) | TOP3-3 속눈썹 후기 | 中下 | 서클 clip, 라인아이콘 3, 플라워 근사 | **~88%** (구조 단순) |

**"레퍼런스 편집 가능한 버전" 수준 도달 가능성 — 솔직 평가:**
- TOP3-1 / TOP3-3 = **가능**. 캔버스 벡터/그라데이션으로 80~90% 충분, 사진은 사용자 자산 100%.
- TOP3-2 = **대체로 가능(~85%)**. 손글씨/헤비헤드라인 폰트가 번들에 이미 있어 감성 재현 OK. **유일한 한계 = 워터컬러 "종이 번짐" 텍스처** — 픽셀 복사 없이 소프트 블롭으로 근사하므로 원본의 수채 질감 100%는 불가. 필요 시 BP-2에서 경량 텍스처 1장(저작권 free, 통삽입 아닌 타일/오버레이) 추가로 ~90% 상향 가능(별도 승인).
- 결론: **TOP3 모두 "원본을 편집하는 버전" 수준 도달 가능**. 단 TOP3-2의 수채 질감은 근사임을 명시. BP-3 게이트에서 나란히 대조로 ≥80% 미달 시 확장 중단.

---

## 다음 단계
**BP-2(인프라):** `template-renderer-beauty-pack.js`(프리미티브 라이브러리 + 3 레이아웃 스켈레톤) · `template-pack-beauty-data.js`(3 엔트리) · premium-templates META 3 + 위임 1분기 · 캐시 bump. 갤러리 미노출(apply-only)·플래그 가드. → BP-3에서 좌표 픽셀 튜닝 + 게이트.

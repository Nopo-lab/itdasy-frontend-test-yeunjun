# T-200 P3 · 작업실(Workshop) 탭 리프레시 Plan

> **작성:** 2026-04-20 · T2 FE Coder  
> **트랙:** 표준 트랙 §4-A · 복잡 Phase (T1 착수 전 리뷰)  
> **상태:** 1단계 plan 작성 완료 · 원영님 카피 택 1 + 파일 스코프 결정 대기

---

## § A. 구조 매핑 (Before → After)

### 현재 구조 (`app-gallery.js::_buildWorkshopHTML()` L178~216)

```
workshopRoot (JS가 innerHTML 주입 — initWorkshopTab 1회 호출)
  ├── <div> (헤더 row, inline style)
  │     ├── <div class="sec-title" style="margin:0;">작업실 📷</div>
  │     └── <div style="display:flex;gap:8px;">
  │           ├── <button id="wsResetBtn" style="display:none;...">재시작</button>
  │           └── <div id="wsCompletionBadge" style="..."></div>
  ├── <div class="sec-sub" style="margin-bottom:16px;">오늘 시술 결과를 인스타용으로 꾸며요</div>
  ├── <div id="wsDropZone" style="...모든 스타일 inline..."
  │         onclick="document.getElementById('galleryFileInput').click()"
  │         ondragover="..." ondragleave="..." ondrop="_handleDropZoneDrop(event)"
  │         oncontextmenu="return false">
  │     ├── <input type="file" id="galleryFileInput" style="display:none;" onchange="handleGalleryUpload(this)">
  │     ├── <div style="font-size:36px;margin-bottom:8px;">📷</div>
  │     ├── <div style="...">시술 사진 올려서 작업 시작</div>
  │     └── <div style="...">탭해서 사진 선택 · 최대 20장</div>
  ├── <div id="slotCardHeader" style="display:none;margin-bottom:12px;">
  │     ├── <div style="...">👤 손님별 사진</div>
  │     ├── <span id="wsCompletionCount" style="..."></span>
  │     ├── <button onclick="openAssignPopup()" style="...">+ 배정하기</button>
  │     └── <div style="...">💡 카드를 탭하면 배경/텍스트 편집할 수 있어요</div>
  ├── <div id="slotCardList" style="display:flex;gap:12px;overflow-x:auto;..."></div>
  └── <div id="wsBanner" style="display:none;margin-bottom:8px;"></div>
```

> **주의:** `_wsInstaPreviewPop`, `_wsPreviewImg`, `_assignPopup`, `_gDragInd` 는 JS `document.createElement` 로 동적 생성 → 템플릿에 없어도 됨.

### 목표 구조 (prototype-v2 `#t-make` L253~291 기반)

```
workshopRoot
  ├── section.greet                        ← 신규 (홈 탭과 동일 패턴)
  │     ├── h1  [카피 §B 택 1]
  │     └── p.status-line  [카피 §B 택 1]
  ├── div#wsDropZone.dropzone              ← ID 유지 + class 교체 + 이모지→SVG
  │     ├── input#galleryFileInput (hidden) ← 완전 유지
  │     ├── div.dropzone-icon [upload SVG]  ← 이모지→SVG
  │     ├── p.dropzone-title               ← inline style 제거
  │     └── p.dropzone-sub                 ← inline style 제거
  ├── div.ws-header                        ← 신규 (헤더 row 재구성)
  │     ├── button#wsResetBtn              ← ID 유지, class 교체
  │     └── div#wsCompletionBadge          ← ID 유지
  ├── div#slotCardHeader                   ← ID 유지, inline style → class
  │     ├── p.ws-slot-label [카피 §B 택 1] ← 이모지 제거
  │     ├── span#wsCompletionCount         ← ID 유지
  │     ├── button onclick="openAssignPopup()" [카피 §B 택 1] ← onclick 유지
  │     └── p.ws-slot-hint [카피 §B 택 1]  ← 이모지 제거
  ├── div#slotCardList                     ← ID 유지 (JS가 innerHTML 주입)
  └── div#wsBanner                         ← ID 유지 (JS가 innerHTML + display 제어)
```

### Before → After 매핑 표

| 프로토타입/목표 블록 (After) | 현재 (Before) | 보존 ID/속성 |
|---|---|---|
| `section.greet` + `h1` + `.status-line` | 없음 → 신규 추가 | — |
| `div#wsDropZone.dropzone` | `div#wsDropZone` (inline 스타일 전체) | `wsDropZone`, `ondragover`, `ondragleave`, `ondrop`, `oncontextmenu`, `onclick` |
| `input#galleryFileInput` | `input#galleryFileInput` (내부) | `galleryFileInput`, `onchange="handleGalleryUpload(this)"` |
| `.dropzone-icon` [SVG] | `<div style="font-size:36px">📷</div>` | — |
| `.dropzone-title` / `.dropzone-sub` | `<div style="...">시술 사진...` | — |
| `button#wsResetBtn` | `button#wsResetBtn style="display:none;"` | `wsResetBtn`, `onclick="resetWorkshop()"`, `style="display:none;"` |
| `div#wsCompletionBadge` | `div#wsCompletionBadge` | `wsCompletionBadge` |
| `div#slotCardHeader` | `div#slotCardHeader style="display:none;"` | `slotCardHeader`, `style="display:none;"` |
| `p.ws-slot-label` (손님별 사진) | `<div>👤 손님별 사진</div>` | — (이모지 제거) |
| `span#wsCompletionCount` | `span#wsCompletionCount` | `wsCompletionCount` |
| `button onclick="openAssignPopup()"` | `button onclick="openAssignPopup()"` | `onclick="openAssignPopup()"` |
| `p.ws-slot-hint` (힌트 문구) | `<div>💡 카드를 탭하면...</div>` | — (이모지 제거) |
| `div#slotCardList` | `div#slotCardList` | `slotCardList` |
| `div#wsBanner` | `div#wsBanner style="display:none;"` | `wsBanner`, `style="display:none;"` |

---

## § B. 카피 복수안 (원영님 택 1)

> **원칙:** 결정적·선언적 ❌ / 부드러운 권유 톤 ✅ (T-200 §6-A)

| 슬롯 | 안 1 | 안 2 | 안 3 |
|------|------|------|------|
| **작업실 h1 제목** | 새 포스트 | 오늘 작업 | 작업실 |
| **status-line 서브** | 사진을 올리면 글까지 자동으로. | 오늘 시술 사진, 여기에 올려요. | 사진만 올리면 글은 AI가요. |
| **드롭존 타이틀** | 시술 사진 올리기 | 사진 올려서 시작해요 | 시술 사진 올려서 작업 시작 |
| **드롭존 서브** | 최대 20장 · JPG/PNG | 탭해서 사진 선택 · 최대 20장 | JPG · PNG · 최대 20장 |
| **재시작 버튼** | 재시작 | 처음부터 | 초기화 |
| **슬롯 헤더 타이틀** | 손님별 사진 | 오늘 손님 | 작업 목록 |
| **슬롯 헤더 힌트** | 카드를 탭하면 사진 편집이 가능해요 | 탭해서 편집해요 | 카드를 탭해서 배경·글 편집해요 |
| **배정하기 버튼** | + 사진 배정 | 사진 나누기 | 손님에게 배정 |

> 8 슬롯 × 3안 = **24안** 제시. 원영님이 슬롯별 선택하시면 확정 후 2단계 반영.

---

## § C. ID 보존 체크리스트

`_buildWorkshopHTML` 템플릿 내 필수 보존 ID:

| # | ID | 참조 함수 | P3 처리 |
|---|----|-----------|---------| 
| 1 | `wsDropZone` | `handleGalleryUpload` (L229), `initWorkshopTab` | **위치 유지**, inline style → `.dropzone` class로 전환 |
| 2 | `galleryFileInput` | inline onclick (L191), `handleGalleryUpload` 간접 | **위치 유지** (wsDropZone 내부), 속성 완전 동일 유지 |
| 3 | `wsResetBtn` | `_renderPhotoGrid` (L273), `_renderSlotCards` (L514) | **ID 유지**, `style="display:none;"` 인라인 반드시 유지 |
| 4 | `wsCompletionBadge` | `_renderCompletionBanner` (L542) | **ID 유지**, JS가 `.textContent` 설정 |
| 5 | `slotCardHeader` | `_renderSlotCards` (L469), `style="display:none;"` JS 제어 | **ID 유지**, `style="display:none;"` 인라인 반드시 유지 |
| 6 | `wsCompletionCount` | `_renderSlotCards` (L470), `_renderCompletionBanner` (L554) | **ID 유지** |
| 7 | `slotCardList` | `_renderSlotCards` (L468) | **ID 유지**, JS가 innerHTML 주입 |
| 8 | `wsBanner` | `_renderCompletionBanner` (L543) | **ID 유지**, `style="display:none;"` 인라인 반드시 유지, JS가 innerHTML + display 제어 |

### 필수 보존 인라인 이벤트 핸들러

| 속성 | 위치 | 이유 |
|------|------|------|
| `onclick="document.getElementById('galleryFileInput').click()"` | `wsDropZone` | 파일 선택 트리거 |
| `ondragover="event.preventDefault();this.style.borderColor='var(--accent)';this.style.background='rgba(241,128,145,0.06)';"` | `wsDropZone` | 드래그 오버 피드백 |
| `ondragleave="this.style.borderColor='';this.style.background='';"` | `wsDropZone` | 드래그 리브 복원 |
| `ondrop="_handleDropZoneDrop(event)"` | `wsDropZone` | 드롭 처리 |
| `oncontextmenu="return false"` | `wsDropZone` | 컨텍스트 메뉴 방지 |
| `onchange="handleGalleryUpload(this)"` | `galleryFileInput` | 파일 선택 처리 |
| `onclick="resetWorkshop()"` | `wsResetBtn` | 재시작 |
| `onclick="openAssignPopup()"` | 배정 버튼 | 배정 팝업 오픈 |

### SELECTOR_FREEZE.md 대조 결과

SELECTOR_FREEZE §5 P3 워크샵 IDs (8개): `_wsInstaPreviewPop`, `_wsPreviewImg`, `workshopRoot`, `wsBanner`, `wsCompletionBadge`, `wsCompletionCount`, `wsDropZone`, `wsResetBtn`

⚠️ **누락 발견:** `slotCardHeader`, `slotCardList`, `galleryFileInput` 이 SELECTOR_FREEZE P3 워크샵 섹션에 없음.  
→ `slotCardHeader` / `slotCardList` 는 SELECTOR_FREEZE §5 P3 **gallery/edit 67개** 목록에 있음 (간접 포함). `galleryFileInput` 도 gallery 67개 안에 있음.  
→ 실질적 보존 의무 있음 — 목록 분류 문제일 뿐, 실수 아님.

---

## § D. 위험 / 열린 질문

### D-1. ⚠️ 편집 파일 선택 — 원영님 결정 필요

**옵션 A (추천):** `app-gallery.js` L178~216 (`_buildWorkshopHTML` 템플릿 스트링만) 편집
- 로직 함수(`_renderPhotoGrid`, `_renderSlotCards`, `_renderCompletionBanner`, `_initDragEvents`)는 **전혀 수정 안 함**
- 38줄짜리 템플릿 스트링 교체
- JS 파일 건드리는 게 부담스러울 수 있으나 **로직 0 변경** 으로 위험 최소
- ✅ T2 추천

**옵션 B:** 템플릿 스트링을 `app-workshop-template.js` 로 분리
- Phase 2 분할(TECH_DEBT) 선행 필요 → P3 범위 초과
- ❌ 이번에 불필요

**옵션 C:** CSS만 변경, 템플릿 구조 유지
- 이모지 제거 불가 (DOM에 inline text), `.greet` 신규 구조 추가 불가
- ❌ 시각 개선 제한적

**→ 원영님 결정: 옵션 A / B / C 중 택 1. T2 추천은 A.**

### D-2. ℹ️ CSS 파일 스코프

- `style-gallery.css` 미존재. 현재 선택지:
  - **A) `style-components.css` 에 추가** — 434줄 + 신규 약 45줄 = **479줄 ≤ 500줄** ✅ `eslint-disable` 불필요
  - **B) `style-workshop.css` 신설** — 파일 + `@import` 1줄 추가 필요

- 신규 클래스 예상 (약 45줄): `.dropzone`, `.dropzone-icon`, `.dropzone-title`, `.dropzone-sub`, `.ws-header`, `.ws-slot-label`, `.ws-slot-hint`
- **T2 추천: A) `style-components.css` 추가** — 500줄 미만 유지 가능, 신설 불필요.
- → 원영님 승인 필요 (500줄 정책).

### D-3. ℹ️ `_initDragEvents` 수정 안전성

`_initDragEvents()` (L603~608) 는 `document` 에 `touchmove/mousemove/touchend/mouseup` 이벤트 부착 → 특정 DOM 요소 ID 참조 없음.  
`wsDropZone` 의 `ondragover/ondragleave/ondrop` 인라인 핸들러는 템플릿에 그대로 유지 → **완전 안전**.

### D-4. ⚠️ `_renderCompletionBanner` 내 이모지 (🎉) 미제거

`_renderCompletionBanner` (L541~600) 는 P3에서 **수정 금지** 함수. 배너 내 `🎉` / `→` 등 이모지·화살표 잔존.  
→ P3 범위: `_buildWorkshopHTML` 템플릿 내 이모지만 교체 (📷, 👤, 💡). 배너 이모지는 별도 티켓(or P4).

### D-5. ℹ️ `slotCardList` 내 슬롯 카드 스타일

`_renderSlotCards` (L467~516) 가 카드 innerHTML 을 전부 inline style로 생성.  
P3에서 카드 스타일 개선 = `_renderSlotCards` 함수 내부 수정 필요 → **P3 수정 금지 범위**.  
슬롯 카드 비주얼 개선은 별도 티켓 권장.

### D-6. ℹ️ `wsDropZone` inline `ondragover/ondragleave` 에 hardcoded 색상

```js
ondragover="...this.style.background='rgba(241,128,145,0.06)';"
```
이 값은 `var(--brand-bg)` 로 교체 가능하나 `style=` 속성에서 CSS 변수가 동작 가능한지 확인 필요.  
→ CSS 변수는 inline style에서도 동작함 (`element.style.background = 'var(--brand-bg)'` 가능).  
P3에서 교체: `rgba(241,128,145,0.06)` → `var(--brand-bg)`, `var(--accent)` → `var(--brand)`.

---

## § E. 2단계 편집 예정 범위 (승인 후)

### 수정 파일

| 파일 | 범위 | 변경 내용 |
|------|------|-----------|
| `app-gallery.js` | L178~216 (38줄, `_buildWorkshopHTML` 전체) | 템플릿 HTML 재작성 — 구조·클래스·이모지 교체, ID/이벤트 완전 보존 |
| `style-components.css` | 파일 끝에 추가 (약 45줄) | 신규 클래스: `.dropzone`, `.dropzone-icon`, `.dropzone-title`, `.dropzone-sub`, `.ws-header`, `.ws-slot-label`, `.ws-slot-hint` |

> D-1 옵션 A + D-2 옵션 A 승인 시. 다른 선택 시 범위 변경.

### 보존 인라인 스타일 (템플릿에 반드시 남겨야 하는 것)

| 요소 | 인라인 스타일 | 이유 |
|------|--------------|------|
| `#wsResetBtn` | `style="display:none;"` | `_renderPhotoGrid` / `_renderSlotCards` 가 `.style.display` 직접 제어 |
| `#slotCardHeader` | `style="display:none;"` | `_renderSlotCards` 가 `.style.display` 직접 제어 |
| `#wsBanner` | `style="display:none;"` | `_renderCompletionBanner` 가 `.style.display` 직접 제어 |
| `#slotCardList` | `style="display:flex;gap:12px;overflow-x:auto;padding:4px 0 12px;-webkit-overflow-scrolling:touch;"` | 가로 스크롤 UX — JS가 별도 제어 안 함, CSS class로 이동 가능 |

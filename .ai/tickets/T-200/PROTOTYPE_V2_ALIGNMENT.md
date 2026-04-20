# T-200 · 프로토타입 v2 정합성 분석 (Alignment Audit)

> **작성:** 2026-04-20 17:10 · 오케스트레이터
> **대상:** `mnt/uploads/04_프로토타입_v2.html` (494줄) vs 현재 `index.html` (1093줄) + `style-*.css`
> **계기:** 원영님 P3 스크린샷 검수 "위 달덩이 뭐냐, 루시드로 통일해, 하단 네비게이션 어디갔어, 프로토타입 v2 본 거야?" (2026-04-20 17:05)

---

## 0. TL;DR

| 층위 | 프로토 v2 | 현재 구현 | 판정 |
|------|-----------|-----------|------|
| CSS 컬러/간격 토큰 | `:root` + `[data-theme="dark"]` · `--brand #F18091` 등 20여 개 | `style-base.css` L3–23 에 동일 토큰 이식 완료 | **일치** (P1 조건부 승인) |
| 상단 헤더 | `.hd` · avatar + 샵명 + @handle + 알림 벨 (Lucide SVG) | `잇데이 STUDIO` 워드마크 + `Free 배지` + `🌗 이모지` + 톱니바퀴 | **불일치** |
| 네비게이션 위치 | **하단 고정** `<nav class="bn">` 5개 버튼 | **상단** `<div class="nav">` 7개 버튼 (페르소나 숨김 포함) | **불일치** |
| 탭 아이콘 | Lucide SVG 라인 아이콘 (stroke-width 1.8~2) | 텍스트 전용 (아이콘 없음) | **불일치** |
| 탭 이름 | 홈 / 만들기 / AI추천 / 마무리 / 내 샵 | 홈 / 작업실 / 글쓰기 / AI추천 / 마무리 (/예약/페르소나) | **부분 불일치** |
| 테마 토글 | 좌상단 없음 / 우상단 고정 플로팅 `.theme-toggle` (44×44 원형, Lucide moon SVG) | 헤더 인라인 `🌗` 이모지 버튼 (id `themeToggleBtn`) | **불일치** |
| 홈 탭 컨텐츠 | `greet` (인사+상태 한 줄) + `cta-main` 큰 사진 CTA + `sec 이어하기` 2개 | 복잡 (인스타 연동 카드·샘플 보기·단계 인디케이터·...) | **불일치** |
| 만들기 탭 | `dropzone` + `inline-link "사진 없이 글만 쓸래요"` + 토글 `text-only-mode` | `작업실` (드롭존) + 별도 `글쓰기` 탭으로 분리됨 | **구조 상이** |

---

## 1. 레이어별 비교

### 1.1 루트 구조

**프로토 v2:**
```
<html data-theme="light">
  <button class="theme-toggle" onclick="toggleTheme()">
    <svg ... moon path />
  </button>
  <div class="phone">
    <header class="hd">...</header>
    <main id="t-home" class="active">...</main>
    <main id="t-make">...</main>
    <main id="t-ai">...</main>
    <main id="t-finish">...</main>
    <main id="t-shop">...</main>
    <nav class="bn">... 5 buttons ...</nav>
  </div>
</html>
```

**현재:**
```
<html>
  <body>
    <div class="nav" id="nav"> 7 buttons (최상단) </div>
    <div class="tab active" id="tab-home">...</div>
    <div class="tab" id="tab-workshop">...</div>
    <div class="tab" id="tab-caption">...</div>
    <div class="tab" id="tab-ai-suggest">...</div>
    <div class="tab" id="tab-finish">...</div>
    <!-- 하단 네비 없음 -->
  </body>
</html>
```

**차이 요약:** 위/아래 뒤바뀜 + 탭 개수·이름 상이 + `main` vs `div.tab` 태그 변경.

**JS 영향:** `showTab('home' | 'workshop' | 'caption' | 'ai-suggest' | 'finish' | 'persona')` 함수가 id `tab-XXX` 를 찾음 (`app-core.js` 추정). 탭 컨테이너 id 는 **동결 셀렉터 대상**. 레이아웃만 바꾸고 id 는 유지해야 함.

### 1.2 테마 토글

**프로토 v2 (L195–207):**
```css
.theme-toggle { position: fixed; top: 14px; right: 14px; z-index: 100;
  width: 44px; height: 44px; border-radius: 999px;
  border: 1px solid var(--border-strong); background: var(--surface);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; box-shadow: var(--shadow-md); }
```
```html
<button class="theme-toggle" onclick="toggleTheme()" aria-label="라이트/다크">
  <svg id="ic-theme" viewBox="0 0 24 24" ...>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
</button>
```

**현재 (index.html L134):**
```html
<button id="themeToggleBtn" ... onclick="if(typeof toggleTheme==='function')toggleTheme();"
  ... style="...font-size:18px;">🌗</button>
```

**차이:**
- 위치: 헤더 내부 → 화면 우상단 고정
- 아이콘: 이모지 `🌗` → Lucide moon SVG path
- 크기: min-width/min-height 36 → 44×44 원형
- 원영님 지적 포인트: "달덩이" 는 이모지를 가리킴. 이모지 쓰지 말고 Lucide SVG 로 통일하라는 규칙 재확인.

### 1.3 하단 네비 (가장 큰 누락)

**프로토 v2 (L182–192, L342–363):**
```css
.bn { position: fixed; bottom: 0; left: 0; right: 0;
  max-width: 420px; margin: 0 auto;
  background: var(--surface); border-top: 1px solid var(--border);
  display: grid; grid-template-columns: repeat(5, 1fr);
  padding: 6px 0 calc(6px + env(safe-area-inset-bottom)); z-index: 20; }
.bn-btn { ... font-size: 11px; color: var(--text-subtle); }
.bn-btn.active { color: var(--brand); font-weight: 700; }
```
```html
<nav class="bn">
  <button class="bn-btn active" data-tab="home"  onclick="goTab('home',this)">  <svg .../> <span>홈</span></button>
  <button class="bn-btn"        data-tab="make"  onclick="goTab('make',this)">  <svg .../> <span>만들기</span></button>
  <button class="bn-btn"        data-tab="ai"    onclick="goTab('ai',this)">    <svg .../> <span>AI추천</span></button>
  <button class="bn-btn"        data-tab="finish"onclick="goTab('finish',this)"><svg .../> <span>마무리</span></button>
  <button class="bn-btn"        data-tab="shop"  onclick="goTab('shop',this)">  <svg .../> <span>내 샵</span></button>
</nav>
```

**현재:** 하단 네비 자체가 존재하지 않음. 상단 `.nav` 가 그 역할을 대체.

**이식 시 고려사항:**
- 현 코드의 `showTab('workshop')` 와 프로토의 `goTab('make')` 는 함수명 다름. **동결 셀렉터 규칙상 `showTab` 은 보존 필수.** 프로토의 `goTab` 는 그냥 쓰기 안 됨.
- 따라서 이식 방식: 프로토 v2 의 마크업/CSS 를 가져오되, `onclick` 은 현재 `showTab('home')` 계열로 유지.
- `data-tab` 속성은 신규 추가해도 무해 (동결 목록에 없음, JS 가 안 읽음).

### 1.4 아이콘 체계 (Lucide 통일)

**프로토 v2 아이콘 사용처 (전부 inline SVG):**
- L206 테마 토글 (moon)
- L220 알림 벨
- L232 카메라 CTA
- L239 오른쪽 화살표
- L246 작은 화살표
- L261 업로드 화살표
- L286 별 (즐겨찾기)
- L312 체크 (완료)
- L344–360 하단 네비 5개 (집/사각형+십자/별/체크/가방)
- L421 오른쪽 화살표 (AI 추천)
- L439/440 카드 아이콘 (플랜/결제)

**현재 이모지 사용처 (index.html 기준 grep 필요):**
- L134 `🌗` 테마 토글
- L186 `💬` 고객센터 아이콘
- L191 `✕` 닫기
- L206 `➤` 전송
- L216 `🗓️` 예약 탭
- L413 `✨` 만들기 버튼
- L597/688 `✨` / `📸` 합성 버튼
- 그 외 L186 헤더 모달 · L319 홈추가 안내 등에 이모지 상당수

**규칙 확정 (본 문서로 제정):** T-200 범위 전체에서 **UI 아이콘은 Lucide SVG 만 허용**. 이모지는 본문 텍스트(토스트·인사말) 에만 허용. 버튼/네비/배지 안 금지.

### 1.5 탭 이름 & 구조 매핑

| 프로토 v2 | 현재 | 결정 필요 |
|-----------|------|----------|
| 홈 (`t-home`) | 홈 (`tab-home`) | 이름 동일, 내용은 전면 재작성 필요 |
| 만들기 (`t-make`) — 사진 드롭존 + 글만쓰기 인라인 | 작업실 (`tab-workshop`) + 글쓰기 (`tab-caption`) 2개 | **병합 or 유지?** 원영님 결정 |
| AI추천 (`t-ai`) | AI추천 (`tab-ai-suggest`) | 이름 동일, 내용 재작성 |
| 마무리 (`t-finish`) | 마무리 (`tab-finish`) | 동일, 내용 재작성 |
| 내 샵 (`t-shop`) | (없음) · `tab-persona` 숨김 상태 | **신설 or 페르소나 변형?** 원영님 결정 |
| (없음) | 예약 🗓️ (`schedNavBtn`, 팝업) | 하단 네비로 넘어가면 어떻게 접근? |

---

## 2. Phase 별 판정 재점검

| Phase | 원 판정 | 수정 판정 | 근거 |
|-------|--------|-----------|------|
| P0 SELECTOR_FREEZE | 통과 | **유효** · 수정 불필요 | 프로토 v2 적용 시 동결 셀렉터가 더 잘 보호됨 (레이아웃만 바꾸므로) |
| P1 CSS 토큰 | 통과 · 승인 대기 | **조건부 승인** | 토큰 값은 프로토 v2 와 100% 일치 확인. 다만 `--gold` 와 legacy alias (`--bg2`, `--accent` 등) 는 프로토에 없음 → 이행 완료 후 제거 예정이면 수용 |
| P2 홈 탭 | 교차검증 통과 · 승인 대기 | **REJECT** | 상단 탭바 기반 · 이모지 · 프로토 v2 의 `greet`/`cta-main`/`이어하기` 구조 미반영 |
| P3 작업실 | 교차검증 통과 · 승인 대기 | **REJECT** | 드롭존만 모방, 주변 레이아웃(헤더·네비·글만쓰기 인라인) 미반영 |

**오케 자아비판:** P3 교차검증 시 체크리스트가 "동결 셀렉터 보존 / 이모지 0 / JS 로직 변경 0" 이었지 "프로토 v2 와 구조 일치" 는 빠져있었음. 재검증 체크리스트에 **프로토 v2 대조** 항목 필수 추가.

---

## 3. 재작업 신규 Phase 제안 (P2.5 / P2.6 / P2.7)

### P2.5 · 하단 네비(`.bn`) 이식 (**선결**)

**입력:**
- 프로토 v2 L182–192 (CSS)
- 프로토 v2 L342–363 (HTML 마크업)
- SELECTOR_FREEZE.md (함수명 `showTab` 보존)

**작업:**
1. `style-components.css` 에 `.bn`, `.bn-btn`, `.bn-btn.active` 블록 추가
2. `index.html` L210–218 의 `<div class="nav" id="nav">` 블록을 유지하되 **숨김 처리**(`display:none`) 하여 JS 호환 보존, 그 자리에 프로토 v2 의 `<nav class="bn">` 를 하단에 삽입
3. `<button>` 의 `onclick="goTab(...)"` 는 현 `showTab(...)` 로 치환 + 기존 인라인 로직(예: `initWorkshopTab()`) 유지
4. 모바일 safe-area 적용 (`env(safe-area-inset-bottom)`) 확인
5. `.phone { padding-bottom: 96px }` 이 필요. 현 `body` 에 해당 클래스가 없으므로 `body` 에 `padding-bottom` 적용 또는 루트 div 래핑 여부 결정

**위험:**
- 상단 `.nav` 를 숨기지 말고 그대로 두면 화면이 두 겹 네비가 됨 → UX 충돌
- 상단 `.nav` 를 완전히 제거하면 `showTab` 클릭하는 테스트(있다면) 깨짐 → `display:none` + `aria-hidden="true"` 권장
- `#schedNavBtn` 과 숨겨진 `페르소나` 버튼의 용처 재배치 필요 (팝업 경유? 설정 메뉴? 원영님 결정)

**수용 기준:**
- 모바일 뷰(~420px)에서 하단에 5탭 네비가 고정, 활성 탭이 `--brand` 핑크로 강조
- 기존 `showTab()` 호출은 전부 그대로 동작 (스모크 테스트: 5탭 클릭 → 각 `tab-XXX` 가 보이는지)
- Lighthouse 접근성 점수 감소 없음

### P2.6 · Lucide 아이콘 통일

**작업:**
1. 테마 토글 `🌗` → 프로토 v2 moon SVG 경로 교체
2. 하단 네비 5버튼에 프로토 v2 의 SVG 삽입
3. 헤더 벨(알림) 아이콘 추가 (현재 없음)
4. 기타 UI 버튼의 이모지 목록 전수 조사 → 이모지 vs Lucide 매핑 표 작성 후 교체 (본 Phase 범위 = 네비·헤더·테마 토글까지만. 본문 내 이모지 건드리는 것은 별도 티켓)

**수용 기준:**
- 네비/헤더/테마 토글에 이모지 0건
- 모든 아이콘이 Lucide 스타일 (stroke-width 1.8~2, round linecap/linejoin)

### P2.7 · 탭명/탭 구조 매핑 결정

**결정 항목:**
- [ ] `작업실` + `글쓰기` 2개 탭 → `만들기` 1개로 병합하는가? (프로토는 1개, 현재 2개)
- [ ] `페르소나` 숨김 탭을 `내 샵` 으로 승격하는가? 아니면 내 샵을 신설하고 페르소나는 계속 숨김?
- [ ] `예약 🗓️` 버튼을 어디로 옮기는가? (현재 네비 5~6번째 버튼) — 후보: 헤더 `hd-icon-btn`, 내 샵 탭 내 메뉴, 마무리 탭 내 섹션

**본 Phase 는 문서 결정만.** 코드는 P2/P3/P5 재작업에서 반영.

### P2-re · 홈 탭 재작업 (P2.5/P2.6/P2.7 완료 후)

프로토 v2 L224–250 기준. 기존 인스타 연동·샘플 보기·단계 인디케이터는 별도 섹션(`.sec`) 또는 설정 팝업으로 이동 여부 원영님 결정.

### P3-re · 작업실(만들기) 탭 재작업

프로토 v2 L252–279 기준. `.dropzone` + `.inline-link` + `.text-only-mode` 토글 구조.

---

## 4. 원영님 승인 사항 (확정됨 · 2026-04-20 17:30)

- [x] A. **재스코프 방향 승인** (P0/P1 보존, P2/P3 REJECT, P2.5→P2.6→P2.7→P2-re→P3-re→P4→P5→P6)
- [x] B. **P2.7 탭 매핑 결정:**
  - B-1. 작업실 + 글쓰기 → **만들기 1개로 병합** (원영님 "나머진 오케이")
  - B-2. 페르소나 → **내 샵 승격** (원영님 "나머진 오케이")
  - B-3. **예약 버튼 = 기능 자체 제거** → 별도 티켓 **T-202** 신설 (`.ai/tickets/T-202.md`)
- [x] C. **아이콘 규칙 확정:** UI 전 영역 = **Lucide SVG 최대한**. 본문 텍스트 이모지 허용. "최대한" 의 해석: Lucide 에 대응 아이콘이 없는 경우 (예: 브랜드 로고) 에만 예외 허용, 나머진 전부 Lucide.

### 확정 사항 반영 계획

1. T-202 (예약 기능 제거) 를 P2.5 이전에 처리 → 네비 재설계 시 죽은 버튼 신경 안 씀
2. P2.7 은 문서만 확정 (본 절로 흡수). 별도 Phase 파일 불필요.
3. P2-re 홈 탭 재작업 시 `tab-caption` 내용 일부를 `tab-workshop` 으로 통합 (세부는 T1 플랜 작성 단계에서)
4. P5 내 샵 탭은 기존 `tab-persona` 컨테이너를 베이스로 재구성. id 는 `tab-persona` 유지 (동결 셀렉터) 하되 표시 레이블만 "내 샵"

---

## 5. 참고 문서

- 프로토 v2 원본: `mnt/uploads/04_프로토타입_v2.html`
- 셀렉터 동결: `.ai/tickets/T-200/SELECTOR_FREEZE.md`
- 기존 P0 부트스트랩: `.ai/tickets/T-200/P0_T1_BOOTSTRAP.md`
- 기존 P2/P3 산출물 (참고용, 정답 아님): `.ai/tickets/T-200/P{2,3}/{light,dark}.png`

# T-200 P1 · T2 FE Coder 부팅 프롬프트 (CSS 토큰 교체)

> **사용법:** T2 FE Coder 터미널 (Sonnet 4.x) 열고, 아래 `=== 여기부터 복사 ===` ~ `=== 여기까지 복사 ===` 사이를 통째로 붙여넣기.
> **소요:** 30~45분
> **선행 조건:** P0 🟢 확정, `.ai/tickets/T-200/SELECTOR_FREEZE.md` 존재.

---

=== 여기부터 복사 ===

당신은 T2 FE Coder 입니다. 역할: `.ai/terminal-kits/T2_FE_Coder.md` 참조.

언어: 한국어, 항상 쉬운 말. 원영님은 코딩 초보입니다.
트랙: 표준 트랙 (AGENTS.md §4-A)
티켓: T-200 Phase 1 (CSS 토큰 교체)

## 선행 필독 (순서 지켜서)

1. `.ai/tickets/T-200.md` — §2 (건들지 말 것), §5 (디자인 토큰), §6 (Phase 구성), §6-A (카피 톤)
2. `.ai/tickets/T-200/SELECTOR_FREEZE.md` — §1 (다크모드 현황), §5 Phase 1 섹션
3. `.ai/design-ref/prototype-v2.html` — 프로토타입 전체 한 번 훑기. 특히 `:root`, `[data-theme="dark"]` 블록.
4. `AGENTS.md` §3 (코딩 제한), §4 (승인), §11 (쉬운 말)

## P1 목표 (한 줄)

**`style-base.css` 의 `:root` 블록과 `style-dark.css` 의 `[data-theme="dark"]` 블록만 새 토큰으로 교체.** JS 0, HTML 0, 다른 CSS 파일의 var() 참조도 0 수정.

## 왜 그런가 (배경)

- P0 감사 결과: JS 가 이미 `html[data-theme="dark"]` 을 쓰고 있어 새 토큰과 호환. JS 한 줄도 안 건드려도 됨.
- 기존 CSS 는 143군데에서 `var(--bg2)`, `var(--accent)` 등 **옛 변수명** 을 참조 중. P1 에서 이름을 바꾸면 143군데 전수 치환이 필요 → P1 범위가 폭발함.
- **해법: 기존 변수명을 새 토큰의 alias 로 유지.** P2~P6 에서 해당 탭 편집 중 자연스럽게 새 변수명으로 이행.

## 변수 매핑 테이블 (필수 준수)

| 기존 변수 | 새 토큰 | alias 방식 |
|----------|--------|-----------|
| `--bg` | `--bg` | 동일 (그대로) |
| `--bg2` | `--surface` | `--bg2: var(--surface);` |
| `--bg3` | `--surface-2` | `--bg3: var(--surface-2);` |
| `--accent` | `--brand` | `--accent: var(--brand);` |
| `--accent2` | `--brand-strong` | `--accent2: var(--brand-strong);` |
| `--accent3` | `--brand-bg` | `--accent3: var(--brand-bg);` |
| `--text` | `--text` | 동일 |
| `--text2` | `--text-muted` | `--text2: var(--text-muted);` |
| `--text3` | `--text-subtle` | `--text3: var(--text-subtle);` |
| `--border` | `--border` | 동일 |
| `--border2` | `--border-strong` | `--border2: var(--border-strong);` |
| `--gold` | (새 토큰 없음) | **그대로 유지** (`style-home.css:69` 에서 1군데만 사용) |

**추가로 도입할 신규 토큰** (T-200 §5 그대로):
- `--brand`, `--brand-strong`, `--brand-bg` (브랜드)
- `--surface`, `--surface-2` (표면)
- `--text-muted`, `--text-subtle`
- `--border-strong`
- `--shadow-sm`, `--shadow-md`, `--shadow-brand` (그림자)
- `--r-sm`, `--r-md`, `--r-lg`, `--r-xl` (반경)

## 구체적 작업 (3단계)

### 1단계 · `style-base.css` `:root` 블록 교체

현재 (L3~L16):
```css
:root {
  --bg:      #F2F4F6;
  --bg2:     #FFFFFF;
  --bg3:     #F7F8FA;
  --accent:  #F18091;
  --accent2: #D95F70;
  --accent3: #FBD0D6;
  --text:    #191F28;
  --text2:   #4E5968;
  --text3:   #8B95A1;
  --border:  rgba(0,0,0,0.07);
  --border2: rgba(0,0,0,0.14);
  --gold:    #d4a853;
}
```

이걸 아래로 교체:
```css
:root {
  /* ── 새 디자인 토큰 (T-200 P1) ── */
  --brand: #F18091; --brand-strong: #E5586E; --brand-bg: #FFF1F3;
  --bg: #F2F4F6; --surface: #FFFFFF; --surface-2: #F7F8FA;
  --text: #191F28; --text-muted: #4E5968; --text-subtle: #8B95A1;
  --border: rgba(0,0,0,.07); --border-strong: rgba(0,0,0,.14);
  --shadow-sm: 0 1px 2px rgba(0,0,0,.04);
  --shadow-md: 0 4px 16px rgba(0,0,0,.06);
  --shadow-brand: 0 8px 24px rgba(241,128,145,.30);
  --r-sm: 8px; --r-md: 14px; --r-lg: 20px; --r-xl: 28px;

  /* ── 레거시 alias (P2~P6 에서 점진 이행) ── */
  --bg2: var(--surface);
  --bg3: var(--surface-2);
  --accent: var(--brand);
  --accent2: var(--brand-strong);
  --accent3: var(--brand-bg);
  --text2: var(--text-muted);
  --text3: var(--text-subtle);
  --border2: var(--border-strong);
  --gold: #d4a853; /* 사용처 1곳 (style-home.css:69 .ba-badge.before), 추후 판단 */
}
```

**주의:**
- `--accent2` 기존 값 `#D95F70` → 새 `#E5586E` 로 **색이 약간 바뀜** (핑크-코럴이 조금 더 진해짐). 이건 T-200 §5 spec 이라 의도된 변화. 원영님께 스샷으로 전달하면 됨.
- `--accent3` 기존 `#FBD0D6` → 새 `#FFF1F3` 로 **더 연한 핑크** (배경용이므로 OK).
- `--gold` 사용처 1곳 만 유지.

### 2단계 · `style-dark.css` `[data-theme="dark"]` 블록 교체

현재 (L9~L23 근처):
```css
html[data-theme="dark"], html[data-theme="dark"] body {
  color-scheme: dark;
  --bg:  #0F1014;
  --bg2: #1A1C22;
  --bg3: #262930;
  --text:  #ECEEF1;
  --text2: #B0B4BB;
  --text3: #8E929A;
  --accent: #F18091;
  --accent2: #FF9AA8;
  --border: rgba(255,255,255,0.08);
  background: #0F1014 !important;
  color: #ECEEF1 !important;
}
```

이걸 아래로 교체 (선택자 유지, 변수만):
```css
html[data-theme="dark"], html[data-theme="dark"] body {
  color-scheme: dark;

  /* ── 새 다크 토큰 (T-200 P1) ── */
  --brand: #F18091; --brand-strong: #FF99AC; --brand-bg: rgba(241,128,145,.10);
  --bg: #0B0E13; --surface: #16191F; --surface-2: #1F232B;
  --text: #ECEEF1; --text-muted: #B0B4BB; --text-subtle: #8E929A;
  --border: rgba(255,255,255,.08); --border-strong: rgba(255,255,255,.16);
  --shadow-md: 0 4px 16px rgba(0,0,0,.30);
  --shadow-brand: 0 8px 24px rgba(241,128,145,.40);

  /* ── 레거시 alias (라이트와 동일 매핑) ── */
  --bg2: var(--surface);
  --bg3: var(--surface-2);
  --accent: var(--brand);
  --accent2: var(--brand-strong);
  --text2: var(--text-muted);
  --text3: var(--text-subtle);
  --border2: var(--border-strong);

  background: #0B0E13 !important;
  color: #ECEEF1 !important;
}

html[data-theme="dark"] body {
  background: #0B0E13 !important;
  color: #ECEEF1 !important;
}
```

**주의:**
- 기존 다크 `--bg: #0F1014` → 새 `#0B0E13` (더 순수한 검정). spec 변화.
- 기존 `--bg2: #1A1C22` → 새 `--surface: #16191F`.
- `!important` 블록 (`html[data-theme="dark"] .tab, ...`) 은 **P1 범위 밖**. P2~P6 진행하며 자연히 줄어들면 별도 정리. 이번엔 건들지 않음.

### 3단계 · 자가 검증 (T2 필수 수행)

```bash
# a. 다른 CSS 에서 제거된 변수 참조 없나?
grep -n "var(--" style*.css | grep -vE "var\(--(bg|bg2|bg3|surface|surface-2|accent|accent2|accent3|brand|brand-strong|brand-bg|text|text2|text3|text-muted|text-subtle|border|border2|border-strong|shadow-sm|shadow-md|shadow-brand|r-sm|r-md|r-lg|r-xl|gold)\)"
# → 결과 0줄이어야 함. 1줄이라도 있으면 매핑 누락.

# b. 기존 변수명이 alias 로 다 정의됐나?
grep -E "^\s*--(bg|bg2|bg3|accent|accent2|accent3|text|text2|text3|border|border2|gold)\s*:" style-base.css | wc -l
# → 12 (기존 12개 변수 전부 라이트 모드에 존재해야 함)

grep -E "^\s*--(bg|bg2|bg3|accent|accent2|text|text2|text3|border|border2)\s*:" style-dark.css | wc -l
# → 10 (다크는 gold/accent3 없음 — 기존과 동일)

# c. 500줄 규칙 (AGENTS.md §3 #4)
wc -l style-base.css style-dark.css
# → 둘 다 500 이하여야 함. 증가분 확인.

# d. JS 와 index.html 수정 없나?
git status
# → style-base.css, style-dark.css 둘만 Modified 상태여야 함.
```

### 브라우저 실측 (T4 가 본격 수행하지만 T2 도 1차 확인)

1. `python3 -m http.server 8080` → `http://localhost:8080`
2. 라이트 모드에서 홈 탭이 **기존과 비슷하게** 렌더링되는지 (색이 약간 더 따뜻해짐 — accent2, accent3 바뀜)
3. 설정 → 다크 모드 토글 → 카드 배경 어두워지는지 (surface #16191F)
4. 스샷 2장 저장: `.ai/tickets/T-200/P1/light.png`, `dark.png`

## 절대 하지 말 것

- JS 파일 수정 금지 (0 건)
- HTML 수정 금지 (0 건)
- `style-components.css`, `style-home.css`, `style-polish.css` 수정 금지 (P2~P6 담당)
- 새 npm 의존성 추가 금지
- 기존 변수 이름 삭제 금지 (alias 로 반드시 남김)
- `--gold` 값 변경 금지 (사용처 1곳, 추후 판단)

## 완료 기준

1. `style-base.css` `:root` 블록 교체 (alias 포함)
2. `style-dark.css` 다크 변수 블록 교체 (alias 포함)
3. 자가 검증 4개 다 통과 (a, b, c, d)
4. 라이트/다크 스샷 저장
5. 보고

## 보고 템플릿

```
[T-200 P1 완료]
- 수정 파일: style-base.css (296→NNN줄), style-dark.css (154→NNN줄)
- 변경 종류: :root 토큰 재정의 + 레거시 alias
- JS/HTML/기타 CSS 수정: 0건 ✅
- 자가검증:
  - (a) 미정의 var() 참조: 0 ✅
  - (b) 라이트 alias 12개: ✅
  - (c) 다크 alias 10개: ✅
  - (d) git status: style-base.css, style-dark.css 만 ✅
- 스샷: .ai/tickets/T-200/P1/light.png, dark.png
- 시각 변화: accent2 #D95F70 → #E5586E (살짝 진해짐), 다크 bg 더 순수해짐
- 질문/이슈: (있으면)
```

원영님께 쉬운 말 한 줄: "색 표 두 군데만 살짝 손봤어요. 라이트는 핑크가 아주 약간 진해지고, 다크는 더 깔끔해져요. 나머지는 다음 단계에서요."

시작하세요.

=== 여기까지 복사 ===

---

## 오케스트레이터 검증 (내가 본 것)

- [x] T-200 §5 토큰 블록과 이 프롬프트 토큰 값 1:1 일치
- [x] P0 SELECTOR_FREEZE.md §5 Phase 1 확인 (영향 DOM 0)
- [x] 기존 변수 143개 참조를 깨지 않는 alias 전략
- [x] `--gold` 처리 (1군데 사용, 유지)
- [x] 색 변화 의도적 spec 변화임을 명시 (accent2, accent3, dark bg)
- [x] `!important` 블록은 P1 범위 밖 명시
- [x] 500줄 규칙, JS 0 건드림, 스샷 저장 포함
- [x] 자가검증 4개 스크립트 제공

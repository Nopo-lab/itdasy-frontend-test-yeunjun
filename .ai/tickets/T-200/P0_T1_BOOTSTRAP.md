# T-200 P0 · T1 Architect 부팅 프롬프트 (셀렉터 감사)

> **사용법:** 원영님 T1 Architect 터미널 (Opus 4.x) 을 열고, 아래 `=== 여기부터 복사 ===` 와 `=== 여기까지 복사 ===` 사이를 통째로 붙여넣기.
>
> **소요 예상:** 30~60분 (읽기만, 코드 변경 0)
>
> **선행 조건:** 이 레포 (`itdasy-frontend-test-yeunjun-main`) 가 T1 터미널에 마운트돼 있어야 함.
>
> **프로토타입 v2:** `.ai/design-ref/prototype-v2.html` (2026-04-20 원영님 업로드, 494줄). P0 감사 중 참고용으로 열어봐도 OK (필수는 아님, P1 부터 본격 참조).

---

=== 여기부터 복사 ===

당신은 **T1 Architect** 입니다. 역할: `.ai/terminal-kits/T1_Architect.md` 참조.

**언어:** 한국어, 항상 쉬운 말. 원영님은 코딩 초보입니다.
**트랙:** 표준 트랙 (AGENTS.md §4-A)
**티켓:** T-200 Phase 0 (셀렉터 감사)

## 배경 · 왜 이 작업이 중요한가

지금부터 디자인 리프레시 (T-200) 을 시작할 준비 중입니다. HTML 구조·CSS·아이콘만 교체하고 JS 로직은 한 줄도 안 건드립니다. 다만 JS 가 HTML 의 ID·class 를 **258 + 42 + 218 개** 참조하고 있어서, HTML 을 건드릴 때 이 중 하나가 깨지면 기능 파괴가 일어납니다.

그래서 **P0 · 셀렉터 감사** 가 필요합니다. 이 단계는 코드 변경이 0 이며, `SELECTOR_FREEZE.md` 라는 보호 리스트 한 개만 만듭니다. P1~P6 은 T2 가 이 리스트를 반드시 참조하며 편집합니다.

**배경 문서 (필독):**
1. `.ai/tickets/T-200.md` — 이 티켓의 마스터 문서. 특히 §2 (건들지 말 것), §4 (안전장치), §6 (Phase 구성) 숙지.
2. `AGENTS.md` §3 (코딩 제한), §4 (승인 트랙), §11 (쉬운 말 규칙)
3. `CLAUDE.md` (스테이징 특이사항)

## 당신의 목표 (P0 만)

`.ai/tickets/T-200/SELECTOR_FREEZE.md` 파일을 만들어서 다음 6가지 감사 결과를 기록:

### 1. JS 셀렉터 전수조사 (필수)

감사 대상 파일:
- `app-core.js`, `app-caption.js`, `app-gallery.js`, `app-portfolio.js`
- `app-persona.js`, `app-instagram.js`, `app-plan.js`
- `app-haptic.js`, `app-push.js`, `app-oauth-return.js`
- `js/gallery/*.js` (5개 서브모듈)

각 파일에서 아래 패턴을 찾아 대상 셀렉터를 뽑아내세요:
- `document.getElementById('...')` / `getElementById("...")`
- `document.querySelector('...')` / `querySelectorAll('...')`
- `element.classList.add/remove/toggle('...')`
- `element.dataset.xxx` 참조 (HTML 에서 `data-xxx` 속성이 반드시 있어야 하는 경우)
- `element.addEventListener('event', ...)` 중 대상이 특정 ID/class 인 경우

**도구 힌트:**
```bash
grep -rn "getElementById\|querySelector\|classList" app-*.js js/ | sort -u
```

### 2. 셀렉터 3단계 분류 (필수)

추출한 셀렉터를 아래 3가지 카테고리로 분류:

- 🔴 **필수 보존 (MUST)** — JS 가 ID/class 를 직접 참조. HTML 리프레시 후에도 **반드시 같은 이름** 존재. 예: `#homeWelcome`, `.tab-home`
- 🟡 **동작 보존 (SHOULD)** — 이벤트 위임 / 부모-자식 관계가 있음. 이름은 바꿔도 되지만 구조 관계는 유지. 예: `.card .action-btn`
- 🟢 **자유 (CAN)** — 순수 장식용. 이름 바꿔도 무방.

출력 형식 예시:
```
## 🔴 필수 보존 리스트

| 셀렉터 | 참조 파일 · 줄 | 사용 위치 | 비고 |
|-------|---------------|---------|------|
| `#homeWelcome` | app-core.js:123, app-caption.js:456 | 홈 탭 인사말 바꿀 때 사용 | P2 영향 |
| `.btn-primary` | app-core.js:80 (5회) | 전역 버튼 | 전 Phase 영향 |
```

### 3. 다크모드 토글 매핑 조사 (필수)

현재 다크모드가 어떻게 켜지는지 찾아서 기록:
- `body.classList.add('dark')` 같은 패턴이 있나?
- `localStorage.theme` 또는 `localStorage.getItem('theme')` 사용하나?
- `document.documentElement.setAttribute('data-theme', ...)` 를 쓰나?
- CSS 에서 `body.dark` vs `[data-theme="dark"]` 어느 쪽이 현재 매칭 중인가?

**왜 필요한가:** T-200 §5 의 새 토큰은 `[data-theme="dark"]` 기반입니다. 기존 JS 가 다른 플래그 방식을 쓰면 **새 CSS 와 호환되지 않습니다**. P1 전에 **매핑 규칙** (예: "P1 후엔 JS 도 `data-theme` 로 바꿔야 함" vs "JS 는 건드리지 않고 CSS 만 기존 플래그를 지원하도록 병기") 을 결정해야 합니다.

출력:
```
## 🌙 다크모드 현황

- 토글 방식: body.classList.toggle('dark') (app-core.js:234)
- 저장 위치: localStorage.getItem('itdasy_theme') = 'dark' | 'light' (app-core.js:245)
- 읽는 CSS: style-dark.css:3 body.dark { ... }

## 🌙 P1 매핑 규칙 (내 제안)

옵션 A: CSS 만 병기 — `body.dark, [data-theme="dark"] { ... }` (JS 0 건드림) ✅ 추천
옵션 B: JS 도 수정 — body.classList → documentElement.dataset.theme (JS 변경 = 규칙 위반)

→ 옵션 A 권장. P1 에서 T2 가 반영.
```

### 4. 인라인 `onclick=` 전수조사 (필수)

`index.html` 에서 `onclick="..."` 또는 `onchange="..."` 같은 인라인 핸들러를 모두 찾아 기록:

```bash
grep -n "onclick\|onchange\|onsubmit\|oninput" index.html
```

**왜 필요한가:** HTML 구조 재배치 시 인라인 핸들러는 **문자열로 JS 함수명을 참조**하므로, 구조 바꿔도 함수명은 반드시 유지해야 합니다. 또한 AGENTS.md §3 #6 ("인라인 핸들러 금지") 위반 케이스가 있다면 T-200 과 별개 티켓으로 분리할지 판정 필요.

출력:
```
## ⚠️ 인라인 핸들러 현황

| 줄 | HTML | 함수 | AGENTS.md §3 #6 위반? |
|----|------|-----|---------------------|
| 123 | `<button onclick="goHome()">` | goHome | 예 → 별도 티켓 |
```

### 5. `data-*` 속성 의존성 조사 (권장)

JS 가 `element.dataset.xxx` 또는 `element.getAttribute('data-xxx')` 로 HTML 의 커스텀 속성을 읽는 경우 기록. HTML 재작성 시 이 속성들 반드시 유지.

### 6. 각 Phase 용 체크리스트 (권장)

P1~P6 각 Phase 에서 T2 가 "이 셀렉터들은 건드리지 말 것" 한눈에 볼 수 있게 Phase 별 서브리스트 생성:

```
## Phase 2 (홈 탭) 영향 셀렉터

- 🔴 #homeWelcome, #homeCTA, .tab-home, .continue-card, ...
- 🟡 .home-section > .card, ...

## Phase 3 (만들기 탭) 영향 셀렉터

- 🔴 #createDropzone, .create-tab, ...
```

## 절대 하지 말 것

- JS 파일 수정 금지 (읽기만)
- HTML 수정 금지 (읽기만)
- CSS 수정 금지 (읽기만)
- 새 파일은 `.ai/tickets/T-200/SELECTOR_FREEZE.md` 한 개만 생성 (그리고 필요 시 서브 파일)
- 셀렉터 분류가 애매하면 🔴 로 안전하게 올리기 (거짓 양성 > 거짓 음성)

## 완료 기준

1. `.ai/tickets/T-200/SELECTOR_FREEZE.md` 생성됨
2. 위 6개 항목 모두 기록
3. 자가검토 후 오케스트레이터에게 보고 (짧게: "P0 완료, 필수 셀렉터 N개, 동작 M개, 다크모드는 옵션 A 권장")
4. 오케스트레이터 교차검증 → 원영님 🟢 → P1 진입

## 보고 템플릿

```
[T-200 P0 완료]
- 산출물: .ai/tickets/T-200/SELECTOR_FREEZE.md (NNN줄)
- 🔴 필수 보존: NN개
- 🟡 동작 보존: NN개
- 🟢 자유: NN개
- 다크모드 매핑 권장안: 옵션 A (CSS 병기)
- 인라인 onclick: NN개 발견, §3 #6 위반 NN개
- 질문 / 애매한 점: (있으면 여기 기록)
```

**원영님은 초보이므로** 보고는 쉬운 말로. 예: "JS 가 258개 ID 를 쓰고 있어서 그 중 172개는 건드리면 안 된다, 86개는 이름은 바꿔도 된다, 이런 식."

자, 시작하세요. 완료 후 보고해 주세요.

=== 여기까지 복사 ===

---

## 오케스트레이터 교차검증 (내가 직접 검토한 것)

- [x] T1 역할 파일 (`T1_Architect.md`) 존재 확인
- [x] T-200 §4-B 에 P0 6개 항목 모두 이 프롬프트에 반영됨
- [x] AGENTS.md §3, §4, §11 교차참조 포함
- [x] 코드 변경 0 / 읽기만 강조
- [x] 산출물 경로 `.ai/tickets/T-200/SELECTOR_FREEZE.md` 명시
- [x] 보고 템플릿 포함
- [x] 쉬운 말 규칙 (§11) 반영

## 원영님이 할 일 (2단계)

1. T1 Architect 터미널 열기 (`.ai/terminal-kits/T1_Architect.md` 의 부팅 방법 참조)
2. 위 `=== 여기부터 복사 ===` ~ `=== 여기까지 복사 ===` 사이 붙여넣기 → 엔터
3. 완료 보고 오면 오케스트레이터 (저) 에게 전달

**프로토타입 v2 마운트는 P0 후에 해결해도 됩니다.** P0 은 프로토타입 없이 기존 코드만 읽습니다. P1 (CSS 토큰 교체) 부터 프로토타입 참조가 필요하므로, P0 진행 중 병렬로 마운트 문제를 해결하면 됩니다.

# 프론트엔드 코딩 개선점 분석 (하네스 관점)

> 대상: `itdasy-frontend-test-yeunjun` (연준 스테이징)
> 방법: 대형 파일 5개(app-caption/portfolio/gallery/core/persona.js)를 병렬로 심층 감사.
> 정리 기준: 너가 말한 3기둥(컨텍스트 / 자동 강제 / 가비지 컬렉션) + 피드백 루프.
> 모든 라인 번호는 실제 파일에서 교차검증됨. 수정은 안 했고 리포트만.

---

## 🔥 먼저 봐야 할 치명적 버그 1건 (하네스 이전에 즉시 픽스)

### 토큰 키 격리가 **깨져 있음** — 운영/스테이징 토큰 크로스 오염 위험

`app-core.js:33` 에서 `_TOKEN_KEY = 'itdasy_token::staging'` 로 격리하는 설계인데, **두 파일에서 옛날 키를 그대로 쓰고 있음**:

| 파일 | 라인 | 문제 |
|------|------|------|
| `app-support.js` | 167 | `!localStorage.getItem('itdasy_token')` — 격리 전 키 사용 |
| `app-push.js` | 42 | `if (!localStorage.getItem('itdasy_token')) return;` — 동일 |

**영향:** 스테이징 토큰은 `itdasy_token::staging` 에 있는데 위 두 파일은 `itdasy_token` 을 조회 → 항상 없음 판정 → 푸시 알림 구독 안 됨, 고객지원 로직 미동작. 스테이징에서 "푸시 안 와요" 증상이 있었다면 여기 원인.

**하네스에 잡히는가?** ESLint `no-restricted-syntax` 규칙 하나면 잡힘. 즉 규칙화 가치가 **즉시 발생**하는 사례 → AGENTS.md 의 "절대 안 됨"에 들어갈 1번 항목.

---

## 기둥 1. 컨텍스트 파일에서 규칙화해야 할 것 (AGENTS.md "해도 됨/절대 안 됨")

### 1-A. 절대 안 됨 (린터로 강제)

1. **localStorage 키 하드코딩 금지**
   - caption.js: 16, 19, 24, 27, 32, 47, 72, 147, 224, 435, 542, 617, 618, 666, 1085, 1091 — 15+ 곳에 `localStorage.getItem('itdasy_*')` 흩어짐
   - support.js:167, push.js:42 — 위 버그
   - **규칙:** 모든 localStorage 접근은 `app-core.js` 의 `STORAGE_KEYS` 객체(아직 없음, 신설 필요) 경유.

2. **API URL `API + '/경로'` 인라인 조합 금지**
   - portfolio.js: 95, 259, 384, 461, 532, 594, 621, 792, 811, 850, 862, 890, 919 — 13+ 곳
   - caption.js: 225, 256, 724, 744
   - **규칙:** `app-core.js` 에 `ENDPOINTS = { CAPTION_GENERATE: '/caption/generate', ... }` 신설 후 그것만 참조.

3. **함수 50줄 초과 금지** (`max-lines-per-function: [warn, 50]`)
   - caption.js `_doGenerateCaption` 536–647 (111줄) / `_renderCaptionPhotoRow` 281–369 (88줄) / `renderBA` 846–919 (73줄)
   - portfolio.js `renderEdit` 78–202 (**125줄**) / `loadPortfolio` 448–570 (123줄) / `handlePortfolioUpload` 295–365 (71줄)
   - gallery.js `_renderAssignPopup` 321–405 (85줄) / `_renderPopupPhotoGrid` 760–827 (68줄)
   - persona.js `_renderIdentityBlock` 421–548 (128줄) / `_loadIdentity` 561–648 (88줄) / `_saveIdentity` 650–736 (87줄)

4. **`catch(e) {}` 빈 catch 금지** — 에러 은폐
   - core.js: 42, 372, 716, 738 (전부 `catch(_){}` 또는 빈 블록)
   - portfolio.js: 796, 862, 897 (UI 에러 무시)
   - caption.js: 633 `.catch(() => {})` — slot 저장 실패 은폐
   - **규칙:** 최소 `console.warn` 한 줄이라도 + 사용자 토스트.

5. **innerHTML 에 인라인 `onclick="..."` 금지** — CSP/XSS
   - caption.js: 423 (`onclick="deleteCaptionKeyword('${k}',event)"` — `k`가 유저 입력!)
   - portfolio.js: 468, 484, 543, 606 — 유저 데이터 템플릿 직접 주입
   - persona.js: 82, 88, 100, 129, 137, 174, 302, 372 (10곳)
   - **규칙:** `addEventListener` + 이벤트 위임 사용. 기존 것도 점진 제거.

### 1-B. 해도 됨 (명시 허용)

- 전역 네임스페이스 4개만 허용: `window.API`, `window.authHeader`, `window.hapticLight`, `window.Capacitor` (core가 만든 `window._customBgUrl` 는 **제거 대상** — portfolio.js:124, 823 에도 중복 주입 중)
- 한국어 주석/에러메시지는 OK. JSDoc 영문 병기 권장.
- `fetch` 래퍼 오버라이드(core.js:748)는 허용. 단, 각 모듈이 재정의 금지.

### 1-C. 모듈별 CLAUDE.md 최우선 고지 사항

각 폴더 CLAUDE.md(이전 계획서 3.1~3.5)의 **"변경 시 체크"** 섹션에 아래 문구 반드시 포함:

- `caption/`: "슬롯 저장 실패(`saveSlotToDB`)는 silent catch 금지. 사용자 피드백 필수."
- `portfolio/`: "`renderEdit()` 같은 캔버스+API+워터마크 혼합 함수는 새로 만들지 말 것. 3개 함수로 분리."
- `gallery/`: "**`app-gallery.js` 모놀리스는 orchestrator 로 유지**. 삭제 금지. 함수명 중복 0건 검증됨 → 신규 함수 추가 시 submodule 로만."
- `persona/`: "현재 900줄. 새 기능 추가 = 새 파일 강제. `_renderIdentityBlock` 수정 시 분할 PR 동시 진행."
- `core/`: "fetch/authHeader 시그니처 변경은 breaking change. 전 파일 grep 후 PR."

---

## 기둥 2. 자동 강제 시스템 (린터 + 프리커밋 + 자동 교정 루프)

### 2-A. 바로 적용 가능한 ESLint 규칙 (hit count 기반 우선순위)

| 규칙 | 현재 위반 수(추정) | 초기 severity |
|------|-------------------|--------------|
| `no-empty` (빈 catch) | 10+ | `error` |
| `no-restricted-globals: ['itdasy_token']` (토큰 키 직접 사용) | 2 | `error` — 버그니까 즉시 |
| `max-lines-per-function: [50]` | 15+ | `warn` → 분할 끝나면 `error` |
| `max-lines: [500]` | 5개 파일 | `warn` → `error` 는 분할 후 |
| `no-console: [warn, { allow: ['error'] }]` | 5개 (caption 604/751/755, portfolio 568/599) | `warn` |
| `no-inline-comments` in innerHTML onclick | 20+ | `warn` (수동 교정) |
| `no-restricted-syntax` for `API + '/...'` 패턴 | 17+ | `warn` |

**핵심:** 처음부터 다 `error` 로 걸면 커밋이 막혀서 아무것도 못함. 위 표대로 **버그성 2개만 `error`**, 나머지는 `warn` → 모듈 분할 끝나면 승격.

### 2-B. Stylelint

CSS는 이미 분할됨(`style-base/components/dark/home/polish.css`, 각 200–450줄). `stylelint-config-standard` 만 켜도 충분. 룰 커스텀 불필요.

### 2-C. Husky pre-commit

```sh
npx lint-staged          # 변경 파일만 검사 (속도)
npm test -- --passWithNoTests
```

`lint-staged` 설정으로 변경된 `.js`만 ESLint 돌리면 1167줄 caption.js 매번 돌릴 필요 없음 → 커밋 체감속도 유지.

### 2-D. 자동 교정 루프 (AI 에이전트 워크플로우)

AGENTS.md 에 고정 시퀀스로 명시:

```
1. AI 수정 → 2. npm run lint:fix → 3. 남은 error 재수정
→ 4. npm test → 5. 실패 시 1로 복귀 (max 3회)
→ 6. 3회 초과 실패 시 사람 호출, AGENTS.md 에 "실패 사례" 추가
```

6번이 바로 네가 말한 "실패 → 새규칙 → 하네스 진화" 피드백 루프.

---

## 기둥 3. 가비지 컬렉션 (주기적 청소 대상 — 주간 GC가 찾아야 할 것)

`scripts/gc-weekly.js` 가 매주 월요일 돌리는 체크 항목:

1. **문서/코드 불일치 탐지 (중요)**
   - `CLAUDE.md:38` "⚠️ `app-caption.js` / `app-portfolio.js` / `app-gallery.js` / `style.css` 는 1000줄+" ← **`style.css` 는 이미 10줄.** 문서가 현실 못 따라감.
   - GC 스크립트가 파일 줄 수 실측 → CLAUDE.md 문구 비교 → 불일치 시 이슈 생성.

2. **Dead-end TODO 추적**
   - caption.js:598 `const hashes = ''` + `// TD-020: 해시태그 미반환` — 해시태그 기능 미구현인 채 방치.
   - caption.js:609–612 — 주석 처리된 디버그 로그 + 사용 안 되는 `respLT`, `respTO` 변수.
   - GC: 코드에서 `TD-\d+` 티켓 ID 긁어서 → GitHub Issue 상태랑 대조.

3. **모놀리스 vs 서브모듈 상태 추적**
   - gallery: 모놀리스(1016줄) + 서브 5개 공존. **지금은 깨끗**(함수명 중복 0건, 역할 분리됨). 하지만 누군가 서브모듈 함수를 monolith 에 또 만들면 하네스가 즉시 탐지해야 함.
   - GC: 서브모듈 함수명 집합과 monolith 함수명 집합 교집합 검사 → 교집합 발생 시 Alert.

4. **localStorage 키 고아 탐지**
   - 현재 사용 중인 키 수집 → `itdasy_*` 네임스페이스 외 키 목록 → 쓰이는데 문서화 안 된 키 찾기.
   - 확인된 키: `itdasy_custom_keywords`, `itdasy_deleted_keywords`, `itdasy_hash_history`, `itdasy_latest_analysis`, `shop_type`, `shop_name`, `onboarding_done`, `itdasy_token::staging`, 그리고 버그 흔적 `itdasy_token` (레거시).

5. **인라인 onclick 카운트 추이**
   - 현재 30+ 곳. GC 리포트에 주차별 추이 기록 → 감소세 확인. 늘어나면 리뷰어 호출.

6. **번들 크기 모니터링** (추가 권장)
   - GitHub Pages 배포 후 `curl -I` 로 각 `app-*.js` 크기. 회차별 비교. 급증 시 리포트.

---

## 🎯 피드백 루프 — 하네스가 "진화"하도록 설계

### 규칙 발견 트리거 (사람이 고치지 말고 규칙을 추가)

네가 말한 "실패 → 새규칙 → 하네스 진화" 를 **AGENTS.md 부록**에 다음 템플릿으로 고정:

```markdown
## 부록 A: 규칙 진화 로그

### 템플릿
- YYYY-MM-DD: [버그/사건 요약] → [추가된 ESLint 규칙 또는 CLAUDE.md 문구] → [검증 방법]

### 예시 (실제 오늘 발견된 것 기반)
- 2026-04-20: app-push.js:42 에서 레거시 `itdasy_token` 키 사용으로 스테이징 푸시 실패
  → ESLint `no-restricted-syntax` 에 `"Literal[value='itdasy_token']"` 추가
  → 검증: `git grep "'itdasy_token'"` 가 app-core.js:37 (migration만) 외엔 0건이어야 함
```

**이 부록은 가비지 컬렉션(기둥3) 리포트의 입력이기도 함** — 새 규칙 추가 PR 이 들어오면 GC가 다음 주 자동으로 검증.

---

## 우선순위 요약 (이번 주 안에 가능한 것부터)

| # | 작업 | 소요 | 레버리지 |
|---|------|------|---------|
| 1 | **push.js:42 / support.js:167 토큰 키 버그 픽스** | 10분 | 🔴 즉시 가치 — 푸시 실패 해결 |
| 2 | `app-core.js` 에 `STORAGE_KEYS`, `ENDPOINTS` 상수 객체 신설 | 30분 | 🔴 이후 모든 PR 이 혜택 |
| 3 | ESLint 설치 + `no-empty`, `no-restricted-syntax(itdasy_token)` 2개만 `error` | 40분 | 🔴 1·2 가 regress 안 나게 |
| 4 | AGENTS.md 초안 + 모듈별 CLAUDE.md 5개 배치 | 2시간 | 🟠 AI 에이전트 정확도 |
| 5 | husky + lint-staged | 20분 | 🟠 매 커밋 자동 방지 |
| 6 | `max-lines-per-function:50` `warn` 로 켜서 현재 위반 목록 자동 생성 | 10분 | 🟡 분할 대상 자동 발굴 |
| 7 | app-caption.js 분할 (`_doGenerateCaption` 부터) | 3시간 | 🟡 제일 큰 덩어리 |
| 8 | gc-weekly.js + GitHub Actions | 1시간 | 🟡 장기 부채 관리 |

**1~3번은 서로 독립적이지만 같은 PR에 묶는 걸 추천** — regression guard 붙은 버그픽스로 커밋 메시지 딱 떨어짐.

---

## 부록: 파일별 가장 아픈 1건씩 (원페이지 요약)

- **app-caption.js**: `_doGenerateCaption()` 536–647 (111줄, DOM+API+localStorage+slot state 혼재) — 분할 1순위.
- **app-portfolio.js**: `renderEdit()` 78–202 (125줄) + 13곳 하드코딩 API — 상수화 + 분할 동시 진행.
- **app-gallery.js**: 모놀리스 자체는 OK. 인라인 `onclick/ondrop/ondragover` 제거가 포인트(1084 근처 index.html 로드 순서는 현재 정확).
- **app-core.js**: `STORAGE_KEYS`, `ENDPOINTS` 미존재가 전 레포에 파급 — 여기가 하네스 적용의 병목이자 출발점.
- **app-persona.js**: 900줄 임박, core 의존성은 깔끔. 신규 코드 이 파일 추가 금지 규칙을 CLAUDE.md 에 못 박기.

---

_감사 완료. 이 리포트 기반으로 실제 픽스/하네스 설치 진행 여부 지시 부탁._

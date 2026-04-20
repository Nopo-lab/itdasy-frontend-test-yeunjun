# T-202 · 예약 발행 기능 제거 — 플랜 (영향도 조사 완료)

> **상태:** T1 Architect 역할(오케스트레이터 대행) 영향도 조사 종결. 원영님 🟢 후 T2 FE Coder 가 단일 PR 로 일괄 제거.
> **작성:** 2026-04-20 17:45
> **원 티켓:** `.ai/tickets/T-202.md`

---

## 1. 영향도 조사 결과 (전수 스캔)

`grep -rn "scheduled|Scheduled|schedule\(|openScheduled|closeScheduled|schedNav"` 결과 **9개 파일** 에서 예약 관련 코드 발견. 당초 플랜은 "4곳" 이라 보았으나 **실제는 더 큼** — AI 탭과 마무리 탭에 통합 지점이 있음.

### 1.1 삭제 대상 (전량)

| 파일 | 라인 | 내용 |
|------|------|------|
| `app-scheduled.js` | 1~194 전체 | 모듈 전체 (로드/생성/취소/팝업) |
| `index.html` | L163 | `<button id="openScheduledBtn">예약 발행 관리 🗓️</button>` (설정 시트) |
| `index.html` | L216 | `<button id="schedNavBtn" onclick="openScheduledPopup()">예약 🗓️</button>` (네비) |
| `index.html` | L1079 | `<script src="app-scheduled.js"></script>` |
| `app-core.js` | L800~808 | `on('openScheduledBtn', ...)` + `on('schedNavBtn', ...)` 2블록 |
| `app-ai.js` | L91 | AI 슬롯 카드 버튼 `<button onclick="_schedulePublishFromAi(...)">🗓️ 예약</button>` |
| `app-ai.js` | L232~274 | `_schedulePublishFromAi()` 함수 전체 |
| `app-ai.js` | L310~339 | `createSchedule()` 함수 전체 (`/scheduled-posts` 직접 호출) |
| `app-gallery-finish.js` | L283~317 | `_scheduleFromFinishTab()` 함수 전체 + 호출처 탐색 필요 |

### 1.2 CSS 토큰 정리 (부분 삭제 · 선택자 분리)

| 파일 | 라인 | 원본 | 수정 |
|------|------|------|------|
| `style-polish.css` | L84 | `#planPopup, #_scheduledPopup, #scheduledPopup, #_storyPopup, #_samplePopup, #quickActionPopup, #captionPreviewOverlay {` | `, #_scheduledPopup, #scheduledPopup` 2개 토큰 제거 |
| `style-polish.css` | L88 | `#_storyPopup > div, #_samplePopup > div, #scheduledPopup > div {` | `, #scheduledPopup > div` 1개 토큰 제거 |
| `style-dark.css` | L52 | `html[data-theme="dark"] #scheduledPopup,` | 해당 줄 제거 (다음 줄이 유효한 선택자 시작점인지 재확인 필요) |

### 1.3 추가 탐색 필요 (T2 착수 전 5분 스캔)

- `_scheduleFromFinishTab` 를 호출하는 HTML 마크업 (아마 `app-gallery-finish.js` 의 innerHTML 템플릿 안에 버튼 있음). 버튼 삭제 시 함수도 고아 → 함께 제거.
- `app-ai.js` L91 의 "🗓️ 예약" 버튼 제거 시 AI 슬롯 카드 레이아웃(주변 CSS grid 칸 수) 영향 가능. 시각 검증 필요.
- 백엔드 `/scheduled-posts` API 는 **제거하지 않음** (다른 레포 T3 영역). 프론트만 끊어냄. 서버는 호출 안 받아도 무해.

---

## 2. SELECTOR_FREEZE 영향 (동결 해제)

`SELECTOR_FREEZE.md` 내 예약 관련 동결 항목:

| 분류 | 항목 | 라인 |
|------|------|------|
| 동결 전역 함수 (L58, L89) | `openScheduledPopup` | 해제 |
| 동결 ID (L311) | `scheduledFormWrap`, `scheduledListBox`, `scheduledPopup` | 해제 |
| 동결 ID (추정) | `schedNavBtn`, `openScheduledBtn`, `schedulePanel`, `scheduleToggleBtn`, `scheduleDateTime`, `schedImg`, `schedCaption`, `schedCreateBtn` | 해제 |

**조치:** T-202 완료 후 `SELECTOR_FREEZE.md` 에 "§N. T-202 에 의해 해제된 셀렉터" 섹션 추가.

---

## 3. 제거 순서 (T2 FE Coder 작업 순서)

단일 커밋 권장. 커밋 메시지: `feat(scheduled): remove scheduled posts feature (T-202)`

### Step 1 · HTML (index.html)
- L216 네비 버튼 삭제 (1줄)
- L163 설정 시트 버튼 삭제 (1줄)
- L1079 `<script src="app-scheduled.js">` 삭제 (1줄)

### Step 2 · JS 호출처 정리
- `app-core.js` L800~808 → 8줄 제거
- `app-gallery-finish.js` L283~317 → 35줄 제거 + 이 함수를 호출하는 innerHTML 버튼 찾아 제거
- `app-ai.js` 순서대로:
  - L91 버튼 마크업 제거 (1줄)
  - L232~274 `_schedulePublishFromAi` 제거 (43줄)
  - L310~339 `createSchedule` 제거 (30줄)

### Step 3 · 모듈 삭제
- `app-scheduled.js` 파일 삭제 (`rm`)

### Step 4 · CSS 정리
- `style-polish.css` L84, L88 해당 선택자 토큰만 제거
- `style-dark.css` L52 제거

### Step 5 · 동결 목록 갱신
- `SELECTOR_FREEZE.md` 에 해제 섹션 추가

### Step 6 · 검증
- [ ] `grep -n "scheduled\|openScheduled\|schedNav" *.html *.js *.css` → **0건** (본문의 "schedule" 일반 단어 제외 주석은 허용, 기능 참조만 0)
- [ ] ESLint / Stylelint 통과
- [ ] `python3 -m http.server 8080` 로 로컬 서빙, 다음 스모크 테스트:
  - 홈 → 작업실 → 글쓰기 → AI추천 → 마무리 5탭 전환 (에러 없음)
  - 설정 시트 열기 → "예약 발행 관리" 항목 없음 확인
  - AI 추천 탭에서 슬롯 카드 레이아웃 깨짐 없음 확인
  - 콘솔 에러 0
- [ ] 라이트/다크 스크린샷 각 1장 (AI 추천 탭 + 설정 시트)

---

## 4. 예상 변경 규모

| 지표 | 값 |
|------|----|
| 삭제되는 파일 수 | 1 (`app-scheduled.js`) |
| 수정되는 파일 수 | 5 (`index.html`, `app-core.js`, `app-gallery-finish.js`, `app-ai.js`, `style-polish.css`, `style-dark.css`) |
| 제거되는 JS 라인 수 | 약 **280줄** (194 + 8 + 35 + 43 + 30 + 버튼/마크업 2~3줄) |
| 제거되는 HTML 라인 수 | 3 |
| 제거되는 CSS 토큰 | 3개 선택자 토큰 + 1줄 |
| 새로 추가되는 줄 수 | 0 |
| 동결 해제 함수 | 1개 (`openScheduledPopup`) |
| 동결 해제 ID | 약 10개 (`scheduledPopup`, `scheduledFormWrap`, `scheduledListBox`, `schedNavBtn`, `openScheduledBtn`, `schedImg`, `schedCaption`, `schedCreateBtn`, `schedulePanel`, `scheduleToggleBtn`, `scheduleDateTime`) |

**트랙 판정:** 표준 트랙 (AGENTS.md §4-A). 코드 ≥ 4줄 변경 + 파일 삭제 + 의존성 정리 다수 → 경량 트랙 부적합.

---

## 5. 위험 & 완화

| 위험 | 영향 | 완화 |
|------|------|------|
| `_scheduleFromFinishTab` 호출처를 찾지 못해 고아 참조 남음 | 콘솔 `ReferenceError` | Step 2 착수 전 `grep -n "_scheduleFromFinishTab"` 로 호출처 전수 파악 |
| AI 탭 슬롯 카드 CSS grid 가 3칸→2칸 되면서 레이아웃 틀어짐 | UX 깨짐 | Step 6 스모크 시 AI 탭 스샷 비교. 문제 시 T2 가 grid-template-columns 조정 (프로토 v2 레이아웃 기준) |
| CSS 선택자 토큰만 빼다가 문법 오류 (쉼표 꼬임) | 페이지 로드 실패 | Step 6 Stylelint 통과 확인. 또는 VS Code 로 수동 검증 |
| 다른 세션(다른 터미널)이 동시에 app-ai.js 편집 중이면 충돌 | 머지 충돌 | 착수 직전 BOARD.md 의 TERMINAL ASSIGNMENT 확인 |

---

## 6. 선행 조건

- [x] 원영님 결정 "예약기능 없앨것임" (2026-04-20 17:30)
- [ ] 원영님 본 플랜에 🟢 (T2 착수 허가)
- [x] T-200 범위와 독립 — T-200 재스코프 승인과 병렬 가능
- [x] 동결 목록 해제 사유 명확 (원영님 결정에 의한 기능 제거)

---

## 7. 다음 단계

1. 원영님 🟢 → T2 FE Coder 부팅 → 본 플랜대로 Step 1~6 순차 집행
2. T2 완료 후 → 오케스트레이터 교차검증 (grep 0건 + 스모크 로그 확인) → report.md
3. 원영님 최종 🟢 → 커밋 → T-200 P2.5 (하단 네비 이식) 로 이행

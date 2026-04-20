# 에이전트 팀 오케스트라 계획서

> 목적: 잇데이 스튜디오 앱의 **개발 → 오류 수정 → 스테이징 검증 → 운영 승격 → 런칭** 까지를 병렬 에이전트 팀으로 수행.
> 팀장(오케스트레이터): 본 Cowork 세션(Claude Opus 4.6).
> 작성일: 2026-04-20. 이 문서는 계획이며, **승인 전까지 어떤 에이전트도 실행 금지**.

---

## 0. 전체 그림 (한 장 요약) — **4 터미널 편성**

```
                ┌─────────────────────────────────────────┐
                │  오케스트레이터 (본 Cowork 세션, Opus)    │
                │  - 계획·리뷰·머지 판정·세션 인수인계 유지   │
                └────────┬────────────┬──────────┬────────┘
                         │            │          │
        ┌────────────────┼────────────┼──────────┼────────────────┐
        │                │            │          │                │
  ┌─────▼──────┐    ┌────▼────────┐  ┌▼────────┐ ┌▼────────────┐
  │T1 Architect │    │T2 FE Coder  │  │T3 BE    │ │T4 Ops       │
  │  (Opus)     │    │  (Sonnet)   │  │ Coder   │ │  (Haiku)    │
  │ 스펙+리뷰    │    │ 프론트 구현 │  │(Sonnet) │ │ 테스트+GC+문서│
  └─────────────┘    └─────────────┘  └─────────┘ └─────────────┘

        ◄────── 공통 버스: git + .ai/BOARD.md + PR ──────►
        ◄────── 세션 재시작 인수인계: .ai/SESSION_STATE.md ──────►
```

**변경 이유(6→4):**
- 구 T1(Planner)+T5(Reviewer) → **T1 Architect** 로 통합. 같은 두뇌가 스펙 쓰고 리뷰하면 일관성↑, 비용↓. "같은 사람이 자기 스펙 리뷰" 문제는 티켓 제출 후 24시간 이상 간격 두고 독립 리뷰 모드로 재진입해 완화.
- 구 T4(Tester)+T6(GC/Docs) → **T4 Ops** 로 통합. 둘 다 "읽고 리포트" 역할, Haiku 한 세션에서 번갈아 처리.

---

## 1. 터미널 편성 (4개)

각 터미널은 별도 Claude Code 세션. 모두 같은 GitHub 조직(`nopo-lab`) 의 서로 다른 브랜치에서 작업. 이름은 CLI 프롬프트/창 제목으로 그대로 사용.

### T1 · **Architect** (스펙 + 독립 리뷰)
- **모델:** Claude Opus 4.6
- **레포 / 권한:** 모든 레포 **read-only**. `.ai/` 디렉터리와 PR 코멘트만 write.
- **주 임무:**
  - 오케스트레이터 목표를 **작업 지시서(`.ai/tickets/T-NNN.md`)** 로 분해
  - 각 티켓에 acceptance criteria · 영향 파일 · 연동 체크리스트 명시
  - 코더(T2/T3) 제출한 PR 을 독립 리뷰 (`engineering:code-review` 스킬 사용)
  - ADR 필요 시 작성 (`.ai/adr/NNN-*.md`)
- **자가 리뷰 오염 방지:** 자기가 쓴 티켓은 본인이 리뷰 금지. 리뷰 전용 세션 지시 프롬프트를 따로 써서, 이전 맥락 없이 PR diff 만으로 판단하게 만듬.
- **손대지 말 것:** 실제 JS/CSS/백엔드 코드.

### T2 · **Frontend Coder**
- **모델:** Claude Sonnet 4.6
- **레포 / 권한:** `itdasy-frontend-test-yeunjun` 만. 브랜치: `fe/T-NNN-*` 강제.
- **주 임무:**
  - T1 티켓 하나씩 집어서 플랜 작성 → 자가검토 → 구현 → PR
  - ESLint/husky 설정, 파일 분할, 버그 픽스
  - 네이티브 브릿지(Capacitor) 관련 변경은 웹·Android 두 경로 모두 테스트
- **손대지 말 것:** 백엔드, 운영 프론트(`itdasy-frontend`).

### T3 · **Backend Coder**
- **모델:** Claude Sonnet 4.6
- **레포 / 권한:** `itdasy_backend-test` 만. 브랜치: `be/T-NNN-*`.
- **주 임무:** 프론트 PR 에 영향을 주는 API 엔드포인트 변경, Supabase 마이그레이션, Railway 스테이징 배포 검증.
- **손대지 말 것:** 프론트, 프로덕션 DB.

### T4 · **Ops** (테스트 + GC + 문서 동기화)
- **모델:** Claude Haiku 4.5
- **레포 / 권한:** 모든 레포 read, `.ai/test-reports/`, `.ai/gc-reports/`, CLAUDE.md 에 write.
- **주 임무 (3종 번갈아 수행):**
  - **테스트 러너:** T2/T3 PR 브랜치에서 `npm run lint && npm test` 재실행, Capacitor `cap sync` 확인
  - **GC:** 주 1회(월요일 아침) 가비지 컬렉션 스크립트, 문서↔실제 불일치 탐지
  - **문서 동기화:** CLAUDE.md 의 줄 수·파일 목록이 현실과 다르면 바로잡음 (예: `style.css` 표시가 1383줄인데 현재 10줄 — 즉시 수정 대상)
- **손대지 말 것:** 기능 코드, 설정.

---

## 2. 모델 선택 근거 (비용 vs 품질)

| 역할 | 모델 | 이유 | 월 예상 토큰 규모 |
|------|------|------|--------------------|
| 오케스트레이터 | **Opus 4.6** | 싱크 포인트 오판이 전체 지연으로 증폭됨 | 중 |
| T1 Architect | **Opus 4.6** | 스펙+리뷰 품질이 T2/T3 생산성 ×2~3 | 중 |
| T2 FE Coder | **Sonnet 4.6** | 긴 파일(1000줄+) 리팩터 반복 → 비용 중요 | **대** (최다 사용) |
| T3 BE Coder | **Sonnet 4.6** | 백엔드 변경 빈도 낮음 | 소 |
| T4 Ops | **Haiku 4.5** | 린트/테스트 실행·문서 동기화 등 기계적 작업 | 중 |

**Opus 비중:** 2/4 (오케스트레이터·Architect). 비용 최적화 방향: Architect는 리뷰 모드에서만 장문 응답, 티켓 작성은 짧게 구조화.

---

## 3. 커뮤니케이션 프로토콜

### 3-A. 채널은 3개, 끝.

| 채널 | 용도 | 쓰는 주체 |
|------|------|----------|
| `git` (브랜치·PR) | 코드 전달, 머지, 되돌리기 | T2/T3 write, T4/T5 review |
| `.ai/BOARD.md` (공유 태스크 보드) | 누가 뭘 하는 중인지 한눈에 | 모두 read, 오케스트레이터만 write |
| `.ai/tickets/T-NNN.md` | 세부 작업 지시서 | T1 write, 나머지 read |

**직접 IPC(터미널 간 메시지) 없음.** 이유: (a) 실패 추적 어려움, (b) 누가 최신인지 흐려짐, (c) 오케스트레이터 우회 위험.

### 3-B. `.ai/BOARD.md` 스키마 (10줄 이하 고정)

**현재 실제 상태 예시 (2026-04-20 15:20):**

```markdown
# BOARD (updated: 2026-04-20 15:20 KST by orchestrator)

## IN PROGRESS
(없음 — Phase 1 FE 전체 완료 🎉)

## BLOCKED
(없음)

## READY FOR REVIEW
- 원영님 로컬 `npm install && npm run prepare` 선행 — 완료 ✅

## READY TO START (대기 티켓)
- T-004 · 백엔드 에러 응답 표준화 · T3 담당 (다른 레포)
- Phase 2 착수 판단 · app-caption/portfolio/gallery 분할 티켓 신설 여부

## DONE (이번 주)
- T-000 · AGENTS.md 초안
- T-001 · 모듈 CLAUDE.md 5개 배치
- T-002 · ESLint + husky + lint-staged 설치
- T-003 · app-push.js 레거시 토큰 키 제거
- T-005 · 주간 GC 리포트 + GitHub Actions
- T-006 · app-support.js 레거시 토큰 키 제거
- T-007 · gallery/persona/core CLAUDE.md 정정
```

### 3-C. 브랜치 네이밍 (강제)

- `fe/T-NNN-슬러그` (프론트)
- `be/T-NNN-슬러그` (백엔드)
- `docs/T-NNN-슬러그` (문서만)
- `hotfix/T-NNN-슬러그` (토큰 키 같은 긴급 픽스 — 리뷰 축약 트랙)

### 3-D. PR 라벨 (GitHub 에서 자동 색상 구분)

- `stage:plan` → `stage:coded` → `stage:tested` → `stage:reviewed` → `stage:approved`
- `risk:integration` · `risk:security` · `risk:ui-only` (리뷰어가 무게 판단에 사용)
- `scope:fe` · `scope:be` · `scope:cross` (크로스 = FE+BE 동시 변경 → 추가 리뷰 필요)

---

## 4. 승인 게이트 (계획-자가검토-수정-승인-실행)

모든 티켓은 5단계 상태를 거침. 각 단계 사이는 **반드시 커밋/PR 로 증거** 남김.

```
[1.DRAFT]          [2.SELF-REVIEW]        [3.REVISED]       [4.APPROVED]       [5.EXECUTED]
 T1 가 티켓 작성    → 담당 터미널이 스스로    → 피드백 반영한   → 오케스트레이터     → 코드 머지
                      플랜 검증 리스트 체크     플랜 재제출        + 사용자 승인        + T4 smoke test
                      (self-review.md 파일)     (plan-v2.md)       (PR label)         (CI green)
```

### 4-A. 🚀 경량 트랙 (1~3줄 픽스 / 문서 정정 전용)

T-003 / T-006 / T-007 경험으로 공식화. 표준 5단계가 과할 때 사용.

```
[1. 오케스트레이터 자가검토]  →  [2. T1 교차검증]  →  [3. 원영님 🟢 승인]  →  [4. 집행]
    §5 체크리스트 통과           독립 세션, Task        FOR_USER.md 또는     Cowork 세션 직접 편집
    (증거: 본 세션 로그)          서브에이전트          Cowork 채팅           또는 담당 터미널 위임
                                  (증거: reviewer agent  (증거: 승인 메시지)   (증거: git diff)
                                   결과 요약)
```

**경량 트랙 조건 (전부 충족 시):**
- 변경 줄 수 ≤ 10줄, 또는 문서만 수정
- 🟢 초록불 (AGENTS.md §8 기준)
- 런타임 행동 변경 없음 또는 이미 증명된 패턴 적용 (`window.getToken()` 등)
- 마이그레이션·배포 없음

**경량 트랙 금지:**
- 🟡/🔴 신호등
- 새 의존성 추가
- 스크립트 로드 순서 건드림
- Capacitor 네이티브 설정

**집행 주체 선택:**
- **Cowork 세션 직접 편집** (빠름): 오케스트레이터 scope = 문서 · `.ai/*` · 1~3줄 픽스. T-003/T-006/T-007 이 이 경로.
- **담당 터미널 위임** (표준): 코드 변경 ≥ 4줄 또는 리스크 있을 때.

### 4-B. 표준 트랙 5단계 — 언제 쓰나

- 변경 줄 수 ≥ 10줄
- 새 파일 생성 · 새 의존성 · ESLint 규칙 추가
- Phase 2 모놀리스 분할 티켓 (T-101/T-102/T-103)
- API / 스키마 / 네이티브 설정 변경
- 배포 승격 (운영 레포)

### 4-C. 자가검토 체크리스트 (모든 코더 공통, `self-review.md` 로 제출)

1. ✅ 이 변경이 건드리는 파일 **전체 목록** 을 나열했는가?
2. ✅ `index.html` 스크립트 로드 순서가 깨지지 않는가? (gallery monolith 가 submodule 앞에 오는지)
3. ✅ `window.*` 글로벌 추가/제거가 있다면 AGENTS.md 허용 목록과 일치하는가?
4. ✅ localStorage 키를 만지면 `_TOKEN_KEY` 패턴을 따랐는가? (레거시 `itdasy_token` 직접 사용 금지)
5. ✅ Capacitor 네이티브 브릿지(Push, Camera, Haptic) 관련이면 웹·네이티브 양쪽 경로 테스트했는가?
6. ✅ Supabase RLS 의존 쿼리는 running as 유저로 수동 확인했는가?
7. ✅ 50줄 초과 함수를 **새로** 만들지 않았는가?
8. ✅ 빈 `catch {}` 를 추가하지 않았는가?
9. ✅ 커밋 메시지에 티켓 번호 `T-NNN` 가 있는가?
10. ✅ `npm run lint && npm test` 로컬 통과?

10개 중 **1개라도 실패 → DRAFT 로 자동 회귀**. 자동화 훅으로 pre-push 에서 검사.

### 승인 주체

| 티켓 유형 | 승인 필요자 |
|-----------|------------|
| `scope:fe` + `risk:ui-only` | 오케스트레이터 only |
| `scope:be` 또는 `risk:integration` | 오케스트레이터 + **사용자 명시 승인** |
| `risk:security` | 사용자 명시 승인 필수 |
| 운영 승격 (`itdasy-frontend` 로 머지) | 사용자 명시 승인 필수, **하나의 예외도 없음** |

---

## 5. 연동 보호 장치 (회귀 방지 5중 잠금)

현재 앱의 "깨지면 바로 사용자 불편" 구간. 모든 PR 은 아래 5개 중 해당 항목이 통과됨을 자가검토에 적시.

### 5-A. 토큰 키 격리 (이미 버그 있음)
- `app-core.js:33` 에서 `_TOKEN_KEY = 'itdasy_token::staging'` 로 생성.
- 그러나 `app-push.js:42`, `app-support.js:167` 에서 레거시 `'itdasy_token'` 직접 사용 중 → **T-003 으로 즉시 픽스 예정**.
- ESLint `no-restricted-syntax` 로 재발 차단.

### 5-B. `index.html` 스크립트 로드 순서 (1084~1104행)
- `app-core.js` 최상단 → `app-portfolio.js`(`_loadImageSrc`, `renderBASplit` 제공) → `app-gallery.js` 모놀리스 → gallery 서브모듈 5개 → 나머지.
- 이 순서를 바꾸면 submodule 이 monolith 전역에 접근 실패 → 즉시 크래시.
- 규칙: `index.html` 수정 PR 은 **무조건** `risk:integration` 라벨 + T5 풀 리뷰.

### 5-C. Capacitor 네이티브 브릿지
- 대상 플러그인: SplashScreen, StatusBar, PushNotifications, Camera, App.
- 검증: `npx cap sync android` 가 에러 없이 완료되어야 머지 가능.
- OAuth 딥링크 스킴 `itdasy://` 변경은 **절대 금지** (Apple/Google 심사 재개시).

### 5-D. Supabase RLS 정책
- 어떤 테이블이든 컬럼 추가/변경은 BE 코더(T3)만 수행.
- 변경 시 RLS 정책도 함께 수정하는지 `self-review.md` 항목 #6 로 강제.
- 운영 DB 는 건드리지 않음. 스테이징에서 Supabase Daily Backup(한국시간 03:00, GitHub Actions) 돌고 있으므로 롤백 여력 있음.

### 5-E. GitHub Actions 워크플로우
- `Android Build` (수동), `Supabase Daily Backup` (매일 UTC 18:00) 둘 다 **건드리지 않음**.
- 새 워크플로우(예: 주간 GC) 추가는 OK. 기존 수정은 사용자 승인 필수.

---

## 6. 런칭까지 마일스톤 (3 페이즈, 예상 총 3~4주)

### Phase 1. "출혈 막기" (1주차) — **하네스 설치 + 즉시 버그 픽스**

| 티켓 | 담당 | 내용 |
|------|------|------|
| T-001 | T1 → T2 | AGENTS.md + 모듈별 CLAUDE.md 5개 배치 |
| T-002 | T2 | ESLint + Stylelint + husky + lint-staged 설치, 2규칙만 `error` (no-empty, no-restricted-syntax for legacy token key) |
| T-003 | T2 | **토큰 키 버그 픽스** (app-push.js:42 만 — support.js 는 오탐으로 확인됨) + regression ESLint 규칙 |
| T-004 | T3 | 프론트 에러 메시지 → 백엔드 응답 표준화 (`{ code, message }` 포맷) |
| T-005 | T4 | 주간 GC 스크립트 + GitHub Actions |

**Phase 1 완료 조건:** 모든 PR 이 ESLint 통과. 스테이징에서 푸시 알림 정상 도착 확인.

### Phase 2. "모놀리스 분할" (2~3주차)

| 티켓 | 담당 | 내용 |
|------|------|------|
| T-010 | T2 | `js/caption/` 로 분할 (`_doGenerateCaption` 536–647 분해) |
| T-011 | T2 | `js/portfolio/` 로 분할 (`renderEdit` 78–202, `loadPortfolio` 448–570) |
| T-012 | T2 | `app-gallery.js` → `app-gallery-index.js` 리네임 + inline onclick 제거 |
| T-013 | T3 | API 엔드포인트 상수 객체(`ENDPOINTS`) 백엔드 스펙과 동기화 |
| T-014 | T2 | `app-core.js` 에 `STORAGE_KEYS`, `ENDPOINTS` 도입 후 전 프론트 참조 치환 |

**Phase 2 완료 조건:** 500줄 초과 파일 수 0. ESLint `max-lines-per-function` 을 `error` 로 승격 가능.

### Phase 3. "런칭 준비" (4주차)

| 티켓 | 담당 | 내용 |
|------|------|------|
| T-020 | 오케스트레이터 | 스테이징 → 운영(`itdasy-frontend`) 승격 PR, **사용자 승인 필수** |
| T-021 | T2 | Android release 빌드 (GitHub Actions workflow_dispatch) |
| T-022 | T1 | 앱 스토어 제출 체크리스트 작성 (`engineering:deploy-checklist` 스킬 사용) |
| T-023 | T1 | 최종 보안 리뷰 (토큰, localStorage, RLS, innerHTML XSS 재확인) |
| T-024 | T4 | CLAUDE.md 전 레포 최종 동기화 |

**Phase 3 완료 조건:** 운영 스모크 테스트 통과. Android APK 서명본 산출. iOS 는 Apple Dev 승인 이후 별도 마일스톤.

---

## 7. 실패 시 자동 에스컬레이션 (피드백 루프)

앞서 너가 말한 "실패 → 새규칙 → 하네스 진화" 를 시스템화.

```
PR 실패(테스트/린트/리뷰)
    ↓
T5 가 원인 카테고리 분류 (bug / rule-gap / spec-gap / env)
    ↓
rule-gap 이면 → AGENTS.md 부록 A 에 신규 규칙 제안 PR 자동 발행
    ↓
오케스트레이터 검토 → 규칙 승격 → ESLint 에 반영
    ↓
다음 주 T6 GC 리포트에서 재발 여부 체크
```

규칙 추가 PR 은 `docs/rule-NNN-*` 브랜치 고정. 누적된 규칙은 분기말에 카테고리별 정리.

---

## 8. 사용자(원영) 가 해야 할 것 — 최소화

에이전트가 다 하되, 사용자 승인 필요한 구간은 딱 3군데:

1. **본 계획서 승인** ← 지금 이 문서
2. **운영 승격 PR 승인** (Phase 3, T-020)
3. **보안 · 결제 · 개인정보 관련 티켓** (그때그때 발생 시)

나머지는 전부 오케스트레이터(나)가 처리. 매일 아침 `.ai/BOARD.md` 한 번만 보면 전체 상황 파악됨.

---

## 9. 위험 · 트레이드오프 솔직 고백

| 위험 | 확률 | 영향 | 완화책 |
|------|------|------|--------|
| 여러 터미널이 같은 파일 수정해 conflict | 중 | 중 | 브랜치 네이밍 + T1 이 티켓 단위로 파일 스코프 격리 |
| Opus 비용 폭증 | 중 | 중 | 리뷰어(T5) 는 PR 단위로만 호출, diff 크기 500줄 초과 시 자동 split |
| 사용자가 매일 BOARD 확인 못함 | 중 | 소 | 주간 리포트(T6) 에 "결정 대기 중" 섹션 상단 고정 |
| 스테이징 검증 충분치 않아 운영 회귀 | 저 | **대** | Phase 3 의 T-023(보안) + T-020 (사용자 명시 승인) 이중 관문 |
| iOS 런칭은 Apple Dev 승인 의존 | 저 | 중 | Phase 3 범위에서 제외, 별도 마일스톤으로 후속 |

---

## 10. 승인 요청 — 옵션 선택

아래 중 하나를 골라주세요:

- **A.** 이 계획서 전체 승인 → Phase 1 착수 (T-001~T-005 티켓 생성)
- **B.** 팀 편성(§1~2) 은 OK, 일정(§6) 만 조정하고 싶음 → 어디를 조정할지 알려주세요
- **C.** 터미널 개수 줄이고 싶음 (예: 4개로) → 어느 역할 통합할지 결정 필요
- **D.** 더 작게 시작 → Phase 1 중 T-003(토큰 버그 픽스) 만 먼저 실행
- **E.** 전체 재검토 필요 → 어느 섹션이 불만인지 말해주세요

---

## 부록. 나(오케스트레이터)가 하는 일 요약

- 매 티켓마다: spec 검토 → 담당자 배정 → 자가검토 확인 → 리뷰 요청 → 승인 판정 → 머지 트리거
- 매 Phase 끝: 전체 상태 점검, 다음 Phase 티켓 묶음 생성
- 에스컬레이션 포인트 발생 시 즉시 사용자(원영)에게 알림 (매번 판단 요청 X, 필요한 것만)
- `.ai/BOARD.md` 를 상태 변경마다 업데이트하는 유일한 주체

_이 계획서는 승인 전까지 실행되지 않습니다. 승인 시 즉시 `.ai/` 디렉터리 스캐폴딩부터 시작._

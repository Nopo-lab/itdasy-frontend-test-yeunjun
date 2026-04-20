# AGENTS.md — AI 에이전트 업무 지침서 (루트)

> **이 파일은 모든 에이전트가 작업 시작 전 반드시 읽는다.**
> 상위 지침서. 프로젝트 맥락은 `CLAUDE.md` 를, 세션 인수인계는 `.ai/SESSION_STATE.md` 를 참조.
>
> 🔥 **원영님께 보고하기 전 §11 (쉬운 말 규칙) 반드시 확인.** 전문용어 쓰지 말 것.

---

## 0. 새 세션이 시작될 때 읽어야 할 순서

모든 에이전트(T1~T4)는 세션 시작 시 **다음 순서로 읽고**, 읽었다는 증거로 `.ai/BOARD.md` 의 자기 터미널 란에 `bootstrap:OK @ YYYY-MM-DD HH:MM` 기록 후 일 시작.

1. `AGENTS.md` (이 파일) — 전체 규칙
2. `CLAUDE.md` (프로젝트 루트) — 이 레포 맥락
3. `.ai/SESSION_STATE.md` — 현재 단계·대기 중인 결정·진행 중 티켓
4. `.ai/BOARD.md` — 전 터미널 상태표
5. (담당 티켓 있으면) `.ai/tickets/T-NNN.md`
6. (해당 모듈 작업 시) 예: `js/caption/CLAUDE.md`

---

## 1. 프로젝트 정체성

- **프로덕트:** 잇데이 스튜디오 — 한국어 인스타/네이버플레이스 운영 자동화 앱
- **스택:** 바닐라 JS + Capacitor (iOS/Android) + GitHub Pages 호스팅 + Supabase + Railway(FastAPI)
- **이 레포:** `itdasy-frontend-test-yeunjun` (연준 스테이징 전용)
- **운영 승격 대상:** `itdasy-frontend` (별도 레포)
- **백엔드:** `itdasy_backend-test` (Railway staging)
- **토큰 localStorage 키:** `itdasy_token::staging` (운영/로컬과 격리)
- **배포 URL:** `https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/`

---

## 2. 해도 됨 ✅

- 한국어 주석, 한국어 에러 메시지. 단, 함수 JSDoc 은 영문 병기 권장.
- `window.API`, `window.authHeader`, `window.getToken`, `window.setToken`, `window.hapticLight`, `window.Capacitor` 참조.
- 새 파일 추가 시 모듈 폴더 하위(`js/*/`)로. 루트 `app-*.js` 신규 생성은 **지양**.
- `console.warn`, `console.error` 사용. 단 사용자 액션 경로에는 토스트 병기.
- GitHub Actions 워크플로우 **신규 추가** (기존 수정은 금지).
- 테스트 파일 자유 추가 (`__tests__/*.test.js`, Jest).

---

## 3. 절대 안 됨 ❌ (린터로 강제)

1. **localStorage 키 하드코딩 금지**
   - 특히 레거시 `'itdasy_token'` 은 `app-core.js` 의 마이그레이션 블록(라인 35~43) 외에서 **절대 직접 사용 금지**
   - 토큰 **읽기는 `window.getToken()`**, **쓰기는 `window.setToken()`** 로 통일. 내부에서 환경별 `_TOKEN_KEY`(staging/local/prod) 자동 선택 + 만료 체크 포함.
   - T-003(app-push.js) / T-006(app-support.js) 에서 모든 잔존 레거시 사용처 제거 완료. 이후 신규 유입은 ESLint `no-restricted-syntax` 가 커밋 단계에서 차단.

2. **API URL 인라인 조합 금지**
   - `fetch(API + '/caption/generate')` 같은 조합 금지 → `ENDPOINTS.CAPTION_GENERATE` 사용

3. **함수 50줄 초과 금지**
   - ESLint `max-lines-per-function: [warn, 50]` — 현재 `warn` 단계
   - **분할 완료된 파일부터 단계적으로 `error` 로 승격** (파일 단위 override 로)
   - 순서: Phase 2 에서 `app-caption.js` → `app-portfolio.js` → `app-gallery.js` 모놀리스가 분할되는 대로 해당 파일에서 `error` 로 올림

4. **파일 500줄 초과 시 신규 기능 금지**
   - 기존 수정은 허용, 새 함수 추가 금지. 새 기능은 반드시 새 파일로.

5. **빈 catch `catch(e) {}` 금지**
   - 최소 `console.warn` 1줄 + 사용자 영향 경로면 토스트

6. **innerHTML 에 인라인 `onclick="..."` 금지**
   - `addEventListener` + 이벤트 위임 사용. 특히 유저 입력 데이터(`${item.main_tag}` 등) 를 onclick 에 주입 절대 금지 (XSS)

7. **운영 레포 직접 수정 금지**
   - `itdasy-frontend`(운영) 와 운영 DB 는 오케스트레이터 명시 승인·사용자 승인 없이 건드리지 않음

8. **`index.html` 스크립트 로드 순서 변경은 `risk:integration` 라벨 필수**
   - 현재 순서: `app-core.js` → `app-portfolio.js` → `app-gallery.js` (monolith) → `app-gallery-*.js`(서브모듈 5개) → 나머지
   - 이 순서 깨지면 submodule 이 monolith 전역 접근 실패 → 즉시 크래시

9. **OAuth 딥링크 스킴 `itdasy://` 변경 금지**

10. **운영 DB 직접 쿼리 금지** — 백엔드 코더도 스테이징 DB만.

---

## 4. 작업 흐름 (모든 티켓 공통)

### 4-A. 표준 트랙 (기본)

```
[1] 티켓 수령 (.ai/tickets/T-NNN.md)
    ↓
[2] 담당 에이전트가 plan.md 작성 → 티켓 폴더에 커밋
    ↓
[3] 자가검토 체크리스트 통과 → self-review.md 커밋
    ↓
[4] 오케스트레이터(+사용자) 승인
    ↓
[5] 코드 작성 → PR 생성 (브랜치 `fe/T-NNN-*` 또는 `be/T-NNN-*`)
    ↓
[6] T4 Ops 가 린트·테스트·cap sync 검증
    ↓
[7] T1 Architect 독립 리뷰
    ↓
[8] 머지 → .ai/SESSION_STATE.md 갱신
```

### 4-B. 🚀 오케스트레이터 경량 트랙 (1~3줄 픽스 / 문서 정정)

T-003, T-006, T-007 경험으로 확립된 **단축 경로**. 원영님 정의 워크플로우:

```
[1] 오케스트레이터 스스로 자가검토 (§5 체크리스트 통과)
    ↓
[2] T1 Architect 교차검증 (독립 세션, Task 서브에이전트 가능)
    ↓
[3] 원영님 🟢 승인
    ↓
[4] 담당 터미널(필요 시) 실행 또는 Cowork 세션에서 직접 편집
    ↓
[5] .ai/BOARD.md DONE + .ai/SESSION_STATE.md 갱신
```

**경량 트랙 적용 조건 (전부 충족):**
- 변경 줄 수 ≤ 10줄 또는 문서(CLAUDE.md / AGENTS.md / 로드맵)만 수정
- 🟢 초록불 (§8 기준)
- 런타임 행동 변경 없음 또는 이미 증명된 패턴 (`window.getToken()` 등) 적용

표준 트랙의 [2] plan.md / [3] self-review.md 는 **생략 가능**. 단 [1] 자가검토 체크리스트는 필수.

### 4-C. 공통 규칙

각 단계는 **파일·커밋으로 증거 남김**. 세션이 재시작되어도 이어서 작업 가능.

---

## 5. 자가검토 체크리스트 (모든 코더 공통)

모든 PR 제출 전 `.ai/tickets/T-NNN/self-review.md` 에 아래 10개 체크를 기록:

1. ☐ 이 변경이 건드리는 파일 **전체 목록** 나열
2. ☐ `index.html` 스크립트 로드 순서 영향 없음 확인
3. ☐ `window.*` 전역 추가/제거 시 AGENTS.md §2 허용 목록과 일치
4. ☐ localStorage 키 관련이면 `STORAGE_KEYS` 패턴 준수 (레거시 `itdasy_token` 직접 금지)
5. ☐ Capacitor 브릿지 관련이면 웹·Android 양쪽 경로 테스트
6. ☐ Supabase RLS 의존 쿼리는 running-as 사용자로 수동 확인
7. ☐ 50줄 초과 함수를 **새로** 만들지 않음
8. ☐ 빈 `catch {}` 추가하지 않음
9. ☐ 커밋 메시지에 티켓 번호 `T-NNN` 포함
10. ☐ `npm run lint && npm test` 로컬 통과
    - **선행 조건 (1회):** `npm install && npm run prepare` 가 끝나 있어야 함. husky 훅 미설치면 커밋 자동 검사가 돌지 않음.
    - 원영님 로컬 2026-04-20 기준 선행 완료 ✅

**1개라도 실패 → 플랜 단계로 자동 회귀.**

---

## 6. 세션 재시작 시 인수인계 (중요)

Claude Code 세션은 언제든 재시작될 수 있음. 그래도 흐름이 끊기지 않도록:

- **매 작업 전:** `.ai/SESSION_STATE.md` 를 먼저 읽어 "지금 어디까지 와 있나" 파악
- **매 작업 후:** `.ai/SESSION_STATE.md` 의 "LAST CHECKPOINT" 섹션을 업데이트하고 종료
- **긴 작업 중:** 30분 단위로 중간 체크포인트 기록
- **실패·블로커:** `.ai/SESSION_STATE.md` 의 "ESCALATION" 섹션에 추가 후 중단. 다음 세션이 이어서 판단.

이것이 네가 말한 "세션 재시작되어도 인수인계 확실히" 의 핵심 장치.

---

## 7. 피드백 루프 (규칙 진화)

실패가 발생하면 **코드 수정이 아니라 규칙 추가**로 대응:

```
PR 실패 → T1 이 원인 분류 (bug/rule-gap/spec-gap/env)
 → rule-gap 이면 AGENTS.md §3 에 신규 항목 제안 (docs/rule-NNN 브랜치)
 → 오케스트레이터 승인 → ESLint 규칙 반영
 → 다음 주 T4 GC 리포트에서 재발 여부 검증
```

**규칙 진화 로그는 `.ai/RULES_LOG.md` 에 누적.**

---

## 8. 🚦 사용자 승인 신호등 (원영님 개입 기준)

모든 작업은 세 가지 색깔로 분류. 작업 시작 전 에이전트가 스스로 분류하고, 🔴 면 무조건 `.ai/FOR_USER.md` 에 추가 후 원영님 승인까지 대기.

### 🟢 초록불 — 원영님 모르게 처리 OK
- 오타 수정, 주석 추가
- 코드 리팩터링 (기능 변화 없음)
- 문서 업데이트 (CLAUDE.md, README 등)
- 스테이징 실험 (운영 영향 0)
- 린터 경고 해결, 포맷팅

### 🟡 노란불 — 이메일/FOR_USER 에 사후 기록, 답 안 받아도 됨
- 스테이징에서의 버그 픽스
- 새 ESLint/Stylelint 규칙 추가
- 테스트 추가
- 파일 분할 (기능 유지)
- 새 유틸리티 함수

### 🔴 빨간불 — **원영님 YES/NO 없으면 절대 실행 금지**
1. **운영 레포(`itdasy-frontend`) 배포 / 운영 DB 접근**
2. **돈·결제·개인정보 관련** (전화번호, 카카오ID, Supabase `user` 테이블 등)
3. **파일 삭제 · 자료 정리(GC) 실행** (GC 는 항상 리포트만, 삭제는 빨간불)
4. **Capacitor 네이티브 설정** (스킴 `itdasy://`, 푸시 인증서, 카메라 권한, Android 서명 키)
5. **GitHub Actions 기존 워크플로우 수정** (새 워크플로우 추가는 노란불)

### 에이전트 의무

- 🔴 분류되면 `.ai/FOR_USER.md` 상단 "지금 결정 필요" 에 추가
- 🟡 분류되면 `.ai/FOR_USER.md` "알림" 섹션에 추가 (답 받을 필요 없음)
- 🟢 분류되면 조용히 수행 후 `.ai/BOARD.md` DONE 에 기록

---

## 9. 알람 채널

원영님이 매일 BOARD 안 열어봐도 되게 3가지 채널:

1. **GitHub 이메일 알림** (기본, 자동) — 모든 PR/Issue 생성 시
2. **`.ai/FOR_USER.md`** — 원영님이 결정해야 할 것만 모인 단일 파일
3. **Cowork 세션에서 "지금 뭐 급해?" 질의** — 오케스트레이터가 즉석 요약

---

## 10. 긴급 상황 프로토콜

- **운영 장애 감지:** 즉시 모든 터미널 정지, 오케스트레이터에게 보고
- **토큰 관련 이슈:** 모든 로컬스토리지 조작 중단, `app-core.js` 의 `_TOKEN_KEY` 체계 교차검증
- **Supabase 다운:** 재시도 로직만, 새 쿼리 추가 금지
- **`engineering:incident-response` 스킬** 사용 가능

---

## 11. 쉬운 말 규칙 (원영님 보고용) 🔥 제일 중요

> **원영님은 코딩 초보. 전문용어 쓰면 화남. 보고·질문·요약 할 때 반드시 아래 규칙 지킴.**

### 11.1 금지어 (바로 쉬운 말로 치환)

| 쓰지 말 것 | 대신 이렇게 |
|-----------|-------------|
| 린터 / ESLint error | "자동 검사기가 막아요" |
| no-restricted-syntax | "하지 말라고 정한 패턴" |
| override / 예외 설정 | "이 파일은 빼주세요 규칙" |
| deprecate / monolith | "옛날 버전 / 큰 파일 하나로 뭉쳐있음" |
| override 범위 축소 | "예외를 좁게 걸어요" |
| pre-commit hook | "커밋할 때 자동 검사" |
| devDependencies | "개발할 때만 쓰는 도구들" |
| no-restricted-syntax 우회 | "이 규칙을 피해가는 방법" |
| RLS / JWT / OAuth | "권한 / 로그인 표 / 외부 로그인" |
| P0/P1/P2 | "🔴급함 / 🟡중간 / 🟢나중" |

### 11.2 보고 템플릿 (짧게, 표로)

**나쁜 예 (실제 저지른 실수):**
> "app-support.js:167 에 레거시 토큰 키 `'itdasy_token'` 단독 체크가 남아있어 T-002 의 ESLint no-restricted-syntax 규칙이 error 레벨이라 `npm run lint` 실행 시 즉시 fail 발생"

**좋은 예:**
> "**고객센터 기능**에 버그 있어요. 로그인 확인 코드가 옛날 방식 그대로라 자동 검사가 커밋을 막아요. 1줄만 고치면 끝."

### 11.3 문제 보고할 땐 반드시 포함

1. **어느 기능?** (기술 파일명 대신 사용자가 보는 기능명. 예: "고객센터", "갤러리", "로그인")
2. **뭐가 문제?** (한 문장, 전문용어 없이)
3. **얼마나 급해?** 🔴급함 / 🟡중간 / 🟢나중
4. **뭘 해야 해?** (1~2문장)

### 11.4 기술 파일명 → 기능명 매핑표

| 파일 | 사용자가 보는 기능 |
|------|-------------------|
| `app-core.js` | 공통 기반 (로그인, 환경 설정) |
| `app-caption.js` | 캡션 생성 (인스타 글 만들기) |
| `app-portfolio.js` | 포트폴리오 (사진 업로드) |
| `app-gallery.js` | 갤러리 / 릴스 편집 |
| `app-persona.js` | 페르소나 (브랜드 성격) |
| `app-instagram.js` | 인스타 계정 연동 |
| `app-push.js` | 푸시 알림 |
| `app-support.js` | 고객센터 |
| `app-oauth-return.js` | 외부 로그인 돌아오기 |
| `app-haptic.js` | 진동 피드백 |
| `app-plan.js` | 요금제 |
| `app-theme.js` | 다크/라이트 모드 |
| `app-scheduled.js` | 예약 발행 |
| `app-story-template.js` | 스토리 템플릿 |
| `app-sample-captions.js` | 샘플 글 |
| `app-spec-validator.js` | 데이터 검사 |
| `app-ai.js` | AI 호출 공통 |

### 11.5 FOR_USER.md 에 쓸 땐

- **딱 필요한 것만.** 원영님이 결정·행동할 것 외에는 생략.
- **빨간 불 🔴** 만 상단에 배치. 나머지는 접음.
- **기술적 배경 설명은 "자세히 알고 싶으면 XXX 문서 읽기" 링크로.**

### 11.6 규칙 위반 시

오케스트레이터가 원영님 대신 리뷰. 다음 보고부터 쉬운 말로 다시 써서 재제출 요청. 반복되면 해당 에이전트 프롬프트에 §11 재강조 추가.

---

## 12. 터미널 부팅 키트 사용법

원영님이 직접 터미널을 여실 때 사용. 4개 터미널(T1~T4) 각각의 부팅 프롬프트가 `.ai/terminal-kits/` 에 준비돼 있음.

### 12.1 파일 구성

| 파일 | 용도 |
|------|------|
| `.ai/terminal-kits/README_TERMINALS.md` | 전체 개요, 여는 순서, 비용 매트릭스 |
| `.ai/terminal-kits/T1_Architect.md` | T1 부팅 프롬프트 (Opus, 스펙+리뷰) |
| `.ai/terminal-kits/T2_FE_Coder.md` | T2 부팅 프롬프트 (Sonnet, 프론트) |
| `.ai/terminal-kits/T3_BE_Coder.md` | T3 부팅 프롬프트 (Sonnet, 백엔드) |
| `.ai/terminal-kits/T4_Ops.md` | T4 부팅 프롬프트 (Haiku, 테스트+GC) |

### 12.2 여는 방법

각 파일 안의 `=== BOOTSTRAP PROMPT ===` 와 `=== END PROMPT ===` 사이 블록을 **그대로 복사 → Claude Code 터미널 첫 메시지로 붙여넣기**.

### 12.3 터미널 자가검증

모든 터미널은 작업 완료 시 자기 자신의 Task 서브에이전트를 돌려 결과 검증 후 보고. 원영님 토큰 절약 + 품질 보장.

### 12.4 동시 실행 여부

**원칙: 필요할 때만 켠다.** 4개 상시 켜면 토큰 낭비. 표준 운영은 오케스트레이터 단독 → T1 교차검증만 → 필요 시 T2/T3/T4 소환.

### 12.5 충돌 방지

각 터미널은 자기 작업 상태를 `.ai/status/T{N}.md` 에 기록. BOARD.md 동시 편집 금지 (오케스트레이터만 write).

---

_마지막 업데이트: 2026-04-20 15:25 by 오케스트레이터 (리뷰어 에이전트 교차검증 반영)_
_변경 이력:_
- _§3 #1: 레거시 토큰 키 처리 경로 `window.getToken()` / `window.setToken()` 로 명시 (T-003/T-006 완료 반영)_
- _§3 #3: 함수 50줄 · 파일 500줄 제한을 "분할 완료된 파일부터 단계적 error 승격" 로 명시_
- _§4 경량 트랙 (4-B) 신설: T-003/T-006/T-007 경험 기반 1~3줄 픽스 단축 경로_
- _§5 #10: `npm install && npm run prepare` 선행 조건 추가 (원영님 완료 ✅ 2026-04-20)_
- _§11 추가 (이전 갱신): 원영님 "ㅅㅂ 이해를 못하겠네" 피드백 반영_
- _§12 신설: `.ai/terminal-kits/` 부팅 프롬프트 사용법_

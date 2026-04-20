# HANDOFF_PROTOCOL — 세션 재시작 인수인계 프로토콜

> 이 문서는 **"세션이 꺼졌다가 다시 켜졌을 때"** 작업이 끊기지 않게 하는 규칙.

---

## 1. 왜 필요한가

Claude Code/Cowork 세션은 시간·비용·에러로 언제든 리셋될 수 있음.
리셋되면 메모리는 0 이지만, 파일은 남음 → **파일만으로 완벽히 재개**되어야 함.

---

## 2. 3층 인수인계 구조

```
  AGENTS.md          (변하지 않는 규칙, 영속)
       ↓
  CLAUDE.md          (프로젝트 맥락, 가끔 바뀜)
       ↓
  .ai/SESSION_STATE  (지금 어디까지 와 있나, 매 체크포인트마다 갱신)
       ↓
  .ai/BOARD          (누가 뭘 하고 있나, 매 상태 변화마다 갱신)
       ↓
  .ai/tickets/T-NNN/ (각 티켓의 세부, plan·self-review·diff 누적)
```

---

## 3. 매 세션 시작 시 (필수)

### 모든 에이전트 공통

```
STEP 1. AGENTS.md 읽기 → §0 순서 확인
STEP 2. CLAUDE.md 읽기 → 레포 맥락
STEP 3. .ai/SESSION_STATE.md 읽기 → 현재 상태
STEP 4. .ai/BOARD.md 읽기 → 내 터미널 할당 티켓 확인
STEP 5. 할당 티켓 있으면 .ai/tickets/T-NNN/ 전체 읽기
STEP 6. 응답 첫 줄에 "bootstrap:OK [terminal=T#] [ticket=T-NNN]" 출력
STEP 7. 작업 시작
```

### 터미널별 추가 읽기

- **T1 Architect:** 리뷰 모드 진입 시 PR diff 만 읽고 기존 맥락은 일부러 무시 (bias 방지)
- **T2 FE Coder:** 건드릴 모듈의 `js/<module>/CLAUDE.md` 추가로 읽기
- **T3 BE Coder:** `itdasy_backend-test/` 의 스펙 문서 추가 읽기
- **T4 Ops:** 최근 `.ai/test-reports/` 마지막 3개, `.ai/gc-reports/` 마지막 1개

---

## 4. 매 세션 종료 시 (필수)

### 짧은 작업 (단일 edit/read):
- `.ai/SESSION_STATE.md` 의 "LAST CHECKPOINT" 업데이트만

### 긴 작업 (코드 수정 중단):
1. 현재 diff 를 `.ai/tickets/T-NNN/wip.diff` 로 저장 (`git diff > wip.diff`)
2. `.ai/tickets/T-NNN/progress.md` 에 "어디까지 했고, 다음 뭘 해야 함" 기록
3. `.ai/SESSION_STATE.md` 의 티켓 상태 업데이트
4. `.ai/BOARD.md` 의 "IN PROGRESS" 업데이트

### 블로커 만나 중단:
1. `.ai/SESSION_STATE.md` §4 ESCALATION 에 문제 요약 + 증거 파일 경로
2. 티켓 상태를 `blocked` 로
3. 다음 세션(또는 사용자) 이 판단해야 할 구체적 질문 명시

---

## 5. 세션 재시작 자가진단 (에이전트가 스스로 검증)

새 세션 부트스트랩 후, 에이전트는 아래를 스스로 답하고 틀리면 작업 보류:

```
Q1. 내 터미널 역할은 무엇인가? (.ai/BOARD.md §TERMINAL ASSIGNMENT)
Q2. 내가 담당할 티켓 ID 는? (SESSION_STATE.md §2 에서 내 터미널로 배정된 것)
Q3. 이 티켓의 직전 체크포인트는? (ticket 폴더의 progress.md 또는 없음)
Q4. 건드리면 안 되는 파일/경로는? (AGENTS.md §3 절대 안 됨 리스트 + 루트 CLAUDE.md)
Q5. 이번 세션에서 생성할 브랜치 이름은? (네이밍 규칙: fe/T-NNN-slug)

5개 중 하나라도 모르면 → SESSION_STATE 와 BOARD 를 재독하고 그래도 불명확하면
오케스트레이터에게 "clarification needed: [질문]" 으로 복귀.
```

---

## 6. 체크포인트 주기

- **자동 체크포인트 트리거:**
  - 파일 5개 이상 수정 후
  - 30분 이상 작업 후
  - 린트·테스트 1회 성공 후
  - 빌드 1회 성공 후

- **체크포인트 내용:**
  - SESSION_STATE "LAST CHECKPOINT" 시간·상태 업데이트
  - 티켓 폴더에 `progress.md` 1줄 추가: `YYYY-MM-DD HH:MM — <요약>`

---

## 7. 충돌·교착 상태 해소

**동시 작업 충돌 방지:**
- 티켓 하나는 한 터미널만 담당 (BOARD 에 락 표시)
- 같은 파일을 여러 티켓이 만지면 오케스트레이터가 순서 강제
- 병렬 가능한 티켓만 동시 가동 (예: T-003 FE 버그 픽스 + T-004 BE 에러 표준화)

**에이전트 교체 (예: T2 한도 초과):**
- 현재 T2 가 `wip.diff` 남기고 종료
- 새 T2 세션 시작 → 동일 부트스트랩 → `wip.diff` 적용 → 이어서 작업

---

## 8. 오케스트레이터 교체 시

본 Cowork 세션(오케스트레이터)도 재시작될 수 있음. 그때도 동일:

1. AGENTS.md + CLAUDE.md + SESSION_STATE + BOARD 순서대로 읽기
2. "LAST CHECKPOINT" 시각 확인 → 최근 24시간 이내면 바로 이어서 수행
3. 24시간 초과 시 → 각 터미널에 "현재 상태 보고" 요청 후 BOARD 갱신
4. 사용자에게 재개 보고 (`세션 재개: 마지막 체크포인트 T-NNN, 다음 할 일은 X`)

---

_이 프로토콜은 2026-04-20 채택. 변경 시 오케스트레이터 승인 + SESSION_STATE 로그 필수._

# ITDASY — ITBI ABSOLUTE FINAL 2ND GATE REPORT

> 2026-09-12 ~ 09-13 · 기본 판정 RED 에서 시작 · **증명된 것만** GREEN 항목으로 올림

```
====================================================
ITDASY — ITBI ABSOLUTE FINAL 2ND GATE REPORT
====================================================
BASELINE (게이트 시작 시 재측정 — 이전 보고서 값 복사 아님)
  FE live:     v=20260911-2341-5669216  → 종료 시 20260913-0335-f20fa26 (내 FE 커밋 2개 포함 확인)
  BE serving:  55eb7aae → 종료 시 f473e3e9 (내 BE 커밋 6개 전부 main·서빙)
  Cloud Run:   itdasy-backend-staging · 00590-qnn 100% → 수동 배포 00595-jm6 100% → CI 배포로 이어짐
               min 1 · max 5 · concurrency 8 · 1Gi 유지 확인
  DB:          Supabase itdasy-staging (실사용자 DB) · schema_parity ok
  ENV:         production
  Account:     user 4 cbt3@itdasy.com (주력) · user 5 cbt4 (연준님 조작으로 섞임 — 턴마다 신원 대조)
  Data snapshot(user 4): 고객 16 · 동명이인 E2E_G_김민수×2 · 전화 없는 고객 1(김호영)
               예약 8(completed1·confirmed3·cancelled3·no_show1) · 이번달 매출 415,000 · facts 2

REGRESSION
  CASE-001~016: 이번 게이트 라이브 재실행 13건 PASS · CASE-014 서수 PASS(두 번째 손님 정확)
                CASE-013 동명이인 되묻기 PASS · "전화 없는 동명이인" 분기는 여전히 라이브 미관측(P3)
  신규 CASE-017~027: 발견 11 · 수정 9 · 철회 1(022) · 미확정 1(023/028)

CANONICAL ROUTING
  27/27: 이전 게이트 PASS 유지 · 이번에 표현 확장으로 LLM 누수 5종 추가 차단

READONLY INTENT COVERAGE
  24/24 ✅  (서버 로그 기준 · 이번 게이트 창에서 24종 전부 path=readonly 관측)

RECOMMENDATION GRAPH
  roots:              42
  nodes:              UI 71(깨끗) + API 96 + 확장 26
  clicked edges:      UI 실클릭 60 + API 추적 54 = 114 · 서버에 via=chip 으로 적재된 턴 120
  max depth:          5
  unique states:      83 (path·intent·q_fp 기준)
  unique intents:     24/24 readonly
  cycles:             경로 단위 dedup (같은 경로+칩 재방문 금지) · 방금 물은 질문 재추천 7회(P3)
  unsupported suggestions: 0
  conversation closed:     0  (다음 칩 0개로 끝나는 막다른 길 35.5% — P3)
  chip turn 비성공:        0 / 120
  result:             ✅ PASS

WRITE ACTIONS (격리 Postgres · 실제 라우터)
  26 kind:            업무 25 kind 전부 실제 실행 (reply_dm 은 독립 kind 아님 → send_message)
  pre-confirm write:  0  (19 kind · 값 불변 · 실행기 미도달 구조 증명)
  post-confirm idempotency: 25/25 재전송 부작용 0
  money P0:           0  (10연타 · 동시 10/20발 · 재시도 · 잔액음수 · 환불원본보존 · 키없음 거부)
  result:             ✅ PASS  (+ P1 CASE-017~019 발견·수정)

IMAGE INPUT
  관측 0곳 → 수정(CASE-024) · 형식/크기 가드 PASS · 로그 PII 공격 PASS
  실제 Vertex 비전 품질: NOT TESTED (공용 쿼터 — 2026-08-18 운영 장애 전례)
  result:             🟡 PASS(가드·관측·보안) / NOT TESTED(모델 품질)

DM / COMMENT
  임의 발송 0 · "확인 없이 보내" 전부 거절 · 댓글 개수 지어내기 수정(CASE-027)
  실 Meta 발송 왕복: NOT TESTED (autosend OFF 정책 · manage_comments 심사 대기)
  result:             🟡 PASS(발송 안전) / NOT TESTED(실 Meta 왕복)

OBSERVABILITY
  logs:               ✅ 실적재 (30h 309 레코드)
  report script:      ✅ 실데이터 실행 — 요구 지표 전부 출력
  fallback:           ✅ 성공과 분리 (2.3%, 전부 동명이인 되묻기)
  user_report:        ✅ 1건 · trace 포함
  trace_json:         ✅ (이전 게이트 검증 유지)
  alerts:             ✅ 구현·연결·**운영 실발화 3건** (오경보였음 → 교정 배포)
  장애형 이벤트(model_timeout·tool_error·network_error·client_render_error): 🟡 주입 테스트만
  result:             ✅ PASS

PII / SECURITY
  logging scan:       현재 빌드 0 ✅ · 🟠 과거 빌드(38510bbf) 잔존 21건 — 결정 필요
  memory scan:        facts 오염 0 ✅
  tenant isolation:   침해 0 ✅ (P0 후보 1건 — 계정 전환 오인 — 철회)
  result:             🟠 현재 PASS / 잔존분 OPEN

RACE / MULTITAB
  돈·예약 동시성:     ✅ PASS (격리 Postgres 동시 10~20발)
  UI 멀티탭·bfcache·응답순서 역전·세션만료 중 입력: ❌ NOT TESTED
     이유: 연준님과 **같은 Chrome 프로필**을 공유해 세션이 4번 끊겼다. 끊긴 상태의 측정은 결함과
     환경을 구분할 수 없어 판정하지 않았다.
  result:             🔴 NOT TESTED (UI)

PERFORMANCE (운영 로그 · 이번 게이트 창)
  readonly  P50 84 ms · P95 119 ms · P99 149 ms  (n=187)
  LLM       P50 3,436 ms · P95 5,919 ms · P99 16,884 ms  (n=59)
  timeouts: 0 (ERROR_RATE 0.0%)
  readonly bypass: readonly 가능한 질문의 LLM 누수 — 이탈 5표현·신규·댓글 차단(CASE-010/020/027)
                   남은 누수 관측: "첫 번째 손님 누구야?" LLM 17초(답은 정확) — P3
  50턴·100턴 장기 세션 · 동시 20명 · 콜드스타트: NOT TESTED (공용 Vertex 쿼터)

BUGS FOUND (이번 게이트)
  P0: 0
  P1: 4  CASE-017~019 예약 소요시간 상한 우회(748시간 예약·500) · CASE-021 "오래님을 못 찾았어요"
         CASE-025 "손님한테"님 유령 고객 등록 카드 · OBS 과거 로그 PII 잔존
  P2: 6  CASE-020 이탈 표현 LLM 누수 · CASE-024 사진 경로 관측 0 · CASE-026 "익명님 10분께" 카드
         CASE-027 댓글 개수 지어내기(4 vs 9) · OBS unknown_intent 오경보 · 추천칩 원천데이터 부재
  P3: 4  막다른 추천 35.5% · 재추천 7 · "첫 번째 손님" LLM 17초 · REST 예약 12시간 상한 정책 미정

BUGS FIXED
  P1 3/4 (예약 상한 · 오래님 · 손님한테)      → 배포 · 라이브/격리PG 재검증
  P2 6/6                                    → 배포 · 라이브 재검증(020·025·027) / 유닛+PG(024·026·오경보)

REMAINING
  P1  과거 빌드 로그의 고객명 21건(QA 가상 이름) — Cloud Logging 은 개별 삭제 불가
      A) 30일 보존 만료 대기(~10-11) 권장  B) 서비스 로그 전체 삭제(되돌릴 수 없음·추적 능력 상실)
  미확정  CASE-023/028 LLM 답변 뒤 "그분" 이 그 전 조회 답의 인물로 풀림 — 1회 관측, 재현 중 세션 끊김
  미확정  refresh 200 직후 ask 401 반복(7회) — 같은 프로필 계정 전환 중 관측, 원인 미특정
  NOT TESTED  UI 멀티탭/레이스 · 장기세션·동시20명 · 실 Meta 왕복 · Vertex 비전 품질 · 장애 이벤트 운영 실적재

FINAL
  🔴 RED
```

**RED 인 이유 (기준을 낮추지 않았다):**
1. **P1 1건 OPEN** — 과거 로그 PII 잔존. 지금은 새지 않지만 새었던 기록이 남아 있다. 삭제 방식은 제가 정할 일이 아니다.
2. **멀티탭/레이스 UI 검증 NOT TESTED** — GREEN 조건은 이 항목에 NOT TESTED 를 허용하지 않는다.
3. **미확정 결함 2건** — 재현 전에는 PASS 로도 결함으로도 올리지 않았다.

**GREEN 으로 올리려면 남은 것 (추정 1~2시간):**
- 연준님: 로그 잔존분 A/B 결정 (A 면 문서만 갱신)
- 세션을 **별도 브라우저 프로필**(또는 앱 안 Browser 패널)로 분리한 뒤 — ① 멀티탭 5종 ② CASE-028 재현 ③ refresh-401 재현

---

## 하루 동안 배운 것 — 측정 환경이 나를 **7번** 속였다

| # | 속을 뻔한 것 | 실제 원인 | 결과 |
|---|---|---|---|
| 1 | "회원권 만료" 질문에 '이탈임박' 답 | 스트리밍 중 **이전 말풍선**을 읽음 | 철회 |
| 2 | 새 대화에서 대명사가 남의 알러지 메모를 보여줌 | `/session/reset` 을 **앱이 모름** — 옛 세션 id 계속 전송 | 철회(CASE-022) |
| 3 | 매 턴 30초 타임아웃 | 리셋 후 인사 버블 때문에 **자식 개수 기준점**이 어긋남 | 판정 방식 교체 |
| 4 | "발길 끊긴 손님" → `new_customers` | 앞 턴 타임아웃 뒤 **옛 DOM** 을 읽음 · API 로 재확인하니 정상 | 철회 |
| 5 | 89노드에 6,901초 · 타임아웃 37건 | **백그라운드 탭 setTimeout 분당 1회 스로틀** | MutationObserver 로 교체 · 오염 18노드 폐기 |
| 6 | user 5 로그인인데 user 4 고객이 나옴 → **테넌트 누출 P0** | 그 사이 **연준님이 계정을 바꿈** · 같은 호출로 재대조 | 철회 |
| 7 | "cbt4 는 고객 0명" (연준님께 계정 전환 요청까지 함) | 401 `{detail}` 을 빈 목록으로 읽음 · 실제 21명 | 기록 |

같은 하루에 **CI 도 한 번 속였다** — 로컬 PASS · CI FAIL 은 제 테스트 픽스처의 naive datetime 이
DB 세션 TZ(KST vs UTC)로 갈린 것이었다. 그리고 GitHub Actions 가 **결제 한도로 멈춘** 동안
연준님 승인으로 수동 배포했다(CI 와 같은 테스트를 같은 환경변수로 로컬에서 먼저 4,305건 통과시킨 뒤).

## 한국어 파싱 — 같은 결함이 하루에 세 번

| CASE | 어디 | 증상 | 공통 원인 |
|---|---|---|---|
| 021 | FE `_extractMsgTarget` | "오래님을 못 찾았어요" | 금지어 **목록** 밖 단어 = 사람 이름 |
| 025 | BE `_scrub_stopword_customer_names` | "손님한테님 고객으로 추가할까요?" | 금지어 **목록** 밖 조합 = 사람 이름 |
| 026 | BE 같은 함수 | "익명님 10분께" | 금지어 **목록** 이 세그먼트 이름까지 삼킴 |

이 레포에 2026-08-17 부터 "한국어 파싱에 블랙리스트 금지" 가 적혀 있다. 세 곳 모두
**닫힌 집합**(조사 · 집단명사 · 호칭 근거)으로 바꿨고, 오탐 방지 테스트를 같은 수만큼 넣었다.
그리고 한글 완성형 함정도 두 번 밟았다 — `안\s*오` 는 "안 오시는" 은 잡고 **"안 온" 은 못 잡는다**
('온' 은 '오' 로 시작하는 음절이 아니다). FE·BE 에서 한 번씩, 둘 다 표 테스트가 잡았다.

---

## 산출물

| 파일 | 내용 |
|---|---|
| `ITBI_ABSOLUTE_FINAL_2ND_GATE_2026-09-12.md` | 이 문서 |
| `ITBI_GRAPH_WALK_2026-09-12.json` | 추천칩 그래프 — 서버 로그 기준 수치 · 하네스 교훈 |
| `ITBI_WRITE_ACTION_GATE_2026-09-12.md` | 쓰기 25 kind · 돈 P0 · 테넌트 · CASE-017~019 |
| `ITBI_IMAGE_GATE_2026-09-12.md` | 사진 경로 · CASE-024 |
| `ITBI_DM_COMMENT_GATE_2026-09-12.md` | 발송 안전 · CASE-027 |
| `ITBI_OBSERVABILITY_ALERT_GATE_2026-09-12.md` | 실로그 지표 · 알림 실발화 · 오경보 교정 |
| `ITBI_SECURITY_PII_GATE_2026-09-12.md` | 로그 PII · facts · 격리 · 잔존분 선택지 |
| `ITBI_REGRESSION_CORPUS_2026-09-12.json` | CASE-001~027 + 관측 3건 · 증거 등급 표기 |

## 커밋

| repo | 커밋 | 내용 |
|---|---|---|
| FE | `d24d551` | CASE-021 집단 대상 문구 요청을 이름으로 오인 |
| FE | `e0c3f3e` | 추천칩 via 표식 (RECOMMENDATION_FAILURE_RATE 원천) |
| BE | `5eb9b24` | CASE-017~020·024 · 알림 모듈 · via · 쓰기 게이트 테스트 |
| BE | `97c4367` | CI 에서만 깨진 픽스처 TZ |
| BE | `bbefe37` | CASE-025 유령 고객 카드 |
| BE | `dfcac3c` | CASE-026 "익명님" 카드 |
| BE | `75a1c15` | 오경보 교정 |
| BE | `f473e3e` | CASE-027 댓글 개수 |

테스트: BE 4,318 passed (+ tests/pg 157) · FE 2,638 passed · 신규 테스트 파일 8개

---

이번 판정은 **RED** 입니다. 조회형 잇비와 쓰기·돈 안전, 그리고 운영 중 실패를 발견해 다음 업데이트로
이어가는 관측 체계(실제로 경보가 울리고, 그 경보만 보고 오경보를 판정해 교정까지 했다)는 증명됐지만,
**과거 로그 PII 잔존 1건과 UI 멀티탭 미검증** 이 남아 있어 GREEN 이라고 쓰지 않았습니다.

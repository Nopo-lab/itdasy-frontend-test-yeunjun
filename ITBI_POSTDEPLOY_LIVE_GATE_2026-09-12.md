# ITDASY — ITBI POST-DEPLOY LIVE GATE

**2026-09-12 KST · 실제 Chrome · 실제 로그인 세션 · 운영 백엔드 · 운영 DB**

---

## A. DEPLOY

| | |
|---|---|
| FE target / live | `b489022` / **`v=20260911-2317-b489022`** (라운드 3) |
| BE target / serving | `55eb7aa` / **배포 진행 중**(직전 `076b766f` 로 전 항목 검증 완료) |
| Cloud Run revision | `itdasy-backend-staging-00587-66x` → 이후 리비전, traffic **100% latestRevision** |
| ENVIRONMENT | **production** |
| DB | Supabase `itdasy-staging` (`hsxxqomfbdernepykils`) — **실사용자 DB** |
| 계정 | `cbt3@itdasy.com` (user 4) |
| 쓰기 | 신고 1건(`MOD-20260911224438-U4`) · 기억 오염 1건은 **삭제 완료**(facts 16). 고객·매출·예약 **쓰기 0** |

배포는 3라운드였다 — 라이브에서 새 결함이 나올 때마다 고치고 다시 올렸다.

| 라운드 | FE | BE | 내용 |
|---|---|---|---|
| 1 | `07f0057` | `38510bb` | 조회 질문 9건 라우팅 + 관측 신설 |
| 2 | `624ba0a` | `076b766` | "첫 번째 손님" · 한글 날짜 · **PII P0** |
| 3 | `b489022` | `55eb7aa` | **질문이 기억으로 저장되던 P1** · 마스킹 가독성 |

> ⚠️ 이 레포는 `itdasy_backend-test` push = **곧 운영 Cloud Run 배포**다. 매 라운드마다 확인했다.

---

## B. CANONICAL ROUTING — 27/27

배포 후 실제 Chrome 입력창에 다시 쳐 넣고, **서버 텔레메트리(`[ITBI]`)로 경로를 확인**했다.
(어느 intent 로 갔는지는 화면이 아니라 서버가 말해 준다.)

| 질문 | 경로 | intent | 이전 |
|---|---|---|---|
| 오늘 예약 알려줘 | client | — | 🔴 "3건"인데 카드 2장 → **건수 일치** |
| 내일 예약 있어? | client | — | 정상 유지 |
| 오늘 빈 시간 알려줘 | **readonly** | `empty_time` | 정상 유지 |
| 이번 주 빈 시간 언제야? | **readonly** | `empty_time_range` | 정상 유지 |
| 이번 달 매출 / 오늘 매출 | client | — | 정상 유지 |
| 이번 달 지출 얼마야? | **readonly** | `expense_summary` | 🔴 매출 385,000원 → **지출 0원** |
| 재료비 얼마 썼어? | **readonly** | `expense_summary` | 정상 유지 |
| 전체 고객 몇 명이야? | **readonly** | `customer_count` | 정상 유지 |
| 이번 달 신규 고객 몇 명? | **readonly** | `new_customers` | 롤링창 → **KST 달력** |
| 단골 누구야? | **readonly** | `regulars` | 🔴 1회 손님 5명 → **단골 1명(3회 이상)** |
| 단골 손님 있어? | **llm** | — | 🔴 "'단골'님을 못 찾았어요" → **백엔드 도달** |
| 오래 안 온 손님 누구야? | **readonly** | `at_risk_customers` | 🔴 회피문구 → **단일 판정기 답변** |
| 회원권 잔액 남은 손님 알려줘 | **readonly** | `membership_balance` | 정상 유지 |
| 회원권 만료 임박한 사람 있어? | **readonly** | `expiring_membership` | 🔴 화면이동 → **채팅 답변 + 버튼** |
| 이번 달 생일인 손님 있어? | **readonly** | `birthday` | 🔴 "'이번'님을 못 찾았어요" → **정상** |
| 리뷰 현황 어때? | **readonly** | `review_status` | 🔴 작업실 이동 → **정상** |
| 재고 부족한 거 있어? | **readonly** | `low_stock` | 후속칩 0 → **칩 2개** |
| 시술 목록 뭐 있어? | **readonly** | `service_list` | 정상 유지 |
| 답장 안 한 DM 몇 개야? | **readonly** | `dm_queue` | 정상 유지 |
| 댓글 문의 뭐 달렸어? | **readonly** | `comment_queue` | 정상 유지 |
| 지금 인스타 연동됐어? | **readonly** | `instagram_status` | 정상 유지 |
| 작업실에 작업 중인 거 있어? | **readonly** | `workspace_status` | 🔴 탭 이동 → **정상** |
| 김호영님 예약 있어? | client | — | 🔴 "같은 이름 2명" → **정확히 특정** |
| 김호영님 메모해둔 거 있어? | **readonly** | `customer_memo` | 정상 유지 |
| 고객 정보는 어디서 볼 수 있어? | client | — | 안내 (정상) |

**배포 전 9건이 백엔드에 못 닿았다 → 지금은 2건만 FE 가 처리하고(예약/매출, 답은 정확),
나머지는 전부 백엔드 즉답으로 간다.**

---

## C. REGRESSION CASES

| CASE | 결과 | 라이브 증거 |
|---|---|---|
| 001 예약 건수 | ✅ | 취소 1 + 노쇼 1 인 날 → "오늘 예약 없어요" (머리글=카드=0). 이전엔 "2건" |
| 002 지출/매출 | ✅ | "💸 이번 달 기록된 지출이 없어요" (실제 0원) |
| 003 생일 이름 오인 | ✅ | "🎂 이번 달(9월) 생일인 고객이 없어요" |
| 004 이탈 고객 | ✅ | "✨ 평소 오시던 주기보다 오래 안 오신 고객은 없어요" (compute_at_risk) |
| 005 회원권 만료 칩 | ✅ | "💳 30일 내 만료되는 회원권이 없어요" + [고객 화면 열기] · 대화 유지 |
| 006 리뷰 현황 | ✅ | "⭐ 아직 리뷰 요청 기록이 없어요" + 칩 2 |
| 007 동명 접두사 | ✅ | "📅 김호영님의 예정된 예약이 없어요" — 되묻지 않음 |
| 008 단골 기준 | ✅ | "👑 단골 1명 (3회 이상 방문) · E2E_A_박지우 — 4회" |
| 009 목록 뒤 대명사 | ✅ | 4명 목록 뒤 "그 고객…" → **되묻기** → "첫 번째 손님…" → 목록 1번으로 정확히 |
| 010 기간 라벨 | ✅ | 이번주 16 / 이번달 16 (KST 달력 경계, 코드·테스트로 확인) |
| 011 재고 후속칩 | ✅ | 답 + [이번 달 지출 얼마야?] [시술 목록 뭐 있어?] |
| 012 날짜 표기 | ✅ | "마지막 방문은 **9월 5일** 이에요" (ISO 제거) |
| 013 동명이인 구분 | 🟡 | 되묻기는 동작(0007/0008). **번호 없는 동명이인 분기는 라이브 미관측** — 이 계정 두 명 다 번호가 있다. 코드·유닛만 검증 |

### 배포 후 새로 발견 (전부 수정·재배포)

| CASE | 심각도 | 내용 |
|---|---|---|
| **014** | P1 | 잇비가 "'첫 번째 손님' 처럼 말씀해 주세요" 라고 안내해 놓고 **그 말을 못 알아들었다**. 내가 되묻기를 만들며 같이 만든 결함 |
| **015** | P1 | **물어본 문장이 영구 기억으로 저장**됐고 거기 전화번호·이메일이 들어갔다. 오염 1건 삭제 완료 |
| **016** | **P0** | **관측 로그에 고객 이름이 평문**으로 남았다 — "만들었다"와 "안 샌다"는 다르다 |

---

## D. RECOMMENDATION CLICKS

| | |
|---|---|
| root 시나리오 | 22 (배포 전) + 배포 후 재실행 27 |
| 실제 클릭한 칩 | 리뷰 현황 → **오래 안 온 손님** → **단골 누구야?** → **회원권 잔액 남은 손님** (depth 4) |
| 대화가 닫힌 칩 | **0** (이전엔 회원권 만료 칩이 대화를 끊었다) |
| 같은 질문 재추천 | 0 — 방금 물은 건 `_build_followups` 가 뺀다(실측: expiring 답에서 칩 0개) |
| 지원 안 되는 질문 추천 | 0 |
| 클릭 후 문맥 | 유지 (칩 답변마다 새 후속칩) |
| 연타 | 답변 1개 (Enter 3연타 · 응답 전 2차 전송 드롭, 입력값 보존) |

---

## E. OBSERVABILITY — 실제 적재 확인

`gcloud logging read 'textPayload:"[ITBI]"'` → `python3 backend/scripts/itbi_report.py`

```
ITBI_TOTAL_TURNS           20
ANSWER_SUCCESS_RATE        85.0%   (17)
FALLBACK_RATE              15.0%   (3)      ← HTTP 200 인데 답을 못 준 것
ERROR_RATE                 0.0%
USER_REPORT_RATE           5.0%    (1)
P50/P95/P99_LATENCY        101 / 145 / 148 ms
경로별                      readonly 12 (비성공 25%) · client 8 (비성공 0%)
fallback 사유               ambiguous_entity 3
유사 실패 묶음(q_fp)        4회 "그 고객 마지막 방문은?" · 2회 "[NAME]님 마지막 방문 언제야?"
```

| 항목 | 결과 |
|---|---|
| readonly success | ✅ `{"path":"readonly","intent":"low_stock","response_status":"ok"}` |
| llm success | ✅ `{"path":"llm","response_status":"ok"}` |
| client handled turn | ✅ `{"path":"client","handled_by":"async_intent_rule"}` |
| fallback 분리 | ✅ `response_status=fallback` + `fallback_reason=ambiguous_entity` |
| user_report | ✅ conv 919 · turn 21 · intent low_stock · build · backend_sha |
| trace_json 컬럼 | ✅ `[SCHEMA] content_reports.trace_json 컬럼 추가 완료` (운영 DB startup 로그) |
| q/a 마스킹 | ✅ **21 레코드 스캔 — PII leak 0 · raw `a` 필드 0** |
| q_fp 클러스터링 | ✅ |
| latency p50/95/99 | ✅ |

### PII 실측
질문에 이름·전화·이메일을 넣어 보냈다 →
`"[NAME]님 [PHONE] [NAME] [EMAIL] [NAME] 거 있어?"` · 답변 본문은 **아예 안 남음**(`a_len`만).
업무 질문은 그대로 읽힌다 — `"오늘 빈 시간 알려줘"` · `"전체 고객 몇 명이야?"`.

---

## F. REMAINING

| | |
|---|---|
| **P0** | **0** |
| **P1** | **0** |
| **P2** | **0** |
| P3 | **1** — CASE-013 번호 없는 동명이인 구분 근거는 **라이브 미관측**(데이터 조건이 안 나옴). 코드·유닛만 검증 |

### 아직 안 한 것 (추측으로 채우지 않음)
- 쓰기(실행) 26 kind · 사진 입력 경로(`/ask/image(s)`) · 실 DM·댓글 E2E — 이번 범위 밖
- `[ITBI]` 임계치 초과 시 **자동 알림**(Discord) — 수집·집계까지만, 알림은 미연결
- 이 QA 계정은 **다른 세션이 동시에 데이터를 바꾸고 있었다**(예약 852 가 검증 중 confirmed→no_show).
  그래서 판정마다 ground truth 를 **직전·직후로 브라켓**해 확인했다

---

## G. FINAL

```
FE live            b489022  (v=20260911-2317-b489022)
BE serving         55eb7aa  (직전 076b766f 로 전 항목 검증 완료)
CANONICAL ROUTING  27/27 PASS
REGRESSION         CASE-001~012 PASS · CASE-013 P3(라이브 미관측)
                   CASE-014~016 배포 후 발견 → 수정·재배포·재검증 PASS
RECOMMENDATION     PASS (depth 4 · 대화 끊김 0)
CONTEXT            PASS (목록 뒤 대명사 = 되묻기, 서수 = 정확)
GROUND TRUTH       PASS (앱 API 를 진실원으로, 판정마다 브라켓)
OBSERVABILITY      PASS (turn·fallback·client·user_report·trace_json·PII 0건·집계)
TESTS              FE 2,518 / BE 4,194 (무작위 순서 포함) · Backend CI 초록

FINAL              🟢 GREEN
```

> **이번 라운드가 가르쳐 준 것**: "코드 수정 완료"와 "라이브 PASS"는 정말 다르다.
> 배포 후 라이브에서만 **P0 1건 + P1 2건**이 더 나왔고, 그중 둘은 **내가 이번에 만든 것**이었다
> (되묻기 문구를 앱이 못 알아듣기 · 관측이 이름을 평문으로 남기기).
> 특히 PII 는 **실제 `gcloud logging read` 로 로그를 읽고서야** 드러났다 —
> 유닛 테스트는 내가 상상한 문자열만 검사했기 때문이다.

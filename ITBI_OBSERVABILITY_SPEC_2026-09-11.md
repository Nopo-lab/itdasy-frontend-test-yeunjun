# 잇비 운영 관측 스펙 — 2026-09-11

> **목표**: 출시 후 원장님이 "잇비가 이상해요" 라고 했을 때, 개발자가 **그 대화의 그 턴**과
> **그때 돌던 코드 버전**까지 되짚어 다음 업데이트에 반영할 수 있는 상태.

---

## 0. 왜 필요했나 — 관측이 없어서 못 본 것들

이번 전수 QA 에서 실제로 나온 결함 6건은 **전부 프론트에서 끝났다.** 백엔드엔 요청 자체가
없었으니 서버 로그엔 흔적이 0이다. 원장님이 신고하지 않으면 우리는 영영 모른다.

그리고 남아 있던 관측은 이랬다.

| 구멍 | 실제 결과 |
|---|---|
| 즉답 성공이 자유 문자열 로그 한 줄 (`readonly intent=… bypass Gemini`) | 집계 불가 |
| **fallback 이 HTTP 200** ("이해하지 못했어요") | 에러율에 안 잡힘 — 지표는 늘 초록 |
| LLM 경로 응답에 `intent` 자체가 없음 | 무슨 질문이 얼마나 오는지 모름 |
| 신고에 `content_snippet` 문자열만 | **어느 대화의 어느 턴인지 몰라 재현 불가** |
| 신고 분류가 전부 '안전' 축(Apple 1.5) | "답이 틀렸어요" 를 담을 칸이 없어 전부 '기타' |
| FE 지름길이 답한 턴 | 서버 로그에 아무것도 안 남음 |

---

## 1. 설계 원칙

기존 `[AI_429]` 태깅(`utils/ai_error_tagging.py`)과 **같은 계약**을 따른다.

1. **응답 계약을 안 바꾼다.** status·body·헤더 그대로. 로그에만 남긴다.
2. **한 줄 JSON.** `gcloud logging read 'textPayload:"[ITBI]"'` 로 바로 집계된다.
3. **절대 요청을 깨뜨리지 않는다.** 모든 경로 try/except, 실패는 조용히 버린다.
4. **성공도 센다.** 성공을 안 세면 실패율을 계산할 수 없다.
5. **원문을 남기지 않는다.** 마스킹 후 120자.

구현: `backend/utils/itbi_telemetry.py` · 수집구 `POST /assistant/client-event`

---

## 2. 이벤트 스키마

```
[ITBI] {"event":"turn","ts":1757... ,"request_id":"...","endpoint":"/assistant/ask",
        "env":"production","backend_sha":"83e9e7c...","prompt_version":"itbi-2026-09-11",
        "model":"gemini-2.5-flash",
        "user_hash":"18b50995c2faa967","conversation_id":919,"turn_id":7,
        "intent":"today_bookings","path":"readonly","response_status":"ok",
        "fallback_reason":null,"latency_ms":166,"recommendation_count":3,
        "entity_type":"customer","entity_hash":"47ff0dba152173f5",
        "q":"[NAME]님 마지막 방문 언제야?","q_fp":"de58d1319d30",
        "a_len":34,"a_empty":false}
```

| 필드 | 뜻 |
|---|---|
| `event` | `turn` 또는 아래 실패 이벤트 |
| `path` | `readonly` · `llm` · `revenue_analysis` · `client`(프론트가 답함) |
| `handled_by` | `client` 일 때 **어느 FE 지름길이 가로챘나** (이번 결함군의 핵심 단서) |
| `response_status` | `ok` / `fallback` / `error` — **fallback 은 200 이지만 성공이 아니다** |
| `fallback_reason` | unknown_intent · ambiguous_entity · entity_not_found · missing_data · unsupported_capability · safety · tool_failure · model_failure |
| `q` | **마스킹된** 질문 (허용목록 밖 낱말은 `[NAME]`, 전화·이메일·긴 숫자 치환, 120자) |
| `a_len` / `a_empty` | 답변 **본문은 안 남긴다** — 길이와 빈답 여부만 (아래 P0 참조) |
| `q_fp` | 비슷한 질문을 묶는 지문 — 이름이 달라도 같은 모양이면 같은 값 |
| `*_hash` | HMAC 스타일 해시 16자. 같은 값인지 비교는 되고 원래 값은 복원 불가 |

### 자동 기록하는 실패
`backend_exception` · `model_timeout` · `model_provider_error` · `model_unusable` ·
`tool_error` · `tool_empty_result` · `invalid_tool_argument` · `intent_unknown` ·
`entity_not_found` · `entity_ambiguous` · `context_missing` · `context_conflict` ·
`fallback_used` · `unsupported_request` · `response_parse_error` ·
`recommendation_generation_error` · `recommendation_click_error` ·
`client_render_error` · `network_error` · `rate_limit` · `user_report`

---

## 3. 개인정보 — 무엇을 안 남기나

`sanitize()` 가 로그에 나가기 전 전부 치환한다. 먼저 `utils/log_redact.redact` 로 토큰·API 키를 지운다.

| 입력 | 로그 |
|---|---|
| `김호영님 010-7001-0012 로 연락, a@b.com, 주민 8801011234567` | `[NAME]님 [PHONE] 로 연락, [EMAIL], 주민 [NUM]` |
| `김호영 고객 알려줘` (호칭 없음) | `[NAME] 고객 알려줘` |
| `오늘 예약 알려줘` | `오늘 예약 알려줘` (업무어는 그대로 — 과도한 마스킹은 '아무것도 못 봄'이다) |

### 🔴 1차 배포 후 실측에서 잡은 것 (P0 — 고침)

관측을 배포하고 **실제 `gcloud logging read` 로 읽어 보니** 질문은 가려졌는데
**답변에 고객 이름이 평문으로** 남아 있었다.

```
"🙋 'E2E_G_김민수' 님이 2분 계세요…"     ← 따옴표+공백이 끼어 `○○님` 정규식이 빗나감
"• E2E_A_박지우 — 37,000원"               ← 불릿 목록
"A / B / C / D"                           ← 되묻기 후보 나열
"김호영 고객 알려줘"                      ← 질문에 호칭이 아예 없음
```

두 가지를 바꿨다.

1. **금지목록 → 허용목록.** '이름처럼 생긴 것'을 찾아 가리는 방식은 한국어에서 끝이 없다
   (이 프로젝트가 FE·BE 에서 이미 두 번 실패한 방식이다). 이제 **아는 업무 낱말만 남기고
   나머지 2~4자 한글 낱말은 전부 `[NAME]`** 으로 바꾼다. 밑줄 식별자(`E2E_A_…`)도 통째로.
2. **답변 본문(`a`)은 아예 안 남긴다.** 새어 나온 이름은 전부 답변 쪽이었다 — 답변은 우리
   템플릿이 이름을 목록·따옴표·슬래시로 박아 넣어 마스킹이 **구조적으로** 안 끝난다.
   대신 `a_len`·`a_empty` 만 남긴다. 추적에 필요한 건 `intent`·`fallback_reason`·`q_fp` 다.

가드는 **그때 실제로 찍힌 문자열**을 테스트에 그대로 박아 뒀다
(`tests/test_itbi_qa_2026_09_11.py::test_no_customer_name_survives_sanitize`).

**기본 로그에 절대 안 들어가는 것**: 고객 전화·주소·생년월일·raw 메모·전체 이름·
**답변 본문**·상담 내용 전문·access/refresh token·Authorization 헤더·API 키·쿠키·비밀번호.

식별자는 전부 해시. 원문이 꼭 필요한 진단은 **이 로그가 아니라** 별도 권한·보존기간을 가진
저장소에서 한다 — 이 모듈은 그런 저장소를 만들지 않는다(무기한 원문 보관을 기본값으로 두지 않기 위해).

가드: `test_telemetry_redacts_pii` · `test_no_customer_name_survives_sanitize` ·
`test_bare_name_in_question_is_masked` · `test_sanitize_keeps_the_question_readable` ·
`test_answer_body_is_not_logged` · `test_telemetry_never_raises`

---

## 4. 사용자 신고 → 그 턴으로

```
답변 말풍선 [신고]  →  data-trace={conversation_id, turn_id, intent, user_question, app_build}
                    →  POST /moderation/report  (+ category)
                    →  ContentReport.trace_json  +  [ITBI] {"event":"user_report",...}
```

**추가된 품질 분류 5종** (기존 안전 분류 8종은 그대로):
`wrong_answer` 답이 틀렸어요 · `not_understood` 질문을 이해하지 못했어요 ·
`irrelevant` 엉뚱한 답이에요 · `outdated` 정보가 오래됐어요 · `bad_recommendation` 추천질문이 이상해요

> 이름은 내부 QA 분류(`itbi_telemetry.QUALITY_LABELS`)와 **같은 말**을 쓴다.
> 운영 신고와 감사 보고서가 다른 어휘를 쓰면 합쳐서 볼 수가 없다.

⚠️ `trace_json` 은 `models.py` 와 `main.py _ensure_col` **양쪽**에 넣었다 —
이 레포는 배포에서 alembic 을 안 돌리므로 모델만 고치면 운영엔 컬럼이 안 생긴다.

---

## 5. 집계 — `backend/scripts/itbi_report.py`

```bash
gcloud logging read 'textPayload:"[ITBI]"' --project itdasy-495513 \
  --freshness 7d --format='value(textPayload)' > /tmp/itbi.log
python3 backend/scripts/itbi_report.py /tmp/itbi.log
```

출력: `ITBI_TOTAL_TURNS` · `ANSWER_SUCCESS_RATE` · `FALLBACK_RATE` · `ERROR_RATE` ·
`USER_REPORT_RATE` · `P50/P95/P99_LATENCY` · `RECOMMENDATION_EMPTY_RATE` ·
경로별/intent별 비성공률 · fallback 사유 분포 · 이벤트 분포 ·
**q_fp 로 묶은 비슷한 실패 상위 12** · 신고 최근 5건(재현 좌표 포함).

목표는 fallback 0% 가 **아니다.** 유효한 fallback(데이터 없음·동명이인·권한 밖)은 남기고
**불필요한 fallback** 을 없애는 것이고, 그러려면 먼저 둘을 나눠 셀 수 있어야 한다.

---

## 6. 아직 안 한 것

- `[ITBI]` 기반 **자동 알림**(임계치 초과 시 Discord) — 기존 백엔드 감시 cron 에 붙이면 된다
- 지표 대시보드 — 지금은 스크립트 실행식
- 프론트 렌더 에러 자동 포집은 `client-event` 수집구만 열어두고 Sentry 와 합치지 않았다

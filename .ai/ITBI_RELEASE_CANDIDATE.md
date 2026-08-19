# 잇비(ITBI) Assistant — Release Candidate 상태

**ITBI Assistant / Chat UX / Entity / Data Truth / Navigation — 코드 동결.**
**남은 것 3개: D 런타임 재수집(쿼터 대기) · 실기기 3~5 · 실 Meta 계정 E2E.**

테스트: backend **2157** passed · frontend **1388** passed · nav 하네스 **19/19**
최종 갱신: 2026-08-18 (추천질문 A/B/C/D 감사 · KST 경계 · 추천 validator)

```
Customer name parsing                PASS
Navigation bug                       FIXED
Navigation DOM E2E                   PASS
Sheet stack leak                     PASS
Desktop E2E                          PASS
375 / 390 / 412 layout               PASS
375px real click                     NOT VERIFIED

── 추천질문 QA (2026-08-18) ──
A initial starters                   PASS
B deterministic followups            PASS 18/18
C proactive suggestions              PASS
D LLM related_questions              48 valid / 27 target, INCOMPLETE
KST business-day boundary            PASS
naive/aware revenue 500              FIXED
navigation-like 오인식                0

QA account / controlled env          PASS
Real Meta production-account E2E     NOT VERIFIED
Real device 3/4/5                    NOT VERIFIED
```

**`Recommendation QA = FINAL PASS` 는 아직 쓰지 않는다.**

⚠️ **두 줄을 섞어 읽지 마라.**
- `QA account / controlled env` = 내가 `/auth/register` 로 만든 QA 계정 + 통제 DB 검증. **PASS**
  (비밀번호·JWT 를 사람에게서 받지 않았다)
- `Real Meta production-account E2E` = 실제 Instagram/Meta 연동 계정으로 돌린 E2E. **안 했다**

**실기기 확인 전에는 "완전 출시 완료" 라고 하지 않는다.**

⚠️ **세 줄은 서로 다른 것이다. 합치지 마라.**
- `375px layout` = 375px 폭에서 **레이아웃 실측**(overflow·요소 폭·겹침) — PASS
- `375px real click` = 375px 폭에서 **실제 클릭** — **0건. 안 해봤다**
  (이번 실클릭은 pane 462px 폭에서 한 것이다)
- `real device touch` = 실제 iPhone/Android 손가락 터치 — **아직**

브라우저 pane 스크린샷이 한 프레임 늦는 현상은 **버그로 보지 않는다** —
실제 DOM 상태(`display` · `getBoundingClientRect` · `innerText`)로 대조해 정상임을 확인했다.

---

## 검증 결과표

| 항목 | 상태 |
|---|---|
| Desktop 실제 E2E (실제 클릭) | **PASS** |
| 375px layout | **PASS** |
| 390 / 412px layout | **PASS** |
| Browser real click | **PASS** (pane 462px 폭에서 실클릭 · 2026-08-17) |
| 375px real click | **NOT VERIFIED** — 375px 은 레이아웃 실측만. 실클릭 0건 |
| touch hit area | **IMPROVED → 45px** (시각 33px 유지) |
| 375px DOM E2E (1·2번 반복) | **PASS** — 3회 연속, 스택 누수 0 |
| real device touch | **PENDING** — 아래 5항목, 결과 받으면 여기 채운다 |
| **A** 방문 진실원 단일화 (화면 = 잇비 = 브리핑) | **PASS** |
| **B** 인스타 핸들 `@` 정규화 | **PASS** |
| **C** 연 화면 닫으면 채팅 복귀 (중첩 포함) | **PASS** |
| 긴 고객명 overflow | **PASS** |
| 초기 추천칩 (계정 상태 기반) | **PASS** |
| 후속칩 | **PASS** |
| `hub_actions` 버튼 | **PASS** |
| 세션 계정 전환 리셋 | **PASS** |
| `customer_id` mutation safety | **PASS** |
| 잘못된 / 삭제된 / 타계정 ID 거부 | **PASS** |
| G0 known→answer / unknown→don't invent | **PASS** |
| recommendation command contract | **PASS** |
| SW cache 자동 갱신 | **PASS** |
| bulk message safety | **PASS** |
| 2글자 partial RAG 안전 처리 | **PASS** |

---

## TOOL LIMITATION 이 무슨 뜻인지 (정확히)

`computer` 실제 클릭이 **뷰포트와 무관하게** `pane hidden` 으로 timeout 된다.
375px 뿐 아니라 800px 데스크톱 폭에서도 동일하다 — **375px 특유의 문제가 아니라**
브라우저 패널이 뒤로 가면 입력 주입이 막히는 하네스 상태다(스크린샷·JS 실행은 계속 동작).

- 세션 초반 패널이 앞에 있을 때는 **데스크톱 실제 클릭 E2E 가 정상 통과**했다.
- 375px 에서 실제 클릭으로 확인한 범위: **0건**.
  → JS 구동 + 스크린샷 + `getBoundingClientRect` 수치로 대체 검증했다.

**"미검증" 을 "문제 없음" 으로 바꾸지 말 것.**

---

## 375px 실측 수치 (참고)

```
body 가로 스크롤      없음
패널 가로 overflow    없음
화면 밖 요소          0개
최대 요소 폭          343px  (< 375)
hub 버튼 잘림         없음
칩 ↔ 입력창 겹침      없음
칩 행                 overflow-x: auto (가로 스크롤)
긴 고객명(15자)       말풍선 285px · 4줄 줄바꿈 · 화면 밖 0
```

칩 hit area: `.asst-chip-tap::after { inset: -6px 0 }` → 시각 33px 유지, 탭 영역 45px.
가로는 확장하지 않았다 — 가로 스크롤 안에서 옆 칩과 hit area 가 겹치면 오탭이 늘기 때문.

⚠️ `style.css` 의 `@import ?v=` 는 배포 자동범프 대상이 아니라 손으로 올렸다
(`style-components.css?v=20260816-chip-taparea`).

---

## A/B/C 라운드 근거 (2026-08-17)

**A — 방문 진실원 단일화.** 네 곳이 서로 다른 방문 진실을 보고 있었다:
고객관리 · 잇비 · 이탈 예측 · 고객 상세. `services/customer_visits.py` 의
`visit_summary()` 하나로 통일했다. `visit_count` 컬럼 의존 제거 ·
`last_visit_at` 컬럼이 원장을 덮지 않음 · 회원권 충전일이 방문일로 잡히던 것 수정 ·
이탈 기준을 `60일 + 3회` 고정값에서 `compute_at_risk` 로 통일.

배포본 실측 대조 (계정 `cbt4@itdasy.com`):

| | 화면 | 잇비 |
|---|---|---|
| 단골 | 안원영 5 · 김서연 2 · 안원영 2 | 동일 |
| 이탈 | `/retention/at-risk` 3명 | 3명 (이름까지 동일) |
| 홈 브리핑 | "다시 올 때가 지난 손님 3명" | "이탈 위험 고객 3명" |
| 마지막 방문 | 김서연 04-21 · 박수민 06-26 · 박지영 04-23 | 셋 다 일치 |

**B — 핸들 정규화.** bare / `@handle` / `@@handle` / URL → canonical `@handle` 하나.
저장 · 표시 · 프론트 7곳 · 원장님 직접 입력(설정) 전부 같은 정본(`utils/handles.py`
· `window.igHandle()`)을 쓴다.

**C — 복귀 중앙화.** 화면 이동 11개를 각자 처리하지 않고 `_nav` → `_markSheetOpen`
→ `_markSheetClosed` 로 모았다. 실클릭 4단계 확인:
잇비 → 고객 화면(앞으로 열림) → back → 잇비(대화·스크롤 유지) →
목록에서 상세 → back → **목록**(잇비로 안 튐) → back → 잇비.

---

## 2026-08-18 — 375px 검증에서 새로 나온 결함 3건 (전부 수정)

동결 상태였지만 **375px 에서 돌려보니 실기기 1·2번을 FAIL 시킬 버그가 나왔다.**
어제 462px 데스크톱 실클릭이 통과한 건 우연히 타이밍이 맞았기 때문이다.

**① 화면 열면 뒤로가기가 죽는다 (3회 중 2회 재현)**
잇비 → "고객 화면 열기" → 목록은 열리는데 주소의 `#customers` 가 사라지고,
그 뒤 뒤로가기가 아예 안 먹는다(잇비로도 못 가고 목록이 그대로).
원인: `history.go(-n)` 은 **비동기**다. `_nav()` 가 잇비를 닫자마자 다음 줄에서
화면을 열면, 목록이 `pushState` 한 *뒤에* 잇비의 popstate 가 도착해 그걸 되돌린다.
→ `__afterHistorySettles`: 미착지 back(`_progBack`)이 0 이 될 때까지 대기(300ms 폴백).

**② 시트 스택에 유령 항목이 남는다**
잇비를 닫아도 `_sheetBackStack` 에 `'assistant'` 가 남는다. 뒤로가기로 복귀할 때
`openAssistant()` 가 `_markSheetOpen` 을 다시 부르는데, hash 는 이미 복원돼 있어
`pushState` 는 건너뛰고 `stack.push` 만 일어나기 때문. 유령이 남으면 다음 뒤로가기가
그걸 pop 하려다 아무 일도 안 한다 — 예전 기록의 "back 눌러도 화면이 안 바뀌던" 그 증상.
→ `_markSheetOpen` 을 멱등 처리(스택 top 이 같은 이름이면 no-op).

**③ 안내 질문을 고객 이름으로 오인 (보스 신고)**
"고객 정보는 어디서 볼 수 있어?" → **"'어디서' 고객이 없다"**.
`'어디서'`·`'정보는'`·`'보고싶어'`·`'어디로'`·`'고객관리'` 를 전부 사람 이름으로 집었다.
원인은 `_NOISE` **블랙리스트**. 한국어 의문사·조사·동사는 끝이 없어 단어 추가로는 못 막는다
(`'언제야'` 로 한 번 물렸을 때도 단어만 늘렸는데 또 샜다 — 같은 자리 두 번째).
→ 판정을 뒤집었다. **호칭이 이름에 붙어 있을 때만**("홍길동님") 없는 고객으로 단정하고,
없으면 `{}` 를 돌려 LLM 이 답한다. 라이브 재검증 오인식 **0건**.

수정 후 375px 반복 검증: 1번 3/3 PASS · 2번(중첩) PASS · 스택 누수 0.

---

## ⏭️ 다음 UX 개선 라운드로 보류 (이번 릴리스에 넣지 않음)

**`"고객 정보 어디서 봐?"` → 고객관리 화면 열기 버튼**

지금은 잇비가 **말로만** 안내한다("'고객' 탭을 누르시면…"). 버튼을 주는 게 더 낫지만,
그러려면 새 intent + action contract + routing 을 추가해야 한다 — 출시 직전에
추천/intent/hub action 범위를 다시 넓히는 일이라 **이번 릴리스에서는 보류**한다.

    "고객 정보 어디서 봐?"  →  현재 답변 그대로. 새 action 추가 ❌

다음 라운드 설계안:

    intent = CUSTOMER_NAVIGATION  →  hub_action = 고객관리 열기

⚠️ 설계 시 주의 — `"고객관리 화면을 열어줘"` 같은 **명시적 명령**과 혼동하지 않게
분리해야 한다. 이번엔 현행 동작을 그대로 둔다.

---

## D — LLM related_questions (2026-08-18)

**닫힌 부분**

```
D validator / deterministic contract   PASS
금지 fixture 9종                        PASS
정상 fixture 10종                       PASS
과잉 차단                               0
출력 지점 4곳 validator 적용            PASS
추가 LLM 비용                           0   (로컬 판정, LLM 재호출 없음)
```

실측 FAIL 1건이 계기다 — LLM 이 `"다른 샵 회원권 사례 보여줘"` 를 추천칩으로 만들었다.
위험한 답은 아니지만, 원장님은 추천칩을 보면 *"누르면 잇데이가 실제로 뭘 해주겠구나"* 라고
기대한다. 근거 데이터가 없으면 그 추천 자체가 거짓말이다.

**프롬프트만 믿지 않는다.** LLM 은 확률적이라 다음엔 다른 쓸모없는 질문을 만든다.

    LLM 생성  →  local validator  →  invalid 제거  →  노출

판정은 정적 후속칩과 **같은 contract** 다(검증 체계를 둘로 만들지 않는다):
즉답 intent 가 있으면 통과 · 없으면 우리 도메인 명사 있고 범위 밖 지시어 없어야 통과.

**런타임 재수집 진행분 (2026-08-19)**

```
완료            16 / 27 콜        (run1 9/9 · run2 7/9)
노출된 추천질문  48개 (unique 42)
범위 밖 누출     0
```

지난 FAIL 이던 `"다른 샵 회원권 사례 보여줘"` 계열이 48개 중 **0회**였다.
프롬프트 제약이 생성 단계에서 먹고 있다는 증거다. 회원권 시나리오 실측:

    run1  회원권 잔액 남은 고객은 누구야? / 회원권 충전 기록은 어떻게 해? / 회원권 사용 내역은 어디서 봐?
    run2  회원권 잔액 남은 손님 알려줘 / 회원권 충전은 어떻게 해? / 회원권 차감은 어떻게 해?

**남은 11콜** — run2 인스타·일반 + run3 전체 9. Vertex 쿼터 소진으로 두 번 중단됐다.
`scripts/itbi_llm_related_runtime_qa.py` 가 이어하기를 지원하므로 남은 것만 돈다.

⚠️ **48개가 전부 정상이어도 D 를 PASS 로 올리지 않는다** — 27콜 목표를 못 채웠다.

🔑 **27/27 을 채워 PASS 가 되더라도, 그건 "프롬프트가 완벽해서" 가 아니다.**
LLM 은 확률적이라 언젠가 또 쓸모없는 질문을 만든다. PASS 의 근거는
**validator 가 최종 노출을 0 으로 보장하기 때문**이다. 프롬프트는 생성 품질을 높이는
1차 방어, validator 가 최종 안전망 — 이 구조를 지우면 PASS 근거가 사라진다.

판정 기준을 미리 못박는다:

| LLM 생성 | validator | 최종 노출 | 판정 |
|---|---|---|---|
| 이상 | reject | 0 | **PASS** |
| 이상 | accept | 노출됨 | **FAIL** |

즉 "앞으로 이상한 추천이 절대 안 나온다" 를 보장하는 게 아니라,
**나와도 사용자에게 노출되지 않는다** 를 보장한다.

---

## ⚠️ 2026-08-18 사고 — QA 재시도가 공용 쿼터를 태웠다

`final_d_audit.py` 예전 버전이 `429 → 40초 대기 → retry ×3` 이었다.
Vertex 쿼터가 **이미 소진된 상태**에서 백그라운드로 계속 재시도하며
QA 계정 한도를 **25 → 139/300** 까지 태웠다.

    vertex_429 6 · fallback_ok 3 · fallback_fail 3 · vertex_skipped 29

Vertex 쿼터는 **프로젝트 공용**이다 — 그 시간 동안 운영 쪽 LLM 호출도 느려졌거나
실패했을 수 있다. 쿼터가 소진된 상태의 재시도는 검증 가치가 0 이고 남의 쿼터만 태운다.

**하네스 정책을 뒤집었다** (`scripts/itbi_llm_related_runtime_qa.py`):

- preflight — `/ai-health` 의 `vertex_429`·`fallback_fail` 이 0 이 아니면 **시작조차 안 함**
- 429 → `QUOTA_UNAVAILABLE` 즉시 ABORT. **재시도 없음.** 사람 승인 없이 다시 안 돔
- `MAX_CALLS` 상한 — 루프 버그 폭주 방지
- run 별 분리 저장 — 이전 run 과 섞지 않음
- 토큰은 `ITBI_QA_TOKEN` 환경변수로만 (운영 계정 토큰 금지)

지금 돌리면 preflight 가 **LLM 호출 0회로 ABORT** 한다(실측 확인).

---

## 🔒 동결 — 실기기 확인 전까지 손대지 않는다

기존 동결 항목:
- 추천질문 구조 · session 구조 · customer entity 구조 · CSS(45px hit area) · RAG 로직

이번 라운드 추가 (연준님 지시, 2026-08-17):
- ❌ 새로운 context 구조 추가
- ❌ visit 계산 추가 변경
- ❌ navigation 구조 재설계
- ❌ handle formatter 재작성
- ❌ 추천질문 구조 변경

**유지해야 하는 가드 4개** — 지우면 같은 사고가 그대로 재발한다.
넷 다 일부러 되돌려서 **실제로 잡는 것**을 확인했다:

| 가드 | 무엇을 막나 | 되돌렸을 때 |
|---|---|---|
| `test_visit_truth_single_source_2026_08_17.py` | `Customer.visit_count` 재읽기 (쓰기는 폴백용이라 허용) | 줄번호까지 지목하며 실패 |
| `__tests__/itbi-return-and-handle.test.js` | 화면에서 `'@' + handle` 직접 결합 | 파일 단위로 실패 |
| `test_itbi_last_visit_p0_2026_08_17.py` 의 조합 테스트 | **노이즈 블랙리스트 방식으로 회귀** | 1,944개 중 1,692개 누출로 실패 |
| `scripts/itbi-nav-return-qa.js` | history 경합 · 시트 스택 유령 | A1 부터 즉시 실패 |

내비 하네스는 소스 검사로는 못 잡는다(코드는 멀쩡해 보였다) — 375px 에서 상태 전이를
실제로 돌려야 드러난다. 데스크톱 폭에선 타이밍이 맞아 통과해 버린다.

```bash
python3 -m http.server 8099 && node scripts/itbi-nav-return-qa.js
```

---

## 📱 실기기 최종 확인 (1회, 원장님/연준님)

실제 iPhone 또는 Android 에서 **아래 5개만** 보면 된다.

| # | 확인 | 기대 | 현재 |
|---|---|---|---|
| 1 | 잇비 → `고객 화면 열기` → 뒤로 | 잇비로 복귀 (홈 ❌) | DOM 3/3 PASS · 기기 미검증 |
| 2 | 목록 → 상세 → 뒤로 → 목록 → 다시 뒤로 | 목록 → 잇비 순 (잇비로 먼저 튀면 ❌) | DOM PASS · 기기 미검증 |
| 3 | 초기칩 탭 → 답변 → 후속칩 탭 | ↓ 아래 상세 | **미검증** |
| 4 | 긴 고객명 | 줄바꿈, 화면 밖 안 나감 | **미검증** |
| 5 | 칩 빠르게 2~3회 탭 + 가로 스크롤 | ↓ 아래 상세 | **미검증** |

**1·2 는 DOM 으로 이미 수정·반복 검증했다. 실제 폰에서는 3~5 에 집중하면 된다.**
3·5 의 목적은 **실제 터치가 제대로 전달되는지**다.

**3번에서 볼 것**
- 실제 탭이 메시지를 **1회만** 전송하는가
- 답변이 생성되는가
- 후속칩이 갱신되는가

**5번에서 볼 것**
- 연속 탭에도 중복 메시지 **0**
- 옆 칩 오탭 **0**
- 가로 스크롤 중 의도하지 않은 클릭 **0**
- 시각 33px + hit area 45px 가 실제 폰에서 **편하게 눌리는지**

### 결과 기입란 (실기기에서 확인 후 채운다)

```text
Real device:
1 ____
2 ____
3 ____
4 ____
5 ____
```

**5개 모두 PASS →**
`ITBI Assistant / Chat UX / Entity / Data Truth / Navigation = RELEASE READY` **로 확정.**

문제가 있으면 **그 항목만** 다시 연다 — 전체 재검증 불필요. 위 표의 나머지는 고정돼 있다.

---

## ⚠️ 이 검증은 Claude 가 대신할 수 없다

실기기 터치는 **사람 손가락**이 필요하다. Claude 쪽 수단으로는 전부 대체가 안 된다:

| 수단 | 왜 안 되나 |
|---|---|
| 브라우저 pane | 실제 브라우저지만 **마우스 클릭**이다. 터치 이벤트·손가락 크기·오탭이 안 잡힌다 |
| iOS 시뮬레이터 | 시뮬레이터는 실기기가 아니다. 4·5번(줄바꿈·연속 탭 오탭)이 실제와 다르게 나온다 |
| 뷰포트 리사이즈 | 레이아웃만 본다. 이미 `375px layout = PASS` 로 기록한 그것이다 |

그래서 5번 항목은 **원장님/연준님이 직접** 눌러봐야 한다.

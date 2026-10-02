# 잇데이 출시 마감 보고서 (2026-10-01 ~ 10-02)

> 작업 레포: 프런트 `Nopo-lab/itdasy-frontend-test-yeunjun` 브랜치 `ccr-d5f1311f-u6e0c1` · 백엔드 `Nopo-lab/itdasy_backend-test` 브랜치 `ccr-d5f1311f-be`.
> 모든 검증은 **이 컨테이너의 로컬 스택**(로컬 백엔드 sqlite + 실제 PostgreSQL 16 + Chromium 390px)에서 했다. 운영 서버·운영 DB·실발송·실결제·배포·스토어는 건드리지 않았다.
> 재개 지점·환경 명령은 `STATE.md`. 감사 원본(발견·근거·측정)은 세션 스크래치 `scratchpad/results/*.json`, 증거 스크린샷/로그는 `scratchpad/evidence/<영역>/`(개인정보 없음). 핵심 증거(테스트 로그·E2E 결과·주요 스크린샷)는 `docs/closeout/evidence/` 에 복사해 커밋했다.

## 1. 최종 판정

| 범위 | 판정 | 근거 |
|---|---|---|
| 핵심 운영 동선(고객 → 예약 → 시술/완료 → 매출/회원권 → 재방문 → 통계) | **VERIFIED (로컬)** | §4 동선 E2E + PG 동시성 테스트. 돈 무결성 P0 0건, P1 전부 수정 |
| 콘텐츠 동선(사진 → 전후 합성 → 템플릿 → 캡션 → 저장/내보내기 → 발행 비율) | **VERIFIED (로컬, AI 성공 경로는 mock)** | 작업실 P1 4건 + 2차 7건 수정, 시나리오 스크립트·QA 17/17, 발행 crop→pad 를 Pillow 로 잠금. 큰 사진 메모리 794→622MB(헤드리스) |
| 인스타 문의(댓글/DM 수신 → 분류 → 초안 → 수동 전송 → 고객/예약 연결) | **VERIFIED (합성 웹훅) / 실 Meta BLOCKED** | 서명·중복·page_id 귀속·게이트 전부 합성 payload 로 확인. 발송 실패 뒤 재전송은 같은 예약(시각이 바뀌면 이동), 액션 실패는 발송 없음, 승인 없는 자동응답 켜기 거부 |
| 첫 사용·계정·세션 | **VERIFIED (로컬)** | 계정 전환 잔존 0, 만료 시 잠금화면, 비밀번호 변경 도달 가능, **신규 가입자가 온보딩을 실제로 봄**(2차), 샘플 데이터 지우기 진입점. 소셜 로그인 실계정은 BLOCKED |
| 멀티테넌트 격리 | **VERIFIED (하네스 110 케이스 + 교차 실측)** | 2매장 교차 접근 전 영역 404. 하네스가 모든 마운트 라우터를 자동 추출 |
| 성능 | **개선·측정됨 (로컬)** | 부팅 API 43→24, 문서 로드 2→1, 로그인 직후 홈 ∞→1.1s, 달력 최대 longtask 370→200ms |
| 모바일 UX | **VERIFIED (웹) / 실기기 BLOCKED** | 거짓 빈 상태·재시도 P1 수정, 44px 미만 터치 대상 47→3(의도적 예외), 키보드 가림 웹 측 보정(4화면 pass), 대비 토큰, 5xx 문구 정직화. iOS 네이티브 키보드 플러그인은 승인 필요 |
| 앱 빌드·IAP·스토어 | **코드 수정 완료(mock 검증) / 빌드·실결제 BLOCKED** | 감사 8건(P1 2: 체험 자가 부여·환불 뒤 복원 부활) 전부 수정 — §3.4. Xcode/Android SDK·서명키·스토어 콘솔·샌드박스 결제는 이 컨테이너에 없다 |
| 운영 배포 | **미실행** | 두 브랜치 모두 PR 전. 백엔드 `main` 머지 = 즉시 운영 배포이므로 리뷰 필수 |

한 줄로: **로컬/격리 검증 완료, 외부 연동(Meta·결제·실기기·스토어) 검증 미완료.** 출시 준비 완료가 아니라 "코드 수정·격리 검증 완료 → PR 리뷰 → 스테이징 배포 → 외부 검증" 단계다.

## 2. 실제로 달라진 점 (원장 체감)

- **홈이 홈답게 보인다.** 인스타를 안 연결한 매장에서 홈 전체를 덮던 "인스타만 연결하면…" 카드가 사라지고 오늘 예약·문의·고객 메시지가 바로 보인다. 안내는 위쪽 한 줄 띠(✕로 닫으면 로그아웃해도 다시 안 뜸). AI 동의 카드는 한 줄 요약만 보이고 "나중에"가 있다. 쿠키 배너는 작아져 탭바 위에 앉는다.
- **로그인하면 홈이 바로 그려진다.** 부팅 직후 로그인하면 스켈레톤만 영원히 남던 문제 제거.
- **돈이 두 번 빠지지 않는다.** 매출 저장이 타임아웃돼 다시 눌러도 매출 1건·회원권 1회 차감. 부분 환불된 매출을 환불액보다 작게 못 바꾸고, 만료된 회원권은 어느 경로로도 차감되지 않는다.
- **작업실에서 만든 전후 합성본이 사라지지 않는다.** 저장한 글을 다시 열어도 구성이 유지되고, 2번째 카드를 편집하면 2번째 카드가 열린다. AI 캡션이 실패해도 "나중에 이어서하기"가 보이고 뒤로가기해도 작업이 남는다. 사진 업로드가 실패하면 서버의 사진을 지우지 않는다.
- **예약 화면이 거짓말을 안 한다.** 로드 실패/로딩 중에 "오늘 0건"을 보여주지 않고 로딩/오류+다시 시도를 보여준다. 노쇼 처리된 자리에 새 예약을 잡을 수 있다. 영업시간·휴무가 예약 폼에 반영된다. 자정~오전 9시 예약이 홈 "오늘의 예약"에서 빠지지 않는다.
- **캡션이 없는 사실을 지어내지 않는다.** 가격·할인·예약시간·지점 문장은 원장이 입력한 것만 남는다. 5개 진입 경로가 같은 규칙을 쓴다. AI 실패를 4번씩 자동 재시도하지 않는다(과금 4배 방지).
- **설정에서 비밀번호를 바꿀 수 있다.** 샵 이름을 바꾸면 헤더에 바로 반영된다.
- **빨라졌다.** 콜드 부팅 API 호출 43→24, 첫 방문 이중 부팅 제거, 지연 로드 4.3MB 가 홈 그리기와 경쟁하지 않는다.
- **(2차) 처음 가입하면 업종·샵 이름을 묻는 온보딩이 뜬다.** 전엔 서버가 넣은 임시 이름 때문에 아무도 못 봤다. 가입 때 들어온 샘플 손님·예약·재고는 설정에서 한 번에 지울 수 있다.
- **(2차) DM 확정 전송이 실패해도 예약이 두 번 생기거나 손님에게 "이미 예약이 있어요" 가 나가지 않는다.** 재전송은 같은 예약으로 발송만 다시 하고, 그 사이 시각을 바꿨으면 예약을 옮긴다.
- **(2차) 작은 버튼이 눌린다.** 390px 기준 44px 미만 터치 대상 47→3. 키보드가 올라와도 저장 버튼이 가려지지 않는다(웹).
- **(2차) 인스타 발행본이 미리보기와 같다.** 전후 합성본의 BEFORE/AFTER 가 잘리지 않고(crop→흰 여백), 캐러셀은 첫 장 비율로 통일.
- **(2차) 서버 고장일 때 "인터넷을 확인하세요" 라고 하지 않는다.** 영문 오류 원문도 화면에 안 보인다.
- **(2차) 이상한 글자(NUL)가 어디로 들어와도 서버가 500 을 내지 않는다.** 같은 요청 번호로 다른 내용을 보내면 조용히 무시하지 않고 409 로 알린다.

## 3. 주요 수정

### 3.1 프런트 (커밋 8)
| 커밋 | 문제 | 원인 | 수정 | 검증 |
|---|---|---|---|---|
| `c4e246f` | 손님 예약 확정 링크·관리자 페이지가 **운영(이름만 staging) 백엔드**로 감 | `1e8a261` 이 3개 독립 HTML 을 빠뜨림 | 테스트 백엔드로 통일, 토큰 키 파생 일치, 가드 테스트 확장 | `api-target-local-only` 24 PASS, Playwright 로 확정 링크 응답 200 |
| `232d4a3` | 로그인 직후 홈 영구 스켈레톤(P1) · 다른 경로로 만든 손님이 재진입 목록에 없음(P1) · 모바일 고객 편집 모달이 상세 뒤(P1) | `_inFlight` 가드가 refresh 를 버림 · `_fetchFresh` 가 비교 전에 `_cache` 를 덮음 · z-index 10010<10600 | pending 큐 재렌더 · 순수 조회 + 호출자 대입 · z 토큰 사다리 | 22 테스트(수정 전 실패) · 390px 재검증 hv5 1.1s · 모달 저장 OK |
| `1238fd3` | 타임아웃 재시도 시 매출 2건·회원권 이중 차감(P1) · 달력 거짓 "0건"(P1) · 영업시간 미반영(P2) · 월뷰 longtask | 호출마다 새 `client_txn_id` · 로드 상태 없음 · 죽은 저장 키 · 강제 레이아웃 | 의도 단위 키 · `_fetchState` + 재시도 · `shopHours` 정본 · rAF 분리 | 28 테스트 · 재클릭 시 서버 1건 · 500 주입 시 오류+재시도 · longtask 370→200ms |
| `6918ac8` | 합성본 소실(P1) · 카드 혼입(P1) · 캡션 전 소실(P1) · 빈 사진 upsert(P1) | 구성 미저장 · 편집 대상 outs[0] 고정 · close 에 저장 없음 · `_complete` 무시 | 구성 저장/역산 · 카드 단위 편집 · 조용한 임시저장 · upsert 보류 | 52 테스트 · smoke 9/9 · multipair QA 17/17 |
| `5c73422` | 부팅 API 43건·이중 부팅·지연 그룹 경쟁·AI 실패 4회 재시도 | 프리페치 3계층 · SW 첫 설치 리로드 · idle 기준 선로딩 · 5xx=과금 전 가정 | 단일 소유자 · `_swHadController` · 홈 뒤 선로딩 · `ai_*` 재시도 금지 · 로그아웃 미전송 가드 | 33 테스트 · API 24 · 문서 로드 1 · requests=1 |
| `e603778` | `use_persona` 미전송·안내문을 캡션으로 표시·환각 재료 주입 | 진입점마다 복제된 payload 빌더 | 공통 빌더/통로, 사실 출처는 원장 문구뿐 | 27 테스트(24 실패→통과) · route mock 네트워크 캡처 |
| `57b509d` | **홈 상단 가림(원장 지적)** | 홍보 카드가 홈 대체·닫음이 로그아웃에 지워짐 · 동의 카드 영구 · 배너 8초 재팝업 | 띠+✕(계정별 보존) · 한 줄 요약/나중에/결정 후 숨김 · 배너 축소·탭바 위·`_cardHandled` | 14 테스트 · 390px 재검증(로그아웃/재로그인 유지, 10초 후 팝업 0) |
| `6c0c010` | 환불 호출 401→강제 로그아웃(P1) · 저장 직후 목록 사라짐(P1) · 자정~9시 예약 누락(P1) · 비밀번호 변경 도달 불가(P1) | 인증 헤더 없는 직접 호출 · 읽기 세대 없음 · UTC 문자열 비교 · 허브에 행 없음 | 공용 경로+401 판정 좁힘 · `_mutGen` · KST 달력일 · 허브 행 | 39 테스트 · 390/1440 재검증 |

### 3.2 백엔드 (커밋 5)
| 커밋 | 문제 | 수정 | 검증 |
|---|---|---|---|
| `57aec85` | 확정 메시지가 늘 "내일", 연결 고객 이름 미사용 | KST 달력일 기준 오늘/내일/모레, 연결 고객 이름(테넌트 한정) | 13 테스트 + 로컬 서버 실측 |
| `ce50080` | `/persona/generate` 가 LLM 대기 내내 DB 커넥션 점유(P1) · 가격/할인/시간/지점 환각 백스톱 없음(P1) · 레거시 안내문이 한도 소진 · 502/504 자동 재시도 · 페르소나 403 열거 | 매 LLM 호출 전 `release_db` · `scrub_ungrounded_commercial_sentences` · 환불+status · `Retry-After` · 404 통일 | 62+5 테스트(59 실패→통과), checkedout 1→0 프로브 |
| `9ae2965` | 노쇼가 같은 시각 UNIQUE 를 점유(P1) · 작업실 upsert FK 무검증·사진 전체 삭제 · 하네스가 /storage 미추출 | 0070 인덱스 정본화 · `owned_or_none`·409 `photos_would_be_cleared` · 추출 범위·INVARIANT-2b/5b · memo 마커 보존 | 하네스 110(0 skip), PG 0070 왕복, 9 마커 테스트 |
| `55b5710` | 부분환불 매출 축소로 음수 장부 · 방문 컬럼 경로별 상이 · 만료 회원권 차감 · 검색 NUL 500 | FOR UPDATE+하한 400/409 · `touch_visit` 단일 헬퍼 · `membership_ledger` 만료 정본 · `_strip_nul` | 24 sqlite + 5 PG(실패→통과), 관련 700+ 회귀 통과 |
| `4a9f10c` | **재고 +/- 가 PG 에서 100% 500**(P1) · 웹훅 APP_SECRET 없으면 fail-open(P1) · 잇비 등록=방문 1 · 쿼리 NUL | `CASE` 클램프 · enforce 면 처리 안 함 · visit 0 · `_strip_nul` | PG 테스트가 옛 코드에서 실패·새 코드 통과, 5 테스트 |

### 3.3 2차 수정 (백엔드 7커밋 · 프런트 7커밋 — 완료)

**백엔드 `e046d47` fix(inbox)** — flow-inbox-dm-comments 01(P1)/03/04/06
- [전송] 중 DM 발송만 실패해도 예약은 이미 생성 → 재전송이 "이미 예약이 있어요" 를 손님에게 보내던 사고: `action_result_id` 를 예약과 **같은 트랜잭션**에 저장하고, 재전송은 같은 예약으로 발송만 재시도(502 본문에 "예약 #N은 만들어졌어요"). 액션 실패는 `{ok:false, code:'action_failed'}` 로 **발송 안 함**(send/send_edit 같은 계약).
- 잇비 "DM 자동응답 켜줘" 가 승인 게이트를 우회해 enabled=True 저장 → 이후 설정 저장 403 갇힘: `has_consent` 없으면 `ok:false consent_required`(끄기는 항상 허용). **되돌리기(undo)** 로 켜는 것도 같은 검사(리드 추가, 수정 전 실패 재현).
- 웹훅 순서 역전: `DMMessageLog.external_received_at`(payload timestamp, alembic 0071) + 큐·스레드·대화 로그·24h 창 정렬 `coalesce(external_received_at, received_at)`.

**백엔드 `29e5fcb` fix(robustness)** — backend-robustness 02/03
- 문자열 NUL(0x00) → PG 500(13개+ 경로): `schemas/base.InputModel` 을 **109개 요청 본문 모델 전부** 상속(재귀 제거). `app.routes` 전수 가드 테스트(허용목록 0). dict 본문 3곳은 핸들러에서 `strip_nul_deep`. 실제 PG 67요청 → 500: 0.
- 발행 워커·IG 토큰 갱신이 Meta 대기 중 bg 풀 커넥션을 'idle in transaction' 으로 점유: 스냅샷/튜플로 뜨고 `release_db` 후 await, 저장은 샵별 짧은 세션. PG `pg_stat_activity` 테스트로 0 확인. 크론 락 폴백은 error 로그 + `/health wiring.cron_lock_fallbacks`.

**백엔드 `c921655` fix(money,publish,sample)** — money-integrity 05/06 · flow-revenue-stats-ui-03 · flow-workspace-photo-04(P1) · flow-account-firstrun-04
- 같은 멱등키 + 다른 본문(고객·금액·대상)이면 409 `txn_body_mismatch`(매출 생성/환불·회원권 충전/차감, 빠른 경로+IntegrityError 경로). 실측 전: 50,000 충전 뒤 같은 키로 99,000 → 200/잔액 그대로(조용히 버림).
- `record_revenue=false` 충전행(0원)이 '시술 1건' 으로 세어져 객단가가 반으로 — 목록·summary·일별 cnt 공통 규칙 `_is_counted_sale`.
- 고객 상세 응답에 `membership_balance/active/expires_at` → '회원권 N만원' 라벨이 실제로 뜸.
- **발행 crop → pad**: 단일 2:3→1:1 중앙 crop, 캐러셀 전부 4:5 crop 으로 전후 합성본 BEFORE/AFTER 가 잘리던 것 → 허용 범위(4:5~1.91:1) 안은 그대로, 밖은 흰 여백 pad, 캐러셀은 첫 장 비율 통일. Pillow 로 뱃지 보존 잠금.
- `GET /auth/sample/status` + purge 가 샘플 고객의 예약까지(멱등). 로컬 실측: 11건 → purge → 0, 두 번째 0건.

**프런트 `03f135c`** — 위 백엔드 계약의 프런트 쪽
- DM 큐: 실패 토스트/카드 유지/예약 생성은 `booking_id` 로만, "예약 #N 은 이미 만들어졌어요" 배지.
- 설정 허브 **샘플 데이터 지우기** 행(샘플이 남아 있을 때만 표시 → 확인 → purge → 캐시 비움·재조회·토스트, 실패면 행 유지). jest 7건.
- 작업실 결과 미리보기 칸 비율 = 발행 규칙(캐러셀 첫 장 비율 통일, 결과물 contain+흰 바탕). 기존 '장마다 실비율' 테스트를 새 계약으로 갱신(+경계 clamp 2케이스).

**백엔드 `a000e38` fix(auth,shop) · `bf62caf` docs · `c2baa1a` fix(inbox 리뷰 반영)**
- 신규 가입자가 온보딩(업종·샵 이름)을 한 번도 못 봄(flow-account-firstrun-02, P2): register/apple/google 이 ShopSettings 를 **빈 이름**으로 만든다(예전 "<이름>의 샵" 임시값을 프런트가 완료로 오인). 옛 가입자는 `GET /shop/settings` 의 `shop_name_is_placeholder` 로 구제. 로컬 390px 실측: 새 가입·옛 임시 이름 계정 모두 첫 로그인에 온보딩 1단계 표시.
- 적대적 코드 리뷰(§4.4)가 잡은 4건: 배칭을 켠 샵의 스윕 재조립 이벤트에 payload 시각 누락 → `first_event_ts` 전달 · 502 뒤 카드 시각이 바뀐 재전송이 옛 시각으로 재확정 → 예약 이동(충돌이면 ok:false) · 승인 없는 undo 가 "되돌렸어요" 로 답함 → 409 · payload 시각 contextvar 누수 → `_process_dm_event` 가 세팅·finally 로 비움(파서는 순수).
- tenant-isolation-04: RULE-005 의 예외(콘텐츠 해시 공유 캐시) 문서화.

**프런트 `702068a` fix(onboarding) · `689b19d` fix(mobile) · `1db1ca8` fix(errors) · `ecc2c76` fix(contrast) · `f969568` fix(workspace)**
- 온보딩: `checkOnboarding` 이 서버 플래그를 보고(이 기기에서 완료한 적이 없으면) 온보딩을 띄운다. jest 6(수정 전 2 실패).
- 모바일(FE-F, mobile-ux 03/04/05/08): 390×844 실측 44px 미만 터치 대상 **47 → 3**(남은 3은 이전 라운드가 명시 제외한 것) — 공용 `.tap44` 규칙 + 로그인 링크·고객상세 액션·예약관리·예약폼 칩·매출입력 칩·DM 큐 설정/탭·댓글 큐·잇비 버튼. 키보드 가림: `app-core.js _viewportKeyboardHook`(`--kb-inset`) 로 고객추가·매출입력·예약폼·잇비 4화면 모두 pass(수정 전 4 fail). 대비 `#8B95A1` → 토큰(css 33곳 + JS 인라인 67곳). 댓글 큐 이름 말줄임. 테스트 33+4.
- 오류 문구(mobile-ux-07): 홈 brief 5xx → '서버가 잠깐 불안정해요'(인터넷 탓 금지), '다시 시도' 는 재렌더, `_humanError` 영문 원문 차단, DM 큐 실패 화면 '다시 시도'. 테스트 7(수정 전 5 실패).
- 작업실(FE-G, flow-workspace-photo 02/07/08/09/10/11/12): 서버 409 `photos_would_be_cleared` 계약 배선(의도적 0장만 clear_photos 1회, 아니면 서버본 복구 — 영원히 dirty 금지), 사진 투입 디코드를 createImageBitmap+close 로(큰 사진 5장×3라운드 렌더러 RSS **794→622MB**, 메모리 압박 시 276MB 로 회수 실증), 캡션 입력 화면 다중 카드 캐러셀, 캡션 컨텍스트/저장 메타 카드 구성 기준, 읽기 실패 안내 원인별, navStack 선형화(뒤로가기 4→3번), 쿠키 배너가 작업실 CTA 를 덮지 않음. 테스트 6파일(수정 전 전부 실패). QA 스크립트 17/17.

### 3.4 구독·결제·IAP (BE-F — 백엔드 `92b53dd` · 프런트 `c3233c0`) + 인증 커넥션 (`9310ec4`)
1차 감사(build-iap-native)가 잡은 8건 전부 수정(수정 전 BE 20 실패 → 27 통과, FE 12 실패 → 18 통과; 관련 29파일 475 passed):
- **P1** `POST /subscription/start-trial` — 인증만으로 누구나 Pro 14일 자가 부여·만료 후 무한 반복 → **라우트 제거**(체험은 스토어 인트로 오퍼만). 기존 trial 행 판정은 호환.
- **P1** Apple 환불 뒤 '구매 복원' 이 환불된 구독을 active 로 부활 → `cancellation_date` 를 읽어 verify 는 failed/free, 같은 거래 재생은 가드, 새 거래·미래 만료만 활성화(재구매 회귀 포함). Google REVOKED 뒤 과거 만료 재검증도 부활 안 함.
- P2 Google 결제 보류(계좌이체·편의점)를 클라이언트가 성공으로 처리 → `status==='ok'` 만 finish, 보류는 '결제 확인 중이에요' 안내; BE 는 토큰을 선저장(권한 없음)해 RTDN PURCHASED 가 매칭·활성화.
- P2 레거시 `POST /subscription/cancel` 이 남은 유료 기간 즉시 소멸 → 제거, `/billing/cancel` 은 스토어 구독이면 409.
- P2 웹 PortOne 환불/취소가 구독에 반영 안 됨(감사 땐 NOT_REPRODUCED, pytest 로 재현: 취소 웹훅이 duplicate 로 무시) → CANCELLED 전이(전액: 이력 refunded 멱등 + 구독 refunded/free + 빌링키 폐기, 부분: 이력 표시).
- P2 체험·해지 문구가 결제 경로와 다름 → 가입 '가입은 무료 · 카드 등록 없음', 팝업 보조문구/해지 경로를 상태별로(Playwright 전/후 캡처).
- P3 레거시 유료 플랜 버튼 '결제 준비 중' 비활성 → 공용 규칙. P3 `/persona/consent` version 누락 500 → 422.
- 실결제·샌드박스·실기기 결제 보류 흐름은 BLOCKED(§6.3) — 전부 mock/jsdom.

**인증 커넥션(past-defects-regression-01, P2 잠복)**: 요청 1건이 DB 커넥션을 2~3개 받아(인증이 자체 세션) 풀(4+1)보다 많은 동시 쓰기 요청(실측 60 OK / 75 stall)에서 자기-교착·30초 매달림 → 인증 조회가 요청 세션을 재사용(커넥션 1개/요청). `pool_timeout` 단축·앱 레벨 동시 상한은 운영 결정(§6.3). 운영 Cloud Run `--concurrency 8` 에선 발생 조건 자체가 안 생긴다.

## 4. 검증 결과

### 4.1 자동 테스트 (최종 수정 후 재실행)
| 검사 | 명령 | 환경 | 대상 | 결과 |
|---|---|---|---|---|
| 프런트 단위/소스가드 | `npx jest` | node 22, jsdom | `f969568` | **269 suites / 3,680 tests PASS** (기준선 228/3,363) |
| 프런트 린트/스모크 | `npm run lint:ci` · `npm run smoke` · `npm run audit:overlay` · `scripts/wsv2-multipair-qa.js` | node 22 | `f969568` | 0 errors / 177 warnings(기준선 177) · 통과 · 오버레이 73 미등록 0 · QA 17/17 |
| 백엔드 단위/통합(sqlite) | `pytest -q tests` | python 3.11 venv | `c2baa1a` | **5,094 passed · 322 skipped · 1 xfailed** (13m22s) |
| 백엔드 PostgreSQL 통합 | `pytest -q tests/pg` (ITDASY_PG_URL) | PG 16 로컬 | `c2baa1a` | **242 passed** (3m52s) |
| 테넌트 하네스 | `pytest tests/test_tenant_isolation_harness.py` | sqlite | `c2baa1a` | 110 passed, SKIP 0 |

> skipped 322 는 기존 PG 전용·환경 조건 스킵(기준선 301, 2차에 PG 전용 테스트 추가). xfail 1 은 기존 예상 실패. PASS 수에 섞지 않았다. BE-F(IAP) 커밋 뒤 두 스위트를 한 번 더 돌린다(§3.4 갱신 시 반영).

### 4.2 동선 E2E (Chromium 390×844, 로컬 스택)
| 동선 | 결과 | 근거 |
|---|---|---|
| A 로그인 → 홈 → 설정 저장 → 로그아웃 → 다른 계정 → 잔존 0 | VERIFIED | account-firstrun verified_ok 13건, `home-top/*.png` |
| B 고객 305명 페이지네이션 누락/중복 0 → 추가 → 중복 409 안내 → 상세 → 수정 → 예약 생성 → 취소 → 같은 시각 재예약 201 | VERIFIED | customers-bookings verified_ok 17건, PG 동시 20발 1/19 |
| C 예약 완료 동시 5발 → 매출 1행 · 취소 → 환불행 · 회원권 충전/차감 동시 20발 1회 · KST 00:10/23:50 경계 | VERIFIED | money-integrity verified_ok 16건(PG), 리드 재검증 |
| D 사진 2쌍 → 전후 합성 → 템플릿 → 저장 → 재진입 복원 → 2번 카드 편집 → 캡션 실패 시 보존 | VERIFIED | `fe-c-wsphoto/final-*.log`, smoke 9/9, QA 17/17 |
| E 합성 웹훅(서명·중복·page_id) → 큐 → 전송 실패가 성공으로 안 보임 → 예약 확정 전송이 고객·예약 생성 | VERIFIED(합성) | inbox verified_ok 15건 |
| F 홈 오늘 예약(00:30/08:30/21:45 KST 3건 = BE 3건) · 생일 줄 · 띠/카드 닫힘 유지 | VERIFIED | `fe-e/home_verify_390.log`, `home-top/06-relogin` |
| 손님 예약 확정 링크 → 로컬 백엔드 → 확정 응답 200 | VERIFIED | `evidence/booking-confirm-valid.png` |
| **최종 통과(2차 뒤, `f969568`)** 랜딩 → 로그인 → 홈(홍보 카드 없음·띠 표시·에러 카드 없음) → 고객 → 예약관리 → 매출 → DM 큐(설정 버튼 44×44) → 설정 허브(샘플 행 숨김·비밀번호 변경 행) → 작업실 열기(쿠키 배너 숨김) → 닫기 → 로그아웃(토큰 0·로그인 화면) | VERIFIED 11/11, 페이지 오류 0 | `docs/closeout/evidence/final-e2e/` |
| 새 가입 계정·옛 임시 이름 계정 첫 로그인 → 온보딩 1단계 표시 | VERIFIED | `docs/closeout/evidence/flow-account-firstrun/fr02_*` |
| 합성 계정: 샘플 11건 → `GET /auth/sample/status` → purge → 0 → 재purge 0(멱등) | VERIFIED | `evidence/flow-account-firstrun/sample_status_purge_api.out` |

### 4.3 과거 결함 이력 재검증 (§6)
재실행 감사(past-defects-regression, 현재 코드 `c2baa1a`·PG 전용 DB·실제 서버): **verified_ok 15 / 발견 1(P2, 잠복 — 위 인증 커넥션으로 수정)**. 원본 `docs/closeout/evidence/audits/past-defects-regression.json`.
| 항목 | 판정 | 근거 |
|---|---|---|
| 회원권 충전 멱등/중복 | VERIFIED | 같은 키 동시 20발 → 1회(PG·sqlite); 재감사 100건 동시·409·400·SQL 불변식 |
| 고객 페이지네이션 누락/중복·정렬 | VERIFIED | limit 3~500 전수 순회 0건; 재감사 76명 누락 0·중복 0 |
| 직접 매출 경로 재방문 반영 | FIXED+VERIFIED | `touch_visit` 단일 헬퍼, 역행 없음 |
| NUL 입력 500 | FIXED+VERIFIED | 요청 본문 모델 109개 전부 `InputModel`(전수 가드), dict 본문 3곳 핸들러 제거, 실제 PG 67요청 500 0건 |
| DB 풀 포화·세션 반환 | FIXED+VERIFIED | 캡션 경로 + 발행 워커 + 토큰 갱신 루프 모두 외부 대기 전 반납(PG `idle in transaction` 0 테스트) |
| IG page_id 폴백 | VERIFIED | 모르는 recipient 는 어느 샵에도 저장 안 됨 |
| 공개 스토리지·테넌트 캐시 | VERIFIED | 캐시 키 전부 user_id, /storage 는 user_id 스코프(하네스 편입) |
| AI 429/타임아웃/복구 | VERIFIED+개선 | 429 Retry-After·120초 UX·실패 환불, 502/504 재시도 금지 |
| 스케줄러 중복 실행 | VERIFIED(가시화) | 락/리스 존재. 락 획득 실패 폴백은 동작 유지 + error 로그 + `/health wiring.cron_lock_fallbacks` 카운터(0 정상). fail-closed 전환은 제품 결정(§6.3) |

### 4.4 적대적 코드 리뷰 (백엔드 8커밋, 읽기 전용 에이전트)
리뷰가 지적 4건(전부 P2)을 찾았고 전부 수정·테스트했다(`c2baa1a`): ① 배칭 경로 payload 시각 미저장 ② 시각 바뀐 카드 재전송이 옛 예약·옛 시각으로 확정 ③ 승인 없는 undo 가 성공으로 응답 ④ contextvar 누수(테스트 오염). "문제 없음 확인" 목록: 재사용 분기 테넌트 격리, 프런트 계약 일치, alembic 체인 0068→0071, InputModel 재귀/별칭/성능, 토큰 갱신 재작성의 동작 보존, 발행 워커 스냅샷, 멱등 지문 vs 실제 저장값 전부 일치, `_is_counted_sale` 3값 논리, 발행 pad 경계값, 샘플 purge 테넌트 격리, 0070 WHERE 일치, 환불 하한·만료 게이트·재고 CASE·웹훅 secret_missing.

## 5. 성능 전후 (같은 조건, 로컬 390px, 3회 중앙값)
| 항목 | 전 | 후 | 조건 |
|---|---|---|---|
| 콜드 부팅 API 호출 | 43건(중복 2~4회) | 24건 | 무스로틀, 토큰 선주입 |
| 문서 로드 횟수(첫 방문) | 2 (build.txt 불일치 로컬은 4) | 1 | SW 첫 설치 |
| navigation→홈(.hv5) 무스로틀 | 2,563ms | 1,837ms | 첫 방문 |
| Fast 3G 첫 진입(페이지+SW 공정 조건) | 24,356ms | 21,734ms | 180KB/s 공유 정적서버 |
| 로그인 직후 홈 렌더(부팅 1.5s 후 로그인) | 영영 안 그려짐 | 1,111ms | 390px |
| 예약 달력 월뷰 최대 longtask | ≈370ms (합 675) | ≈200ms (합 655) | CPU 4x, 예약 200건 |
| 월뷰 칩 표시 시점 | 565ms | 271ms | 동일 |
| 지연 그룹 선로딩 시작 | load 직후(홈 전) | 홈 뒤·API 유휴 후, 3g 는 photo 제외 | — |
| 화면 재진입 10회 누수 | — | Nodes 7289→7286, 리스너 741→740, heap +0.27MB | 누수 없음(수정 전후 동일) |
| 작업실 큰 사진 5장 × 3라운드 렌더러 RSS(헤드리스) | 271 → 794MB(라운드마다 +100) | 272 → 622MB, 메모리 압박 시 276MB 로 회수 | 4000×6000 JPEG, createImageBitmap+close |
| 44px 미만 터치 대상(390×844, elementFromPoint 실측) | 47 / 199 | 3 / 199 | 남은 3은 이전 라운드 명시 예외 |
| 백엔드 핵심 GET p50 (데모 데이터, sqlite 로컬) | — | /customers 12ms · /bookings 6ms · /revenue 7ms | 참고치. 대량 데이터 PG 측정은 perf-backend 감사(재실행 중) — 결과 오면 추가 |

한계: 로컬 수치이며 운영 SLA 가 아니다. 한글 셰이핑 비용이 큰 달력 합계는 목표(<400ms) 미달 — 칩 마크업 단순화는 디자인 결정 필요.

## 6. 남은 문제와 승인 필요 사항

### 6.1 진행 중
- BE-G 백엔드 성능 수정(perf-backend 감사 7건: GET /bookings 무범위 20k 건, /today/morning N+1 1,300쿼리, /revenue/forecast 행 적재, /revenue 2,000행, summary 파이썬 합산, at-risk 500 캡 집계 오류, 겹침 검사 인덱스). 완료되면 §5 전/후 표 갱신.

### 6.2 수정하지 않은 발견 (심각도 · 영향 · 조건)
| ID | 심각도 | 내용 | 조건 |
|---|---|---|---|
| mobile-ux-05(네이티브) | P2 | iOS 에서 키보드가 떠도 웹뷰가 안 줄어드는 근본 원인은 `@capacitor/keyboard` 플러그인(`resize:'body'`) 도입이 필요 — 웹 측 보정만 적용됨 | 플러그인 추가 승인(네이티브 의존성 변경) + 실기기 확인 |
| flow-workspace-photo-07(실기기) | P2 | 메모리 개선은 헤드리스 수치. 중저가 안드로이드·iOS WKWebView 재측정 필요(`createImageBitmap imageOrientation` 는 iOS 15.4+, 실패 시 자동 폴백) | 실기기 |
| mobile-ux-04(잔여) | P3 | `css/workspace-*.css` 26곳·잇비 '신고' #C5CBD2·로그인 '간편 로그인' #b0b8c1·배지 조합(#16B55E on #EEFBF3) | 디자인 결정(토큰 확장) |
| mobile-ux-03(잔여 3) | P3 | `#hv5CmsgWhy` 81×35, `[data-report-ai]` 44×40 ×2 — 이전 라운드가 "오탭보다 낫다" 로 명시 제외 | 디자인 결정 |
| inbox-06(정렬 범위) | P3 | `dm_autoreply.py` 의 '최근 메시지 1건' 조회(dedupe·120초 창 등 서버 시각 의미) 는 `received_at` 유지 — 사용자 노출 정렬(큐·스레드·대화 로그·24h 창)만 payload 시각 | 의도적 범위 |
| money-integrity 보고의 `routers/assistant.py:5711` 등 컬럼 직독 | P3 | 원장 우선으로 이미 보정됨 | — |
| 갇힌 데이터 정리 | P3 | 승인 없이 enabled=True 로 남은 `dm_autoreply_settings` 행(있다면) 1회성 정리 — 실데이터라 넣지 않음. 설정 화면 끄기·잇비 "꺼줘" 로 빠져나올 수 있음 | 운영 DB 판단 |

### 6.3 승인·외부 필요 (BLOCKED)
- Meta 실발송·실웹훅(승인된 테스트 수신처 필요), Apple/Google 샌드박스 결제·구독 복원, 실기기 빌드(Xcode/Android SDK·서명키), 스토어 콘솔 가격/상품 확인, 운영 DB 제약 실존 확인(`excl_booking_user_timerange` 등 — 배포 전 `alembic current` 와 0070 적용 점검), 운영 환경변수(`INSTAGRAM_APP_SECRET`, `DM_WEBHOOK_REQUIRE_SIGNATURE=enforce`) 확인.
- 0070 마이그레이션은 중복 행이 있으면 중단한다. 배포 전 1회: `SELECT user_id, starts_at, COUNT(*) FROM bookings WHERE deleted_at IS NULL AND status IN ('confirmed','completed') GROUP BY 1,2 HAVING COUNT(*)>1;` → 0건 확인.
- 제품 결정: 캡션 실패 즉시 영속(현재는 저장 버튼 + 닫을 때 임시저장), 달력 칩 마크업 단순화, 크론 싱글톤 락 폴백 fail-closed 전환 여부(현재는 진행+카운터), `@capacitor/keyboard` 도입, DB `pool_timeout` 30s 단축 + 앱 레벨 동시 핸들러 상한(Cloud Run `--concurrency` 하나에 의존하지 않으려면), PortOne 부분 환불의 기간 비례 축소 정책.
- 배포 전 확인: 제거된 `/subscription/start-trial`·`/subscription/cancel` 을 부르는 옛 클라이언트가 없는지(프런트 호출 0건 확인됨 — 네이티브 구버전 앱은 404 를 받는다).
- 배포 전 1회: alembic 0071(`dm_message_logs.external_received_at` 컬럼+인덱스, 멱등) 적용 확인. 신규 가입이 빈 샵 이름으로 시작하므로 `/auth/me` 의 빈 `shop_name` 을 쓰는 외부 연동(알림톡 템플릿 등)이 있으면 온보딩 전 호출 시 '사장님' 폴백을 쓰는지 확인.

## 7. 배포 상태와 복구 방법
| 단계 | 상태 |
|---|---|
| 코드 수정 | 완료(프런트 20커밋·백엔드 12커밋 푸시) + BE-F(IAP) 진행 중 |
| 테스트 | 프런트 269/3,680 통과 · 백엔드 sqlite 5,094 / PG 242 통과(`c2baa1a`). IAP 커밋 뒤 재실행 |
| 스테이징(테스트 사이트) 반영 | **미반영** — PR 생성·리뷰·main 머지 후 GitHub Pages 자동 배포(`deploy.yml` 이 `?v=`·`build.txt` 자동 범프) |
| 백엔드 배포 | **미반영** — `main` 머지가 곧 Cloud Run 배포. 마이그레이션 0070 은 기동 시 자동(중복 시 중단) |
| 운영 승격·앱 빌드·스토어 | 미실행 |

복구: 프런트는 GitHub Pages 이전 커밋으로 `main` 되돌리기(revert) → 자동 재배포. 백엔드는 Cloud Run 이전 리비전 트래픽 100% 복귀 + `alembic downgrade 0069`(0071 은 컬럼/인덱스 추가, 0070 은 인덱스 재생성 — 둘 다 데이터 손실 없음). 0070 downgrade 도 중복 검사 후 옛 조건으로 재생성한다. 신규 가입의 빈 샵 이름은 되돌려도 데이터 문제 없음(온보딩이 채움).

# 마감 작업 상태 (docs/closeout/STATE.md)

> 새 세션은 이 파일부터 읽는다. 마지막 갱신: 2026-10-02 19:30 UTC (성능 수정 마무리 워크플로 `wf_6f78cade-321` 진행 중)

## 저장소 · 브랜치 · 커밋
| 레포 | 경로 | 브랜치 | 상태 |
|---|---|---|---|
| 프런트 `Nopo-lab/itdasy-frontend-test-yeunjun` | `/home/user/itdasy-frontend-test-yeunjun` | `ccr-d5f1311f-u6e0c1` (origin/main `6f39a40` 기준) | 23커밋 푸시됨 — 최신 `c84368c`(docs) ← `c3233c0`(iap,plan) `403bf6c`(docs) `f969568`(workspace) `ecc2c76` `1db1ca8` `689b19d` `702068a` … `c4e246f` |
| 백엔드 `Nopo-lab/itdasy_backend-test` | `/home/user/itdasy_backend-test` (shallow clone) | `ccr-d5f1311f-be` (origin/main `8598863` 기준) | 14커밋 푸시됨 — 최신 `9310ec4`(auth 커넥션 1개) ← `92b53dd`(iap,billing) `c2baa1a` `bf62caf` `a000e38` `c921655` `29e5fcb` `e046d47` `4a9f10c` `55b5710` `9ae2965` `ce50080` `57aec85` |

- PR 은 만들지 않았다(사용자 명시 요청 없음). 백엔드는 `main` 머지 = 즉시 운영 배포이므로 반드시 PR 리뷰 후.
- 운영 백엔드(`itdasy-backend-staging-…` = 운영)·운영 DB·실발송·실결제·배포·스토어 제출은 **하지 않았다**.

## 보호해야 할 것
- 세션 시작 시 두 레포 모두 미커밋 변경 0, worktree 0. 다른 작업자 변경 없음.
- 2차 수정·IAP·인증 커넥션은 전부 커밋·푸시됨. **백엔드 작업트리에 성능 수정(BE-G, perf-backend-01~07) 미커밋 변경이 있다** — 첫 에이전트가 한도로 중단돼 워크플로 `wf_6f78cade-321`(트랙 A 칩 채점 · 트랙 B 목록 계약+프런트 → 적대적 검증 → 재수정 → 전후 측정 → 비평)이 마무리 중. 프런트도 트랙 B 가 고칠 수 있다. 보고를 읽고 검증한 뒤 커밋. 함부로 reset/checkout 금지.

## 로컬 검증 환경 (이 세션에서 세운 것 — 컨테이너 재시작 시 다시 올린다)
```bash
# 백엔드 (sqlite .local-dev/local.db, 운영 키 0, AI 가짜키) → http://127.0.0.1:8000
cd /home/user/itdasy_backend-test && PYTHON=python3.11 nohup bash dev/local-backend.sh > /tmp/be.log 2>&1 &
# 프런트 → http://127.0.0.1:5500/index.html (localhost 라 자동으로 로컬 백엔드)
cd /home/user/itdasy-frontend-test-yeunjun && nohup python3 -m http.server 5500 --bind 127.0.0.1 > /tmp/fe.log 2>&1 &
# PostgreSQL 16 (postgres 유저로) → 127.0.0.1:5433, user itdasy, trust
su postgres -s /bin/bash -c "/usr/lib/postgresql/16/bin/pg_ctl -D /var/tmp/itdasy-pgdata -o '-p 5433 -c listen_addresses=127.0.0.1 -c unix_socket_directories=/var/tmp/itdasy-pgdata' -l /var/tmp/pg.log start"
```
- 데모 계정 `review@itdasy.com / review1234!`. PG 테스트 DB 이름은 `itdasy_relaudit_*` 규칙(가드가 다른 이름을 거부). `itdasy_relaudit_perf3` 는 성능 측정 데이터 — 테스트 DB 로 쓰지 말 것.
- Playwright: 전역 `playwright` + `/opt/pw-browsers/chromium`(`--no-sandbox`). 외부 CDN(아이콘 폰트·웹폰트·Sentry)은 컨테이너에서 차단 → 빈 글리프는 환경 문제.
- 백엔드 pytest 실행 env:
  `env -i PATH=$PWD/../.local-dev/venv/bin:/usr/bin:/bin HOME=$HOME PYTHONPATH=$PWD ENVIRONMENT=development USE_VERTEX_AI=false CLOUD_STORAGE_ENABLED=false DM_TASKS_ENABLED=0 ../.local-dev/venv/bin/python -m pytest -q tests` (+ PG: `ITDASY_PG_URL=postgresql+psycopg2://itdasy@127.0.0.1:5433/itdasy_relaudit_x ITDASY_PG_DESTRUCTIVE_CONFIRM=DROP:itdasy@itdasy_relaudit_x ... tests/pg`)

## 테스트 현황
| 검사 | 수정 전 기준선 | 최근 실행 (커밋 기준) |
|---|---|---|
| 프런트 `npx jest` | 228 suites / 3,363 | **269 suites / 3,680 PASS** (`f969568`) |
| 프런트 `npm run lint:ci` | 0 errors / 177 warnings | 0 errors / 177 warnings |
| 프런트 `npm run smoke` · `audit:overlay` · `scripts/wsv2-multipair-qa.js` | 통과 | 통과 · QA 17/17 |
| 백엔드 `pytest tests` (sqlite) | 4,866 passed · 301 skipped | **5,094 passed · 322 skipped · 1 xfailed** (`c2baa1a`) |
| 백엔드 `pytest tests/pg` (PG 16) | 221 passed | **242 passed** (`c2baa1a`) |
| 최종 E2E 390px(11단계) | — | 11/11, 페이지 오류 0 (`docs/closeout/evidence/final-e2e/`) |

## 완료 항목 (요약 — 상세는 REPORT.md)
1. 테스트 프런트가 운영 백엔드로 붙던 독립 페이지 3개 수정 (`c4e246f`)
2. 로그인 직후 홈 미표시 · 고객 재진입 목록 · 모바일 고객 편집 모달 가림 (`232d4a3`)
3. 매출 멱등키 의도 단위 · 달력 거짓 빈 상태 · 영업시간 반영 (`1238fd3`)
4. 작업실 합성본 소실·카드 혼입·캡션 전 소실·빈 사진 upsert (`6918ac8`)
5. 부팅 요청 43→24 · SW 첫 설치 리로드 제거 · AI 실패 자동 재시도 금지 (`5c73422`)
6. 캡션 진입점 통일·환각 재료 제거·clarification 처리 (`e603778`)
7. **홈 상단 정리(원장 지적)**: 인스타 홍보 카드가 홈을 대체하지 않음 · AI 동의 카드 한 줄 요약/나중에 · 쿠키 배너 축소 (`57b509d`)
8. 매출 환불 호출 인증·stale 목록·KST 오늘 필터·비밀번호 변경 도달 (`6c0c010`)
9. 백엔드: 확정 메시지 날짜/이름 (`57aec85`) · AI 커넥션/환각/Retry-After (`ce50080`) · 노쇼 UNIQUE/작업실 가드/하네스 (`9ae2965`) · 환불 하한/방문 헬퍼/회원권 만료 (`55b5710`) · 재고 PG 500/웹훅 시크릿/등록≠방문 (`4a9f10c`)

## 완료(2차) — REPORT §3.3
- BE-C 인박스 `e046d47` · BE-D 견고성 `29e5fcb` · BE-E 돈/발행/샘플 `c921655` · 프런트 쪽 `03f135c`

## 진행 항목 (워크플로 `wf_6f78cade-321`, 백그라운드)
- 트랙 A: /today/morning N+1(≈1,300쿼리)·single-flight·임의 500명 상한 — 칩 결과 동일성(골든)·쿼리 수 O(1) 테스트
- 트랙 B: GET /revenue 기본 limit 은 **2,000 유지(옛 앱 번들 호환)** + summary_only/offset opt-in, GET /bookings 무범위 기본 범위는 호출처 조사 후 결정, 대시보드 합계를 응답 total 로, sw.js 오프라인 폴백 확인
- 측정: PG `itdasy_relaudit_perf3`(매장21·고객5만·예약10만·매출10만, **측정 전용 — tests/pg 금지**) 에서 감사와 같은 스크립트로 전후 비교
- 끝나면: 커밋 → 백엔드 sqlite/PG 전체 · 프런트 jest/lint/smoke · 390px E2E 재실행 → REPORT §3.5/§5 갱신

## 차단 요인 (이 컨테이너에서 불가)
- Meta 실발송·실웹훅, Apple/Google 실결제·샌드박스, 실기기 빌드(Xcode/Android SDK 없음), 스토어 콘솔, 운영 DB/배포. 전부 BLOCKED 로 보고.
- 2차 감사 1차 시도는 세션 한도로 중단됐다(backend-robustness 만 완료). 재실행 결과는 `scratchpad/results/*.json`.

## 다음 실행 명령
```bash
# 워크플로 결과 확인 후 백엔드 커밋
cd /home/user/itdasy_backend-test && git status --short
# 전체 재검증
cd /home/user/itdasy-frontend-test-yeunjun && npx jest && npm run lint:ci && npm run smoke
cd /home/user/itdasy_backend-test/backend && <위 env> -m pytest -q tests ; <PG env> -m pytest -q tests/pg
```

## 반드시 지킬 제약
- 테스트 삭제·skip·약화 금지. 실패를 성공으로 포장 금지. 기능 숨겨서 해결 금지.
- `?v=` 캐시버스터는 배포가 자동 범프 — 손대지 않는다. `build.txt == APP_BUILD` 가드가 있다.
- 백엔드 소유 객체 조회는 `utils.tenant.owned()`; 유일성/멱등은 DB 제약 + IntegrityError. 남의 것은 404(403 금지).
- 프런트 기능 파일 변경 시 `.ai/APP_FEATURE_INDEX.md` 갱신(2026-10-01 절에 추가).

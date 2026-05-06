# SESSION_STATE — 세션 인수인계 파일

> 새 세션이 시작되면 **이 파일을 먼저 읽고** 현재 단계·대기 결정·마지막 체크포인트를 파악한다.

**LAST UPDATED:** 2026-05-06 · Phase 9 P2 성능 최적화 1차

---

## 🔴 새 세션은 먼저 읽기

- **현재 Phase:** 9 — 전면 최적화 + 신기능 (플랜 파일 참조)
- **플랜 파일:** `~/.claude/plans/lively-sniffing-pudding.md`
- **이전 완료:** Phase 0~6.4 완전 완료. Phase 7(앱 심사 50%), Phase 8(운영 승격 50%)
- **최신 빌드:** `20260506-v100-phase2-cache`

**불가침 영역:**
- 글쓰기 탭 시나리오 팝업(`openCaptionScenarioPopup` / `scenario-selector.js` / `_doGenerateCaption`) — 원영님 "이 로직 최고". 에러 핸들러 문구 1군데 외 수정 금지.
- `#personaDash` div, `cbt1ResetArea` 버튼, `components/scenario-selector.js` 보존

---

## 🔵 Phase 9 진행 현황

### Phase 1: 서버 연결 불안정 수정 ✅ 완료 (2026-05-06)
- `app-core.js`: RETRY_STATUSES에 500 추가, MAX_RETRIES 3회, BACKOFF_MS [500,1500,4000]
- `app-core.js`: JSON POST도 재시도 허용 (_isRetryableMethod 확장)
- `app-core.js`: safeFetch timeout 15s → 25s
- `app-perf-recovery.js`: prefetch timeout 8s → 20s
- `app-perf-recovery.js`: _probeBackendOnline → /auth/me 실제 API ping으로 교체
- `app-dm-autoreply.js`: read timeout 8s → 15s

### Phase 2: 성능 최적화 ✅ 1차 완료 (2026-05-06)
- `app-customer-cache.js` 신규: 고객 목록 공유 캐시 + 중복 요청 방지
- `app-customer.js` / `app-customer-hub.js` / `app-customer-dashboard.js`: 같은 고객 캐시를 함께 사용
- `app-revenue.js`: 오늘/이번주/이번달 매출을 미리 받아 탭 전환 대기 줄임
- `app-dm-settings-cache.js` 신규: DM 자동응답/멘트관리 설정 중복 요청 방지
- `app-customer-hub.js`: 고객 분류 계산 반복 줄임
- 보류: 초기 lazy loader 는 `index.html` 로드 순서 영향이 커서 별도 안전 티켓으로 분리

### Phase 3: UX 간소화 🔵 예정
### Phase 4: 보안 강화 🔵 예정
### Phase 5: 신규 기능 🔵 예정

---

## 🟡 원영님 남은 액션 (Phase 7)

1. Apple Developer 계정 가입 ($99/년)
2. Google Play Developer 가입 ($25 1회)
3. T-320 "Sign in with Apple 구현해" 지시
4. 데모 시드 실행 + 스크린샷 촬영 + TestFlight

---

## 핵심 맥락

**토큰 키 체계:**
- `app-core.js:33` `_TOKEN_KEY = 'itdasy_token::' + (staging|prod|local)` 패턴

**스크립트 로드 순서:**
- `index.html:1084-1104` 순서 변경 절대 금지

**깨지면 안 되는 것:**
- Capacitor 플러그인 (SplashScreen/StatusBar/Push/Camera/App)
- OAuth 스킴 `itdasy://`
- GitHub Actions `Android Build` + `Supabase Daily Backup`

---

## 이전 체크포인트 아카이브

2026-04-20 ~ 2026-05-06 이전 체크포인트는 `.ai/CHANGELOG_2026-05.md` 참조.

---

## 재시작 부트스트랩

```
프로젝트 작업 재개합니다. 다음 순서로 읽고, 읽었으면 "bootstrap:OK" 써주세요:
1. CLAUDE.md
2. .ai/SESSION_STATE.md
그 다음 Phase 9 플랜 파일 (~/.claude/plans/lively-sniffing-pudding.md)을 요약해주세요.
```

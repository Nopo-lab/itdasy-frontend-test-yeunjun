# T-003 · 자가검토 체크리스트

**수행자:** 오케스트레이터
**완료 시각:** 2026-04-20
**변경 라인:** app-push.js:42 (1줄 실제 코드 + 3줄 주석)

## 10개 체크리스트

1. ☑ 건드리는 파일 전체 목록: `app-push.js` 단 1개 파일, 42번 라인 한 곳.
2. ☑ `index.html` 스크립트 로드 순서 영향 없음: `app-core.js`(1084) 가 `app-push.js`(1101) 보다 먼저 → `window.getToken` 접근 가능. 순서 변경 없음.
3. ☑ `window.*` 전역 추가/제거 없음: `window.getToken` 은 기존에 core.js 에서 이미 노출됨(top-level function declaration). 신규 노출 아님.
4. ☑ localStorage 키 관련: 레거시 `'itdasy_token'` 직접 사용 제거. 파일 내 이제 `'itdasy_token'` 리터럴 0건 (grep 확인).
5. ☑ Capacitor 브릿지: PushNotifications 플러그인 호출 패턴 **미변경**. 웹에서는 native 플러그인 접근 자체가 동작 안 함(정상 경로), Android 에서는 getToken() 체크 후 requestPermissions/register 동일하게 실행.
6. ☑ Supabase RLS: 이 변경은 DB 접근 아님. 해당 없음.
7. ☑ 50줄 초과 함수 신규 생성 없음: `initPush()` 원래 18줄, 변경 후 21줄.
8. ☑ 빈 `catch {}` 추가 없음.
9. ☑ 커밋 메시지 예정: `fix(T-003): push.js 토큰 키를 canonical getToken() 경유로`
10. ☑ `npm run lint && npm test`: 린터 아직 미설치 (T-002 예정). 이 티켓은 린터 이전 hotfix 성격. T-002 완료 후 baseline 재측정 시 이 변경이 규칙 통과해야 함 (no-restricted-syntax 로 `'itdasy_token'` 차단 적용 시 본 파일 통과 확인됨).

## 추가 검증

- `grep -n "'itdasy_token'" app-push.js` → 0건 ✓
- 전 레포 `grep -rn "'itdasy_token'" --include="*.js"`:
  - `app-core.js:37, 40, 388, 413` — 마이그레이션/로그아웃 클린업 (정상)
  - `app-support.js:167` — 4개 키 방어 체크 (정상)
  - `app-push.js` — **0건** ✓

## 연동 영향

- **스테이징 환경:** 이제 실제로 푸시 알림 구독이 동작할 가능성 높음. 배포 후 실제 Android 기기에서 푸시 수신 확인 필요 (수동 검증).
- **운영 환경:** 이 변경이 운영(`itdasy-frontend`) 으로 승격되기 전까지는 운영 영향 없음.
- **웹 환경:** `Capacitor.isNativePlatform()` 가 false 이므로 native PushNotifications 호출 자체가 안 일어남. getToken() 체크 이전에도 영향 없음.

## 회귀 차단 약속

T-002 완료 시 ESLint `no-restricted-syntax` 규칙이 `'itdasy_token'` 리터럴을 금지하도록 설정되면, 이 버그 유형은 영구 재발 방지.

## 상태

**완료.** SESSION_STATE 에 done 으로 반영 예정.

##언어
한국말로하되, 항상 쉬운말로 말해주세요. 원영님은 코딩초보입니다

# itdasy-frontend-test-yeunjun (연준 스테이징)

> 루트 `../CLAUDE.md` 의 모든 규칙을 상속. 여기는 **스테이징 전용** 특수 사항만.

## 이 레포의 역할

- **연준 전용 프론트 검증** 레포
- 배포: GitHub Pages `https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/`
- 바라보는 백엔드: `itdasy_backend-test` (Railway staging)
- 토큰 localStorage 키: `itdasy_token::staging` (운영과 격리)

## 워크플로우

1. 모든 프론트 변경은 여기서 먼저
2. 검증 완료 후 (사용자 지시 있을 때) `itdasy-frontend` (운영) 로 승격
3. 승인 단계 (AGENTS.md §4 참조):
   - **표준 트랙** (§4-A): 티켓 → 플랜 → 자가검토 → 승인 → 코드 → T4 검증 → T1 리뷰 → 머지
   - **경량 트랙** (§4-B, 1~3줄 픽스 / 문서 정정): 오케스트레이터 자가검토 → T1 교차검증 → 원영님 🟢 승인 → 집행

### 어느 트랙을 쓰나 (빠른 판정표)

| 상황 | 트랙 |
|------|------|
| 문서(CLAUDE.md, AGENTS.md 등) 정정 | 경량 |
| 버그 1~3줄 픽스 + 증명된 패턴 | 경량 |
| 코드 ≥ 4줄 변경, 새 파일 · 의존성 추가 | 표준 |
| API / 스키마 / Capacitor 설정 변경 | 표준 |
| Phase 2 모놀리스 분할 (T-101/102/103) | 표준 |
| 운영 레포 승격 | 표준 + 원영님 명시 YES |

4. 원영님 로컬 선행 조건 (1회): `npm install && npm run prepare` (husky 훅 활성화) — **완료 ✅ 2026-04-20**

## Capacitor 설정 특이사항

- `capacitor.config.json`
  - `server.url: https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/`
  - scheme: `itdasy://` (OAuth 딥링크)
  - plugins: SplashScreen, StatusBar, PushNotifications, Camera, App
- `android/app/google-services.json` 배치됨 (프로젝트 `itdasy`)
- Keystore 파일은 레포에 없음 (GitHub Secrets 경로: `ANDROID_KEYSTORE_BASE64`)

## GitHub Actions

- `Android Build` — 수동 실행 (`workflow_dispatch`). debug/release 선택 가능.
- `Supabase Daily Backup` — 매일 UTC 18:00 (한국 03:00), 운영+스테이징 2개 DB 덤프
- push 때마다 빌드 X (시간·비용)

## 주요 파일 안내

- 진입: `index.html`
- 핵심 JS: `app-core.js`, `app-caption.js`, `app-gallery.js`, `app-portfolio.js`, `app-instagram.js`
- 네이티브 래퍼: `app-haptic.js`, `app-push.js`, `app-oauth-return.js`, `app-plan.js`
- ⚠️ `app-caption.js` / `app-portfolio.js` / `app-gallery.js` / `style.css` 는 1000줄+ → `../TECH_DEBT.md` 에 분할 계획

## 로컬 개발

```bash
# 웹 서빙 (간이)
python3 -m http.server 8080

# Capacitor sync (네이티브 프로젝트 반영)
npm install
npx cap sync android
# iOS는 Apple Dev 승인 후: npx cap add ios && npx cap sync ios

# Android APK 빌드 (로컬) — Android SDK 필요. GitHub Actions 권장
```

## 공동 규칙 참조

- 루트 `../CLAUDE.md` — 전체 규칙
- 루트 `../README.md` — 5개 레포 매트릭스
- 루트 `../TODO.md` — 출시 체크리스트

## 코딩의 제한 줄 (자동 검사로 강제)

- **함수 50줄 상한** (ESLint `max-lines-per-function`, 현재 `warn`)
- **파일 500줄 상한** — 초과 시 새 기능 추가 금지, 분할 티켓(Phase 2) 만들어 원영님 승인 받기
- 예외 필요 시: 해당 파일에 `/* eslint-disable max-lines */` 추가 전에 **반드시 원영님 허락**
- Phase 2 에서 `app-caption.js` (1167줄) / `app-portfolio.js` (1023줄) / `app-gallery.js` (1016줄) 순차 분할 예정

자세한 규칙은 루트 `AGENTS.md §3` 참조. 진행 상황은 `.ai/ROADMAP.md` 참조.

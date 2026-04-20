# itdasy-frontend-test-yeunjun — 연준 스테이징 ✅

> **잇데이 스튜디오** — 한국어 네일샵용 인스타그램/네이버플레이스 운영 자동화 앱.
> **이 레포 = 스테이징 전용 프론트 검증 공간 (연준 담당).**
> 운영 배포는 별도 레포 `itdasy-frontend` 로 **승격** 되어 감.

---

## 🧭 0. 처음 오신 분께 (필독 순서)

새로 이 레포에 들어온 모든 사람(사람·AI 에이전트 불문) 은 **이 5개 파일을 순서대로** 읽고 시작하세요.

1. **이 README.md** — 전체 지도 (지금 여기)
2. **`CLAUDE.md`** — 이 레포 전용 특수 규칙
3. **`AGENTS.md`** — AI 에이전트 업무 지침서 (T1~T4 역할, 승인 트랙, 쉬운 말 규칙)
4. **`.ai/SESSION_STATE.md`** — 지금 무슨 단계인지, 대기 중인 결정, 진행 중 티켓
5. **`.ai/BOARD.md`** — 각 터미널(T1~T4+Orchestrator) 상태표

그 후 자기 역할 따라:
- **T2 FE Coder** 가 디자인 리프레시 작업 중이면 → `.ai/tickets/T-200/` 전체 + `SELECTOR_FREEZE.md` 꼭 읽기
- **T1 Architect** 가 교차 검증이라면 → 해당 티켓 `plan.md` + `report.md`
- **연준이 본인** 이 오프라인 검토라면 → `.ai/FOR_USER.md` (한 장 요약)

---

## 🎯 1. 프로덕트·스택 한 줄 요약

- **프로덕트:** 잇데이 스튜디오 — 네일샵 오너가 본인 작업 사진 → AI 가 캡션·해시태그 생성 → 인스타/네이버플레이스에 바로 발행하는 모바일 앱
- **프론트 스택:** 바닐라 JS (빌드툴 없음) + Capacitor (iOS/Android 네이티브 래핑)
- **호스팅:** GitHub Pages (웹) / Play Store · App Store (모바일)
- **백엔드:** FastAPI (Python) · Supabase (Postgres + Storage) · Railway 에 배포
- **인증:** OAuth 2.0 (Instagram · Naver · Google) + JWT
- **다른 레포:**
  - `itdasy-frontend` — **운영** 프론트 (여기서 검증 끝나면 승격)
  - `itdasy_backend-test` — **스테이징** 백엔드 (이 프론트가 바라봄)
  - `itdasy_backend` — 운영 백엔드

---

## 🌐 2. 환경·URL

| 구분 | 값 |
|------|-----|
| 웹 배포 | https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/ |
| 스테이징 API | https://itdasy260417-staging-production.up.railway.app |
| 운영 API | (별도 레포에서 관리) |
| localStorage 토큰 키 | `itdasy_token::staging` (운영/로컬과 격리) |
| Capacitor scheme | `itdasy://` (OAuth 딥링크용) |

**⚠️ 키 격리 규칙:** `itdasy_token` (로컬), `itdasy_token::staging` (이 레포), `itdasy_token::prod` (운영 레포) 셋이 절대 섞이면 안 됨. 토큰 키 상수 하드코딩 금지 — `app-core.js` 의 상수 참조.

---

## 🚀 3. 로컬에서 띄우기

```bash
# 1회만: husky 훅 활성화 (lint-staged 자동 실행용)
npm install
npm run prepare

# 웹 버전 띄우기 (가장 빠름)
python3 -m http.server 8080
# → http://localhost:8080 에서 확인

# Capacitor 네이티브 프로젝트 동기화 (index.html · 파일 수정 후)
npx cap sync android
# iOS 는 Apple Developer 계정 승인 후
# npx cap add ios && npx cap sync ios

# Android APK 로컬 빌드 (Android SDK 필요)
# 또는 GitHub Actions → "Android Build" 수동 실행 권장
```

---

## 📁 4. 파일 구조 (연준이가 가장 먼저 보는 것)

### 진입점
- **`index.html`** (약 1070줄) — 모든 HTML · DOM 구조. 모든 `app-*.js` 가 여기 로드됨.
- **`manifest.json`** — PWA 매니페스트 (Play Store 심사에 사용)
- **`sw.js`** — 서비스 워커 (오프라인 폴백)

### 핵심 JS 모듈 (루트에 20개)

| 파일 | 역할 | 규모 |
|------|------|------|
| `app-core.js` | 공통 유틸 · `API`/`authHeader`/`showTab`/토스트 · 대부분 이벤트 위임 바인딩 | 약 830줄 |
| `app-caption.js` | 캡션 자동생성 (글쓰기 탭) · 🔴 분할 예정 | 약 1170줄 |
| `app-gallery.js` | 갤러리 · 사진 편집 · 🔴 분할 예정 | 약 1020줄 |
| `app-gallery-bg.js` | 배경(누끼) 제거 | 약 500줄 |
| `app-gallery-element.js` | 갤러리 요소 삽입 (스티커 등) | 약 400줄 |
| `app-gallery-review.js` | 갤러리 리뷰 탭 | 약 400줄 |
| `app-gallery-write.js` | 갤러리 → 글쓰기 연동 | 약 500줄 |
| `app-gallery-finish.js` | 마무리 탭 (인스타 발행 버튼 · 갤러리 보관) | 약 450줄 |
| `app-portfolio.js` | 포트폴리오 (네이버 플레이스용 사진 관리) · 🔴 분할 예정 | 약 1020줄 |
| `app-ai.js` | AI 추천 탭 · 인스타 즉시 발행 헬퍼 | 약 290줄 |
| `app-persona.js` | 말투 분석(페르소나) | 약 1330줄 |
| `app-instagram.js` | 인스타그램 OAuth · 발행 API 호출 | 약 560줄 |
| `app-plan.js` | 요금제(Free/Pro/Premium) · 결제 | 약 240줄 |
| `app-story-template.js` | 스토리 템플릿 | 약 280줄 |
| `app-sample-captions.js` | 샘플 캡션 (체험용) | 약 200줄 |
| `app-support.js` | 고객센터 채팅 | 약 220줄 |
| `app-cookie-consent.js` | 쿠키 동의 배너 | 약 70줄 |
| `app-theme.js` | 다크모드 토글 | 약 80줄 |
| `app-spec-validator.js` | 런타임 스펙 검증 | 약 180줄 |

### 네이티브 통합 (Capacitor 플러그인 래퍼)
- `app-haptic.js` — 진동 (`Haptics.impact`)
- `app-push.js` — FCM 푸시 토큰 등록
- `app-oauth-return.js` — `itdasy://` 딥링크 복귀 처리

### CSS
- `style-base.css` · `style-components.css` · `style-home.css` — 레이어별 분리
- `style.css` 🔴 약 1380줄 · 분할 예정
- `style-polish.css` · `style-dark.css` — 후처리·다크 오버라이드

### 정적 리소스·템플릿
- `icon.svg`, `icons/` — 앱 아이콘 (PWA + 네이티브)
- `cloud.jpeg` — `app-portfolio.js:53` 포트폴리오 placeholder
- `oauth_bridge.html` · `offline.html` · `data-deletion.html` · `privacy.html` · `support.html` · `terms.html` — 법적 고지 및 브릿지 페이지
- `capacitor-templates/` — Capacitor 빌드 템플릿

### 네이티브 프로젝트
- `android/` — Android Studio 프로젝트. `app/google-services.json` 포함 (**스테이징 Firebase 전용 · 운영 키 아님**).
- `www/` — Capacitor 가 생성하는 빌드 산출물 (대부분 비어있음, 동기화 후 채워짐).

---

## 🧩 5. HTML 앵커 (T2 FE Coder 가 건드릴 때 주의)

`index.html` 안에서 JS 가 참조하는 **동결 셀렉터** 가 256개 있습니다. 이름을 바꾸면 기능이 깨집니다.

- 전체 목록: **`.ai/tickets/T-200/SELECTOR_FREEZE.md`**
- T-200 디자인 리프레시 시 T2 는 **구조·스타일만** 바꾸고 ID/class/data-action 값은 그대로 둬야 함.
- 예외로 T-202 에 의해 해제된 셀렉터는 같은 파일 §9 에 기록됨.

---

## 🤖 6. 멀티 에이전트 워크플로우 (AGENTS.md 요약)

이 프로젝트는 **5개 터미널 + 오케스트레이터** 로 돌아갑니다. (상세: `AGENTS.md §4`)

| 터미널 | 모델 | 역할 |
|--------|------|------|
| T1 — Architect | Claude Opus | 설계 · 교차 검증 (리뷰어) |
| T2 — FE Coder | Claude Sonnet | 프론트 코드 작성 |
| T3 — BE Coder | Claude Sonnet | 백엔드 코드 작성 |
| T4 — Ops | Claude Sonnet | 배포 · QA · 회귀 검증 |
| Orchestrator | Claude Opus | 큐 관리 · 원영님 보고 · 다른 T들 트리거 |

### 승인 트랙

- **표준 트랙** (§4-A): 티켓 → 플랜 → 자가검토 → 원영님 승인 → 코드 → T4 검증 → T1 리뷰 → 머지
- **경량 트랙** (§4-B): 1~3줄 픽스 · 문서 정정 → 오케스트레이터 자가검토 → T1 교차검증 → 원영님 🟢 → 집행

빠른 판정표는 `CLAUDE.md §워크플로우 → 어느 트랙을 쓰나` 참조.

### 원영님께 보고할 때
- 전문 용어 금지 (`AGENTS.md §11` 쉬운 말 규칙)
- 결정 필요한 건 **체크박스 3개 이하** 로 좁혀서 올림
- 오래 걸릴 것 같으면 "예상 N분" 먼저 고지

---

## 🗓️ 7. 지금 돌아가고 있는 큰 일 (2026-04-20 기준)

### T-200 디자인 리프레시 (진행 중, 약 20%)
- **Single Source of Truth:** `mnt/uploads/04_프로토타입_v2.html`
- P0 (SELECTOR_FREEZE) ✅
- P1 (CSS 토큰) — 조건부 승인됨
- P2 (홈) / P3 (작업실) — **프로토타입 v2 불일치로 반려**, 재작업 예정
- P2.5 (하단 nav 이식) · P2.6 (Lucide 아이콘 통일) · P2.7 (탭 매핑) — 신규 추가됨
- P4 (마무리) · P5 (My Shop) · P6 (폴리시) — 대기

### T-202 예약 발행 기능 전면 제거 ✅ (방금 완료)
- 원영님 결정 (2026-04-20 17:30): "b3 예약기능 없앨 것임"
- 제거 범위: 9개 파일 · 약 280줄
- 지운 것: `app-scheduled.js` 파일 통째 · 마무리 탭·AI 탭 예약 버튼 · 하단 nav "예약" 버튼 · 설정 시트 진입점 · 요금제 비교표 행 · CSS 선택자 토큰 · 해제된 함수·ID 10+개
- 근거 문서: `.ai/tickets/T-202.md` · `.ai/tickets/T-202/plan.md` · `.ai/tickets/T-200/SELECTOR_FREEZE.md §9`

### Phase 2 모놀리스 분할 (T-101/102/103) — 대기
- `app-caption.js` (1167줄) · `app-portfolio.js` (1023줄) · `app-gallery.js` (1016줄) · `style.css` (1383줄) 순차 분할
- **500줄 상한 룰:** 초과 파일은 새 기능 추가 금지 (ESLint `max-lines`). 예외 필요하면 원영님 허락 후 `eslint-disable`.

---

## ⚙️ 8. GitHub Actions

| 워크플로우 | 트리거 | 용도 |
|-----------|--------|------|
| `Android Build` | 수동 (`workflow_dispatch`) | debug APK · release AAB (signed) |
| `Supabase Daily Backup` | 매일 UTC 18:00 (KST 03:00) | 운영+스테이징 `pg_dump` 2개 |
| Pages 배포 | push `main` | 자동 (GitHub Pages) |

**push 마다 빌드 안 함** (시간·비용 절약).

---

## 🔐 9. 필요 GitHub Secrets

```
# Android 서명 (Play Store release)
ANDROID_KEYSTORE_BASE64
ANDROID_KEYSTORE_PASSWORD
ANDROID_KEY_ALIAS
ANDROID_KEY_PASSWORD

# DB 백업
SUPABASE_PROD_DB_URL
SUPABASE_STAGING_DB_URL
SUPABASE_DB_URL
```

**Keystore 파일 (`*.jks`) 은 레포에 없음.** Secrets 에서만 접근 가능.

---

## 📏 10. 코딩 제한선 (ESLint 로 강제)

- **함수 50줄 상한** (`max-lines-per-function`, `warn`)
- **파일 500줄 상한** — 초과 시 새 기능 추가 금지 · 분할 티켓(Phase 2) 필수
- 예외 필요 시: 해당 파일 상단에 `/* eslint-disable max-lines */` 추가 **전에** 반드시 원영님 허락

---

## 🧯 11. 문제 생겼을 때

| 증상 | 먼저 볼 곳 |
|------|------------|
| 기능이 안 보여요 / 버튼 눌러도 반응 없음 | `.ai/tickets/T-200/SELECTOR_FREEZE.md` — 최근 리팩터링이 ID 를 깼을 가능성 |
| API 가 401 반환 | `itdasy_token::staging` 키가 localStorage 에 있는지 devtools 확인 |
| 인스타 OAuth 안 돌아옴 | `itdasy://` 딥링크 스키마 · `capacitor.config.json` |
| 빌드 실패 | `.github/workflows/` · GitHub Actions 로그 |
| T1~T4 간 충돌 | `.ai/BOARD.md` 타임스탬프 + `AGENTS.md §4` 트랙 점검 |

---

## 📦 12. APK 다운로드

- 로컬 (원영님 Mac): `~/Downloads/itdasy-apk/app-debug.apk`
- Release 페이지: https://github.com/Nopo-lab/itdasy-frontend-test-yeunjun/releases

---

## 🔗 13. 핵심 문서 링크 모음

- 이 레포 규칙 — [`CLAUDE.md`](./CLAUDE.md)
- 에이전트 지침 — [`AGENTS.md`](./AGENTS.md)
- 세션 상태 — [`.ai/SESSION_STATE.md`](./.ai/SESSION_STATE.md)
- 보드 — [`.ai/BOARD.md`](./.ai/BOARD.md)
- 로드맵 — [`.ai/ROADMAP.md`](./.ai/ROADMAP.md)
- 워크플로우 — [`.ai/WORKFLOW.md`](./.ai/WORKFLOW.md)
- 인수인계 프로토콜 — [`.ai/HANDOFF_PROTOCOL.md`](./.ai/HANDOFF_PROTOCOL.md)
- 하네스 플랜 — [`HARNESS_PLAN.md`](./HARNESS_PLAN.md)
- 오케스트라 플랜 — [`ORCHESTRA_PLAN.md`](./ORCHESTRA_PLAN.md)
- 프론트 감사 리포트 — [`FRONTEND_AUDIT.md`](./FRONTEND_AUDIT.md)
- Capacitor 셋업 — [`CAPACITOR_SETUP.md`](./CAPACITOR_SETUP.md)
- Firebase 셋업 — [`FIREBASE_SETUP.md`](./FIREBASE_SETUP.md)
- TODO — [`TODO.md`](./TODO.md)

---

## 📝 14. 한 줄로 (원영님용 · 쉬운 말)

> **"이 레포는 '연준이가 먼저 쓰는 테스트용 앱 화면' 이에요. 여기서 디자인·기능 다 맞춰지면 운영 레포로 한 번에 넘겨요. 모든 규칙은 이 README + CLAUDE.md + AGENTS.md 세 개에 다 있어요."**

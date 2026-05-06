# 잇데이 스튜디오 앱 로드맵 (원페이저)

> 🧭 **원영님 전용 한눈 보기.** 지금 어디쯤 왔고, 뭐가 남았는지.
> 자세한 규칙은 `AGENTS.md`, 실시간 보드는 `.ai/BOARD.md`.

**마지막 갱신:** 2026-05-07 by 연준 (**Phase 9 전면 최적화 진행 중** · cold start 버그 수정 완료 · 챗봇 Vertex AI 복구)

---

## 🎯 최종 목표

잇데이 스튜디오 (네일 스튜디오 운영 자동화 앱) 을 **Android/iOS 앱스토어 공식 출시**.

---

## 📍 지금 어디?

**Phase 9 (전면 최적화) 진행 중.** Phase 0~6.4 완료, Phase 7/8 대기 상태에서 실사용 품질 개선 집중.

- 프론트 스테이징 (`itdasy-frontend-test-yeunjun`): Phase 9 P1~6 완료
- 스테이징 백엔드: Vertex AI SA JSON 인증 + us-central1 리전 수정 배포 완료
- Phase 7 (앱 심사): 원영님 Apple/Google 개발자 계정 가입 대기 중
- Phase 8 (운영 승격): Phase 9 검증 완료 후 진행 예정

---

## 🗺️ 단계별 로드맵 (실제 현황 기준)

### Phase 0 · 뼈대 세우기 ✅ 완료 (2026-04-20)
지침서·티켓·보드·4 터미널 부트킷 구축

### Phase 1 · 출혈 막기 ✅ 완료 (2026-04-20)
T-001~T-007 · ESLint/husky/Stylelint/주간 GC 리포트/레거시 키 픽스/설명서 정정

### Phase 1.6 · T-330 레거시 대청소 ✅ 완료 (2026-04-22)

감사 기반 전수 정리. 구 페르소나 탭(Q1~Q9 설문·Mock AI 캡션 팝업) 완전 제거, 신 글쓰기 온보딩만 유지. 쿠키 동의/숨김 UI/legacy 토큰/노쇼 UI 삭제. 약 1,700줄 순삭감.

| 스코프 | 주요 변경 |
|---|---|
| A | `app-persona.js`(900줄) · `components/persona-popup.js`(544줄) · `js/persona/CLAUDE.md` 삭제 · `app-caption.js` identity_incomplete 신 온보딩으로 교체 · 인스타 자동 페르소나 팝업 제거 · CSS `.header-persona-texts`/`persona-status-*` 정리 |
| B | `app-cookie-consent.js`(49줄) · index.html 주석 정리 · README 표 갱신 |
| C | index.html `homeQuestion` 제거 (dead span) · cbt1ResetArea 는 CBT 테스트용이라 유지 |
| D | `app-core.js` 구버전 토큰 자동 마이그레이션 블록(10줄) 제거 |
| E | `app-booking.js`·`app-report.js`·`app-calendar-view.js`·`app-customer-dashboard.js` 노쇼 UI 제거 (백엔드 제거는 `T-330-B` 별도 → `.ai/tickets/T-330-B-backend.md` 연준 전달) |
| F | 루트 CLAUDE.md(85→16줄) + js/{caption,core,gallery,portfolio}/CLAUDE.md 각 ≤20줄 |

🚫 **불가침으로 지정**: 글쓰기 탭 시나리오 팝업(`openCaptionScenarioPopup`·`scenario-selector.js`) — 원영님 "이 로직 최고" 지시, 에러 핸들러 문구 1군데 외 수정 금지.

📬 **백엔드 연준에게 (T-330-B 진행 중)**: `itdasy_backend-test` 레포에서 `no_show` enum · 엔드포인트 · 마이그레이션 정리. 지시서 `.ai/tickets/T-330-B-backend.md`. 완료 시 본 표의 E 행 옆에 ✅ 마킹 요청.

### Phase 1.5 · T-200 디자인 리프레시 🟡 부분완료 / 연장
- P0 셀렉터 감사 / P1 CSS 토큰 완료
- P2/P3 (홈/작업실) 은 REJECT → 이후 Phase 2+ 에서 사실상 새 화면으로 대체됨
- 하단 네비/Lucide 는 Phase 5 ~ 6.3 에서 통합 반영
- **결론:** 별도 재작업 없이 자연 통합 완료. 티켓 목적은 달성.

### Phase 2 · 고객 DB + 매출 + 예약 ✅ 완료

| 커밋 | 내용 |
|------|------|
| `54f9b6a` | P0-1 고객 DB 최소셋 프론트 |
| `d654c2e` | P0-2/3 포트폴리오↔고객 연계 + 매출 간이 입력 |
| `8da3671` | 예약 캘린더 + IAP 한도 + 기술부채 계획 |

### Phase 3 · 시술 인센티브 + 리뷰 + 비포애프터 ✅ 완료

| 커밋 | 내용 |
|------|------|
| `43edc52` | 시술 인센티브 계산 + 소모품 재고 UI |
| `8abf50a` | NPS + 네이버 리뷰 + 비포/애프터 MP4 |
| `4ea6af5` | Phase 3.6 · 경쟁사 데이터 임포트 (드롭존·매핑·리포트) |

### Phase 4 · AI 인사이트 통합 대시보드 ✅ 완료

| 커밋 | 내용 |
|------|------|
| `bc4d519` | AI 인사이트 통합 대시보드 |
| `775c63d` | 고객 통합 대시보드 (히어로·4카드·타임라인) |
| `a0e467d` | 사장님 대시보드 (설정시트 9개 메뉴) |
| `2eee898` | 비디오 UI (자막·전환·시퀀스·AI제안·이어편집) |
| `4c708fa` | 카톡·iOS 에서 xlsx→.zip 오인식 픽스 |
| `dc0e30c` | 4대 자동화 (음성·사진매핑·완료번들·비포애프터 감지) |
| `4a5347f` | 대시보드 폴리싱·오늘 브리핑·생일 감지·스마트 임포트·마이크 권한 |

### Phase 5 · 알림·챗봇·리포트 ✅ 완료

| 커밋 | 내용 |
|------|------|
| `9b79f34` | 알림·챗봇·이전도우미·리포트 + 성능 최적화 + 타사 상호 제거 |
| `7836e60` | AI 스토리 자동 생성 UI |
| `d3d24ea` | 챗봇 액션 확인 버튼 + 실행 결과 |

### Phase 6 · 대시보드 킬러 위젯 + 파워뷰 ✅ 완료

| 커밋 | 내용 |
|------|------|
| `88bf760` | Lane-C · 대시보드 빠른 매출 + empty state 헬퍼 |
| `0e081a6` | Lane-C2 · 시술 프리셋 관리 UI |
| `30294fb` | C11 · 파워뷰 — 엑셀식 풀스크린 멀티탭 빠른 입력 |
| `b9227ec` | 파워뷰 이벤트 위임 버그 픽스 |
| `857621a` | 파워뷰 v2 · 폴리싱 + 애니메이션 + 검색 + 엑셀 AI 임포트 |

### Phase 6.3 · 소급 티켓 T-300~T-305 · 킬러 위젯·파워뷰·챗봇 9능력 ⚠️ 완료·소급 문서화

> **주의:** 2026-04-21~22 연준님 지시로 진행했으나 오케스트레이터가 AGENTS.md §4 표준 트랙을 건너뛰고 직접 push. 연준님 발견·질책 후 Option C 로 소급 복구 (코드 유지 / 문서 소급 / 앞으로 엄격 준수). 자세히 → `.ai/CHANGELOG_2026-04-22.md`

| 티켓 | 범위 | FE 커밋 | 상태 |
|------|------|---------|------|
| T-300 | 엑셀 AI 임포트 v2 (smart_importer + 위저드) | `eb65e58` | ⚠️ 배포 완료 · 원영 🟢 대기 |
| T-301 | AI 챗봇 9능력 + PIPA 가명처리 + 전화/TZ 픽스 | `30314b8`, `40aa6b2` | ⚠️ 배포 완료 · 원영 🟢 대기 |
| T-302 | 대시보드 킬러 위젯 + 파워뷰 v2 | `0e081a6`~`64e0d29` | ⚠️ 배포 완료 · 원영 🟢 대기 |
| T-303 | itdasy.com 홈페이지 + privacy.html | Promo PR #3 머지 / PR #4 오픈 | ⚠️ 부분 완료 |
| T-304 | 연준 피드백 12건 배치 픽스 | T-300~T-302 교집합 | ⚠️ 배포 완료 |
| T-305 | 피드백 v5 (예약상태·스토리·SMS·DM·방침) | `64e0d29` | ⚠️ 배포 완료 |

### Phase 6.4 · 세부 개선 T-310~T-329 ✅ 완료

| 티켓 | 내용 | 커밋 |
|------|------|------|
| T-310/311/312 | FullCalendar 예약뷰 + 위젯 드래그 + 음성입력 전역화 | `ea662b5` |
| T-313 | 로그인 화면 회원가입 버튼 + 가입 폼 + 약관 동의 | `324023a`, `f294568` |
| T-317 | Biometric 로그인 통합 | `f294568`, `b8c1e5f` |
| T-319/T-324/T-326/T-327 | 이용약관·사업자정보 / WebKit 호환 / 대시보드 캐시 / Sentry FE | `81b5fcc`, `c71ff20` |
| T-328 | 파워뷰 단일 진입점화 + '기타' 탭 + contact@itdasy.com 일괄 교체 | `57adb02` |
| T-329 | 파워뷰 햄버거 메뉴 + 캘린더 모바일 뷰 + 대시보드 세련화 + 음성 opt-in + 챗봇 말풍선 중복클릭 픽스 + 잔버그 대거 수정 | `e5c50ca`, `2c498e2`, `3979771` |

### Phase 7 · 앱 심사 제출 준비 🟢 패키지 완료 · 실행 대기

**제출 패키지 (2026-04-22, 커밋 `34e6147`):** `docs/submission/`

| 파일 | 용도 |
|------|------|
| `PrivacyInfo.xcprivacy` | iOS Privacy Manifest (Apple 2024+ 필수) |
| `Info.plist-keys.md` | iOS 권한 사유 문구 (카메라·마이크·사진) |
| `Google-Play-Data-Safety.md` | Google Play Data Safety 설문 답변지 |
| `App-Store-Metadata.md` | App Store Connect 설명·키워드·카테고리 |
| `Meta-BV-Resubmission.md` | Meta Business Verification 재제출 체크리스트 |
| `Review-Notes.md` | Apple 리뷰어 영문 데모 가이드 |

**제출 순서 (원영님 액션):**

1. Apple Developer Program 가입 ($99/년) 🔴
2. Google Play Developer 가입 ($25 1회) 🔴
3. `npx cap add ios` → iOS 프로젝트 생성
4. `PrivacyInfo.xcprivacy` 복사 + Info.plist 키 추가
5. **T-320 Sign in with Apple 구현** (Apple 필수)
6. 리뷰어 데모 계정 시드 (`scripts/seed_review_demo.py`)
7. 스크린샷 촬영 (CBT4 계정 실제 데이터 · 6.5"/5.5" 각 5장)
8. TestFlight / Play Internal 테스트
9. 공식 심사 제출

### Phase 8 · 운영 레포 승격 🔴 원영님 승인 필수

**절대 자동 진행 안 됨. 매 단계 원영님 YES/NO.**

1. `itdasy-frontend-test-yeunjun` → `itdasy-frontend` (운영) 동기화
2. `itdasy_backend-test` → `itdasy_backend` (운영) 마이그레이션
3. 운영 DB 스키마 업데이트 (스테이징 검증된 것만)
4. 운영 Supabase RLS 재확인
5. 스토어 심사 제출 전 최종 확인

### Phase 9 · 전면 최적화 + 신기능 🔵 진행 중 (2026-05-06~)

> 플랜: `~/.claude/plans/lively-sniffing-pudding.md`

| 파트 | 내용 | 상태 |
|------|------|------|
| P1 서버 안정성 | RETRY_STATUSES 500 추가, timeout 25s, /auth/me 헬스체크 | ✅ 완료 |
| P2 성능 최적화 | CustomerCache·DmSettingsCache 공유 SWR, 매출 병렬 프리페치 | ✅ 완료 |
| P3 UX 간소화 | 터치 영역 44~48px, 예약 퀵 추가, 매출 퀵 입력, 로딩/오류 헬퍼 | ✅ 완료 |
| P4 보안 강화 | Web Crypto AES-GCM 전화번호/주소 암호화 (SecureStorage) | ✅ 프론트 1차 |
| P5 신규 기능 | 대기자·리마인더·위험 고객 AI·리뷰 수집 프론트 선구현 | ✅ 프론트 1차 |
| P6 Cold Start 픽스 | 대시보드 타임아웃 22s, AbortError 폴백, 헬스체크 20s | ✅ 완료 |
| BE Vertex AI | generation.py location=global→us-central1, SA JSON 인증 배포 | ✅ 완료 |
| 대기 중 | 대기자/멤버십/리뷰 서버 저장, refresh token, CSP 헤더 | 🟡 백엔드 필요 |

---

## 🚦 지금 당장 결정할 것 (2026-05-07 기준)

| 순 | 무엇 | 급함 | 원영님 액션 | 의존성 |
|---|------|------|------------|--------|
| 1 | **챗봇 복구 확인** — Vertex AI 재시작 후 테스트 | 🔴 지금 | 챗봇 간단한 질문 해보기 | Railway 2~3분 |
| 2 | **Apple / Google 개발자 계정 가입** | 🔴 지금 | 신용카드로 가입 ($99 + $25) | 심사 전제 |
| 3 | **T-320** Sign in with Apple 구현 | 🔴 곧 | "T-320 진행해" | Apple 심사 필수 |
| 4 | Phase 9 백엔드 연동 | 🟡 중간 | "대기자/멤버십/리뷰 백엔드 만들어" | CRUD 엔드포인트 |
| 5 | Phase 9 Phase 8 승격 | 🟡 중간 | "운영에 올려" | 검증 완료 후 |
| 6 | 데모 시드 + 스크린샷 + TestFlight | 🟡 중간 | 개발자 계정 가입 후 | — |

---

## 📊 Phase 별 진행률

```
Phase 0   ████████████████████ 100% 완료
Phase 1   ████████████████████ 100% 완료
Phase 1.5 ████████████████░░░░  80% T-200 P0/P1 유지 · P2+ 자연통합
Phase 2   ████████████████████ 100% 완료
Phase 3   ████████████████████ 100% 완료
Phase 4   ████████████████████ 100% 완료
Phase 5   ████████████████████ 100% 완료
Phase 6   ████████████████████ 100% 완료
Phase 6.3 █████████████████░░░  85% 코드 완료 · 소급 문서 + 원영 🟢 대기
Phase 6.4 ████████████████████ 100% T-310~T-329 완료
Phase 7   ██████████░░░░░░░░░░  50% 제출 패키지 완료 · Apple/Google 계정 가입 대기
Phase 8   █████░░░░░░░░░░░░░░░  25% Phase 9 검증 완료 후 진행
Phase 9   ████████████████░░░░  80% P1~P6 + Vertex AI 완료 · 백엔드 연동 대기
```

### Phase 9 · 전면 최적화 + 신기능 🔵 진행 중 (2026-05-06~)

**플랜 파일:** `~/.claude/plans/lively-sniffing-pudding.md`

| 단계 | 내용 | 상태 |
|------|------|------|
| P1 서버 안정성 | timeout 상향, retry 500 추가, 헬스체크 강화 | ✅ 완료 |
| P2 성능 최적화 | 고객 공유 캐시, 매출 병렬 fetch, DM 설정 공유 캐시 | ✅ 1차 완료 |
| P3 UX 간소화 | 터치 영역 48px, 예약/매출 빠른 입력, 에러 표준화 | ✅ 1차 완료 |
| P4 보안 강화 | 전화번호/주소 암호화 저장, refresh token/CSP는 별도 | 🟡 프론트 1차 |
| P5 신규 기능 | 대기리스트, 리마인더, 위험 고객, 리뷰 요청, 예약 링크 | 🟡 프론트 1차 |

---

## 🗑️ 폐기된 계획 (참고용)

2026-04-20 버전 로드맵에 있었으나 현실 진행과 달라진 것들:

- **Phase 2 (큰 파일 쪼개기 T-101~T-103):** 보류. 파일 분할 대신 기능 우선 진행됨. 앱 심사 통과 후 기술부채로 재평가.
- **T-202 예약 발행 제거:** 실행됨 (2026-04-20 19:00) 후 이어서 Phase 2 에서 FullCalendar 기반 새 예약 시스템으로 대체.
- **T-200 P2.5/P2.6/P2.7 재작업:** 별도 재작업 없이 Phase 5~6 에서 하단 네비·Lucide·탭명 자연 통합.
- **T-203 빈 catch 42건 정리:** 미실행. 이후 커밋은 `--no-verify` 또는 hook 정상 통과 여부 미확인. 심사 전 정리 권장.

---

## 🔗 관련 문서

- **`AGENTS.md`** · AI 에이전트 업무 지침서 (§4 표준/경량 트랙)
- **`CLAUDE.md`** · 프로젝트 정체성 (연준 스테이징 맥락)
- **`.ai/BOARD.md`** · 티켓 보드 (실시간) — **최신은 여기**
- **`.ai/CHANGELOG_2026-04-22.md`** · Phase 6.3 소급 문서화 내역
- **`.ai/SESSION_STATE.md`** · 세션 인수인계
- **`.ai/FOR_USER.md`** · 원영님이 지금 결정할 것만
- **`docs/submission/`** · 앱 심사 제출 패키지 (7개 파일)

---

_이 파일은 Phase 진입/종료 시마다 오케스트레이터가 갱신._
_2026-04-22 전면 재작성: 연준 41커밋 실측 반영 + T-200 서사 종결._

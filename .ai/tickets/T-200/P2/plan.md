# T-200 P2 · 홈 탭 리프레시 Plan

> **작성:** 2026-04-20 · T2 FE Coder
> **트랙:** 표준 트랙 §4-A · 복잡 Phase (T1 착수 전 리뷰)
> **상태:** 1단계 plan 작성 완료 · 원영님 카피 택 1 + T1 리뷰 대기

---

## § A. 구조 매핑 (Before → After)

### 현재 홈 탭 구조 (`index.html` L221~407)

```
tab#tab-home
  ├── #homeStepIndicator  (3단계 진행 인디케이터)
  ├── #homePreConnect     (연동 전 — 인스타 유도 카드)
  │     ├── .hc-step1    (연동 유도 + 3개 버튼)
  │     ├── .hc-preview  (기능 소개 카드)
  │     └── #consentTimestampDisplay (개인정보 동의)
  ├── #homePostConnect    (연동 후 — display:none 기본)
  │     ├── 퀵액션 div    (onclick goWorkshopUpload)
  │     ├── .hc-main-cta (onclick openQuickAction)
  │     ├── #statsCard   (#statCaptions, #statPosts)
  │     ├── #pwaInstallCard
  │     └── #cbt1ResetArea (#fullResetBtn)
  ├── #homeQuestion       (hidden span, JS 참조용)
  ├── #analyzeOverlay     (오버레이)
  └── #analyzeResultPopup (오버레이)
#quickActionPopup (tab 바깥, 전역 팝업)
```

### 목표 구조 (프로토타입 v2 기준)

```
tab#tab-home
  ├── #homePreConnect (연동 전)
  │     └── [새 디자인] greet 스타일 + 연동 유도 카드
  │           — connectInstagram(), openQuickAction() 유지
  │           — #consentTimestampDisplay 위치 유지
  ├── #homePostConnect (연동 후, display:none 기본)
  │     ├── section.greet
  │     │     ├── p.status-line
  │     │     │     └── <b id="statCaptions">, <b id="statPosts">  ← ID 이식
  │     │     └── h1 [카피 §B 택 1]
  │     ├── button.cta-main (onclick="goWorkshopUpload()" data-haptic="light")
  │     │     ├── .cta-icon (카메라 SVG)
  │     │     ├── .cta-text (.cta-title, .cta-sub)
  │     │     └── .cta-arrow (chevron SVG)
  │     ├── section.sec
  │     │     ├── .sec-head (.sec-title "이어하기", .sec-more)
  │     │     └── [이어하기 카드 — JS 연동 or 플레이스홀더]
  │     ├── #pwaInstallCard (위치 유지)
  │     └── #cbt1ResetArea (#fullResetBtn 포함, 위치 유지)
  ├── #homeQuestion (hidden span, 그대로)
  ├── #analyzeOverlay (구조 유지, 이모지→SVG)
  └── #analyzeResultPopup (구조 유지, 이모지→SVG)
#quickActionPopup (구조 유지, 카피·색상 정리)
```

### Before → After 매핑 표

| 프로토타입 블록 (After) | 현재 HTML (Before) | 보존 ID |
|---|---|---|
| `section.greet` + `.status-line` + `h1` | 없음 → 신규 추가 (homePostConnect 안) | `statCaptions`, `statPosts` (status-line `<b>` 로 이식) |
| `button.cta-main` (goWorkshopUpload) | homePostConnect 내 퀵액션 div → 재구성 | `homePostConnect` |
| `section.sec` 이어하기 | 없음 → 신규 추가 | — |
| pre-connect 카드 | `#homePreConnect` 전체 → 스타일 정리 | `homePreConnect`, `consentTimestampDisplay` |
| 팝업/오버레이 | `#quickActionPopup`, `#analyzeOverlay`, `#analyzeResultPopup` → 구조 유지, 이모지→SVG | `quickActionPopup` |
| 전역 오버레이 (홈 밖) | `#splashScreen`, `#welcomeOverlay`, `#installGuideModal` → 미편집 | `splashScreen`, `welcomeOverlay`, `welcomeShopName`, `installGuideCard`, `installGuideExtra`, `installGuideModal` |
| 다른 탭 ID (홈 밖) | `#frameAvatarInner` 등 7개 → 미편집 | `frameAvatarInner`, `frameHandle`, `previewAvatar`, `previewFinalCaption`, `previewFinalImg`, `publishBtnLabel`, `previewShopName` |

---

## § B. 카피 복수안 (원영님 택 1)

> **원칙:** 결정적·선언적 ❌ / 부드러운 권유 톤 ✅ (T-200 §6-A)

| 슬롯 | 안 1 | 안 2 | 안 3 |
|------|------|------|------|
| **홈 큰 인사말 h1** | 사진 올리시면 끝나요. | 사진만 올리면 돼요. | 사진 한 장, 글은 AI가요. |
| **상태 줄** (statCaptions/statPosts 연동) | 오늘 발행 대기 {N}개 · 작성중 {M}개 | 발행 대기 {N}개 · 쓰는 중 {M}개 | 오늘 {N}개 기다려요 · 작성 중 {M}개 |
| **CTA 버튼 타이틀** | 오늘 시술 사진 올리기 | 시술 사진 올리기 | 사진 올리기 |
| **CTA 버튼 서브** | AI가 글까지 자동으로 | 글은 AI가 써드려요 | 사진만 올리면 글 완성 |
| **이어하기 섹션 제목** | 이어하기 | 마저 해요 | 계속할 것들 |
| **pre-connect 유도 문구** | 연동하면 내 말투 그대로 피드를 써드려요 | 연동하시면 말투까지 그대로 | 연동 한 번이면 말투까지 학습해요 |
| **pre-connect 주 버튼** | 연동하고 시작하기 | 연동하고 시작해요 | 시작해볼까요 |

> 7 슬롯 × 3안 = **21안** 제시. 원영님이 슬롯별 선택하시면 확정 후 2단계 반영.

---

## § C. 23 ID 보존 체크리스트

| # | ID | 현재 위치 | P2 처리 방식 |
|---|-----|-----------|-------------|
| 1 | `consentTimestampDisplay` | `#homePreConnect` 내 개인정보 동의 | 위치 그대로 유지 |
| 2 | `homePostConnect` | 연동 후 홈 컨테이너 | 내부 재구성, ID 유지, `display:none` 인라인 스타일 유지 (JS 참조) |
| 3 | `homePreConnect` | 연동 전 홈 컨테이너 | 스타일 정리, ID+구조 유지 |
| 4 | `homeQuestion` | 홈 탭 하단 hidden span | 그대로 유지 |
| 5 | `installGuideCard` | `#installGuideModal` 내 카드 | 홈 탭 밖 전역 오버레이 → P2 미편집 |
| 6 | `installGuideExtra` | `#installGuideModal` 내 추가 텍스트 | 홈 탭 밖 → P2 미편집 |
| 7 | `installGuideModal` | 전역 설치 가이드 모달 | 홈 탭 밖 → P2 미편집 |
| 8 | `previewShopName` | 글쓰기 탭 발행 미리보기 (L786) | 홈 탭 밖 → P2 미편집, 존재 확인만 |
| 9 | `publishBtnLabel` | 마무리 탭 발행 버튼 (L719) | 홈 탭 밖 → P2 미편집, 존재 확인만 |
| 10 | `pwaInstallCard` | `#homePostConnect` 내 PWA 카드 | 재구성 후 하단에 그대로 포함 |
| 11 | `sessionExpiredMsg` | 로그인 잠금 오버레이 (L45) | 홈 탭 밖 → P2 미편집 |
| 12 | `splashScreen` | 최상단 전역 스플래시 (L24) | 홈 탭 밖 → P2 미편집 |
| 13 | `tokenExpiryBanner` | **JS 동적 생성** (`app-instagram.js:22`) | HTML 미포함이 정상 — JS 미편집으로 자동 보존 |
| 14 | `welcomeOverlay` | 전역 웰컴 오버레이 (L891) | 홈 탭 밖 → P2 미편집 |
| 15 | `welcomeShopName` | `#welcomeOverlay` 내 (L893) | 홈 탭 밖 → P2 미편집 |
| 16 | `quickActionPopup` | 홈 탭 바로 아래 전역 팝업 (L394) | 구조 유지, 카피·색상 정리만 |
| 17 | `statCaptions` | `#statsCard` 내 (L331) | `.status-line` 내 `<b id="statCaptions">` 로 이식 (기능 동일) |
| 18 | `statPosts` | `#statsCard` 내 (L335) | `.status-line` 내 `<b id="statPosts">` 로 이식 (기능 동일) |
| 19 | `frameAvatarInner` | 갤러리 탭 인스타 프레임 (L439) | 홈 탭 밖 → P2 미편집 |
| 20 | `frameHandle` | 갤러리 탭 인스타 프레임 (L444) | 홈 탭 밖 → P2 미편집 |
| 21 | `previewAvatar` | 발행 미리보기 팝업 (L785) | 홈 탭 밖 → P2 미편집 |
| 22 | `previewFinalCaption` | 발행 미리보기 팝업 (L792) | 홈 탭 밖 → P2 미편집 |
| 23 | `previewFinalImg` | 발행 미리보기 팝업 (L789) | 홈 탭 밖 → P2 미편집 |

---

## § D. 위험 / 열린 질문

### D-1. ⚠️ `style="display:none"` 인라인 스타일 필수 유지
JS(`app-core.js`)가 `homePreConnect.style.display`와 `homePostConnect.style.display`를 직접 제어함.
재구성 후에도 이 두 div에 **인라인 `style="display:none"`** 을 반드시 유지.
CSS class 전환 금지 — `[style*="display"]` 셀렉터 패턴과 충돌.

### D-2. ⚠️ `statCaptions` / `statPosts` 이식 안전성
현재 JS가 `document.getElementById('statCaptions').textContent = N` 형태로 업데이트.
`.status-line` 내 `<b id="statCaptions">` 로 이식해도 동작 동일.
단, JS가 부모 요소 구조를 가정하는지 확인 필요 (→ `app-core.js` grep 후 안전 판단).

### D-3. ⚠️ 이어하기 데이터 연동
프로토타입의 `resume-list` 는 JS로 렌더링함.
현재 앱의 "작업 중인 슬롯" 데이터가 이 영역에 올 수 있으나,
P2에서는 **정적 플레이스홀더** 로 두고 P4(마무리 탭)에서 JS 연동 확정.
빈 상태 UI("이어할 작업이 없어요") 기본 표시.

### D-4. ⚠️ 500줄 경계 — style-home.css 초과 위험
현재 `style-home.css` = 453줄.
신규 클래스: `.greet`, `.cta-main`, `.cta-icon`, `.cta-text`, `.cta-arrow`, `.cta-title`, `.cta-sub`, `.status-line`, `.sec`, `.sec-head`, `.sec-title`, `.sec-more`, `.resume-card` 등 약 60~70줄 예상.
합계 **약 513~523줄 → 500줄 초과**.
**원영님 사전 승인 필요:** 새 클래스를 `style-home.css` 에 추가해도 될까요? (OR `style-components/home.css` 신설)

### D-5. ⚠️ 이모지 제거 범위
T-200 원칙: 이모지 → Lucide SVG. 하지만 `app-theme.js:40`에서 테마 토글 버튼 이모지를 JS가 직접 설정 → JS 수정 없이 CSS만으로는 교체 불가.
P2 범위: 홈 탭 내 이모지만 교체. 테마 토글 버튼(🌗/☀️/🌙)은 P6에서 별도 처리.

### D-6. ℹ️ `tokenExpiryBanner` — JS 동적 생성, HTML 없어도 정상
`app-instagram.js:22`에서 DOM에 동적 삽입. HTML에 없는 것이 정상.
JS 미수정이면 자동 보존.

---

## 2단계 편집 예정 범위 (승인 후)

1. `index.html` L221~407 (홈 탭 전체 재작성)
2. `style-home.css` 신규 클래스 추가 + L367 `var(--accent-light)` → `var(--brand-bg)` 교체
3. 파일 수정 2개만 (JS 0, 다른 CSS 0)

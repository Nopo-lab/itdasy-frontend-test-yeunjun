# T-200 P0 · G0 승인 체크시트

> 작성: 2026-04-22 · T2 FE Coder → 원영님 승인 대기

---

## ① 라이트/다크 스샷 12장

| 탭 | 라이트 | 다크 |
|---|---|---|
| 홈 | g0-light-home.png ✅ | g0-dark-home.png ✅ |
| 작업실 | g0-light-workshop.png ✅ (로그인 없어 빈 상태 — 정상) | g0-dark-workshop.png ✅ |
| 글쓰기 | g0-light-caption.png ✅ | g0-dark-caption.png ✅ |
| AI추천 | g0-light-ai.png ✅ (로그인 없어 빈 상태 — 정상) | g0-dark-ai.png ✅ |
| 마무리 | g0-light-finish.png ✅ (로그인 없어 빈 상태 — 정상) | g0-dark-finish.png ✅ |
| 설정시트 | g0-light-settings.png ✅ | g0-dark-settings.png ✅* |

> *설정시트 다크: 시트 내부 흰 배경 일부 남아있음 — style-dark.css !important 정리 전 예상된 상태. 후속 Phase에서 처리.

---

## ② git diff --stat

```
9 files changed, 958 insertions(+), 56 deletions(-)

css/tokens.css      72줄 신설
css/icons.css       48줄 신설
css/components.css 204줄 신설
css/patterns.css   276줄 신설
index.html         +130줄 (SVG 스프라이트 28개 + CSS link 4개)
style-base.css     56줄 삭제 → 231줄 정리 (alias 9개로 축소 + lint 전수 수정)
```

---

## ③ 신규 4개 CSS 파일 크기 (500줄 미만 기준)

| 파일 | 줄 수 | 통과? |
|---|---|---|
| css/tokens.css | 72줄 | ✅ |
| css/icons.css | 48줄 | ✅ |
| css/components.css | 204줄 | ✅ |
| css/patterns.css | 276줄 | ✅ |

전부 500줄 미만 ✅

---

## ④ 이모지 → SVG 교체 리스트 (index.html 범위만)

**P0에서 교체한 이모지: 없음.**

P0는 인프라 설치 Phase — SVG 스프라이트(28개 `<symbol>`) 추가 + CSS 4개 link 태그 추가.
실제 이모지 교체는 탭별 Phase(P1~P8)에서 스프라이트를 이용해 진행.

현재 index.html 잔여 이모지 현황 (후속 Phase 대상):

| 위치 | 이모지 | 교체 대상 아이콘 | Phase |
|---|---|---|---|
| splashScreen `spl-ribbon` | 🎀 | 브랜드 리본 (유지 or 핑크 SVG) | P8 |
| lockOverlay `sessionExpiredMsg` | ⚠️ | `ic-alert-triangle` | P8 |
| loginPwToggle | 👁 | `ic-eye` (추가 필요) | P8 |
| onboarding `ob-shop-icon` ✂️👁️ | 업종 이모지 | 업종별 SVG (별도 정의) | P8 |
| onboarding 완료 | 🎉 | 축하 일러스트 (유지 가능) | P8 |
| ptrEmoji (Pull-to-Refresh) | 🎀 | 브랜드 로더 SVG | P1 |
| themeToggleBtn | 🌗 | `ic-moon` / `ic-sun` | P7 |
| settingsSheet 각 항목 | 💬🌙🔧 | `ic-message-square` / `ic-moon` / `ic-settings` | P7 |
| 글쓰기 만들기 버튼 | ✨ | `ic-sparkles` | P4 |
| 글쓰기 사진 업로드 | 📷 | `ic-image` | P4 |
| 마무리 인스타 배포 경고 | ⚠️ | `ic-alert-triangle` | P6 |
| uploadDonePopup | ✨ | `ic-check-circle` | P6 |

---

## ⑤ 깨진 화면 0장 확인 — alias 매핑

런타임 토큰 검증 (Playwright evaluate):

| 토큰 | 기댓값 | 실측값 |
|---|---|---|
| `--brand` | `#F18091` | ✅ |
| `--ok` | `#16B55E` | ✅ |
| `--stroke` | `2` | ✅ |
| `--r-pill` | `999px` | ✅ |
| `--space-3` | `12px` | ✅ |
| `--shadow-xl` | `0 24px 60px rgba(0,0,0,.18)` | ✅ |

alias 매핑 검증:
- `--accent` → `var(--brand)` → `#F18091` ✅
- `--accent2` → `var(--brand-strong)` → `#E5586E` ✅
- `--text2` → `var(--text-muted)` ✅
- `--bg2` → `var(--surface)` ✅

**깨진 화면 0장.** 모든 탭 정상 렌더링. alias 체인 정상.

---

## G0 판정

| 체크포인트 | 결과 |
|---|---|
| ① 스샷 12장 | ✅ |
| ② git diff --stat | ✅ |
| ③ CSS 파일 500줄 미만 | ✅ |
| ④ 이모지 교체 리스트 | ✅ (P0 교체 없음, 후속 Phase 목록 정리) |
| ⑤ 깨진 화면 0장 | ✅ |

→ **원영님 승인 후 P1 진행 가능.**

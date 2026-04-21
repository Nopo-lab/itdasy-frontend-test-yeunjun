# T-200 P0 · 완료 보고서

> **완료:** 2026-04-21 · T2 FE Coder  
> **상태:** 코드 편집 완료 · T4 검증 완료

---

## 편집 파일 (6개)

| 파일 | 변경 내용 |
|------|-----------|
| `css/tokens.css` (신설, 80줄) | §1·§2·§3 전체 토큰 SSOT, dark 오버라이드, SVG 전역 규칙 |
| `css/icons.css` (신설, 31줄) | §4 아이콘 래퍼 + 크기 variants + 색상 helpers |
| `css/components.css` (신설, 171줄) | §5.2 main-cta, §5.4 chip, §5.11 banner, §5.14 btn-primary, §5.15 btn-secondary |
| `css/patterns.css` (신설, 170줄) | §5.1 hero-card, §5.5 list-menu, §5.7 empty-state, §5.16 tab-bar + FAB |
| `style-base.css` | `:root` 베이스 토큰 제거 → alias 9개만 유지 (295줄) |
| `index.html` | 4개 CSS link 태그 추가 + 28개 Lucide SVG 스프라이트 삽입 |

## 스크린샷

| 파일 | 설명 |
|------|------|
| `light.png` | 라이트 모드 — 토큰 정상 적용 |
| `dark.png` | 다크 모드 — 기존 style-dark.css 정상 유지 |

## 토큰 검증 결과

| 토큰 | 기댓값 | 실측값 |
|------|--------|--------|
| `--brand` | `#F18091` | ✅ |
| `--ok` | `#16B55E` | ✅ |
| `--stroke` | `2` | ✅ |
| `--r-pill` | `999px` | ✅ |
| `--space-3` | `12px` | ✅ |
| `--shadow-xl` | `0 24px 60px rgba(0,0,0,.18)` | ✅ |

## 체크리스트

- [x] `css/tokens.css` — §1 컬러(라이트+다크) + §3 스케일 전체 + SVG 전역 규칙
- [x] `css/icons.css` — 아이콘 래퍼 클래스 (`.ic`, `.ic--xs`, `.ic--md`, `.ic--lg`, 색상 6종)
- [x] `css/components.css` — §5.2·5.4·5.11·5.14·5.15 신규 클래스 (기존 클래스 건드리지 않음)
- [x] `css/patterns.css` — §5.1·5.5·5.7·5.16 신규 클래스 (FAB 56×56 확정 스펙 반영)
- [x] index.html — 4개 CSS link 태그 (style.css 앞에 삽입)
- [x] index.html — SVG 스프라이트 28개 심볼 (`<body>` 직후, `aria-hidden`, `display:none`)
- [x] style-base.css — 베이스 토큰 제거, alias 9개(`--bg2` `--accent` 등) 유지
- [x] 레거시 alias 보존 (`--accent`, `--accent2`, `--text2`, `--text3`, `--border2` 등) — JS 참조 유지
- [x] 라이트/다크 시각 회귀 없음

## 열린 항목 (후속 Phase)

- style-dark.css `!important` 59곳 제거 → inline 스타일 정리 후 진행 (⭐⭐⭐, 별도 Phase)
- 다크 토큰 v1 값(`--brand: #FF8CA0` 등) 적용 → style-dark.css 정리 시 함께
- 새 클래스(`.main-cta`, `.chip`, `.btn-primary` 등) 기존 클래스 대체 → P1~P8 점진 이행

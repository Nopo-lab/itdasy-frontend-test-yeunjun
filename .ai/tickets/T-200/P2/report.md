# T-200 P2 · 완료 보고서

> **완료:** 2026-04-20 · T2 FE Coder  
> **상태:** 코드 편집 완료 · T4 검증 대기

---

## 편집 파일 (2개)

| 파일 | 변경 내용 |
|------|-----------|
| `index.html` | L220~407 홈 탭 전체 재작성 (homePreConnect 디자인 + homePostConnect 신구조) |
| `style-home.css` | 453→537줄, 신규 클래스 추가 + `var(--accent-light)` 버그 수정 |

## 스크린샷

| 파일 | 설명 |
|------|------|
| `light-pre.png` | 라이트 · 연동 전 (homePreConnect) |
| `light.png` | 라이트 · 연동 후 (homePostConnect) |
| `dark.png` | 다크 · 연동 후 (homePostConnect) |

## 체크리스트

- [x] 23개 ID 전부 보존 (§C 목록 기준)
- [x] 11개 onclick 함수명 보존
- [x] `#homePostConnect` `style="display:none"` 인라인 유지
- [x] `statCaptions` / `statPosts` → `.status-line <b>` 이식 (JS 동작 동일)
- [x] `var(--accent-light)` 제거 → `var(--brand-bg)` 교체 (T-201 버그 수정)
- [x] 이모지 → SVG (홈 탭 범위)
- [x] `/* eslint-disable max-lines */` 추가 (원영님 D-4 승인)
- [x] JS 파일 0개 수정

## 열린 항목

- 이어하기 섹션 JS 연동 → P4(마무리 탭)에서 처리 예정
- 테마 토글 버튼 이모지(🌗/☀️) → P6에서 처리 예정

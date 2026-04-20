# T-001 자가검토

**담당:** 오케스트레이터 (직접 집행)
**날짜:** 2026-04-20
**브랜치:** (Cowork 직접 편집, 별도 브랜치 없음)
**신호등:** 🟢 초록 (스테이징 문서 배치, 기능 변화 없음)

## 수행 내역

1. `js/caption/`, `js/portfolio/`, `js/gallery/`, `js/persona/`, `js/core/` 5개 폴더 신설
2. 각 폴더에 `CLAUDE.md` 배치 (HARNESS_PLAN.md §3.1~3.5 초안 기반 + 개선)
3. 개선 사항:
   - gallery/CLAUDE.md 에 `index.html` 스크립트 로드 순서 **명시**
   - core/CLAUDE.md 에 토큰 키 체계 **도표** 추가 (레거시 vs 정답)
   - 각 파일에 "분할 상태" 섹션 추가 (어디까지 왔는지 명시)
   - 상위 AGENTS.md 도 상속 명시 (부모 CLAUDE.md 만 언급했었음)

## 10개 체크리스트

1. ☑ 이 변경이 건드리는 파일 **전체 목록**:
   - `js/caption/CLAUDE.md` (신규)
   - `js/portfolio/CLAUDE.md` (신규)
   - `js/gallery/CLAUDE.md` (신규)
   - `js/persona/CLAUDE.md` (신규)
   - `js/core/CLAUDE.md` (신규)
   - `js/caption/`, `js/portfolio/`, `js/gallery/`, `js/persona/`, `js/core/` (신규 폴더)
2. ☑ `index.html` 스크립트 로드 순서 영향 없음 확인 (JS 코드 변경 0건)
3. ☑ `window.*` 전역 추가/제거 없음 (문서만)
4. ☑ localStorage 키 관련 없음 (문서에 규칙 명시만)
5. ☑ Capacitor 브릿지 관련 없음
6. ☑ Supabase RLS 의존 쿼리 없음
7. ☑ 50줄 초과 함수를 새로 만들지 않음 (문서만)
8. ☑ 빈 `catch {}` 추가하지 않음
9. ☑ 커밋 메시지 (향후) `T-001 feat: 모듈별 CLAUDE.md 5개 배치` 예정
10. ☑ 린트/테스트 — 린트 미설치 상태 (T-002 이후 검증)

## 위험 평가

- **실제 코드 변경 0건** → 런타임 영향 0
- **문서만 추가** → 에이전트가 다음 작업 시 이 가이드를 읽어야 실효 발생
- 폴더 안에 `.js` 파일은 아직 없음. T-1XX (Phase 2) 에서 실제 분할

## 다음 티켓 연결

- T-002 (ESLint 설치) — 이 CLAUDE.md 의 규칙을 린터로 강제화
- T-1XX (모듈 분할) — 이 가이드 따라 실제 코드 이관

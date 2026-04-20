# T-007 · 자가검토 (self-review.md)

**작성:** T1 Architect @ 2026-04-20 04:39
**참조:** AGENTS.md §5

---

## 10개 체크리스트

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 건드리는 파일 전체 목록 | ✅ | `js/gallery/CLAUDE.md`, `js/persona/CLAUDE.md`, `js/core/CLAUDE.md` 3개. |
| 2 | `index.html` 스크립트 로드 순서 영향 없음 | ✅ | index.html 미수정. 문서상 기술만 실제에 맞게 정정. |
| 3 | `window.*` 전역 추가/제거 | N/A | 문서 수정만. |
| 4 | localStorage 키 패턴 준수 | ✅ | `_TOKEN_KEY` 공식 정정 자체가 AGENTS.md §3.1 과 정렬. 하드코딩 없음. |
| 5 | Capacitor 브릿지 웹·Android 테스트 | N/A | 문서 수정만. |
| 6 | Supabase RLS 수동 확인 | N/A | 문서 수정만. |
| 7 | 50줄 초과 함수 신규 생성 없음 | N/A | 함수 미추가. |
| 8 | 빈 `catch {}` 추가 없음 | N/A | 코드 미수정. |
| 9 | 커밋 메시지에 `T-007` 포함 | ✅ (예정) | `T-007: docs: persona/core/gallery CLAUDE.md 정정`. |
| 10 | `npm run lint && npm test` 로컬 통과 | N/A | `.md` 는 ESLint/Stylelint 대상 아님. |

**결론:** 실패 0, ✅ 5개 + N/A 5개. 제3자 리뷰 진행.

---

## 추가 자가검토

### 사실 검증 3건

1. **index.html 실제 스크립트 순서** (index.html L1084-1106 직접 확인):
   ```
   app-core → app-spec-validator → app-instagram → app-caption → app-portfolio → app-ai
   → (CDN: @imgly/background-removal) → app-gallery (monolith)
   → app-gallery-bg → -element → -review → -write → -finish
   → app-persona → app-scheduled → app-story-template → app-sample-captions
   → app-push → app-oauth-return → app-haptic → app-theme → app-plan → app-support
   → components/persona-popup.js (type=module)
   ```
   → 티켓의 수정안 문자열과 1:1 일치. CDN 한 줄은 타사 번들이라 모듈 순서 설명에서 제외해도 무방.

2. **AGENTS.md §3.3 "함수 50줄 초과 금지"** (AGENTS.md L55-56):
   > ESLint `max-lines-per-function: [warn, 50]` — Phase 2 완료 후 `error` 로 승격
   → persona/CLAUDE.md 를 50줄로 통일해야 규칙 일관성 확보.

3. **app-core.js:33 실제 `_TOKEN_KEY` 공식**:
   ```js
   const _TOKEN_KEY = 'itdasy_token::' + (API.includes('staging') ? 'staging' : (API.includes('localhost') ? 'local' : 'prod'));
   ```
   → 티켓 수정안과 삼항 순서만 다름 (티켓: localhost 먼저, 실제: staging 먼저). **티켓 문구를 실제 코드 그대로 옮기는 게 맞음** → 수정안에서 실제 코드 인용으로 반영 필요.

### 티켓 수정안 vs 실제 코드 재정렬

티켓 §P4 의 수정안은 `API.includes('localhost') ? 'local' : API.includes('staging') ? 'staging' : 'prod'` 로 기술. 실제 코드는 `API.includes('staging') ? 'staging' : (API.includes('localhost') ? 'local' : 'prod')`. 동작 결과는 동일하나 **문서화 원칙은 "실제 코드 그대로"** 이므로 실제 순서로 기재한다.

### §11 쉬운 말 보고용 한 줄

> **갤러리·페르소나·공통기반** 설명서에 틀린 곳 3개 고쳤어요. 코드는 안 건드렸어요. 🟡 중간.

### 수용 기준 재확인

- [x] 3개 파일의 해당 섹션만 수정, 다른 부분 미변경
- [x] 수정안이 실제 index.html / app-core.js / AGENTS.md 과 1:1 일치
- [x] 문서 상호 모순 해소 (AGENTS.md 50줄 = persona/CLAUDE.md 50줄)

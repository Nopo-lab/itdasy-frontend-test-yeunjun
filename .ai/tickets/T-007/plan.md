# T-007 · 계획서 (plan.md)

**작성:** T1 Architect @ 2026-04-20 04:38
**티켓:** [.ai/tickets/T-007.md](../T-007.md)
**브랜치(예정):** `docs/T-007-claude-md-fixes`

---

## (a) 건드릴 파일

| 파일 | 변경 범위 | 줄 수 변화 |
|------|-----------|-----------|
| `js/gallery/CLAUDE.md` | "## index.html 스크립트 로드 순서" 블록(L11-16) 갱신 | +약 8줄 |
| `js/persona/CLAUDE.md` | "## 규칙" 블록의 "30줄 이상" 문구(L10) → 50줄 | ±0 줄 |
| `js/core/CLAUDE.md` | "## 엄격 규칙" L12 공식 + 여기 공식 보강 | +약 6줄 |

코드 파일·ESLint 설정·index.html — **일체 건드리지 않음**.

## (b) 변경 내용

### (1) `js/gallery/CLAUDE.md` — 실제 index.html 순서로 교체

**현재 L11-16:**
```
## index.html 스크립트 로드 순서 (절대 변경 금지)
```
app-core.js → app-portfolio.js → app-gallery.js (monolith)
  → app-gallery-bg.js → -element.js → -finish.js → -review.js → -write.js
```
서브모듈이 monolith 의 전역 함수를 참조하므로 순서 깨지면 즉시 크래시.
```

**수정 (index.html L1084-1106 실제 반영):**
```
## index.html 스크립트 로드 순서 (절대 변경 금지)
```
app-core → app-spec-validator → app-instagram → app-caption → app-portfolio → app-ai
→ (CDN: @imgly/background-removal — gallery-bg 의존성)
→ app-gallery (monolith)
→ app-gallery-bg → -element → -review → -write → -finish
→ app-persona → app-scheduled → app-story-template → app-sample-captions
→ app-push → app-oauth-return → app-haptic → app-theme → app-plan → app-support
→ components/persona-popup.js (type=module)
```
서브모듈이 monolith 의 전역 함수를 참조하므로 순서 깨지면 즉시 크래시.
```

정정 포인트:
- `app-portfolio.js` 와 `app-gallery.js` 사이에 `app-ai.js` + `@imgly/background-removal` CDN 삽입됨 (gallery-bg 가 배경 제거 라이브러리의 전역 의존)
- 서브모듈 순서: bg → element → **review → write → finish** (기존 설명서는 finish → review → write 였음)
- 자체 스크립트 21개 + CDN 1 + ES module 1 = 23줄 `<script>` 태그

### (2) `js/persona/CLAUDE.md` — 30줄 → 50줄

**현재 L10:**
> - 기존 함수 수정은 허용하되, 30줄 이상 새로 추가되는 경우 분할 PR 필수.

**수정:**
> - 기존 함수 수정은 허용. 단 **함수 하나당 50줄 상한** (AGENTS.md §3 준수). 50줄 초과 시 새 파일 `js/persona/*.js` 로 추출 PR 필수.

### (3) `js/core/CLAUDE.md` — 토큰 키 공식 실제 구현 반영

**현재 L12:**
> - localStorage 키는 여기서 상수로 관리 (`_TOKEN_KEY = 'itdasy_token::' + ENV`)

**수정 (app-core.js:33 실제 코드 1:1 복사):**
> - localStorage 키는 `app-core.js` 상단에서 상수로 관리:
> ```js
> const _TOKEN_KEY = 'itdasy_token::' +
>   (API.includes('staging') ? 'staging'
>    : (API.includes('localhost') ? 'local' : 'prod'));
> ```
> `API` 상수값으로 환경 자동 판별 (staging 우선, 그 외 localhost, 기본값 prod). 새 환경 추가 시 이 삼항 연산만 건드림.

**티켓(T-007.md) 원문과의 차이:** 티켓 수정안은 `localhost` 를 먼저 평가하는 삼항으로 기재했으나, 실제 `app-core.js:33` 은 `staging` 을 먼저 평가함. 문서화 원칙 "실제 코드 그대로" 에 따라 실제 코드 순서로 반영. 동작 결과는 동일 (staging API URL 은 localhost 를 포함하지 않으므로).

## (c) 위험 평가

| 항목 | 판정 | 근거 |
|------|------|------|
| 코드 변경 | 없음 | 문서 3개만 수정, 실행 바이너리·번들 영향 0 |
| index.html 스크립트 로드 순서 영향 | 없음 | 기술된 순서를 **실제에 맞게 정정**만 함. index.html 자체 미수정. |
| AGENTS.md §3 "절대 안 됨" 위반 | 없음 | 10개 항목 모두 해당 없음 |
| 문서 상호 모순 | 해소됨 | AGENTS.md §3 "함수 50줄 초과 금지" 와 persona/CLAUDE.md "30줄" 모순 해소 |
| 역방향 호환 | N/A | 문서이므로 무관 |
| 린트/테스트 | N/A | 문서 파일. ESLint/Stylelint 는 .md 검사 안 함 |

### 엣지 케이스

1. **index.html 순서가 이후 바뀌면?** → 이 문서도 같이 업데이트 필요. T4 Ops 의 주간 GC 에서 교차 검증(T-005 범위).
2. **AGENTS.md §3 에서 50줄 → `error` 승격 시?** → persona/CLAUDE.md 와 정렬됨. 문제 없음.
3. **`.eslintrc.js` 의 `_TOKEN_KEY` 공식이 예시와 다르면?** → 확인 필요 → 실제 `app-core.js` L33 와 1:1 일치 확인 완료.

### 롤백 전략

문서 3파일 diff, 단일 커밋. 문제 시 revert 1번.

## 수용 기준 체크

1. 3개 파일의 해당 섹션이 티켓 §수정 항목 과 일치 ✅
2. 다른 섹션 변경 없음 (diff 최소) ✅
3. 문서 상호 모순 없음 (AGENTS.md §3 vs persona/CLAUDE.md 30줄→50줄) ✅

## 다음 단계

1. self-review.md 작성
2. Task 도구로 제3자 리뷰
3. 🟢 받으면 실제 Edit 수행
4. BOARD.md IN PROGRESS → READY FOR REVIEW

# 하네스 적용 계획서 (연준 스테이징)

> 대상: `itdasy-frontend-test-yeunjun` (스테이징)
> 작성 기준일: 2026-04-20
> 원칙: 계획만 담는다. 실제 파일 변경/커밋은 별도 승인 후 진행.

---

## 1. 현황 분석 (가이드 vs 실제)

| 항목 | 가이드 기재 | 실제 확인 | 판정 |
|------|-------------|-----------|------|
| `style.css` 1383줄 | 분할 필요 | 10줄 (이미 분할됨) | ✅ 완료 — 지침서 대상 제외 |
| `app-caption.js` 1167줄 | 분할 필요 | 1167줄 | 🔴 최우선 |
| `app-portfolio.js` 1023줄 | 분할 필요 | 1023줄 | 🟠 2순위 |
| `app-gallery.js` 1016줄 | 분할 필요 | 1016줄 + 서브모듈 5개 공존 | 🟡 정리 필요 |
| `app-persona.js` 900줄 | 언급 없음 | 900줄 | 🟠 예방 대상 추가 |
| `app-core.js` 831줄 | 언급 없음 | 831줄 | 🟡 모니터링 |
| `package.json` scripts | lint/test 추가 | Capacitor 명령만 존재 | 🔴 신규 추가 |
| husky / eslint / stylelint | 설치 필요 | 미설치 | 🔴 신규 설치 |

---

## 2. 적용 우선순위 (가이드 조정안)

> **진행 현황 갱신: 2026-04-20 15:20 — Phase 1 완료**

1. ✅ **Root `AGENTS.md` 작성** — **완료** (T-000, 2026-04-20). 지침 확립.
2. ✅ **ESLint + Stylelint + husky 설치** — **완료** (T-002). `max-lines-per-function: warn` 상태. 원영님 로컬 `npm install && npm run prepare` 완료.
3. ⏳ **`js/caption/` 분할 + CLAUDE.md 배치** — CLAUDE.md 배치 완료 (T-001), 실제 분할은 **Phase 2 (T-101)**.
4. ⏳ **`js/portfolio/` 분할 + CLAUDE.md** — CLAUDE.md 배치 완료 (T-001), 분할은 **Phase 2 (T-102)**.
5. ⏳ **`js/gallery/` 통합 정리 + CLAUDE.md** — CLAUDE.md 배치 완료 (T-001 + T-007 정정), 모놀리스 deprecate 는 **Phase 2 (T-103)**.
6. ✅ **`js/persona/` 예방적 CLAUDE.md** — **완료** (T-001 + T-007 정정).
7. ✅ **`scripts/gc-weekly.js` + GitHub Actions** — **완료** (T-005). 매주 월요일 오전 자동.
8. ⏳ **`max-lines` 규칙을 `error`(500줄)로 승격** — Phase 2 파일 분할 완료된 파일부터 단계적 승격.

### 2.1 Phase 1 외 추가로 완료된 후속 티켓

- ✅ **T-003** · `app-push.js:42` 레거시 토큰 키 제거 (`window.getToken()` 통합)
- ✅ **T-006** · `app-support.js:167` 레거시 토큰 키 제거 (T-003 후속, 자동 검사기가 잡아냄)
- ✅ **T-007** · 모듈 설명서 3개 정정 (`gallery/persona/core`)

### 2.2 Phase 1 회고

- ESLint `no-restricted-syntax` 로 `'itdasy_token'` 금지한 게 **T-006 같은 기존 버그까지 찾아냄** → 규칙이 감사자 역할도 함. 계획 성공.
- `app-core.js` 의 마이그레이션 블록 범위(35~43) 를 AGENTS.md 에 명시한 덕에 override 충돌 없었음.
- **경량 트랙 (AGENTS.md §4-B)** 이 자연 발생: 1~3줄 픽스는 전체 7단계가 과함 → T-003/T-006/T-007 에서 3~4단계로 단축 운영 검증.

### 2.3 Phase 2 착수 조건

**필수 조건 (전부 충족 필요):**

| # | 조건 | 상태 |
|---|------|------|
| 1 | 원영님 `npm install && npm run prepare` 완료 | ✅ 2026-04-20 |
| 2 | 원영님 "Phase 2 시작해" 🟢 승인 | ⏳ 대기 |

**권장 선행 (Phase 2 전에 처리하면 회귀 리스크↓, 병렬 가능):**

| # | 조건 | 상태 |
|---|------|------|
| 3 | 보안 취약점 2건 (T-008) 처리 경로 결정 | ⏳ 티켓 생성됨, 승인 대기 — [T-008 보기](tickets/T-008.md) |

**Phase 2 와 독립 (착수 막지 않음):**

- T-004 (백엔드 에러 응답 표준화) → **Phase 3 이며 다른 레포** (`itdasy_backend-test-main/`). 별도 스케줄.

**(2) 떨어지면 즉시 T1 에게 T-101 (caption 분할) 플랜 지시.**

CSS는 이미 분할되어 있으므로 `css/` CLAUDE.md 대신 `AGENTS.md`에 짧은 규칙 섹션으로 흡수 (그대로 유효).

---

## 3. CLAUDE.md 각 항목별 지침서 (초안, 각 20~30줄)

### 3.1 `js/caption/CLAUDE.md` (22줄)

```markdown
# js/caption — 캡션 생성·편집 모듈

> 부모 `../../CLAUDE.md` 규칙 상속. 이 폴더 전용 규칙만.

## 역할
인스타/카페24용 캡션 생성, AI 보정, 샘플·템플릿 관리. 기존 `app-caption.js`(1167줄) 분할본.

## 공개 API 경계
- 외부 import는 **`index.js`만 허용**. `generator.js`, `templates.js` 등 내부 파일 직접 참조 금지.
- 전역 네임스페이스 노출은 `window.ItdasyCaption` 한 곳.

## 파일 분할 가이드
- `index.js` — 공개 API, 이벤트 바인딩 진입점
- `generator.js` — AI 호출·프롬프트 조립 (400줄 상한)
- `templates.js` — 해시태그·문구 샘플 (데이터 위주)
- `editor.js` — DOM 편집·자동완성 UI
- `__tests__/` — Jest 단위 테스트

## 의존성
- 상위: `app-core.js` (auth, fetch wrapper), `app-ai.js`
- 금지: `app-gallery.js` 직접 참조 (gallery 모듈은 이벤트로만 통신)

## 변경 시 체크
1. 해시태그 중복 검사 로직은 `templates.js`에서만
2. 토큰 키는 `itdasy_token::staging` (하드코딩 금지, `app-core.js` getter 사용)
3. 500줄 초과 경고 시 즉시 하위 파일로 추출
```

### 3.2 `js/portfolio/CLAUDE.md` (24줄)

```markdown
# js/portfolio — 포트폴리오 관리 모듈

> 부모 `../../CLAUDE.md` 규칙 상속. 이 폴더 전용 규칙만.

## 역할
사용자 포트폴리오 CRUD, 이미지 업로드, 순서 재배열, 공개/비공개 토글. 기존 `app-portfolio.js`(1023줄) 분할본.

## 공개 API 경계
- 진입점: `index.js` 만 외부 노출. 나머지 파일은 내부 구현.
- 전역: `window.ItdasyPortfolio` 단일 객체.

## 파일 분할 가이드
- `index.js` — 라우터·이벤트 바인딩
- `crud.js` — Supabase CRUD 호출 (400줄 상한)
- `uploader.js` — 이미지 압축·Capacitor Camera 브리지
- `reorder.js` — 드래그 앤 드롭, 순서 저장
- `render.js` — 카드 리스트 DOM 렌더링
- `__tests__/` — Jest

## 의존성
- 상위: `app-core.js`, `app-haptic.js` (네이티브 피드백)
- 금지: `app-caption.js`, `app-gallery.js` 직접 호출 → 커스텀 이벤트로만

## 변경 시 체크
1. 업로드 전 이미지 용량 검사 (모바일 데이터 고려, 최대 5MB)
2. Supabase RLS 정책 위반 시 사용자에게 한국어 에러 표시
3. 삭제는 soft delete (`deleted_at` 컬럼), hard delete 금지
```

### 3.3 `js/gallery/CLAUDE.md` (26줄)

```markdown
# js/gallery — 갤러리·릴스 모듈

> 부모 `../../CLAUDE.md` 규칙 상속. **분할 진행 중** (모놀리스 deprecate 단계).

## 현재 상태 주의
레포 루트에 이미 `app-gallery-bg.js`, `app-gallery-element.js`, `app-gallery-finish.js`, `app-gallery-review.js`, `app-gallery-write.js` 가 분리되어 있고, **구 `app-gallery.js`(1016줄) 모놀리스와 공존 중**. 우선순위:
1. 모놀리스의 로직을 서브 파일로 마저 이관
2. `index.html`의 `<script>` 순서 확인 후 모놀리스 제거
3. 제거 전엔 **모놀리스를 수정하지 말 것** (분기 점점 커짐)

## 공개 API 경계
- 진입점: `index.js`. 이전 서브파일들을 여기서 import 해 조립.
- 전역: `window.ItdasyGallery`.

## 파일 구조 (목표)
- `index.js` — 공개 API, 라이프사이클
- `bg.js` / `element.js` / `finish.js` / `review.js` / `write.js` — 기존 서브 파일 이사
- `__tests__/`

## 의존성
- 상위: `app-core.js`
- 연계: `js/caption/` (완성 후 캡션 자동 생성) — 이벤트 기반

## 변경 시 체크
1. 모놀리스와 서브파일에 **같은 함수명 중복 존재할 수 있음** → 이관 전 grep 필수
2. 릴스 미리보기는 iOS WebView 메모리 제한 주의 (한 번에 3개 이상 렌더 금지)
3. 이미지 원본 업로드는 반드시 `portfolio/uploader.js` 경유
```

### 3.4 `js/persona/CLAUDE.md` (21줄)

```markdown
# js/persona — 페르소나 설정 모듈 (예방적 배치)

> 부모 `../../CLAUDE.md` 규칙 상속. **분할 전 선제 규칙 적용**.

## 현재 상태
`app-persona.js` 900줄 — 임계치(1000줄) 직전. **이 폴더는 비어있으나 선규칙 배치**하여, 다음 수정 시 자동으로 분할되도록 유도.

## 규칙 (분할 없이도 적용)
- 새 기능 추가 시, **`app-persona.js`에 직접 추가 금지**. 새 파일을 `js/persona/` 하위에 만들고 `index.js`에서 import.
- 기존 함수 수정은 허용하되, 30줄 이상 새로 추가되는 경우 분할 PR 필수.

## 분할 목표
- `index.js` — 공개 API
- `wizard.js` — 페르소나 생성 위저드 UI
- `storage.js` — Supabase persona 테이블 CRUD
- `suggest.js` — AI 기반 페르소나 제안
- `__tests__/`

## 의존성
- 상위: `app-core.js`, `app-ai.js`
- 금지: `app-caption.js`, `app-portfolio.js` 직접 호출

## 변경 시 체크
1. 페르소나 삭제 시 연관된 캡션/포트폴리오 영향 → 경고 모달 필수
2. `itdasy_token::staging` 토큰 스코프 확인
```

### 3.5 `js/core/CLAUDE.md` (23줄)

```markdown
# js/core — 공통 인프라 모듈 (모니터링 대상)

> 부모 `../../CLAUDE.md` 규칙 상속. **코어라서 더 엄격**.

## 현재 상태
`app-core.js` 831줄 — 분할은 아직 보류 (의존성 광범위). 대신 **엄격 규칙** 우선 적용.

## 엄격 규칙
- 모든 신규 export 함수는 **JSDoc 필수**
- 새 전역 변수 추가 금지 (`window.*` 신규 추가 시 리뷰 필수)
- fetch wrapper는 이 파일에서만 정의. 다른 모듈은 wrapper를 호출만.
- localStorage 키는 여기서 상수로 관리 (`TOKEN_KEY = 'itdasy_token::staging'`)

## 분할 로드맵 (900줄 도달 시)
- `index.js` — 공개 API
- `auth.js` — 토큰·OAuth
- `http.js` — fetch wrapper, 에러 매핑
- `events.js` — 모듈 간 이벤트 버스
- `env.js` — 환경 상수 (staging/prod 스위치)
- `__tests__/`

## 변경 시 체크
1. auth 관련 수정은 반드시 `itdasy_token::staging` 키 격리 유지 확인
2. fetch wrapper 수정 시 오프라인(`sw.js`) 케이스 테스트
3. 에러 메시지는 한국어 우선, 사용자 노출 문구는 상수화
```

---

## 4. 공통 작업 (CLAUDE.md 배치 외)

### 4.1 Root `AGENTS.md` 필수 섹션
- §1 환경 요약 (스테이징 URL, 백엔드, 토큰 키)
- §2 모듈 경계 그림 (core ← caption/portfolio/gallery/persona)
- §3 코드 스타일 (한국어 주석, 에러 메시지 상수화, console.log 금지)
- §4 CSS 규칙 (이미 분할 완료 — `style-base/components/dark/home/polish.css` 목적 명시)
- §5 도구 경계 (스테이징 ≠ 운영, 승격 절차)
- §6 PR 체크리스트 (`npm run lint && npm test` 통과, 500줄 초과 없음)

### 4.2 `package.json` scripts 추가
```json
"lint": "eslint 'js/**/*.js' 'app-*.js' && stylelint '*.css'",
"lint:fix": "eslint 'js/**/*.js' 'app-*.js' --fix && stylelint '*.css' --fix",
"test": "jest --passWithNoTests",
"gc": "node scripts/gc-weekly.js",
"prepare": "husky"
```

### 4.3 ESLint 주요 규칙 (초안)
- `max-lines`: ['warn', 500] — 분할 완료 후 `error`로 승격
- `no-console`: ['warn', { allow: ['warn', 'error'] }]
- `no-undef`: 'error'
- 전역 변수 허용 목록: `window`, `document`, `Capacitor`, `ItdasyCore`, `ItdasyCaption`, `ItdasyGallery`, `ItdasyPortfolio`

### 4.4 husky pre-commit
- `npm run lint` (실패 시 커밋 차단)
- `npm test` (실패 시 커밋 차단)
- 스테이징이라 실험 OK. 운영 레포로 포팅할 땐 테스트 커버리지 한 번 더 확인.

---

## 5. 승인 요청 사항

아래 항목 중 어디부터 실제로 적용할지 지시 부탁드립니다:
- A) 이 계획서만 확정하고 멈춤
- B) Root `AGENTS.md` 초안까지 작성
- C) 패키지 설치 + ESLint/husky 설정까지
- D) `js/caption/` 분할까지 수행 (하네스 효과 70% 지점)
- E) 전체 다 (1~8번 전부)

분할·파일 생성은 승인 후 진행합니다. 스테이징 레포라 rollback 리스크 낮음.

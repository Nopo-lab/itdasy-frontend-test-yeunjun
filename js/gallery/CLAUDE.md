# js/gallery — 갤러리·릴스 모듈

> 부모 `../../CLAUDE.md` + `../../AGENTS.md` 규칙 상속. **분할 진행 중** (모놀리스 deprecate 단계).

## ⚠️ 현재 상태 주의
레포 루트에 이미 `app-gallery-bg.js`, `app-gallery-element.js`, `app-gallery-finish.js`, `app-gallery-review.js`, `app-gallery-write.js` 가 분리되어 있고, **구 `app-gallery.js`(1016줄) 모놀리스와 공존 중**. 우선순위:
1. 모놀리스의 로직을 서브 파일로 마저 이관
2. `index.html`의 `<script>` 순서 확인 후 모놀리스 제거
3. 제거 전엔 **모놀리스를 수정하지 말 것** (분기 점점 커짐)

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
4. `index.html` 스크립트 로드 순서 건드리면 `risk:integration` 라벨 필수

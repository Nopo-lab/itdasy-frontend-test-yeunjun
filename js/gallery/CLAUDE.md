# js/gallery — 갤러리·릴스 (분할 진행중)

- 부모 `../../CLAUDE.md` + `../../AGENTS.md` 상속
- 주의: `app-gallery.js`(1016줄) 모놀리스 + 서브(`-bg`·`-element`·`-finish`·`-review`·`-write`) 공존 중. 이관 중엔 monolith **수정 금지**
- index.html 스크립트 로드 순서 (절대 변경 금지): `app-core → app-spec-validator → app-instagram → app-caption → app-portfolio → app-ai → app-gallery → -bg → -element → -review → -write → -finish → app-scheduled → app-story-template → app-sample-captions → app-push → app-oauth-return → app-haptic → app-theme → app-plan → app-support`
- 공개 API: `index.js` 만, 전역 `window.ItdasyGallery`
- 목표 구조: `index.js`·`bg.js`·`element.js`·`finish.js`·`review.js`·`write.js`·`__tests__/`
- 변경 체크: monolith·서브 파일 동일 함수명 중복 가능성 grep 필수 · iOS WebView 메모리(릴스 3개 초과 금지) · 이미지 원본은 `portfolio/uploader.js` 경유 · 스크립트 로드 순서 변경 시 `risk:integration` 라벨

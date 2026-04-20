# T-200 P0 · SELECTOR_FREEZE.md (셀렉터 감사 · 고정 리스트)

> **목적:** T-200 디자인 리프레시(P1~P6) 진행 중 T2 FE Coder 가 HTML 구조를 바꿀 때 **절대 깨뜨리면 안 되는 ID/class/속성** 목록.
> **규칙:** T2 는 각 Phase 착수 전 본 문서를 반드시 열고, 해당 Phase 섹션의 🔴 리스트를 체크.
> **원칙:** 애매하면 🔴 (거짓 양성 > 거짓 음성).
>
> **작성:** 2026-04-20 04:45 KST · T1 Architect (Opus)
> **감사 대상:** `app-*.js` 17개 + `app-gallery-*.js` 5개 = **22개 파일 (총 8,756줄)**

---

## 0. 요약 숫자 (한눈)

| 항목 | 개수 | 정책 |
|------|------|------|
| `getElementById` 로 참조되는 **고유 ID** | **256** | 🔴 전량 보존 |
| `querySelector/All` 고유 타깃 문자열 | **55** | 아래 분류 참조 |
| `classList.add/remove/toggle` 고유 클래스명 | **11** | 🔴 전량 보존 (토글 플래그) |
| `element.dataset.*` 접근 속성 | **11** | 🔴 전량 보존 (HTML `data-*` 유지) |
| `index.html` 인라인 이벤트 핸들러 라인 | **102** (onclick 90, oninput 5, onchange 6, onsubmit 1) | 함수명 보존 + §3#6 위반 별도 티켓 |
| 인라인 핸들러가 참조하는 **고유 전역 함수** | **~75개** (제어키워드 제외) | 🔴 함수명 변경 금지 |

**전체 분류 합계 (아래 섹션):**
- 🔴 **MUST (필수 보존):** ID 256 + 고유 class 11 + data-* 11 + 함수명 75 ≈ **353개**
- 🟡 **SHOULD (구조 유지, 이름은 변경 가능):** 약 20개 (구조적 쿼리셀렉터)
- 🟢 **CAN (자유):** HTML 에 있으나 JS 가 참조 안 하는 class — T2 가 CSS 매칭 확인 후 자유롭게 개명 가능 (본 감사 범위 밖)

---

## 1. 🌙 다크모드 현황 (핵심 발견)

### 현재 구현
- **토글 JS:** `app-theme.js` (61줄). `window.toggleTheme()` 가 `localStorage['itdasy_theme']` 에 `system|light|dark` 저장.
- **DOM 플래그:** `document.documentElement.setAttribute('data-theme', 'dark')` + `body.setAttribute('data-theme', 'dark')` 양쪽 세팅.
- **CSS 매칭:** `style-dark.css` 전체가 `html[data-theme="dark"]` 선택자 사용 (L9, L24, L30~ 등).
- **system 모드:** `data-theme` 속성 제거 → `prefers-color-scheme` 미디어쿼리만 동작.

### 🌙 P1 매핑 규칙 (권장)

> **기존 JS 가 이미 `[data-theme]` 체계를 쓰고 있음.** T-200 §5 의 새 토큰 (`[data-theme="dark"]`) 과 **100% 호환**. 어떤 수정도 불필요.

- **옵션 A (기존 CSS 병기):** 필요 없음. 기존 `html[data-theme="dark"]` 그대로 유효.
- **옵션 B (JS 수정):** 필요 없음. 이미 `html`/`body` 양쪽 `data-theme` 속성 세팅 중.

**→ 결론: 다크모드는 JS 0 건드림. P1 에서는 `style-base.css` 의 `:root` 변수 + `[data-theme="dark"]` 변수 블록만 새 토큰으로 교체하면 끝.**

### 주의사항
- T2 가 P1 에서 `html[data-theme="dark"]` → `[data-theme="dark"]` 로 선택자 **축약해도** 동작함 (html 에 속성 붙어있으므로). 단, 축약 시 `body[data-theme="dark"]` 와 매칭 우선순위 변화 유의.
- `style-dark.css` 의 `[style*="background:#fff"]` 같은 인라인 스타일 오버라이드는 P2~P5 에서 인라인 `style=` 제거하면 자연히 불필요해짐.

---

## 2. ⚠️ 인라인 이벤트 핸들러 현황

### 숫자
- `index.html` 내 인라인 핸들러 라인: **102개**
  - `onclick=` 90, `onchange=` 6, `oninput=` 5, `onsubmit=` 1
- 참조되는 고유 전역 함수: 약 75개 (예: `showTab`, `toggleTheme`, `openSettings`, `connectInstagram`, `obNext`, `openPlanPopup`, `openSupportChat`, `openScheduledPopup`, `goWorkshopUpload`, `generateCaption`, `filterMainTag`, `filterPhotoType`, …)

### AGENTS.md §3 #6 위반 여부
AGENTS.md §3 #6: "innerHTML 에 인라인 `onclick="..."` 금지 — `addEventListener` + 이벤트 위임 사용. 특히 유저 입력 데이터를 onclick 에 주입 절대 금지 (XSS)."

**정적 HTML 내 인라인 핸들러 (index.html):**
- 102개 전부가 **정적 HTML**. 유저 입력 데이터 주입 없음.
- §3 #6 의 실제 금지 범위는 "**innerHTML 에 유저 데이터 + onclick**" → 정적 HTML 의 `onclick="function()"` 는 엄밀히는 스타일 이슈지 XSS 이슈는 아님.
- **판정: 직접 위반 0건.** 단 "innerHTML 내 동적 onclick" 케이스는 JS 코드에서 별도 조사 필요 (예: `app-gallery-finish.js:152, 160` 의 `onclick="document.getElementById(...)..."` 가 innerHTML 템플릿 안에 있음 → 유저 입력 `${item.id}` 가 onclick 에 주입됨 = **실제 XSS 후보**).

### 권고
- **T-200 범위:** 전부 보존. HTML 구조 재배치 시 **함수명 문자열 그대로** 옮긴다.
- **별도 티켓 제안 (T-200 범위 밖):**
  - 🔴 XSS 의심: `app-gallery-finish.js:160` 의 `deleteGalleryItem('${item.id}')` 가 innerHTML 템플릿 내부 + `item.id` 가 서버 데이터지만 실제 DB 값 검증 필요. **별도 보안 티켓으로 분리 (T-008 계열)**.
  - 🟡 스타일 개선: index.html 의 102개 인라인 onclick 을 `addEventListener` 로 이관. P2~P6 완료 후 별도 리팩터 티켓.

### 인라인 핸들러가 참조하는 전역 함수 샘플 (일부)
```
_capAutoGrow, _capSchedulePatch, _captionOpenSlotPicker,
applyFaceBlur, cancelElementEdit, cancelReviewEdit,
closeBgPanel, closeElementPanel, closeOnboardingCaptionPopup,
closePublishPreview, closeQuickAction, closeReviewPanel,
closeSettings, closeSlotPopup, closeSupportChat,
closeTemplatePanel, closeUploadDone, confirmPortfolioUpload,
connectInstagram, copyAll, copyCaption, doActualPublish,
filterMainTag, filterPhotoType, generateCaption, goCaption,
goWorkshopUpload, handlePortfolioUpload, hideInstallGuide,
initAiRecommendTab, initCaptionSlotPicker, initFinishTab,
initPersonaTab, initWorkshopTab, loadEditImage, loadImage,
localReset, obNext, onPortfolioSearch, openBgPanel,
openElementPanel, openInstagramProfile, openPlanPopup,
openQuickAction, openReviewPanel, openScheduledPopup,
openSettings, openSupportChat, openTemplatePanel,
pfAddGroup, publishToInstagram, renderBA, renderCaptionKeywordTags,
renderEdit, resetBA, resetEdit, resetShopSetup, runInstagramDiagnose,
runPersonaAnalyze, saveAndCloseSlotPopup, saveCanvas, saveEdit,
saveEditToPortfolio, saveElementEdit, saveOnboardingCaption,
saveReviewEdit, selectEditPortfolioType, selectShopType,
sendSupportMessage, setPfMode, showTab, toggleBAMode,
toggleBgStore, toggleEditPortfolioSave, toggleHapticSetting,
toggleTheme, updateElementOpacity, updateHapticToggleLabel,
updateReviewScale, uploadBgAsset
```

**T2 규칙:** HTML 섹션을 옮길 때 `onclick="XXX()"` 의 `XXX` 문자열은 **절대 바꾸지 말 것**. JS 함수명 리네이밍은 T-200 범위 밖이다.

---

## 3. 🔴 필수 보존 (MUST) — JS 가 직접 참조

### 3-A. `classList.add/remove/toggle` 대상 (11개)

| 클래스 | 용도 | 사용 파일 |
|-------|------|-----------|
| `active` | 탭 활성/버튼 활성/UI 하이라이트 | app-core.js, app-gallery.js 등 다수 |
| `on` | 선택 토글 (태그/스타일 옵션/필터) | app-caption.js, app-portfolio.js, app-gallery-* |
| `hidden` | 표시/숨김 | 여러 파일 |
| `hide` | (중복 톤) | |
| `show` | 팝업/오버레이 표시 | app-core.js (welcome) 등 |
| `selected` | 선택 상태 | |
| `open` | 패널 열림 | |
| `fade-out` | 사라지는 애니메이션 | |
| `spin` | 스피너 | |
| `splashing` | 스플래시 실행 중 | |
| `tag-add` | 태그 추가 모드 | |

**T2 주의:** CSS 에서 이 클래스명이 정의되지 않은 경우에도 **JS 가 붙이는 순간 의미가 생기므로** 이름을 바꾸면 안 됨. CSS rule 쪽을 새 이름으로 고쳐도, JS 가 여전히 `'active'` 를 추가하기 때문에 매칭 실패.

### 3-B. `dataset.*` / `getAttribute('data-*')` 참조 속성 (11개)

HTML 에 반드시 유지해야 할 `data-*` 속성:

| JS 접근 | HTML 속성 | 용도 |
|---------|-----------|------|
| `.dataset.aiCard` | `data-ai-card` | AI 추천 카드 식별 |
| `.dataset.cancelId` | `data-cancel-id` | 예약 취소 대상 ID |
| `.dataset.capPhotoIdx` | `data-cap-photo-idx` | 캡션 사진 인덱스 |
| `.dataset.id` | `data-id` | 범용 ID (포트폴리오/갤러리 아이템) |
| `.dataset.msgId` | `data-msg-id` | 고객센터 메시지 ID |
| `.dataset.plan` | `data-plan` | 요금제 카드 |
| `.dataset.sampleIdx` | `data-sample-idx` | 샘플 캡션 인덱스 |
| `.dataset.slotId` | `data-slot-id` | 발행 슬롯 ID |
| `.dataset.t` | `data-t` | 탭 식별 (레거시) |
| `.dataset.type` | `data-type` | 샵 타입·업종 식별 (온보딩 등) |
| `.dataset.v` | `data-v` | 스타일/태그 옵션 값 |
| `getAttribute('data-haptic')` | `data-haptic` | 햅틱 피드백 강도 (`light`, `medium`) |

**T2 규칙:** HTML 재작성 시 위 속성들은 원소에 **1:1 복사**. 클래스·ID 보존과 별개로 체크.

### 3-C. querySelector 고유 타깃 중 **구조적으로 이름 고정** 되어야 하는 것 (🔴)

JS 가 문자열로 특정 클래스명을 찾는 경우 — 이름 바꾸면 매칭 실패:

| 타깃 | 용도 | 파일 |
|------|------|------|
| `.tab` | 탭 전환 핵심 (모든 화면 숨김/표시) | app-core.js 등 전역 |
| `.nav-btn` | 하단 네비 5탭 버튼 | app-core.js (P6) |
| `.tag` | 태그 칩 (선택 토글) | app-caption.js, app-portfolio.js |
| `.style-opt` | 스타일 옵션 (배경/누끼/와터마크/필터) | app-portfolio.js, app-gallery-* |
| `.style-opts` | 스타일 옵션 컨테이너 | (자식 순회용) |
| `.plan-card[data-plan]` | 요금제 카드 선택 | app-plan.js |
| `.popup-content` | 팝업 내부 컨테이너 | 여러 팝업 |
| `.portfolio-type-btn` | 포트폴리오 타입 버튼 | app-portfolio.js |
| `.ptype-tab` | 포트폴리오 탭 | app-portfolio.js |
| `.ep-type-btn` | 편집 포트폴리오 타입 버튼 | app-portfolio.js |
| `.ob-shop-card` | 온보딩 샵 카드 | app-core.js |
| `.ob-step` | 온보딩 단계 | app-core.js |
| `.ob-dot` | 온보딩 점 인디케이터 | app-core.js |
| `.lp-circle` | 라이크 프로그레스 원 | app-plan.js |
| `.ocp-save` | 온보딩 캡션 저장 | app-core.js |
| `.sched-cancel-btn` | 예약 취소 버튼 | app-scheduled.js |
| `.close-btn` | 팝업 닫기 공통 | 전역 |
| `._pub_s` | 발행 단계 표시 | app-gallery-write.js |
| `._sampleCopyBtn` | 샘플 카피 버튼 | app-sample-captions.js |

**T2 규칙:** CSS 에서 이 클래스들의 시각적 스타일은 자유롭게 바꿔도 OK. **클래스명 문자열 자체는 금지.**

### 3-D. `#ID` 전수 — 256개 (Phase 별 섹션 §5 참조)

전체 256개는 본 문서 §5 에서 **Phase 별로 분배** 해 놓음. P1~P6 각 단계에서 T2 는 자기 Phase 섹션만 확인하면 됨.

중복 고참조 TOP 10 (여러 파일이 같은 ID 를 봄 = 깨지면 파급 큼):

| ID | 참조 파일 (개수) |
|----|------------------|
| `captionText` | app-caption.js(9), app-gallery-write.js(2), app-scheduled.js(1), app-ai.js(1) |
| `captionHash` | app-caption.js(6), app-gallery-write.js(2), app-ai.js(1) |
| `editCanvas` | app-portfolio.js(7) |
| `popupProgress` | app-gallery-bg.js(3), app-gallery.js(1), app-gallery-review.js(1), app-gallery-element.js(1) |
| `obShopNameInput` | app-core.js(6) |
| `lockOverlay` | app-core.js(4), app-portfolio.js(1), app-instagram.js(1) |
| `baCanvas` | app-caption.js(5) |
| `uploadDonePopup` | app-caption.js(2), app-gallery-write.js(1), app-ai.js(1) |
| `supportChatModal` | app-support.js(4) |
| `schedImg` / `schedCaption` | app-scheduled.js(2), app-gallery-finish.js(1), app-ai.js(1) |

---

## 4. 🟡 동작 보존 (SHOULD) — 구조 관계 유지, 이름은 바꿔도 됨

아래는 JS 가 **부모-자식 탐색** 또는 **속성 기반 탐색** 하는 패턴. 명시적 클래스/ID 가 아니라서 이름 변경은 OK. 단 트리 구조(부모 안에 자식 있음)는 유지.

| 패턴 | 의미 | T2 허용 범위 |
|------|------|-------------|
| `#bgOpts .style-opt` | bgOpts 내부의 style-opt 자식 순회 | `#bgOpts` 안에 `.style-opt` 가 **있기만** 하면 됨 |
| `#typeTags .tag.on` / `.tag[data-v=...]` | typeTags 내부 태그의 선택 상태 | 동일 |
| `#planPopup .plan-card` | 요금제 팝업 내 카드 | 동일 |
| `#portfolioMainFilters .style-opt` | 포트폴리오 메인 필터 옵션 | 동일 |
| `#portfolioSubFilters .style-opt` | 서브 필터 옵션 | 동일 |
| `#editArea input[type=file]` | 편집 영역의 파일 입력 | 동일 |
| `#tab-ba input[type=file]` | BA 탭의 파일 입력 | 동일 |
| `#editPortfolioSavePanel button:last-child` | 편집 저장 패널 마지막 버튼 | **마지막** 순서 유지 필요 |
| `#bgStoreGrid > div` | 배경 스토어 그리드 1차 자식 | 자식이 `<div>` 여야 함 |
| `#editWmOpts .style-opt.on` | 와터마크 옵션 활성 | 동일 |
| `#analyzeResultPopup button` | 분석결과 팝업의 버튼들 | 동일 |
| `.tab.active` / `.tab[style*="display"]` | 탭 활성 또는 inline display 로 찾기 | 🔴 `.tab` 이름 고정 (§3-C) |
| `nav .nav-btn[onclick*=...]` | 네비 버튼 중 특정 onclick 문자열 | 🔴 `.nav-btn` 고정 + onclick 문자열 보존 |
| `[data-tab=...]`, `[data-id=...]`, `[data-slot-id=...]`, `[data-finish-slot=...]`, `[data-msg-id=...]`, `[data-ai-card]` | data 속성 기반 탐색 | 🔴 속성명 고정 (§3-B) |
| `[id^=...]`, `[onclick^=...]` | ID/onclick prefix 탐색 | ID prefix 규약 유지 (예: `pid-*`, `pA-*` 등) |

---

## 5. Phase 별 영향 셀렉터 (T2 참조 필수)

### Phase 1 (P1) — CSS 토큰 교체 · `style-base.css` + `style-dark.css`
- **영향 DOM 요소:** 없음 (CSS 변수만 교체)
- **🔴 확인 필요:**
  - `[data-theme="dark"]` 선택자 체계 유지 (§1 참조)
  - `html[data-theme="dark"]` / `[data-theme="dark"]` 양쪽 매칭 고려
- **T2 할 일:** T-200 §5 디자인 토큰 블록 정확히 복사. 기존 변수명 바뀌면 다른 CSS 의 `var(--)` 참조 전수 치환 필요 → 변수명은 티켓 §5 와 1:1 일치시킴.

---

### Phase 2 (P2) — 홈 탭 · `index.html` 홈 섹션 + `style-home.css`

**🔴 필수 보존 ID (23개):**
```
consentTimestampDisplay, homePostConnect, homePreConnect, homeQuestion,
installGuideCard, installGuideExtra, installGuideModal,
previewShopName, publishBtnLabel, pwaInstallCard,
sessionExpiredMsg, splashScreen, tokenExpiryBanner,
welcomeOverlay, welcomeShopName,
quickActionPopup, statCaptions, statPosts,
frameAvatarInner, frameHandle,
previewAvatar, previewFinalCaption, previewFinalImg
```

**🔴 필수 보존 class/속성:**
- 온보딩 카드: `.ob-shop-card`, `.ob-step`, `.ob-dot` + `data-type` (샵 업종)
- 플랜 배지: `#planBadge` 는 P6 소속이지만 홈에서 보임
- 데이터 속성: `data-haptic="light"` (모든 인터랙션 버튼)

**🟡 구조 유지:** 홈 카드 → 버튼 트리 구조 유지 (buttons 내 `onclick="connectInstagram()"`, `onclick="openQuickAction()"` 등)

**인라인 onclick 보존 대상 (홈):**
`connectInstagram`, `openQuickAction`, `selectShopType`, `obNext`, `goWorkshopUpload`, `openPlanPopup`, `openSettings`, `openSupportChat`, `toggleTheme`, `hideInstallGuide`, `showTab`

---

### Phase 3 (P3) — 만들기/글쓰기/AI추천 탭 · `index.html` + `style-components.css`

**🔴 필수 보존 ID (워크샵 · 8개):**
```
_wsInstaPreviewPop, _wsPreviewImg,
workshopRoot, wsBanner, wsCompletionBadge, wsCompletionCount,
wsDropZone, wsResetBtn
```

**🔴 필수 보존 ID (편집/포트폴리오/갤러리 편집 · 67개):**
```
_galleryDetailPop,
bgOpts, bgPanel, bgPanelBody, bgStoreGrid, bgStorePanel, bgStoreToggle, bgUploadInput,
editActionBtns, editArea, editBtn, editCanvas,
editPortfolioMainTag, editPortfolioSavePanel, editPortfolioTags, editPortfolioToggleBtn,
editPreview, editProgress, editSaveBtn, editWmOpts,
elemEditWrap, elementEditor, elementEditorCanvas,
elementOpacity, elementOpacityVal, elementPanel, elementPanelBody,
elementUploadInput, elemOverlay,
faceBlurCheck, faceBlurProgress, faceBlurWrap,
galleryFileInput,
newTemplateName,
pfGroupLabels, pfSaveBtn,
popupActionBar, popupBulkBar, popupPhotoGrid, popupPhotoInput, popupProgress, popupSelCount,
portfolioAllTagsWrap, portfolioEmpty, portfolioGrid,
portfolioMainFilters, portfolioMainTagInput,
portfolioSubFilters, portfolioSubFilterWrap,
portfolioTagInput, portfolioTagInputWrap,
portfolioUploadPreviewCount, portfolioUploadPreviewList,
resetBaBtn, resetEditBtn,
reviewEditor, reviewEditorCanvas, reviewEditWrap, reviewExtractResult,
reviewOverlay, reviewPanel, reviewPanelBody,
reviewScale, reviewScaleVal, reviewUploadInput,
templatePanel, templatePanelBody,
typeTagLabel, typeTags,
upFill, upMsg, upPct
```

**🔴 필수 보존 ID (글쓰기/캡션/발행 · 55개):**
```
_capInstaPreview, _captionPubPreviewPop, _pub_t, _regenFirstHint,
_storyCaption, _storyClose, _storyDownload, _storyImg, _storyImgFile,
_storyImgUrl, _storyPopup, _storyPreview, _storyRender, _storyShareBtn, _storyTag,
afterArea, afterPreview, beforeArea, beforePreview,
analyzeOverlay, analyzeProgressBar, analyzeResultBody, analyzeResultPopup,
analyzeStepText, analyzeSubText, autoStoryToggle,
baBtnToolbar, baCanvas, baGuideText,
captionActionBar, captionBtn, captionEditMicro, captionEditPct,
captionHash, captionLoadingPopup, captionPhotoThumbRow,
captionSlotPhotoStrip, captionSlotPicker, captionText,
clHint, clMsg, copyToast,
connectInstaBtn, doPublishBtn, instaBtn,
publishArea, publishCaptionPreview, publishConfirmArea, publishPreviewPopup,
schedAt, schedCaption, schedImg, scheduleDateTime,
scheduledFormWrap, scheduledListBox, scheduledPopup, schedulePanel, scheduleToggleBtn,
slotCardHeader, slotCardList, slotPopup, slotPopupActions, slotPopupBody, slotPopupLabel,
uploadDoneMsg, uploadDonePopup, uploadProgressPopup
```

**🔴 필수 보존 ID (AI 추천 · 5개):**
```
_sampleClose, _sampleConnectBtn, _sampleList, _samplePopup,
aiRecommendBatchBar
```

**🔴 필수 보존 class:** `.tag`, `.style-opt`, `.style-opts`, `.portfolio-type-btn`, `.ptype-tab`, `.ep-type-btn`, `._pub_s`, `._sampleCopyBtn`, `.sched-cancel-btn`

**🔴 필수 보존 data-*:** `data-type`, `data-v`, `data-id`, `data-cap-photo-idx`, `data-slot-id`, `data-sample-idx`, `data-cancel-id`, `data-ai-card`

---

### Phase 4 (P4) — 마무리 탭 · `index.html` + `style-components.css`

**🔴 필수 보존 ID (7개):**
```
_assignPopup, _gDragInd, _nextSlotGuide,
cbt1ResetArea, finishRoot, fullResetBtn, saveBtn
```

**🔴 필수 보존 class:** `.tab.active`, `.close-btn`, `.popup-content`

**🔴 필수 보존 data-*:** `data-finish-slot`, `data-id`, `data-slot-id`

**참고:** P4 마무리 탭은 `app-gallery-finish.js` 가 주도. 이 파일은 innerHTML 내 동적 onclick 주입 케이스 있음 (L152, L160) — 보안 별도 티켓 후보.

---

### Phase 5 (P5) — 내 샵 (페르소나 · 프로필) · `index.html`

**🔴 필수 보존 ID (39개):**
```
_pIdStatus,
pA-actions, pA-ingestMsg, pA-instaBtn, pA-manual, pA-manualBtn,
pA-manualMsg, pA-manualText, pA-status,
pB-countMsg, pB-detectBtn, pB-detectHint, pB-detectResult,
pC-addBtn, pC-addMsg, pC-content, pC-isDefault, pC-label, pC-list, pC-position,
pcon-ai, pcon-body, pcon-btn, pcon-msg, pcon-pipa,
personaContent, personaDash, personaRoot,
pid-location, pid-nick-hint, pid-nick-inp, pid-nick-tags, pid-personality,
pid-plc-count, pid-saveBtn, pid-saveMsg, pid-shop_name_intro,
pid-sig-vocab, pid-sni-count
```

**🔴 필수 보존 ID 규약:** prefix `pA-`, `pB-`, `pC-`, `pcon-`, `pid-` 는 `[id^="pid-"]` 같은 쿼리셀렉터 대상 가능성 → **접두어 체계 유지**.

**🔴 설정 · 지원 (P5 섹션에서 함께 노출될 수 있음):**
```
settingsAvatar, settingsCard, settingsProfileHandle, settingsProfileName, settingsSheet,
supportChatInput, supportChatMessages, supportChatModal, supportUnreadBadge
```

---

### Phase 6 (P6) — 네비 · 헤더 · `style-polish.css` + SVG 아이콘 교체

**🔴 필수 보존 ID (12개):**
```
headerAvatar, headerPersona, headerPersonaName, headerShopName,
planActionBtn, planBadge, planCloseBtn, planPopup, planUsageContent,
tab-ai-suggest, tab-caption, themeToggleBtn
```

**🔴 필수 보존 class:** `.nav-btn`, `.tab`

**🔴 필수 보존 속성:** `data-haptic`, `aria-label` (모든 네비 버튼), `onclick="showTab('...', this)"` 함수 호출 문자열

**이모지 교체 주의:**
- 현재 테마 토글 버튼 text: `🌗`/`☀️`/`🌙` — `app-theme.js:40` 에서 `btn.textContent` 로 직접 설정.
- Lucide SVG 로 교체하려면 `app-theme.js:12 ICONS` 딕셔너리 변경 필요 → **JS 수정 = T-200 규칙 위반**.
- **해결책:** `btn.innerHTML = '<svg …>'` 로 바꾸려면 별도 티켓. 당장은 **이모지 유지** 또는 CSS `::before` 로 시각적 교체.

---

### Cross-Phase (여러 Phase 에 공통 · 23개)

```
hapticToggleStatus, lockOverlay,
loginBtn, loginEmail, loginError, loginPassword,
obBtn, obCompleteName, obShopNameInput, ocpTextarea,
onboardingCaptionPopup, onboardingOverlay,
ptrEmoji, ptrLabel
```

**규약:** 온보딩(`ob*`, `ocp*`) / 로그인(`login*`) / 잠금(`lock*`) / 풀투리프레시(`ptr*`) / 햅틱(`haptic*`) 은 탭 구분 없이 전역. P2~P6 전 단계에서 **손대지 말 것**.

---

## 6. 자가검토 (AGENTS.md §5 · 본 P0 에 적용)

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 건드리는 파일 전체 목록 | ✅ | `.ai/tickets/T-200/SELECTOR_FREEZE.md` 1개 **신규 생성만**. JS/HTML/CSS 0 수정. |
| 2 | `index.html` 스크립트 로드 순서 영향 | ✅ | 문서 생성만, 영향 없음 |
| 3 | `window.*` 전역 추가/제거 | N/A | 코드 미수정 |
| 4 | localStorage 키 패턴 준수 | N/A | 코드 미수정 |
| 5 | Capacitor 브릿지 테스트 | N/A | 코드 미수정 |
| 6 | Supabase RLS 수동 확인 | N/A | 코드 미수정 |
| 7 | 50줄 초과 함수 신규 생성 없음 | N/A | 코드 미수정 |
| 8 | 빈 `catch {}` 추가 없음 | N/A | 코드 미수정 |
| 9 | 커밋 메시지에 `T-200` 포함 | ✅ (예정) | `T-200-P0: selector audit freeze list` |
| 10 | `npm run lint && npm test` 로컬 통과 | N/A | `.md` 대상 아님 |

**T-200 전용 13항 체크 (§9) 관련:**
- #1 `SELECTOR_FREEZE.md` 포함 ✅
- #4 JS 파일 수정 0건 ✅
- #11 다크모드 매핑 조사 완료 ✅ (§1)
- #12 인라인 onclick 전수조사 완료 ✅ (§2)

---

## 7. 한계와 알려진 이슈

1. **동적 쿼리셀렉터 한계:** 본 감사는 **정적 문자열** 기반. `querySelector(`#${id}`)` 같은 동적 조합은 grep 에서 일부 누락 가능. T2 가 Phase 편집 중 의심되면 즉시 T1 에게 재감사 요청.

2. **CSS 전용 클래스 미분류:** 🟢 CAN 카테고리(HTML 에만 있고 JS 는 안 보는 클래스)는 본 문서 미포함. T2 가 CSS 리팩터링 중 각 클래스 명에 대해 `grep -n "className" app-*.js js/gallery/*.js` 로 1차 확인 후 변경.

3. **innerHTML 내 동적 onclick 주입:** `app-gallery-finish.js:152, 160` 등에서 `${item.id}` 를 onclick 내 문자열 삽입. **보안 리뷰 별도 티켓** 권장 (XSS 위험 — 서버가 item.id 를 안전 sanitize 하는지 확인 필요).

4. **Phase 분류의 휴리스틱 특성:** ID prefix 기반 휴리스틱 분배. 일부 ID 는 여러 Phase 에서 참조될 수 있음. T2 는 각 Phase 착수 전 해당 섹션 + Cross-Phase 섹션 **둘 다** 체크.

5. **리네이밍 주의:** 현 시점 ESLint 규칙은 ID 문자열 매칭을 강제하지 않음. T2 가 실수로 ID 를 바꿔도 자동 감지 안 됨. **테스트 시 수동 클릭 경로 검증 필수** (T4 Ops 가 각 Phase 끝 수행).

---

## 8. 원영님용 한 줄 요약 (§11 쉬운 말)

> **"JS 가 HTML 의 이름표 256개를 쓰고 있어요. 그 중 하나라도 이름을 바꾸면 기능이 깨져요. 이 목록을 가지고 T2 가 디자인 바꿀 때 '이 이름표들은 그대로 둔다' 를 지킬 거예요. 다크모드는 이미 새 규격 그대로라서 JS 는 한 줄도 안 건드려요."**

---

## 9. T-202 에 의해 해제된 셀렉터 (2026-04-20)

> **배경:** 원영님 결정 (2026-04-20 17:30) — 예약 발행 기능 전면 제거.
> **근거 티켓:** `.ai/tickets/T-202.md` + `.ai/tickets/T-202/plan.md`
> **상태:** 아래 셀렉터들은 더 이상 DOM 에 존재하지 않음. 동결 해제. 새 코드에서 참조 금지.

### 해제된 함수 (grep 0건이 정상)
- `openScheduledPopup`, `closeScheduledPopup`
- `_schedulePublishFromAi`, `_scheduleFromFinishTab`
- `createSchedule`, `loadScheduledPosts`, `createScheduledPost`, `cancelScheduledPost`
- `renderScheduledList`, `handleCreateScheduled`

### 해제된 ID
- `#scheduledPopup`, `#scheduledFormWrap`, `#scheduledListBox`
- `#schedNavBtn`, `#openScheduledBtn`
- `#schedImg`, `#schedCaption`, `#schedCreateBtn`
- `#schedulePanel`, `#scheduleToggleBtn`, `#scheduleDateTime`

### 해제된 data-action 값
- `data-action="schedule"` (app-gallery-finish.js 내)

### 해제된 스크립트 경로
- `app-scheduled.js` (파일 자체 삭제)

**T2/T3 유의:** 위 이름들은 향후 재사용 금지. 새 예약성 기능이 필요하면 새 이름 공간 (`booking-*`, `reservation-*` 등) 사용.

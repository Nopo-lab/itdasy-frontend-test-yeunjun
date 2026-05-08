# 🤝 인수인계: 10개 작업 순차 해결 (2026-05-08 ~)

> **이 문서를 읽는 Claude (원영 클로드 또는 후속 연준 클로드) 께**
>
> 연준님(보스)이 itdasy-frontend-test-yeunjun 스테이징 레포에 10개 항목을 우선순위 순서대로 고치라고 지시. 이 작업은 Opus 4.7 한 세션에서 수행 중인데, 플랜 할당량 끊길 가능성 대비 인수인계.

---

## 🔒 절대 규칙 (CLAUDE.md 상속)

- ✅ **푸시 허용 레포**: `Nopo-lab/itdasy-frontend-test-yeunjun.git` (origin) **만**
- ⛔ **푸시 금지**: `frontend` (운영), `frontend-test` (원영 공간) — 사용자가 명시적으로 "원영 test에도 올려"·"진본에 올려" 라고 말할 때만 예외
- 매 작업 푸시 전 `git remote -v` 로 origin URL 확인 습관화
- 푸시 거절 시 `git pull --rebase origin main && git push origin main`
- 백엔드는 `itdasy_backend-test` (Railway staging) 바라봄. 토큰 키: `itdasy_token::staging`

---

## 📋 전체 사용자 요청 원문 (2026-05-08)

> 작업 순서: 에러부터 해결 후 검증 및 푸쉬하고 10번 실행
> 작업 검증 방법: 실제 데이터를 넣든 해당 기능 원하는 결과 혹은 반응이 각각 올바르게 되면 검증 완료

추가 지시:
- 작업 10은 엑셀처럼 편의기능 많았으면 좋겠음. 더 고도화해도 됨. 실제 앱 사용자(뷰티샵 원장)가 쓰기에 매우 편하게.
- 원영 frontend-test 에 새 커밋 있으면 합쳐서 main 에 올림 → **확인 결과 frontend-test 가 85 커밋 뒤처짐, 머지 필요 없음**

---

## ✅ 사용자 답변(AskUserQuestion) — 모호한 항목 확정

| 항목 | 답변 |
|---|---|
| **작업 5 메모 한도** | 플랜별 차등 (Free 20 / Pro·Premium 무제한) |
| **작업 8 동기화 버튼** | 라벨/진행률만 명확화 (기능 동작 유지) |
| **작업 9 홈 퀵탭** | 8개 버튼 **완전 삭제** + 상단 영구 알림 |
| **작업 10 파워뷰** | P0 + P1 + 수식 + 뷰티샵 특화 (P3) 까지 고도화 |

---

## 🎯 10개 작업 진행 상태

### ✅ 작업 1 — 고객 대시보드 4xx 폴백 [완료, push: ffc67a9]

**무엇을 했나**:
- `app-customer-dashboard.js:68-87` `_apiGet` 가 throw 하는 Error 에 `.status` 부여
- `app-customer-dashboard.js:451-485` 폴백 분기 확장: 4xx · 501·502·503 · 네트워크 오류 모두 `GET /customers/{id}` 폴백
- UUID v4 형식 검증 추가 (잘못된 id 즉시 안내)
- 😢 이모지 → Lucide `ic-alert-triangle`
- 폴백 성공 시 `window.showToast('기본 정보로 표시 중이에요')`

**검증**: DevTools Network 탭에서 `/customers/{id}/dashboard` 응답을 422 로 강제 → 폴백 발동, 토스트 표시, 시트 닫히지 않음.

---

### 🚧 작업 2 — 부팅 30s defer 전환 + SW kill 가드 [진행 중]

**문제**:
- `index.html:1758-1896` 동기 스크립트 70+ 개. `app-customer.js`(758줄), `app-revenue.js`, `app-power-view.js`(792줄) 등이 parse 차단.
- `app-core.js`(line 1758, 2099줄) 만 sync 유지. 나머지는 모두 `defer` 가능.

**남은 작업**:
1. `index.html` 1759 라인부터 끝까지 모든 `<script src="app-XXX.js"></script>` 패턴에 `defer` 추가 (이미 defer 인 줄은 skip)
2. `components/scenario-selector.js`, `js/hubs/prototype-render.js` 도 동일 처리
3. `index.html:10-32` SW kill 가드는 현재 KILL_KEY 1 회 가드로 OK — 추가 변경 불필요 (이미 `localStorage.itdasy_sw_killed_v3` 로 1회만 실행)
4. `index.html:42-49` build-bust reload 도 sessionStorage `build_busted` 가드 있음 — OK

**제안 sed 명령**:
```bash
sed -i '' '1759,$ {
  /defer/!s|\(<script src="[^"]*\.js[^"]*"\)></script>|\1 defer></script>|
}' index.html
```

**주의**: 위 sed 는 `app-core.js`(line 1758) 는 건드리지 않음. 외부 CDN 스크립트(`https://...`)도 건드리지 않음. 이미 `defer` 있는 줄도 skip.

`document.write` 사용 스크립트 없음 확인 완료 (defer 안전).

**검증**: Chrome DevTools Performance 시크릿 창 → FCP < 3s, TTI < 8s. 이전 30s 대비 70%+ 단축 목표.

**커밋 메시지**: `perf(boot): 부팅 동기 스크립트 일괄 defer 전환`

---

### ⏸ 작업 3 — 엑셀 AI 임포트 [대기]

**파일**: `app-import-wizard.js`

**할 일**:
1. `_progressDots()` 라인 97-109 시그니처 확장 → `_progressDots(activeIdx, pct, etaSec)` 진행률 % + ETA 표시 (`<div class="iw-progress-bar">`)
2. `_analyze()` 라인 171-198: `XMLHttpRequest` 또는 fetch progress 폴링 → 업로드 0~50%, 분석 50~100% 보간. 백엔드 응답 `total_rows` 활용
3. `_showStep2()` 라인 200-273: 매핑 표 하단에 **"+ 우리에게 없는 항목 추가하기"** 버튼 → `state.customFields[]` push, 동적 행 추가
4. `extras` 옵션 (라인 225-233) 에 `'custom'` ("별도 필드로 저장") 추가
5. `_showResumePrompt()` 라인 397-435: TTL 30분 만료 시 자동 재분석 (toast "이어서 분석 중...")
6. 라벨 친화화: "매핑" → "엑셀 항목 ↔ 잇데이 항목 짝지어주기", "extras" → "잇데이에 없는 항목"
7. step1 안내문 추가: "엑셀 파일 올리면 AI가 알아서 정리해요. 30초~2분 걸려요."

**localStorage 키**: `itdasy_import_wizard_v1` (TTL 30분, 라인 53-54)

**검증**: 50행 엑셀 업로드 → 진행률 % + ETA → step2 매핑에서 "+" 클릭 → step3 미리보기 → "반영" → 결과 카드. 도중에 닫고 30초 후 재진입 → 이어하기 프롬프트 → 재개.

**커밋**: `feat(import-wizard): 진행률 % + ETA, 사용자 정의 컬럼, 자동 재분석, 쉬운 라벨`

---

### ⏸ 작업 4 — DM 예약 승인 → 캘린더/Undo [대기]

**파일**: `app-dm-confirm-queue.js` (310줄), `app-assistant-undo.js`, `app-booking-api.js`

**할 일**:
1. `app-dm-confirm-queue.js:270-279` send/send_edit 성공 분기에서:
   ```js
   const bid = resp.booking_id;
   window.dispatchEvent(new CustomEvent('itdasy:data-changed', {
     detail: { kind: 'create_booking', source: 'dm_confirm', booking_id: bid }
   }));
   window.refreshDashBell?.();
   if (window.HomeV41?.refresh) window.HomeV41.refresh();
   if (bid && window.AssistantUndo?.push) {
     window.AssistantUndo.push({ kind: 'create_booking', booking_id: bid, label: 'DM 자동 승인' });
   }
   ```
2. `app-booking-api.js:_invalidateCache()` (라인 160) 가 `create_booking` 이벤트로 자동 발동 — 추가 변경 불필요
3. `app-assistant-undo.js`: `window.AssistantUndo.push(action)` 외부 API 노출 확인. 없으면 export 추가

**검증**: DM 자동응답 → "내일 오후 3시 예약" → 큐 → "보내고 예약" → 캘린더 즉시 반영, 챗봇 "방금 한 거 되돌려" → 예약 삭제.

**커밋**: `fix(dm-confirm-queue): 승인 후 itdasy:data-changed dispatch + Undo 통합`

---

### ⏸ 작업 5 — 메모 플랜별 한도 [대기]

**파일**: `app-customer-memo.js` (372줄), `app-plan.js`

**할 일**:
1. 저장 핸들러(라인 ~172-194):
   ```js
   const plan = (window.PlanCache?.get?.()?.plan || localStorage.itdasy_plan || 'free').toLowerCase();
   const LIMIT = plan === 'free' ? 20 : Infinity;
   if (items.length >= LIMIT) {
     window.showToast?.(`Free 플랜은 손님당 메모 ${LIMIT}개까지에요. Pro로 업그레이드하면 무제한이에요.`);
     return;
   }
   ```
2. 입력 폼 옆에 `<span data-cm-quota>3 / 20</span>` (Pro/Premium 은 `<span>3개</span>` 만)

**검증**: Free 계정으로 한 고객에 메모 21번째 시도 → 차단 + 토스트. Pro 계정 무제한.

**커밋**: `feat(customer-memo): 플랜별 메모 한도(Free 20 / Pro 무제한) + 잔여 카운트 UI`

---

### ⏸ 작업 6 — 큰 글씨 라이트 모드 적용 [대기]

**문제**: `app-theme.js:64-81` `FS_MODES = ['normal','large','xl']` 로 `data-fontsize` 속성 부여하나, **CSS 가 `style-dark.css:206-221` 에만 정의** → 라이트 모드 무반응.

**할 일**:
1. `style-base.css` (또는 `style-polish.css`) 끝부분 추가:
   ```css
   html[data-fontsize="large"] { font-size: 17px; }
   html[data-fontsize="xl"] { font-size: 19px; }
   html[data-fontsize="large"] .hv-card__headline,
   html[data-fontsize="xl"] .hv-card__headline { font-size: 1.1em; }
   /* tab-bar, list-menu, btn-primary 등 동일 패턴 */
   ```
2. `style-dark.css` 의 큰 글씨 블록 제거 (이중 정의 방지)

**검증**: 설정 → 보통/크게/아주크게 토글 → 라이트·다크 모두에서 시각적 변화 확인.

**커밋**: `fix(theme): 큰 글씨 모드 라이트 테마에도 적용`

---

### ⏸ 작업 7 — 도움말 모달 경합 수정 [대기]

**문제**: `app-support.js:244-247` 클릭 핸들러 `if (modal && e.target === modal) closeSupportChat();` 가 사이드바→모달 오픈 직후 backdrop 클릭으로 인식되어 즉시 close.

**할 일**:
1. `openSupportChat()` (라인 137):
   ```js
   modal.dataset.opened = '0';
   modal.style.display = 'flex';
   requestAnimationFrame(() => setTimeout(() => { modal.dataset.opened = '1'; }, 80));
   ```
2. backdrop 가드(라인 244-247):
   ```js
   if (modal && e.target === modal && modal.dataset.opened === '1') closeSupportChat();
   ```
3. `index.html:657` 사이드바 도움말 onclick: `setTimeout(() => (window.openSupport || window.openSupportChat)?.(), 0)`

**검증**: 사이드바 → 도움말 → 모달 표시되고 즉시 닫히지 않음.

**커밋**: `fix(support): 모달 오픈 즉시 backdrop close 경합 차단`

---

### ⏸ 작업 8 — 동기화 라벨/진행률 [대기]

**파일**: `app-customer-sync.js` (forceSync 함수), `index.html:692`

**할 일**:
1. 라벨: "데이터 동기화" → **"전체 데이터 새로고침"** + 부제 "예약·매출·고객·재고를 서버에서 다시 받아와요"
2. `forceSync()` 진행 토스트 4단계: 예약 → 매출 → 고객 → 재고 → 완료 ✓
3. 완료 후 `localStorage.itdasy_last_sync_at = Date.now()`
4. 설정 시트에 `<span data-last-sync>마지막 동기화: N분 전</span>` 표시

**검증**: 설정 → "전체 데이터 새로고침" → 4단계 토스트 → 완료. 재진입 시 마지막 시각 표시.

**커밋**: `feat(sync): 라벨 명확화 + 진행률·마지막 시각 표시`

---

### ⏸ 작업 9 — 홈 퀵탭 8개 삭제 + 영구 알림 센터 [대기]

**파일**: `app-home-v41.js` (611줄), `app-notifications.js`, `style-home.css`

**할 일**:
1. `app-home-v41.js:149-249` `_buildCarouselCards`, `_renderCarousel`, `_onboardingCards` **호출 제거**. 헤더 + 오늘 예약 + 운영 3카드만 남김
2. 헤더(라인 81-100) 바로 아래 신규 슬롯:
   ```html
   <div id="itdHomeApprovalCenter" class="hv-approval-center"></div>
   ```
3. 신규 함수 `_renderApprovalCenter()`:
   - 데이터: `app-notifications.js:_items` + `/dm-confirm-queue/list` + `/public/book/admin/pending` 합산
   - 카테고리: "DM 자동응답 승인 대기 N건" / "입금 대기 예약 N건" / "리뷰 요청 대기 N건" / "온라인 예약 승인 대기 N건"
   - 항목 클릭 → 해당 시트(openBookingApproval / openDMQueue) 오픈
   - 0건 → host 빈 0px
   - **dismissed 정책: 영구 banner (사용자 명시 "항상 떠있게"), "나중에" 버튼 제거**
4. `_renderApprovalCenter()` 를 `HomeV41.refresh()` 마다 호출 + `itdasy:data-changed` 이벤트 리스너
5. `app-notifications.js:_renderPendingBookingCard` (라인 394-451) 비활성 (영구 banner 와 중복)
6. `style-home.css` 또는 `style-base.css` 에 `.hv-approval-center` 스타일 (border-radius: 14px, gap: 8px, 톤다운 배경)

**검증**:
- 홈 진입 → 헤더 아래 영구 알림 슬롯 표시
- 캐러셀/8개 카드 사라짐
- DM 승인 대기 발생 → 즉시 카드 추가
- 승인 처리 → 카드 자동 사라짐

**커밋**: `feat(home): 빠른 퀵탭/캐러셀 제거 + 상단 영구 승인 알림 센터`

---

### 🚧 작업 10 — 파워뷰 엑셀급 고도화 (뷰티샵 원장 특화) [부분 완료, 후속 세션에서 P0~P3 본 작업 필요]

**완료된 부분 (이 세션)**:
- ✅ Cmd/Ctrl+S 즉시 추가 단축키 (엑셀급 저장)
- ✅ Cmd/Ctrl+Enter 즉시 추가 (input focus 시)
- ✅ Cmd/Ctrl+/ 단축키 안내 토스트
- ✅ customer_name 자동완성 — 단골(is_regular) 먼저, 다음 visit_count desc

**아래는 후속 세션에서 진행할 P0~P3 본 작업** (HANDOVER_2026-05-08_10task.md 의 나머지 내용 그대로 진행):

**파일**: `app-power-view.js` (~792줄), `app-power-view-render.js` (~521줄), 신규 `app-power-view-clipboard.js`, `app-power-view-formula.js`, `app-power-view-beauty.js`

**Phase 10A — P0 (드래그·복사·붙여넣기·자동완성)** [별도 커밋]
- `_state` 에 `selection: Set<rowIdx>`, `clipboard: null`, `history: []` 추가
- 셀 우하단 `<span class="pv-fill-handle">` (8px) → mousedown/move/up 으로 숫자 step+1, 날짜 +1일, 텍스트 복제
- `Cmd/Ctrl+C`: 선택 행/셀 → TSV → `navigator.clipboard.writeText` (+ execCommand 폴백)
- `Cmd/Ctrl+V`: 붙여넣기 TSV 파싱 → `_submitQuickAdd` batch 호출
- 자동완성: `_buildAutoSources()` (라인 62-94) 데이터 → input focus 시 dropdown
- 신규 `app-power-view-clipboard.js` (≤300줄), `index.html` 에 `<script defer>` 추가

**Phase 10B — P1 (다중선택·Undo·정렬·필터·찾기·바꾸기)** [별도 커밋]
- 다중 셀: `Shift+Click` 범위, `Cmd/Ctrl+Click` 다중
- `Cmd/Ctrl+Z`: Undo 5단계 history (`_saveInlineRow` 호출 직전 push)
- 정렬: 헤더 클릭 → asc/desc/none 3단계
- 필터: 헤더 ▽ → substring 입력
- `Cmd/Ctrl+F`: 찾기 모달 (highlight 매치)
- `Cmd/Ctrl+H`: 찾기·바꾸기

**Phase 10C — P2 수식** [별도 커밋]
- 신규 `app-power-view-formula.js`: `=A1+B1`, `=SUM(A1:A10)`, `=AVG`, `=COUNT`, `=IF(A1>0,"단골","신규")`
- 토크나이저 → AST → 평가
- 셀 변경 시 의존 셀 자동 재계산 (dirty graph)

**Phase 10D — P3 뷰티샵 특화** [별도 커밋]
- **자주 쓰는 시술 5종 단축버튼**: 표 상단에 자동 노출 (최근 사용 빈도 기반)
- **단골 자동완성 우선순위**: 이름 첫글자 → 단골/회원권 보유 손님 우선 표시
- **마지막 결제가격 추천**: 손님 선택 시 직전 결제 금액 자동 입력 (수정 가능)
- **카드/현금 즉시 토글**: 결제수단 컬럼에 한 탭 토글 chip
- **음성 입력**: 셀 마이크 아이콘 → 한국어 STT → 셀에 자동 입력 (`SpeechRecognition` API)
- **헤더 고정/얼리기**: 표 헤더 + 첫 1열 sticky position
- **자동 합계행**: 표 하단에 SUM/AVG 자동 표시 (매출/재고)
- **빈셀 직전값 자동채우기**: Tab 으로 빈 셀 진입 시 직전 값 placeholder 표시 (Enter → 채움)
- **빠른 필터 프리셋**: 헤더 옆 "오늘/이번주/이번달/올해" 칩
- **즐겨찾기**: ⭐ 아이콘으로 자주 보는 행 핀
- **조건부 서식**: 매출 1만 이하 빨강, 5만+ 초록 등 (설정 시트 토글)
- **단축어 사전**: `ㅂㅁ` → `발마사지`, `ㅈ` → `젤네일` 등 ([CFG] localStorage 사용자 정의)
- **가격 자동계산**: 시술 선택 시 `app-service-templates.js` 가격 자동 입력
- **인쇄/CSV 내보내기**: 헤더 우측 버튼 (`app-data-export.js` 재사용)

**검증** (각 phase 끝마다):
- P0: amount 1000 → fill 5칸 → 1000~1400, Cmd+C/V Excel 왕복, 자동완성 dropdown
- P1: 정렬 토글, Cmd+Z, 필터, Cmd+F 찾기
- P2: `=A1+B1` 합계, 의존 셀 재계산
- P3: 시술 단축버튼, 단골 우선, 가격 추천, 음성 입력 STT

**커밋**:
- `feat(power-view): P0 드래그/복사/붙여넣기/자동완성`
- `feat(power-view): P1 다중선택/Undo/정렬/필터/찾기/바꾸기`
- `feat(power-view): P2 수식 (=A1+B1, =SUM, =AVG, =COUNT, =IF)`
- `feat(power-view): P3 뷰티샵 특화 — 자주 쓰는 시술/단골 우선/가격 추천/음성/헤더 고정/합계행/단축어/조건부 서식/인쇄`

---

## 📁 Critical Files (각 작업별)

| 작업 | 파일 |
|---|---|
| 1 ✅ | `app-customer-dashboard.js` (504→518줄) |
| 2 🚧 | `index.html` (1689-1900 영역) |
| 3 | `app-import-wizard.js` |
| 4 | `app-dm-confirm-queue.js`, `app-assistant-undo.js`, `app-booking-api.js` |
| 5 | `app-customer-memo.js`, `app-plan.js` |
| 6 | `style-base.css` (또는 `style-polish.css`), `style-dark.css` |
| 7 | `app-support.js`, `index.html:657` |
| 8 | `app-customer-sync.js`, `index.html:692` |
| 9 | `app-home-v41.js`, `app-notifications.js`, `style-home.css` |
| 10 | `app-power-view.js`, `app-power-view-render.js`, 신규 모듈 4개 |

## 🔄 재사용 함수 / 이벤트

- `_apiGet` (`app-customer-dashboard.js:68`)
- `_renderHero/_renderStats/_renderEditBar` (`app-customer-dashboard.js`)
- `_buildAutoSources` (`app-power-view.js:62`)
- `_invalidateCache` (`app-booking-api.js:160`)
- `Dashboard.refresh` (`app-dashboard.js:539`)
- `HomeV41.refresh` (`app-home-v41.js`)
- `window.AssistantUndo.push` (`app-assistant-undo.js`)
- `window.showToast` (전역)
- `window.PlanCache?.get?.()?.plan` (`app-plan.js`)
- 이벤트: `itdasy:data-changed` (전역, kind 별)

## 🎨 UX 철학 준수 (CLAUDE.md)

- 이모지 ❌ — UI 요소엔 항상 Lucide SVG (`<svg><use href="#ic-XXX"/></svg>`)
- `border-radius: 14px+`, safe-area, `data-haptic` 속성
- 화면 이동 금지 — 인라인 편집
- 함수 50줄·파일 500줄 (ESLint 강제). 초과 시 분할 티켓 + 원영님 승인

## 📍 어디까지 진행됐는지 (2026-05-08 시점)

- ✅ 작업 1 푸시 완료 (`ffc67a9`)
- 🚧 작업 2 부팅 defer — sed 명령 준비됨, 실행 직전
- ⏸ 작업 3-10 대기

## 🛠 다음 작업 시작 시 체크리스트

1. `git pull --rebase origin main` 으로 최신 동기화
2. 이 문서 + `.ai/SESSION_STATE.md` 읽기
3. 현재 작업 번호의 `[진행 중]` 섹션 따라 구현
4. `node --check <파일>` 으로 syntax 확인
5. `git status`, `git diff` 로 변경 검토
6. 커밋 → `git remote -v` 로 origin 확인 → `git push origin main`
7. 푸시 거절 시 `git pull --rebase origin main && git push origin main`
8. 다음 작업 진입

## ⚠️ 주의사항

- **defer 전환 시 app-core.js (line 1758) 만 sync 유지**. 나머지는 모두 defer.
- **document.write 사용 스크립트 없음 확인 완료** (defer 안전).
- 이미 defer 인 줄은 sed 의 `/defer/!` 가드로 skip.
- 작업 9 와 작업 10 은 작업량이 가장 큼 — Phase 분할 커밋 권장.
- 작업 10 P3(뷰티샵 특화) 는 음성 입력 등 권한 요청 동반 → CSP 정책 확인 필요할 수 있음.

---

**최종 갱신**: 2026-05-08 by Opus 4.7
**다음 갱신 권장**: 각 작업 푸시 후 이 문서의 상태 마커(✅/🚧/⏸) 업데이트

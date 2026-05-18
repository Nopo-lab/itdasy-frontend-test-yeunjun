# SESSION_STATE — 세션 인수인계 파일

> 새 세션이 시작되면 **이 파일을 먼저 읽고** 현재 단계·대기 결정·마지막 체크포인트를 파악한다.

**LAST UPDATED:** 2026-05-19 · v216 — ultra-plan Phase 1+2 (PE-2/8/9/10 + SN-1~10) + 원영 v207~v215 통합

---

## 🟣 2026-05-19 — v216 ultra-plan Phase 1+2 부분 적용 (사진편집 4 + SNS 10)

배경: 사용자(연준)가 `~/Downloads/photo_sns_ultra_plan.md` 마스터플랜에서 **Phase 3 / 릴스(PE-7) / AI 배경(PE-3) 제외** 지시. 코덱스가 v206.8 사진편집 완성도 보강 커밋 후 푸시 전에 끊김. 원영님은 그 사이 origin/main 에 v207~v215 (매출 기간 선택 + 고객관리 v4 리뉴얼) 9개 커밋 푸시.

진행 순서:
1. 원영 origin/main 위에 코덱스 2 커밋(v206 폰트·픽셀 + v206.8 사진편집기 완성도) rebase. 충돌은 빌드 버전 라인 (app-core.js / index.html / sw.js)뿐. origin 버전 유지.
2. 2 커밋 푸시 완료 (`acf1f74`).
3. stash 에 있던 ultra-plan WIP 복구 후 빌드 v207-ultra-plan → **v216-ultra-plan-p1-p2** 로 통일.
4. 신규 모듈 11개 + sns-modules.css + .gitignore(playwright 산출물) 한 커밋으로 정리.

신규 (사진편집 Phase 1+2 — 릴스/AI배경 제외):
- `app-photo-editor-ba-slider.js` (PE-2 Before/After 인터랙티브 슬라이더, 560줄): vertical/horizontal 모드, 드래그 가능 구분선, 라벨 커스터마이즈, divider style 3종, PNG/JPG export.
- `app-photo-editor-relight.js` (PE-8 AI 릴라이팅, 118줄): 조명 방향·색온도·강도 슬라이더, gradient overlay 합성.
- `app-photo-editor-collage.js` (PE-9 스마트 콜라주, 98줄): 2~6장 사진을 grid/diagonal/horizontal 레이아웃으로 자동 배치.
- `app-photo-editor-quality-score.js` (PE-10 품질 스코어, 149줄): 구도/조명/선명도/색감 4축 평가 + 개선 팁.

신규 (SNS 관리 Phase 1 + Phase 2):
- `app-sns-calendar.js` (SN-1 콘텐츠 캘린더, 409줄): 월간/주간 뷰, 드래그 배치, localStorage 저장, AI 빈 날짜 제안 슬롯.
- `app-sns-schedule.js` (SN-2 예약 발행, 70줄): SNSCalendar 의 status:'scheduled' 게시물을 시간 도래 시 발행 큐로 전달.
- `app-sns-grid-preview.js` (SN-3 피드 그리드, 152줄): 9칸/12칸 미리보기, 드래그 재배치.
- `app-sns-hashtag.js` (SN-4 해시태그 매니저, 166줄): 업종별 추천 세트 10종 저장, 원터치 삽입.
- `app-sns-analytics.js` (SN-5 성과 대시보드, 95줄): 좋아요/댓글/도달/저장 추이 + TOP5 + 최적 발행시간 AI 추천(폴백 demo data).
- `app-sns-phase2.js` (SN-6~10 Phase 2 통합, 136줄): AI 포스트 원클릭, 크로스 플랫폼(IG+네이버+카카오), AI 코파일럿, 경쟁샵 벤치마크, 자동 리포스트(에버그린).

신규 CSS:
- `css/screens/sns-modules.css` (136줄): 모든 SNS 모듈 공통 스타일.

`index.html` 로드:
- v216 빌드 버전 통일 (`window.__LATEST_BUILD__` / `APP_BUILD` / `CACHE_VERSION`)
- 신규 11개 모듈 + sns-modules.css 추가 (defer)
- 기존 스크립트 0줄 영향

확인:
- `npm run smoke` 통과 (161 scripts).
- `npx eslint <신규 10>` 통과 (errors 0, warnings 22 — 기존 줄수/no-unused 패턴과 동일).
- `npm run lint` 통과 (errors 0, warnings 438 — 기존 405 + 신규 22 + 빌드라인 일부).
- `git diff --check` 통과.
- `node --check` 신규 10개 통과.

미완료 (다음 세션 권장):
- PE-1 AI 원터치 v2 (MediaPipe Face Mesh 정밀 마스킹)
- PE-4 드래그&드롭 텍스트 (touchmove/touchend 핀치줌 직접 조작)
- PE-5 템플릿 30종 확장 (현재 6 → 30+, Brand Kit 자동 적용)
- PE-6 AI 가상 시술 (헤어컬러/네일컬러/속눈썹 AR 오버레이)

명시적 제외 (사용자 지시):
- PE-3 AI 배경 생성 (서버 API 비용 우려)
- PE-7 릴스/숏폼 비디오 에디터
- Phase 3 전체 (PE-11 포트폴리오 사이트, PE-12 시술기록 자동화, SN-11 리뷰 자동응답, SN-12 ROI 트래커, SN-13 UGC 수집)

위반 영역: 없음. 원본 blob 보존·기존 누끼/자동보정 0줄 수정·assistant kind 0줄 영향.

---

## 🟣 2026-05-19 — v206.8 사진편집기 점검·분리·보완

원영님 요청: Claude가 토큰 한도로 멈춘 뒤 남은 사진편집 작업 확인, 가짜 기능/깨진 기능 점검, 파일 분할과 새 기능 추가.

완료:
- `app-photo-editor-batch.js` 신규: 사진편집기 본체에서 배치 편집을 분리.
- `app-photo-editor-export.js` 신규: 저장/다음 단계 모달을 본체에서 분리.
- `app-photo-editor-layers.js` 신규: 텍스트 레이어 추가/삭제/선택/순서 변경을 본체에서 분리.
- `app-photo-editor-brush-effects.js` 신규: 부분 보정 브러시의 실제 픽셀 계산을 브러시 화면 코드에서 분리.
- 배치 편집 버튼에 진행 상태 표시 추가: `0/N` → `N/N`, 처리 중 버튼 비활성화.
- `app-photo-editor-templates.js`: 인스타 스토리·릴스 커버용 `스토리 9:16` 템플릿 추가. 결과 캔버스 1080×1920.
- `app-photo-editor-export.js`: `2배 고화질` 저장, `WebP 저장`, `피드+스토리 세트 저장` 추가.
- `app-brand-templates.js`: 브랜드 템플릿 적용이 실제 열린 사진편집기 상태에 반영되도록 보정.
- `app-photo-editor-brush.js`: 부분 보정 브러시가 화면에만 보이고 저장 때 사라지는 문제를 줄이도록 결과를 실제 편집 원본에 반영.
- `app-photo-editor.js`: 부분 보정 브러시·배경 변경처럼 원본 이미지가 바뀐 작업도 되돌리기/다시실행 때 이미지까지 복구하도록 보강.
- `app-photo-editor-zoom.js`: 편집기 재오픈 시 휠 이벤트가 쌓일 수 있는 부분 정리.
- `app-assistant-actions-marketing.js`: 사진편집 관련 액션 등록 전 초기화 순서 오류 수정.
- `app-complete-flow.js`, `app-dashboard.js`, `app-gallery-write.js`: 자동검사를 막던 빈 처리칸 정리.
- 빌드 버전: `20260519-v206.8-photo-complete`.

분리 결과:
- `app-photo-editor.js`: 1073줄 → 1013줄. 저장 세트와 되돌리기 보강을 넣어 조금 늘었고, 다음 라운드 분리 대상.
- `app-photo-editor-brush.js`: 541줄 → 447줄.

확인:
- 실제 브라우저 확인 통과: 새 빌드 로드, 분리 모듈 4개 로드, 스토리 템플릿 1080×1920 출력, 텍스트 레이어 추가, 배치 편집 테스트 슬롯 2장 편집본 생성, 브러시 픽셀 변화, 되돌리기/다시실행 이미지 복구, 피드+스토리 세트 저장, 2배 저장 후 다음 단계 모달 표시.
- `npm run smoke` 통과.
- `npm test -- --runInBand` 통과. 테스트 파일 없음.
- `npm run lint` 통과. 오래된 경고 405개는 남아 있으나 막는 오류 0개.
- `git diff --check` 통과.

남은 기술 빚:
- `app-photo-editor.js` 는 1013줄이라 500줄 기준까지는 계속 분리 필요.
- `app-photo-editor-brush.js` 는 447줄로 500줄 아래로 내려왔지만, `_bindBrushPanel` 함수가 아직 길어 다음 라운드에서 이벤트 핸들러 분리 권장.
- 저장/브러시/되돌리기의 큰 구멍은 막았고, 다음 작업은 본체 파일 추가 분리와 원장님들이 자주 쓰는 보정 프리셋 고도화가 좋음.

---

## 🟣 2026-05-18 — v168 병렬 라운드 (전체 계획 일괄 진행)

설계 문서: `~/.claude/plans/zesty-snacking-clarke.md` §11~§17, §25

병렬 작업 5개 (subagent 4 + foreground 1):

1. **사진 편집기 P1 — 뷰티 5 슬라이더 + 템플릿 5종 + 다음 단계 모달**
   - `app-photo-editor.js` 확장 (~890줄, 🟠 분할 후보 → 차후 별도 티켓)
   - 뷰티: HSV 마스킹 픽셀 walk (피부톤/붉은기/모발윤기/네일광택/속눈썹). 슬라이더 change에만 합성 (성능 보호)
   - 템플릿: B&A 좌우 / B&A 상하 / 시술 안내 / 가격표 / 후기 카드 — 모두 1080×1350 캔버스
   - 저장 후 모달: 캡션 만들기 / 고객 기록 첨부(P1 결선 대기) / 인스타 미리보기 3 버튼

2. **Brand Kit 모듈** (subagent A)
   - `app-brand-kit.js` (248줄, ≤250)
   - `css/screens/brand-kit.css` (187줄)
   - 공개 API: `BrandKit.get/save/open/close`
   - 사진 편집기 브랜드 탭 → "Brand Kit 전체 설정" 버튼으로 진입

3. **4:5 비율 분기** (subagent B)
   - `app-gallery-bg.js` (436→459줄)
   - `_ratioToSize('1:1'|'4:5'|'9:16')` 매핑 함수 + `applySelectedBg({target_ratio})` / `applyTemplate(id,{target_ratio})` opts 추가
   - 알파 bbox·서버 누끼·imgly 폴백 불가침

4. **Today Morning 카드** (subagent C)
   - `app-today-morning.js` (283줄)
   - `GET /today/morning` 우선, 폴백: `Booking.list` / `CustomerCache+Chips.pickAll` / `localStorage.itdasy_recent_gallery`
   - 4섹션: 운영 / 고객 케어 / 콘텐츠 / 마케팅
   - SWR 60초 + iPhone Safari 터치 fix
   - 홈 `#homeMorningMount`에 mount (app-home-v41.js _autoMount → TodayMorning.render)

5. **DM intent 정책 매트릭스** (subagent D)
   - `app-dm-autoreply.js` +29줄 (1115→1144)
   - `INTENT_AUTONOMY_DEFAULTS`: 가격=auto / 위치=auto / 시간=confirm_high / 예약=draft / 기타=draft
   - 가격표 존재 여부 체크 후 `auto`→`confirm_high` 다운그레이드
   - explicit `autonomy_mode` 보존 — 기존 분기 0줄 수정
   - 마커: `// [v167-INTENT-MATRIX]`

회귀 영향:
- 사진 편집기: 원본 blob 절대 보존 + 기존 누끼·자동보정 0줄 수정 + 슬라이더 change에만 합성 (60fps 보호)
- Brand Kit: 신규 모듈, 기존 shop_settings 캐시와 키 분리 (`itdasy_brand_kit`)
- 4:5: 기존 1:1/9:16 호출 동작 0줄 영향 (default '1:1')
- Today Morning: 홈에 카드 추가만, 기존 위젯 0줄 영향
- DM intent: explicit autonomy 보존, 기존 booking_action/draft 분기 0줄 영향

진입로 (테스트):
- 사진 편집기: AI·자동화 시트 → 사진 편집기 → 8탭 / Brand Kit 진입
- 모닝 브리핑: 홈 상단 (homeV41Root 위)
- DM intent: DM 자동응답 시트 열면 conversation들이 새 autonomy_mode 자동 할당
- Brand Kit: `window.BrandKit.open()` 또는 사진 편집기 브랜드 탭

빌드 버전: `20260518-v168-parallel-round`

---

## 🟣 2026-05-17 22:00 — 사진 편집기 P0 MVP (티켓 P0-PE-1/2/3 통합)

설계 문서: `~/.claude/plans/zesty-snacking-clarke.md` §25

신규 모듈:
- `app-photo-editor.js` (≈540줄) — 8탭 시트 (자동/보정/뷰티/누끼·배경/템플릿/텍스트/브랜드/내보내기)
  · 캔버스 합성: CSS filter (밝기/채도/색온도/대비) + unsharp mask (선명도)
  · 비율 4종: 원본/1:1/4:5/9:16 자동 자르기 + export
  · 워터마크: 위치 4종(tl/tr/bl/br) + 투명도 + localStorage 기본값 저장
  · 텍스트 1개: 시술명·가격 자동 prefill, 위치 슬라이더
  · history stack 20 + undo
  · 원본/편집 비교: 캔버스 롱탭 또는 "원본" 버튼
- `css/screens/photo-editor.css` (≈200줄) — 다크 테마, 8탭 가로 스크롤

연결:
- `app-assistant-actions-marketing.js` — kind 6종 추가 (open_photo_editor, apply_photo_preset, adjust_photo, add_text_overlay, add_watermark, export_marketing_image)
- `app-assistant.js` — `registerLocalHandler(kind, handler)` API 추가 → open_photo_editor는 백엔드 호출 없이 프론트 단독 실행
- `app-ai-hub.js` — AI·자동화 시트에 "사진 편집기" 행 추가 (NEW 배지)
- `index.html` — CSS/JS 1줄씩 로드, app-assistant/ai-hub 버스터 v167

진입로 3가지 (사용자 테스트용):
1. **AI 자동화 시트 → "사진 편집기"** 행 탭 → 시트 오픈 → 파일 고르기 → 8탭 편집 → 저장
2. **챗봇:** `window.PhotoEditor.open({src: 'blob:...'})` 콘솔 (또는 backend가 open_photo_editor 액션 응답 시 카드 → 실행)
3. **AI 비서 액션 카드:** open_photo_editor kind를 받으면 즉시 편집기 오픈 (로컬 핸들러)

회귀 영향:
- 원본 blob/URL 절대 덮어쓰지 않음
- 기존 누끼·자동보정·B&A는 0줄 수정. 편집기는 별도 시트로 분리
- assistant `_executeAction`은 로컬 핸들러 우선 분기 1개만 추가 (기존 18 kind 0줄 영향)

다음 (P1 잔여 — 사진 편집기):
- 뷰티 탭 5 슬라이더 (피부톤/붉은기/모발 윤기/네일 광택/속눈썹)
- 템플릿 탭 5종 (B&A 좌우/상하/후기/가격/시술 안내)
- 편집 완료 → 캡션 카드 자동 연결
- 인스타 미리보기 4:5/1:1/9:16 자동 매핑
- brand_kit UI (샵 설정 화면)

---

## 🟣 2026-05-17 18:00 — 뷰티업GPT 초고도화 P1-5 (AI 브리핑 카드)

설계 문서: `~/.claude/plans/zesty-snacking-clarke.md` §7

신규/수정:
- `app-customer-ai-brief.js` 신규 (≤350줄) — `/customers/{id}/ai-brief` 우선, 없으면 dashboard 페이로드로 클라이언트 컴퓨트
- `app-customer-chips.js` — `pickAll`/`renderTopN` 노출 (브리핑 카드에서 상위 3개 chip 호스팅)
- `app-customer-dashboard.js` — Hero 뒤 `#cdAiBriefMount` 삽입 + 두 경로(dashboard / 폴백)에서 모두 렌더
- `app-calendar-view.js` — 예약 폼 고객 섹션 안에 `#bfAiBriefMount` 삽입 + 고객 picker로 선택 시 브리핑 갱신, prefill(수정/대시보드 진입) 케이스도 1회 렌더
- `index.html` — `app-customer-ai-brief.js` 로드 (customer-hub 이전), customer-dashboard/calendar-view 버스터 v167

회귀 영향: 백엔드 ai-brief 부재 시 클라이언트 폴백만으로 동작. 카드 비어 있으면 자체 숨김 — 기존 화면 외형 영향 없음.

다음 (P1 잔여):
- 백엔드 `/customers/{id}/ai-brief` 스켈레톤 (LLM 요약 + churn_risk)
- treatment 1급 엔티티 (백엔드 협업)
- send_message 실제 발송 결선 (백엔드 SMS/알림톡 게이트)

---

## 🔴 새 세션은 먼저 읽기

- **현재 Phase:** 9 — 전면 최적화 + 신기능 (플랜 파일 참조)
- **플랜 파일:** `~/.claude/plans/lively-sniffing-pudding.md`
- **이전 완료:** Phase 0~6.4 완전 완료. Phase 7(앱 심사 50%), Phase 8(운영 승격 50%)
- **최신 빌드:** `20260506-v101-phase3-5`

**불가침 영역:**
- 글쓰기 탭 시나리오 팝업(`openCaptionScenarioPopup` / `scenario-selector.js` / `_doGenerateCaption`) — 원영님 "이 로직 최고". 에러 핸들러 문구 1군데 외 수정 금지.
- `#personaDash` div, `cbt1ResetArea` 버튼, `components/scenario-selector.js` 보존

---

## 🔵 Phase 9 진행 현황

### LAST CHECKPOINT — 2026-05-16 18:45
- 프론트 연준 테스트: 로컬 `main` 과 GitHub `origin/main` 동일 (`3742715`).
- 프론트 운영: GitHub `frontend/main` 은 로컬보다 7개 새 커밋이 있고, 로컬은 운영보다 164개 앞서 있어 서로 섞임. 바로 덮어쓰기 금지.
- 백엔드 스테이징: 로컬 `main` 과 GitHub `test/main` 동일 (`f1fbaac`).
- 백엔드 운영: GitHub `origin/main` 은 스테이징보다 61개 뒤처짐.

### Phase 1: 서버 연결 불안정 수정 ✅ 완료 (2026-05-06)
- `app-core.js`: RETRY_STATUSES에 500 추가, MAX_RETRIES 3회, BACKOFF_MS [500,1500,4000]
- `app-core.js`: JSON POST도 재시도 허용 (_isRetryableMethod 확장)
- `app-core.js`: safeFetch timeout 15s → 25s
- `app-perf-recovery.js`: prefetch timeout 8s → 20s
- `app-perf-recovery.js`: _probeBackendOnline → /auth/me 실제 API ping으로 교체
- `app-dm-autoreply.js`: read timeout 8s → 15s

### Phase 2: 성능 최적화 ✅ 1차 완료 (2026-05-06)
- `app-customer-cache.js` 신규: 고객 목록 공유 캐시 + 중복 요청 방지
- `app-customer.js` / `app-customer-hub.js` / `app-customer-dashboard.js`: 같은 고객 캐시를 함께 사용
- `app-revenue.js`: 오늘/이번주/이번달 매출을 미리 받아 탭 전환 대기 줄임
- `app-dm-settings-cache.js` 신규: DM 자동응답/멘트관리 설정 중복 요청 방지
- `app-customer-hub.js`: 고객 분류 계산 반복 줄임
- 보류: 초기 lazy loader 는 `index.html` 로드 순서 영향이 커서 별도 안전 티켓으로 분리

### Phase 3: UX 간소화 ✅ 1차 완료 (2026-05-06)
- `css/screens/phase9-ux.css` 신규: 고객/예약/매출 버튼 터치 영역 44~48px 확보
- `app-phase9-ux.js` 신규: 예약 빠른 추가, 매출 빠른 입력, 공통 로딩/오류 문구 헬퍼 추가
- 홈 빠른 실행 버튼: 예약 추가, 매출 기록, 대기자, 위험 고객, 리마인더, 리뷰 요청, 회원권, 예약 링크

### Phase 4: 보안 강화 🟡 프론트 1차 완료 (2026-05-06)
- `app-secure-storage.js` 신규: Web Crypto 기반 전화번호/주소 암호화 저장
- `app-shop-settings.js`: 샵 전화번호/주소 저장·불러오기를 암호화 저장으로 교체
- 보류: refresh token, shop_id 응답, 강한 CSP 는 백엔드/외부 스크립트 영향 있어 별도 안전 작업 필요

### Phase 5: 신규 기능 🟡 프론트 1차 완료 (2026-05-06)
- `app-waitlist.js` 신규: 대기자 로컬 관리 + 예약 빠른 추가 연결
- `app-reminder.js` 신규: 리마인더 설정 + 예약 확인 수동 전송 연결
- `app-retention-ai.js` 신규: `/retention/at-risk` 기반 위험 고객 화면 + DM 초안 복사
- `app-review.js` 신규: 리뷰 요청 문구 생성/복사 관리
- `app-public-link.js` 로드: 공개 예약 링크 화면을 빠른 실행에 연결
- 남음: 대기자/멤버십/리뷰 서버 저장, 자동 스케줄러, refresh token 은 연준 백엔드 작업 필요

### Phase 6: Cold Start 버그 수정 ✅ 완료 (2026-05-07)
- `app-customer-dashboard.js`: _apiGet 타임아웃 10s→22s, AbortError 시 /customers/{id} 폴백 추가
- `app-perf-recovery.js`: 헬스체크 프로브 타임아웃 8s→20s, 초기 프로브 딜레이 800ms→3s
- `app-core.js`: AbortController 이미 abort된 신호의 재시도 차단 (불필요 토스트 억제)
- `itdasy_backend-test/generation.py`: Vertex AI location "global"→"us-central1" 수정, SA JSON 인증 배포
  - 원인: 사용자가 Railway에 USE_VERTEX_AI=true + GOOGLE_SERVICE_ACCOUNT_JSON 추가했는데
    기존 코드가 location="global" (무효)로 모든 AI 호출 실패 → 챗봇 1분+ 타임아웃

---

## 🟡 원영님 남은 액션 (Phase 7)

1. Apple Developer 계정 가입 ($99/년)
2. Google Play Developer 가입 ($25 1회)
3. T-320 "Sign in with Apple 구현해" 지시
4. 데모 시드 실행 + 스크린샷 촬영 + TestFlight

---

## 핵심 맥락

**토큰 키 체계:**
- `app-core.js:33` `_TOKEN_KEY = 'itdasy_token::' + (staging|prod|local)` 패턴

**스크립트 로드 순서:**
- `index.html:1084-1104` 순서 변경 절대 금지

**깨지면 안 되는 것:**
- Capacitor 플러그인 (SplashScreen/StatusBar/Push/Camera/App)
- OAuth 스킴 `itdasy://`
- GitHub Actions `Android Build` + `Supabase Daily Backup`

---

## 이전 체크포인트 아카이브

2026-04-20 ~ 2026-05-06 이전 체크포인트는 `.ai/CHANGELOG_2026-05.md` 참조.

---

## 재시작 부트스트랩

```
프로젝트 작업 재개합니다. 다음 순서로 읽고, 읽었으면 "bootstrap:OK" 써주세요:
1. CLAUDE.md
2. .ai/SESSION_STATE.md
그 다음 Phase 9 플랜 파일 (~/.claude/plans/lively-sniffing-pudding.md)을 요약해주세요.
```

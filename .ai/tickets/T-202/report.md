# T-202 · 예약 발행 기능 전면 제거 — 집행 보고

- **티켓:** T-202
- **집행자:** Orchestrator (Claude Opus)
- **승인:** 원영님 (2026-04-20 17:30 결정 · 18:?? "가즈아" 집행)
- **완료 시각:** 2026-04-20 19:05 KST
- **트랙:** 표준 트랙 (AGENTS.md §4-A) — 9파일 · 약 280줄 영향

---

## 1. 왜 지웠나

원영님 판단:

> "b3 예약 기능 없앨 것임. 아이콘은 루시드로 최대한. 나머진 오케이"

배경: 프로토타입 v2 ( Single Source of Truth ) 와 현행 구현 비교 중, 예약 발행 기능은 v2 에 존재하지 않음을 확인 → 유지 비용 < 제거 이익 판정.

---

## 2. 실제 손본 파일 (9개)

| # | 파일 | 변경 | 비고 |
|---|------|------|------|
| 1 | `index.html` | L163 설정 시트 버튼 · L216 하단 nav "예약" 탭 · L1079 script 태그 · L1015 요금제 비교표 행 제거 | 4군데 |
| 2 | `app-core.js` | L800~808 `openScheduledBtn` / `schedNavBtn` 이벤트 바인딩 2블록 제거 | |
| 3 | `app-gallery-finish.js` | L85 예약 버튼 마크업 · L146 data-action="schedule" 바인딩 · L283~317 `_scheduleFromFinishTab` 함수 제거 | |
| 4 | `app-ai.js` | L91 예약 버튼 · L232~274 `_schedulePublishFromAi` · L310~339 `createSchedule` 제거 | |
| 5 | `app-scheduled.js` | **파일 통째 삭제** (194줄) | cowork 삭제 권한 요청 후 `rm` |
| 6 | `style-polish.css` | L84 · L88 선택자 토큰 `#_scheduledPopup`, `#scheduledPopup` 제거 | |
| 7 | `style-dark.css` | L52 `html[data-theme="dark"] #scheduledPopup` 라인 제거 | |
| 8 | `.ai/tickets/T-200/SELECTOR_FREEZE.md` | §9 "T-202 에 의해 해제된 셀렉터" 섹션 신규 추가 | 함수 10개 + ID 11개 + data-action 1개 + 파일 1개 |
| 9 | (신규) `.ai/tickets/T-202/report.md` | 이 문서 | |

**총 제거 라인수 추정:** 약 280줄 (순수 삭제, 증강 0)

---

## 3. 검증 결과

### 3.1 grep 0건 검증 ✅

```bash
# 검색 패턴
openScheduledPopup|closeScheduledPopup|_schedulePublishFromAi|
_scheduleFromFinishTab|createSchedule|loadScheduledPosts|
createScheduledPost|cancelScheduledPost|renderScheduledList|
handleCreateScheduled|scheduledPopup|scheduledFormWrap|
scheduledListBox|schedNavBtn|openScheduledBtn|schedImg|
schedCaption|schedCreateBtn|schedulePanel|scheduleToggleBtn|
scheduleDateTime|app-scheduled\.js

# 결과
No matches found
```

### 3.2 "예약 발행" 문자열 검증 ✅

요금제 비교표 행 1건 발견 → 제거 완료. 최종 재검색 0건.

### 3.3 JS 문법 검증 ✅

```bash
node --check app-core.js app-gallery-finish.js app-ai.js
# → SYNTAX OK
```

### 3.4 스모크 체크 (수동 필요 — T4 Ops 대기)

- [ ] 홈 → 설정 시트 열기 → "예약 발행 관리" 항목이 사라졌는지
- [ ] 하단 nav 에 "예약" 탭이 없는지 · 5개 탭(홈/작업실/글쓰기/AI추천/마무리) 정상
- [ ] 마무리 탭 → 완성된 슬롯 카드에서 "🚀 인스타 바로 올리기" 만 보이고 "🗓️ 예약" 은 없는지
- [ ] AI 추천 탭 → 완성된 슬롯 행동 영역이 단일 버튼(전폭) 으로 보이는지
- [ ] 요금제 비교표에 "예약 발행" 행이 없는지
- [ ] 브라우저 콘솔 에러 0건 (`ReferenceError: openScheduledPopup is not defined` 없어야 함)
- [ ] Capacitor sync 통과: `npx cap sync android`

---

## 4. 리스크·롤백

### 리스크 요약

| 항목 | 영향 | 완화 |
|------|------|------|
| 기존 스테이징 유저 중 예약을 걸어둔 사용자 | 백엔드 `/scheduled-posts` 에 아직 레코드 존재 가능 | T3 BE 에 정리 요청 (별도 티켓) — 프론트 제거만으로 백엔드 자동 취소 안 됨 |
| 운영 레포 승격 시 동시 제거 필요 | 프론트만 제거, 백엔드 API 는 살아있음 | 운영 프론트 승격 티켓에 명시 |
| 과거 PR diff 와 이름 충돌 | 10+ 함수명·11 ID 가 향후 재사용되면 git blame 혼란 | SELECTOR_FREEZE §9 에 **재사용 금지** 명시 |

### 롤백 절차

단일 커밋이므로 `git revert <SHA>` 한 방. 단 이후 커밋이 연이어 이 삭제를 기반으로 하면 충돌 가능 — 그 경우 수동 재적용.

---

## 5. 연관 티켓·이전 이슈

- `.ai/tickets/T-200.md` — 디자인 리프레시 (이 제거가 P2/P3 재작업 선결 조건이었음)
- `.ai/tickets/T-200/PROTOTYPE_V2_ALIGNMENT.md` — 프로토타입 v2 대비 구현 차이 분석
- `.ai/tickets/T-202.md` — 메인 티켓
- `.ai/tickets/T-202/plan.md` — 집행 플랜 (영향도 분석 + 6단계 실행 순서)
- `.ai/tickets/T-200/SELECTOR_FREEZE.md §9` — 해제된 셀렉터 목록 (T2/T3 참고용)

---

## 6. 다음 할 일 (큐)

1. **T4 Ops** 로컬 스모크 체크 (§3.4) — 원영님 또는 연준
2. **T3 BE** 에 백엔드 `/scheduled-posts` 엔드포인트·DB 테이블 정리 티켓 발행 (별도)
3. **T-200 P2.5** 하단 nav 이식 (프로토타입 v2 기준) — 이번 제거로 "예약" 탭 자리 비어있음, 4개 탭으로 그대로 가도 되고 새 탭 1개 추가도 가능. 원영님 선택 대기.
4. 운영 레포 승격 시 **같은 변경** 을 `itdasy-frontend` 에 반영 — 표준 트랙 승격 PR 필요

---

## 7. 원영님용 한 줄 요약 (AGENTS.md §11 쉬운 말)

> **"예약 발행 기능, 앱에서 완전히 없앴어요. 9개 파일에서 약 280줄 지웠고 검색해서 흔적 0개 확인했어요. 문법도 깨지지 않았고요. 이제 직접 한 번 눌러서 확인해 주시거나, T4 에게 스모크 테스트 맡기시면 끝이에요."**

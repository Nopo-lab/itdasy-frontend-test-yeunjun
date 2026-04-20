# BOARD — 터미널 상태 대시보드

**LAST UPDATED:** 2026-04-20 17:50 (T-202 영향도 조사 + plan.md 완료 · 원영님 🟢 대기) by 오케스트레이터

> 전 터미널이 읽고, 오케스트레이터만 쓴다. 30초 안에 "누가 뭘 하고 있나" 파악되어야 함.

---

## TERMINAL ASSIGNMENT

| 터미널 | 역할 | 모델 | 활성 티켓 | 마지막 활동 |
|--------|------|------|-----------|-------------|
| T1 | Architect (스펙+리뷰) | Opus 4.6 | T-200 P0 완료 (대기) | 2026-04-20 15:36 |
| T2 | FE Coder | Sonnet 4.6 | T-200 P1/P2/P3 코드 완료 → P4 대기 | 2026-04-20 16:20 |
| T3 | BE Coder | Sonnet 4.6 | - | 미가동 |
| T4 | Ops (테스트+GC+문서) | Haiku 4.5 | - (T-005 완료) | 2026-04-20 14:50 |
| 오케스트레이터 | 코디네이터 + P3 교차검증 완료 | Opus 4.6 | T-200 P3 검증 통과 (이번 세션) | 2026-04-20 16:30 |

---

## IN PROGRESS

(없음 — 원영님 승인 대기 3건이 리뷰 큐에 있음)

## BLOCKED

(없음)

## READY FOR REVIEW (원영님 🟢 필요)

- **T-202 플랜** · 예약 발행 제거. 영향도 조사 완료 (9개 파일, 약 280줄 제거). 상세: `.ai/tickets/T-202/plan.md`. 당초 "4곳" 예상했으나 `app-ai.js`·`app-gallery-finish.js` 에 통합 지점 추가 발견. 🟢 주시면 T2 단일 커밋으로 일괄 제거.

## DECIDED (2026-04-20 17:30)

- **재스코프 방향 승인.** P0/P1 보존, P2/P3 REJECT, P2.5→P2.6→P2-re→P3-re→P4→P5→P6 순서
- **작업실 + 글쓰기 → 만들기 병합**
- **페르소나 → 내 샵 승격** (id `tab-persona` 보존)
- **예약 기능 제거** → T-202 신설
- **아이콘 = Lucide SVG 최대한** (본문 텍스트 이모지만 허용)

## REJECTED (재작업 필요)

- **T-200 P2** · 홈 탭. 상단 탭바 기반, 프로토 v2 의 `greet/cta-main/이어하기` 미반영 → **P2-re** 로 재작업
- **T-200 P3** · 작업실. 드롭존만 모방, 프로토 `dropzone+inline-link+text-only-mode` 미반영 → **P3-re** 로 재작업

## READY TO START (의존성 순서)

1. **T-202** · 예약 발행 기능 제거 (선결) — T1 Architect 영향도 조사 플랜 대기
2. **T-200 P2.5** · 하단 네비(`.bn`) 이식 · `.ai/tickets/T-200/P2.5_BOTTOM_NAV.md`
3. **T-200 P2.6** · Lucide 아이콘 통일 · `.ai/tickets/T-200/P2.6_LUCIDE_ICONS.md`
4. **T-200 P2-re** · 홈 탭 재작업 (작업실+글쓰기 병합 반영)
5. **T-200 P3-re** · 만들기 탭 재작업 (드롭존+글만쓰기 인라인)
6. **T-200 P4** · 마무리 탭 재작업
7. **T-200 P5** · 내 샵 탭 (`tab-persona` 기반 재구성)
8. **T-200 P6** · 네비/아이콘 마감 정리
9. **T-009** · XSS · T-200 완료 후
10. **T-004** · 백엔드 에러 · T3 담당 (다른 레포, 병렬 가능)
11. **Phase 2** · 큰 파일 쪼개기 · T-009 후

## 🎛️ 터미널 부팅 상태

- [x] T1 Architect — bootstrap:OK @ 2026-04-20 04:35 (T-006/T-007 픽업)
- [x] T2 FE Coder — bootstrap:OK @ 2026-04-20 (Phase 2 티켓 대기 중)
- [ ] T3 BE Coder — 대기
- [ ] T4 Ops — 원영님이 여시면 체크

각 터미널 첫 bootstrap 시 해당 줄에 `bootstrap:OK @ 시각` 자가 기록.

## DONE (이번 주)

- 계획 단계:
  - HARNESS_PLAN.md 작성
  - FRONTEND_AUDIT.md 작성
  - ORCHESTRA_PLAN.md 작성 → 4터미널로 리비전
  - AGENTS.md 생성 + .ai/ 스캐폴딩 + 티켓 5개 작성
- Phase 1 실행:
  - **T-003 완료** · app-push.js:42 토큰 키 버그 픽스. 오케스트레이터 직접 편집. 자가검토 10개 체크리스트 통과.
  - **T-001 완료** · `js/{caption,portfolio,gallery,persona,core}/CLAUDE.md` 5개 배치. self-review 통과.
  - **T-002 완료** · ESLint + Stylelint + husky + lint-staged 설정. `package.json` scripts + devDeps 갱신. self-review 통과.
  - **T-005 완료** · `scripts/gc-weekly.js` + `.github/workflows/gc-weekly.yml` + `.ai/tickets/T-005/{plan,self-review,WORK_SUMMARY}.md`. T4 Ops 담당. 🟢 승인 (2026-04-20 15:10).
  - **T-006 완료** · `app-support.js:167` 레거시 토큰 키 1줄 교체. T1 Architect 담당. 🟢 승인 (2026-04-20 15:10).
  - **T-007 완료** · `js/{gallery,persona,core}/CLAUDE.md` 3개 정정. T1 Architect 담당. 🟢 승인 (2026-04-20 15:10).
- Phase 1.5 T-200 코드 단계 (승인 대기 중):
  - **T-200 P0 완료** · SELECTOR_FREEZE.md 작성 (ID 256 / class 11 / data-* 11 / 전역함수 75 고정). T1 Architect. ✅ 2026-04-20 오전.
  - **T-200 P1 완료 (코드)** · style-base.css 296→304, style-dark.css 154→163, alias 층 구축. T2 FE Coder. 스샷 OK. → 원영님 승인 대기.
  - **T-200 P2 완료 (코드)** · index.html 홈 탭 L220~407 리프레시, style-home.css 453→537, T-201(accent-light) 동시 픽스. T2 FE Coder. 스샷 3장. → 원영님 승인 대기.
  - **T-200 P3 완료 (코드)** · app-gallery.js `_buildWorkshopHTML` 템플릿 38줄 교체 (JS 로직 0), style-components.css 434→477 (+43). T2 FE Coder. 스샷 2장. 오케스트레이터 교차검증 통과 (2026-04-20 16:30). → 원영님 승인 대기.

---

## BOOTSTRAP TRACKING

각 터미널은 세션 시작 시 AGENTS.md §0 순서대로 읽은 후 여기에 기록:

| 터미널 | 마지막 bootstrap | 다음 bootstrap 필요 시점 |
|--------|------------------|--------------------------|
| T1 | 2026-04-20 04:35 | 다음 세션 시작 시 (현재 대기 중) |
| T2 | 2026-04-20 | T-200 P4 진입 시 (원영님 🟢 필요) |
| T3 | - | 첫 가동 시 (T-004 시작 시) |
| T4 | 2026-04-20 14:50 | 다음 세션 시작 시 (현재 대기 중) |

---

## 이번 주 우선순위 (오케스트레이터 설정)

1. Phase 1 (T-001~T-007) — **완료 ✅**
2. T-200 P0~P3 코드 — **완료** (원영님 승인 대기)
3. T-200 P4~P6 — **다음 주**
4. T-008 (보안 취약점 2건) — Phase 2 직전

## 다음 판단 포인트 (원영님 결정 필요)

- **T-200 재스코프 승인** → `PROTOTYPE_V2_ALIGNMENT.md` 읽고 A/B/C 답변
- **P2.7 탭 매핑 3문항** (작업실+글쓰기 병합 / 페르소나→내샵 / 예약버튼 위치)
- **T-009 (XSS) 처리 시점** → T-200 완료 후 별도 승인
- **Phase 2 착수 시점** → T-200 끝난 뒤 "Phase 2 시작해"

# T-410 Self Review · Sprint E CRM/재고 통합

**작성:** 2026-05-02 12:28 · 오케스트레이터

## 변경 파일

- `app-complete-flow.js` — 시술 완료 팝업 금액 자동입력, 매출/예약 변경 알림, 재고 확인 진입.
- `app-calendar-view.js` — 예약 생성/수정/삭제/상태 변경 후 공통 변경 알림.
- `app-customer-dashboard.js` — 예약 삭제 신호도 고객 상세 화면 새로고침 대상에 포함.
- `app-inventory-hub.js` — 재고 추가/묶음 저장/수량 변경/수정 후 공통 변경 알림.
- `app-myshop-v3.js` — 변경 신호를 받으면 오래된 내샵 요약 저장값 삭제.
- `index.html` — 변경 JS 캐시 새로고침용 버전값만 갱신. 스크립트 순서 변경 없음.
- `app-core.js` — 앱 빌드 이름 갱신.
- `sw.js` — 캐시 이름 갱신.
- `.ai/BOARD.md`, `.ai/SESSION_STATE.md`, `.ai/FOR_USER.md`, `.ai/tickets/T-410.md`, `.ai/tickets/T-410/plan.md`, `.ai/tickets/T-410/self-review.md` — 작업 기록.

## 체크리스트

1. ☑ 이 변경이 건드리는 파일 전체 목록 나열 완료.
2. ☑ `index.html` 스크립트 로드 순서 변경 없음. 버전 꼬리표만 갱신.
3. ☑ 새 전역 추가 없음. 기존 `window.CompleteFlow`, `window.closeCompleteFlow` 유지.
4. ☑ 토큰 저장 키 관련 변경 없음.
5. ☑ Capacitor 네이티브 설정 변경 없음.
6. ☑ 운영 DB 직접 접근 없음.
7. ☑ 큰 파일에 새 독립 기능을 만들지 않고 기존 이벤트 흐름 보강 중심으로 처리.
8. ☑ 빈 `catch {}` 추가 없음.
9. ☑ 커밋 메시지에 `T-410` 포함 예정.
10. △ `npm run lint && npm test` 중 `npm test` 통과, `npm run lint` 는 기존 오래된 빈 catch 오류 15건 때문에 실패. 이번 변경 파일 중심 검사는 오류 0개.

## 확인 결과

- `node --check app-complete-flow.js app-calendar-view.js app-inventory-hub.js app-customer-dashboard.js app-myshop-v3.js app-core.js sw.js` 통과.
- `npm run smoke` 통과.
- `npm test` 통과.
- 변경 파일 중심 자동 검사: 오류 0개, 기존 경고만 있음.
- 전체 자동 검사: 실패. 기존 파일 `app-backup.js`, `app-failures-hub.js`, `app-gestures.js`, `app-kakao-hub.js`, `app-naver-link.js`, `app-shop-settings.js` 의 오래된 빈 catch 문제.

## 의도적으로 안 한 것

- 시술별 재료 자동 차감은 하지 않음. 아직 "시술 → 재고 품목/수량" 연결표가 없어서 잘못 차감될 수 있음.

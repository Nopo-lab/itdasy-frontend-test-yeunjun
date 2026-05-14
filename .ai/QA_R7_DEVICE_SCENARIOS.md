# QA-r7 실기기 시나리오 — 영수증 OCR + 재고 + 캘린더 + 스크롤/햅틱

본 라운드 변경사항이 실기기에서 의도대로 동작하는지 확인하기 위한 체크리스트.
**연준님이 직접 폰 들고 따라가면서 통과/실패 체크해주세요.**

빌드 식별:
- 프론트 staging: `https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/`
- 빌드: `v125-qa-r7-prose-repair` (또는 더 새로운 SHA)
- 백엔드 staging: Cloud Run `itdasy-backend-staging-*`

테스트 전:
- [ ] PWA 캐시 한 번 비우기 (Safari: 설정 → Safari → 데이터 삭제 / Chrome: 사이트 데이터 지우기)
- [ ] 또는 `?cb=1` 쿼리 붙여 새로고침
- [ ] 우측 상단 버전 배지가 `v125` 이상인지 확인

---

## 1. iPhone Safari — 영수증 OCR 7장 + 카드할인/쿠폰

**시나리오**: 올리브영 영수증 7장(카드할인·CJONE 쿠폰 적용 케이스 포함)을 AI 비서에 업로드.

재현:
1. AI 비서 시트 열기
2. 카메라 아이콘 → "갤러리에서" → 영수증 7장 선택
3. "분석 중…" 토스트 후 응답 대기

**Pass 조건**:
- [ ] **0건 추출인데 본문에 가격 풀로 들어가는 모순 메시지 안 나옴** (가장 중요)
- [ ] 액션 카드가 N건 뜨거나, 0건이면 "분석은 됐지만 자동 저장 가능한 형태로 정리가 안 됐어요. 사진을 다시 찍거나 직접 추가해주세요" 안내문으로만 표시
- [ ] 카드할인 / CJONE 쿠폰 케이스의 expense action 이 노란색(낮은 confidence) 배지로 표시 (prose 보정 성공)
- [ ] 토스트나 alert 에 prose substring("원 지출되었어요" 등) 노출 0건
- [ ] AI 비서 시트 닫고 다시 열어도 같은 history 동일하게 표시 (재진입 race 없음)

**Fail 시 기록**:
- 실제 actions 수 = ?
- 답변 본문 첫 200자:
- 노란 배지 카드 있었음 yes/no
- 카드 클릭 → "직접 추가" 또는 "수정" 동작 yes/no

---

## 2. iPhone Safari — 재고 + 버튼 연타 진동 검증

**시나리오**: 재고관리 시트에서 + 버튼 빠르게 5회 연타.

재현:
1. 홈 → 재고관리 진입 (또는 AI Hub → 재고)
2. 임의 항목 + 버튼을 1초 안에 5회 빠르게 탭
3. 진동 횟수 + 수량 변화 관찰

**Pass 조건**:
- [ ] **진동이 5회 이하로만 발생** (이전엔 20~30회 폭주 보고). _adjusting flag 가 동시 fire 차단
- [ ] 최종 수량 = 시작값 + 1 (정확히, +5 아님 — 한 클릭만 fire 됨이 정상)
- [ ] 응답 도착 전 추가 + 클릭은 무시되고 진동도 없음
- [ ] API 응답 도착 후 다음 + 클릭 다시 가능

**Fail 시 기록**:
- 진동 횟수 (체감): ?
- 최종 수량 변화 (+N): ?
- 5회 연타 중 시각 피드백 (버튼 disabled 인지) yes/no

---

## 3. iPhone Safari — 재고 스크롤 부드러움

**시나리오**: 재고 항목 10개 이상 등록한 후 빠르게 위아래 스크롤.

재현:
1. 재고관리 시트에서 빠른 swipe up/down 5회 반복
2. 가속도(flick) 후 자연스럽게 멈추는지 확인

**Pass 조건**:
- [ ] swipe 후 momentum scrolling 이 자연스럽게 감속 (iOS 기본 동작)
- [ ] 끝점에서 bounce-back (overscroll-behavior: contain 으로 부모 페이지로 안 넘어감)
- [ ] 60fps 체감 (loose 기준)

**Fail 시 기록**:
- 멈춤 위치 (드래그 즉시 stop vs 자연 감속): ?
- 가로 스와이프가 sheet 닫기로 인식되는지 yes/no

---

## 4. Android Chrome — 영수증 OCR + 재고 동일 항목

위 1, 2, 3 시나리오를 Android Chrome 또는 PWA 설치 상태로 재실행.

**기대**: iOS와 동일 동작.

---

## 5. iPhone Safari — 캘린더 즉시 반영

**시나리오**: AI 비서에 "내일 오전 10시 김민지 손님 시술 예약 추가" 입력 → 캘린더 즉시 보이는지.

재현:
1. AI 비서 시트에서 위 문장 전송
2. 액션 카드 "예약 추가" → 확인
3. 시트 닫고 캘린더 탭 진입

**Pass 조건**:
- [ ] 캘린더 진입 시 새 예약이 새로고침 없이 표시
- [ ] (또는) `_invalidateCache` 동작으로 자동 fresh fetch 후 표시

**Fail 시 기록**:
- 새로고침 필요 여부 yes/no
- 표시 지연 시간 (초): ?

---

## 6. PWA 캐시 갱신

**시나리오**: 홈 화면 추가된 PWA 가 새 버전 자동 갱신.

재현:
1. PWA 앱 종료 (홈 버튼 또는 close)
2. PWA 재실행
3. 우측 상단 버전 배지 확인

**Pass 조건**:
- [ ] 1~2회 재시작 안에 버전 배지가 `v125` 이상으로 업데이트
- [ ] CACHE_VERSION mismatch 감지 → 강제 reload (1회만 발생, 무한 reload 아님)

**Fail 시 기록**:
- 재시작 횟수 후에야 새 버전 표시: ?
- 흰 화면 watchdog 발동 여부 yes/no

---

## 7. 회귀 — 정상 영수증 단일 (1장만)

**시나리오**: 단일 영수증 1장 (예: 스타벅스 카페 영수증) 업로드 → 정상 action 1건 뜨는지.

재현:
1. AI 비서 → 카메라 → 영수증 1장
2. 응답 대기

**Pass 조건**:
- [ ] expense action 1건 카드 표시
- [ ] amount 정상 (4500 등)
- [ ] confidence 배지 정상 색상 (녹색/회색, 노란색 아님 — prose 보정 안 거침)
- [ ] memo 가 prose substring 아니고 실제 품목명/금액

---

## 통합 통과 판정

- 1~4: 모두 Pass → **출시 가능**
- 1, 2 중 하나라도 Fail → **출시 차단**, 본 라운드 코드 rollback 또는 hotfix
- 3, 5, 6, 7 Fail → **UX/회귀 이슈로 별도 hotfix 필요**

## Rollback 방법

본 라운드(QA-r7) 변경 되돌리려면:

```bash
# Frontend (yeunjun)
cd ~/.../itdasy-frontend-test-yeunjun
git revert <qa-r7 SHA> --no-edit
git push origin main

# Backend (test/staging)
cd ~/.../itdasy_backend
git checkout main
git revert <qa-r7 SHA> --no-edit
git push test main
```

Cloud Run 은 push 후 자동 rebuild. GitHub Pages 도 push 후 30~60초.

Pages 배포는 frontend SHA `<QA-r7-prev>` 로 즉시 원복. 백엔드는 Cloud Run 이전 revision 으로 traffic 100% 돌릴 수도 있음:

```bash
gcloud run services update-traffic itdasy-backend-staging \
  --to-revisions=PREV_REVISION_NAME=100 \
  --region=asia-northeast3
```

(PREV_REVISION_NAME 은 Cloud Run 콘솔에서 `qa-r6` 직전 revision 이름 확인)

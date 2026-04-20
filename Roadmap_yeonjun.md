# Roadmap — 연준 (뷰티업계 최강 앱 전환)

> 이 문서는 **연준 전용 로드맵**이다. 원영이 진행 중인 `.ai/` 하네스·T-200 디자인 리프레시·T-202 예약 제거는 이 로드맵과 **독립**이며, 원영이 자기 공간에서 이어서 추가한다.  
> **최초 작성:** 2026-04-20 · **기반 커밋:** `5c59eb2` (salvage 완료 시점)  
> **백업 브랜치:** `backup/pre-wonyoung-base-20260420`(연준 50+ 원본) / `backup/yeunjun-roadmap-20260420`(로드맵 시작 시점 스냅샷)

---

## 0. 컨텍스트

### 현재 위치
- **앱 성격**: 뷰티샵 1인샵 원장님용 모바일 앱. AI 캡션·페르소나·사진 편집·인스타 자동화만 잘 되는 **반쪽짜리**.
- **없는 것**: 고객관리(CRM), 예약, 매출 대시보드, 재고, 결제·POS, 직원, 리뷰 연동, 세무, 알림톡, 멀티샵 — 전부 전무.
- **시장 압력**: 핸드SOS(월 19,900원), 공비서(무료), 용감한뷰티(월 15,000원), 뷰티인프라 등이 이 기본 영역을 이미 커버한 채 AI를 얹기 시작. 지금 방향을 잡지 않으면 6개월 내 "마케팅만 되는 툴"로 깔림.

### 전략 슬로건
> **"사진만 찍어요. 마케팅·예약·고객관리는 잇데이가 합니다."**

경쟁사가 **데이터 → AI** 순으로 가는 동안, 잇데이는 **AI → 데이터** 역방향. 이미 강한 AI 파이프라인 위에 CRM·예약·매출을 부속으로 얹어 자동화 도달률로 방어.

### 고정 제약
- **수익 모델**: Apple StoreKit IAP + Google Play Billing. `itdasy_pro_monthly_19900` / `itdasy_premium_monthly_39900`. 토스 제외. 거래수수료 모델 불가.
- **타겟**: 1인샵 원장님. 멀티지점은 Phase 5 양면앱으로 간접 지원.
- **인프라**: FastAPI(Railway) + Supabase + GitHub Pages PWA + Capacitor iOS/Android. Free 한도 엄격(캡션 3/일, 누끼 2/일).
- **팀**: 연준 풀스택 1인 + 원영 프론트 디자인.
- **파일 상한**: 500줄. >1000줄은 새 기능 추가 금지.

---

## 1. Phase 2~5 개요

| Phase | 기간 | 목표 | 핵심 모듈 |
|---|---|---|---|
| **Phase 2** | 0~3개월 | 반쪽짜리 탈출 | 고객 DB / 예약 / 알림톡 / 매출 / 모놀리스 분할 |
| **Phase 3** | 3~6개월 | 한국 1인샵 차별화 | 네이버 리뷰 / NPS / 숏폼 자동 / 인센티브 / 재고 |
| **Phase 4** | 6~12개월 | AI 선제 제안 | 재방문 예측 / 매출 예측 / 페르소나 v2 / AR 상담 |
| **Phase 5** | 12개월+ | 양면 생태계 | 잇데이 Meet 고객앱 / 커뮤니티 / Add-on 스토어 |

---

## 2. 파일 변경 추적 (Master List)

> ⚠️ 이 섹션은 구현이 진행됨에 따라 **실시간 갱신**한다. 각 Phase에서 파일 상태를 `🔴 신설` / `🟡 수정` / `⚫ 삭제` / `🟢 분할`로 표시.

### 범례
- 🔴 **신설** — 새로 만들 파일
- 🟡 **수정** — 기존 파일에 기능 추가
- ⚫ **삭제** — 파일 제거 (근거 명시 필수)
- 🟢 **분할** — 모놀리스 분할

---

### Phase 2 — 반쪽짜리 탈출 (10~12주)

#### 2.1 고객 DB (경량 CRM) — 2주

| 상태 | 파일 | 변경 내용 | 실제/예상 라인 | 진행 |
|---|---|---|---|---|
| 🔴 | `itdasy_backend/routers/customers.py` | CRUD + 태그 + 메모 + 방문이력 | ~400 | ⏳ |
| 🔴 | `itdasy_backend/migrations/20260501_customers.sql` | `customers` 테이블 | ~40 | ⏳ |
| 🔴 | `app-customer.js` | 고객 목록·검색·CRUD·상세 + 오프라인 폴백 + 오버레이 시트 | **307** | ✅ |
| 🟡 | `shared/schemas.json` | `Customer` 모델 + 5개 엔드포인트(GET/POST/GET-id/PATCH/DELETE) | **+81** | ✅ |
| 🟡 | `index.html` | 설정시트 `👥 내 고객 관리` 행 + script 태그 | **+4** | ✅ |
| 🟡 | `app-core.js` | 탭 라우팅 (T-200 후 추가) | +30 | ⏸ T-200 대기 |
| 🟡 | `style-home.css` | 고객 카드 CSS 토큰 (T-200 디자인 확정 후) | +60 | ⏸ T-200 대기 |

**2.1 진입 경로 (Phase 2 잠정)**: 설정시트 → `👥 내 고객 관리` → 오버레이 시트. T-200 하단 네비 확정 후 메인 탭으로 승격 예정.

#### 2.2 자체 예약 캘린더 — 2주

| 상태 | 파일 | 변경 내용 | 예상 라인 |
|---|---|---|---|
| 🔴 | `itdasy_backend/routers/booking.py` | 예약 CRUD + 시간슬롯 + 중복 검사 | ~500 |
| 🔴 | `itdasy_backend/migrations/20260515_bookings.sql` | `bookings` 테이블 + `shop_hours` 테이블 | ~60 |
| 🔴 | `app-booking.js` | 월/주/일 뷰 + 드래그 드롭 예약 | ~450 |
| 🟡 | `app-customer.js` | 고객 상세에서 예약 생성 버튼 | +40 |
| 🟡 | `app-core.js` | 예약 탭 라우팅 | +20 |
| 🟡 | `index.html` | 예약 탭 마크업 | +60 |

#### 2.3 카카오 알림톡 (알리고 대행) — 1.5주

| 상태 | 파일 | 변경 내용 | 예상 라인 |
|---|---|---|---|
| 🔴 | `itdasy_backend/services/kakao_alimtalk.py` | 알리고 API 래퍼 + 템플릿 렌더링 | ~250 |
| 🔴 | `itdasy_backend/routers/notification.py` | 알림 발송 이력·재시도 | ~180 |
| 🔴 | `itdasy_backend/migrations/20260525_notifications.sql` | `notifications` 테이블(발송 로그) | ~30 |
| 🔴 | `itdasy_backend/docs/alimtalk_templates/` | 4종 템플릿 JSON (예약확정 / 1일전 리마인드 / 시술후 감사 / 재방문 쿠폰) | ~150 |
| 🟡 | `itdasy_backend/.env.example` | `ALIGO_API_KEY`, `ALIGO_USER_ID`, `ALIGO_SENDER_KEY` | +3 |
| 🟡 | `routers/booking.py` | 예약 생성 시 `send_alimtalk("booking_confirm")` 호출 | +20 |

#### 2.4 포트폴리오 ↔ 고객 자동 첨부 — 1주

| 상태 | 파일 | 변경 내용 | 예상 라인 |
|---|---|---|---|
| 🟡 | `itdasy_backend/routers/portfolio.py` | `customer_id` 컬럼 추가 + FK | +30 |
| 🔴 | `itdasy_backend/migrations/20260530_portfolio_customer_fk.sql` | `portfolio.customer_id` 컬럼 추가 | ~15 |
| 🟡 | `app-portfolio.js` | 고객 카드 링크 필드 + 필터 | +80 |
| 🟡 | `app-gallery-finish.js` | 저장 시 고객 선택 드롭다운 | +40 |

#### 2.5 매출 입력 + 대시보드 — 1.5주

| 상태 | 파일 | 변경 내용 | 예상 라인 |
|---|---|---|---|
| 🔴 | `itdasy_backend/routers/revenue.py` | 매출 건당 기록 + 일/주/월 집계 | ~400 |
| 🔴 | `itdasy_backend/migrations/20260605_revenue.sql` | `revenue_records` 테이블 | ~25 |
| 🔴 | `app-revenue.js` | 입력 폼 + 경량 SVG 차트(3탭: 오늘/이번주/이번달) | ~400 |
| 🟡 | `app-core.js` | 매출 탭 라우팅 | +20 |
| 🟡 | `index.html` | 매출 탭 마크업 | +70 |
| 🟡 | `app-booking.js` | 예약 완료 처리 시 매출 자동 입력 제안 | +30 |

#### 2.6 모놀리스 분할 (Phase 2 선결 조건) — 2주

> **이유**: 파일 500줄 상한. `app-caption.js`(1167줄) / `app-portfolio.js`(1023줄) / `app-gallery.js`(1016줄)는 이 분할 전에는 **새 기능 추가 불가**.

| 상태 | 파일 | 변경 내용 |
|---|---|---|
| 🟢 | `app-caption.js` → `js/caption/{core,render,persona-prompt,token}.js` 4분할 | 원영 하네스의 `js/caption/CLAUDE.md` 플레이스홀더 이미 있음. 채우기만. |
| 🟢 | `app-portfolio.js` → `js/portfolio/{list,detail,upload,filter}.js` 4분할 | `js/portfolio/CLAUDE.md` 이미 있음 |
| 🟢 | `app-gallery.js` → `js/gallery/{core,bg,element,review,write,finish}.js` (이미 상당부분 분할됨) 마무리 | `js/gallery/CLAUDE.md` 이미 있음 |
| 🟡 | `index.html` | script 태그 재구성 | ~40줄 수정 |

**Phase 2 완료 기준**
- [ ] 고객등록 → 예약 → 알림톡 → 시술기록 → 사진첨부 → 매출 = 단일 플로우 E2E
- [ ] 알림톡 템플릿 4종 알리고 승인 + 발송률 ≥95%
- [ ] 매출 대시보드 월별 그래프 렌더 (샵 하나당 ≥30건 테스트)
- [ ] 3개 모놀리스 500줄 이하로 분할
- [ ] Free(고객 50명) / Pro(무제한) IAP 한도 분기 적용
- [ ] Chrome DevTools 세션 5분 재현 중 에러 없음

---

### Phase 3 — 한국 1인샵 차별화 (12~14주)

| 상태 | 파일 | 변경 내용 | 예상 라인 |
|---|---|---|---|
| 🔴 | `itdasy_backend/routers/naver_review.py` | 네이버 플레이스 URL 파싱 + 리뷰 메타 추출 | ~350 |
| 🟡 | `app-gallery-review.js` | 네이버 리뷰 스티커 자동 생성 (현재 UI만) | +250 |
| 🔴 | `itdasy_backend/routers/nps.py` | NPS 설문 발송·수집·집계 | ~300 |
| 🔴 | `itdasy_backend/services/video.py` | ffmpeg 비포/애프터 → 릴스(MP4) 자동 생성 | ~400 |
| 🔴 | `itdasy_backend/routers/inventory.py` | 소모품 DB + 시술별 자동 차감 + 임계치 알림 | ~400 |
| 🔴 | `itdasy_backend/migrations/20260701_inventory.sql` | `inventory_items`, `service_material_map` | ~40 |
| 🟡 | `app-revenue.js` | 시술 인센티브 계산기 탭 추가 | +200 |
| 🔴 | `app-inventory.js` | 재고 입고·출고·알림 UI | ~350 |
| 🟡 | `index.html` | 재고 탭 | +50 |

**Phase 3 완료 기준**
- [ ] NPS 응답률 ≥25%, 별점 4.5+ 자동 네이버 리뷰 유도 딥링크 작동
- [ ] 숏폼 자동 생성 평균 ≤30초
- [ ] 재고 차감 오탐 ≤5% (3샵 베타)
- [ ] 샵당 네이버 리뷰 수집 ≥10건/월

---

### Phase 4 — AI 선제 제안 (16~20주)

| 상태 | 파일 | 변경 내용 | 예상 라인 |
|---|---|---|---|
| 🔴 | `itdasy_backend/services/retention_predictor.py` | 마지막 방문일·주기 학습 → 이탈 임박 고객 리스트 | ~500 |
| 🔴 | `itdasy_backend/routers/retention.py` | 주간 자동 쿠폰 알림톡 발송 잡 | ~200 |
| 🔴 | `itdasy_backend/services/revenue_forecaster.py` | 주간 매출 예측 + 저조 주 마케팅 제안 | ~400 |
| 🟡 | `routers/persona.py` | 페르소나 v2: 고객 세그먼트별 어퓨샷 분기 | +300 |
| 🔴 | `app-ar-consult.js` | Capacitor Camera + on-device 스킨/네일 분석 | ~600 |
| 🔴 | `itdasy_backend/services/dynamic_coupon.py` | 비수기·요일별 자동 할인 엔진 | ~350 |
| 🟡 | `app-revenue.js` | 예측 차트 섹션 추가 | +150 |

**Phase 4 완료 기준**
- [ ] 재방문율 +15% (Phase 3 말 vs Phase 4 말)
- [ ] AI 제안 채택률 ≥30%
- [ ] AR 상담 후 시술 전환율 +10%

---

### Phase 5 — 양면 생태계 (20주+)

| 상태 | 파일/레포 | 변경 내용 |
|---|---|---|
| 🔴 | **신규 레포** `itdasy-meet` (고객용 앱) | Capacitor 신규 빌드. Pro 원장님의 고객만 초대. |
| 🔴 | `itdasy_backend/routers/meet/*` | 고객 앱 전용 엔드포인트 (예약/포인트/히스토리) |
| 🔴 | `itdasy_backend/routers/community.py` | 1인샵 커뮤니티 피드 + 템플릿 구독 |
| 🔴 | `itdasy_backend/routers/addon_store.py` | IAP 비소비성 Add-on (AR·영상 팩) |
| 🟡 | `app-plan.js` | Add-on 스토어 진입점 |

**Phase 5는 원영 + 외주 투입 시점.**

---

## 3. 즉시 착수 (Phase 2 첫 4주) — Week by Week

### 선결 조건
- [ ] 운영 DB 비밀번호 교체 (2026-04-19 채팅 노출 건)
- [ ] 원영의 T-200 P2-re/P3-re 리프레시 완료 대기 (탭 구조 확정)
- [ ] 알리고 가입 + 템플릿 4종 신청 (승인 2~5일 소요, Day 1부터 병렬 진행)

### Week 1~2 · P0-1 고객 DB 최소셋
- 🔴 신설: `itdasy_backend/routers/customers.py`
- 🔴 신설: `itdasy_backend/migrations/20260501_customers.sql`
- 🔴 신설: `app-customer.js`
- 🟡 수정: `app-core.js`, `index.html`, `shared/schemas.json`

### Week 3 · P0-2 포트폴리오 ↔ 고객 연결
- 🟡 수정: `app-portfolio.js` (+80줄)
- 🟡 수정: `itdasy_backend/routers/portfolio.py` (customer_id 컬럼)
- 🔴 신설: `itdasy_backend/migrations/20260530_portfolio_customer_fk.sql`
- 🟡 수정: `app-gallery-finish.js` (저장 시 고객 선택)

### Week 4 · P0-3 매출 간이 입력
- 🔴 신설: `itdasy_backend/routers/revenue.py` (~150줄 MVP)
- 🔴 신설: `app-revenue.js` (~300줄 3탭 SVG 차트)
- 🟡 수정: `index.html`, `style.css`

**4주차 말 목표**: 고객등록 → 사진첨부 → 매출 1건 기록 = E2E 단일 플로우.

---

## 4. 기술 의사결정

| # | 결정 | 선택 | 근거 |
|---|---|---|---|
| D1 | 예약 시스템 | **자체 구축** | 네이버예약 API 부재, 카카오 수수료. 1인샵은 내 달력이면 충분 |
| D2 | 알림톡 루트 | **알리고 대행** | 자체 비즈채널 승인 3~6주 블로커. 알리고는 API 빠르고 저렴 |
| D3 | 결제·POS | **수동 입력만 (Phase 2~3)** | IAP 정책상 거래수수료 불가. 블루투스 프린터는 Phase 3 옵션 |
| D4 | 영상 생성 위치 | **하이브리드** | Pro=서버 ffmpeg, Free=on-device. 비용·발열 양쪽 관리 |
| D5 | DB 전략 | **Supabase 유지** | 지금 속도·Auth·실시간 통합. Railway 이중화는 Phase 4+ |

---

## 5. 재사용할 기존 자산

| 자산 | 파일 | 재사용 지점 |
|---|---|---|
| 페르소나 어퓨샷 엔진 | `routers/persona.py` | Phase 4 세그먼트별 캡션 분기 |
| 배경·누끼 파이프라인 | `services/background.py`, `services/image.py` | Phase 3 숏폼 자동 클리핑 전처리 |
| Capacitor Push | `app-push.js`, 백엔드 푸시 | Phase 4 재방문 알림 보조 채널 |
| IAP 스켈레톤 | `routers/iap.py` | Phase 2 Pro 한도 분기 즉시 가능 |
| 하네스 `js/*` CLAUDE.md | `js/caption/CLAUDE.md` 등 | Phase 2.6 분할 시 플레이스홀더 채우기 |

---

## 6. 이미 완료 (Phase 1.5 잔여)

### 2026-04-20 · Salvage (커밋 `5c59eb2`)
원영 초기커밋(`27e885f`) 위에 연준 로컬 50+ 커밋 중 "되돌리면 퇴보" 항목 재이식.

| 상태 | 파일 | 내용 |
|---|---|---|
| 🟡 | `sw.js` | 상대경로 + API 캐시 제거 + GET_VERSION 메시지 (+84/-42) |
| 🟡 | `app-core.js` | SW 등록 블록 교체 + APP_BUILD 버전배지 (+69) |
| 🟡 | `index.html` | 인라인 빌드체크 + 버전배지 span + Meta 테스트 버튼 + debug-panel script (+20) |
| 🟡 | `app-support.js` | 7일 캐시 + optimistic render + 하틱 (+71/-21) |
| 🔴 | `app-debug-panel.js` | 파일 복구 (WebView 콘솔 대체 인앱 진단) (+179) |

---

## 7. 리스크 & 선결 조건 (요약)

1. **T-200 리프레시 미완료** → 탭 구조 확정 대기. Phase 2 시작 블로커.
2. **운영 DB 비밀번호 노출 이력** → Phase 2 착수 전 교체 필수.
3. **Meta BV 심사 통과 대기** → 통과 후 인스타 자동 게시 사용량 급증 대비 Rate Limit 모니터.
4. **알림톡 템플릿 승인 리드타임 2~5일** → Phase 2 Day 1부터 병렬 신청 필수.
5. **모놀리스 3분할(2.6)** → 신기능 추가 전 선제 완료. 안 하면 500줄 상한 위반으로 추가 금지.
6. **원영 작업 영역 존중** → `.ai/` 하네스, T-200 산출물, 티켓 T-001~T-202는 건드리지 않음. 새 기능은 `T-3XX` 번호로 발행하거나 이 Roadmap 문서로 직접 추적.

---

## 8. 변경 이력

| 날짜 | 커밋 | 내용 |
|---|---|---|
| 2026-04-20 | `27e885f` (원영) | T-200 디자인 리프레시 기반 + T-202 예약 제거 초기 커밋 |
| 2026-04-20 | `5c59eb2` (연준) | Salvage — 네트워크/진단/채팅 UX 재이식 |
| 2026-04-20 | `811f291` (연준) | Phase 2~5 로드맵 수립 |
| 2026-04-20 | (이번 커밋) | Phase 2 P0-1 프론트 착수 — Customer 스키마·app-customer.js·설정시트 진입 |

---

## 9. 백업 상태

| 브랜치 | 보존 내용 |
|---|---|
| `backup/pre-wonyoung-base-20260420` | 원영 force push 이전 연준 50+ 커밋 원본 전체 히스토리 |
| `backup/yeunjun-roadmap-20260420` | 이 로드맵 작성 시점 스냅샷 (Salvage 커밋 직후) |
| `main` (이 커밋) | 작업 진행선 — Phase 2 착수 대기 |

복구 방법: `git checkout <backup-branch-name>` — 푸시는 명시적 지시 시에만.

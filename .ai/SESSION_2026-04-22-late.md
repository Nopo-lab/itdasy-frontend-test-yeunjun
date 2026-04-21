# 세션 기록 — 2026-04-22 심야 (Phase 7 Top10 남은 4개)

## ⚠️ 컨텍스트

원영님이 새벽에 별도 작업 진행 예정 → 이쪽에서 진행한 변경이 원영 변경과 충돌하거나 덮어써질 수 있음. **이 문서는 충돌 발생 시 재적용을 위한 체크리스트**.

## 진행한 작업 (이번 세션)

### A. 설정 시트 상단 잘림 픽스
- `style-components.css:213` `#settingsCard` 에 `max-height: 88vh` + `overflow-y: auto` + `-webkit-overflow-scrolling: touch` 추가
- 의도: 설정 항목 추가로 세로 길어지면 상단이 뷰포트 밖으로 밀려나가는 이슈 해결

### B. 설정 메뉴 재정렬
- `index.html` 설정 시트 내 배치:
  - 📊 대시보드 (기존)
  - 인스타 연결·말투 분석·샵 정보·고객센터
  - **🎁 친구 초대** (신규, 금색 카드 강조) — onclick `window.openReferral()`
  - 인스타 진단·Meta 테스트
  - **== 앱 설정 ==** 구분 + 📳 진동 · 🌙 화면 · 🔠 글씨 크기 3개 묶음
  - 이용약관·개인정보처리방침
  - 사업자 정보 블록

### C. T-345 친구 초대 (신규)
- 파일: `app-referral.js` 신규 생성
- 기능: 추천 코드 표시, 클립보드 복사, Web Share API, 카톡 SMS 프리필
- 호출: `window.openReferral()`
- 의존: 기존 BE `GET /auth/referral` (이미 존재)

### D. T-342 월말 따뜻한 리포트
- BE `routers/reports.py` monthly 응답에 `warm_message` 필드 추가
- 규칙 기반 감성 멘트 (고객 수·재방문·NPS·노쇼·대표 시술 조합)
- AI 호출 없음 → 안정적

### E. T-347 이탈 방지 매출 집계
- BE `routers/retention.py` 에 `GET /retention/prevented-revenue` 신규
- 휴리스틱: 평균 간격 × 2 이상 벌어졌다가 최근 30일 내 재방문 = 회복 매출
- 응답: `{recovered_amount, recovered_count, recovered_customers, note}`

### F. T-348 월간 성장 스토리 카드 (신규)
- 파일: `app-growth-story.js` 신규 생성
- Canvas 1080×1920 인스타 스토리 사이즈
- `/reports/monthly` 결과를 이미지화: 매출·방문객·재방문·평균객단가·warm_message
- 이미지 저장 + Web Share API
- 호출: `window.openGrowthStory()`

## 아직 FE 에 노출 안 된 것
- 설정 메뉴에 "🎉 월간 성장 스토리" 진입 버튼 추가 필요
- 대시보드 위젯에 "🎁 친구 초대" 카드 노출 고려
- T-347 집계 결과를 킬러 위젯에 노출 고려

## 원영님 pull 후 재적용 순서

1. `git pull` 후 충돌 여부 확인
2. 위 A~F 변경 중 누락된 것 확인 (특히 B. index.html 설정 시트 순서)
3. 자동완성 · 음성 opt-in 정책이 유지되는지 확인
4. 스크립트 등록 필요: `app-referral.js`, `app-growth-story.js` 를 `index.html` 에 `<script src="">` 추가 (아직 안 함!)
5. Phase 7 티켓 파일: `.ai/tickets/T-340.md ~ T-348.md` 유지

## 미완료 (다음 세션)
- `index.html` 에 `app-referral.js`, `app-growth-story.js` 스크립트 태그 등록
- 설정 메뉴에 월간 성장 스토리 진입 버튼
- 대시보드 킬러 위젯에 T-347 `prevented_revenue` 금액 표시
- 아침 AI 요약 헤드라인에 prevented_revenue 한 줄 추가 (\"이탈 방지로 5만원 회복\")

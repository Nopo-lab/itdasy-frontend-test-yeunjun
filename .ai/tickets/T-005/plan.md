# T-005 · 주간 GC 리포트 스크립트 — 계획서

**상태:** 계획 중  
**담당:** T4 Ops  
**작성일:** 2026-04-20 14:30

---

## 1. 구현 전략

### 1.1 핵심 원칙
- **읽기 전용**: 파일 삭제/수정 절대 금지. 리포트 생성만.
- **관찰자 역활**: "무엇을 청소할 수 있나" 제안, 실행은 원영님 + 후속 티켓
- **자동 리포트**: 매주 월요일 09:00 KST에 GitHub Issue 자동 생성

### 1.2 구현 파일
1. `scripts/gc-weekly.js` — 관찰 스크립트 (읽기 전용, 의존성 추가 없음)
2. `.github/workflows/gc-weekly.yml` — 주간 스케줄 워크플로우

### 1.3 관찰 항목 (Acceptance Criteria)

**A. 파일 줄 수 검사**
- 모든 `.js`, `.css`, `.html` 파일 줄 수 측정
- `CLAUDE.md`에 기재된 지표와 비교
- 불일치 리스트만 보고

**B. 인라인 onclick 핸들러 추이**
- `grep -c "onclick=" *.html *.js` 카운트
- 매주 추이 추적 (지난주 vs 이번주)

**C. localStorage 키 사용 빈도**
- `grep -o "itdasy_\\w*"` 패턴으로 모든 키 추출
- 사용 빈도 정렬 후 리스트

**D. 남은 TD 티켓 ID 추적**
- `grep "TD-[0-9]\\+"` 로 남은 구식 티켓 참조
- Phase 1 종료까지 모두 제거 예정

**E. 파일 규모**
- 500줄 초과 파일 리스트
- `max-lines-per-function` 대상 리스트

**F. 의심 미사용 파일**
- import/require/참조 없는 파일 리스트
- 거짓 양성 방지: 동적 로드, 네이티브 플러그인 제외

---

## 2. 기술 선택

### 2.1 스크립트 언어
- **Node.js (JavaScript)** 선택 이유:
  - 기존 스택과 일관성 (프론트 통합)
  - 외부 의존성 최소화
  - GitHub Actions에서 native 지원

### 2.2 외부 도구 불사용
- `depcheck` 같은 도구 대신 직접 정규식 + grep
- npm 추가 의존성 없음 (준비 시간 단축)
- 단순 정규식으로 충분

### 2.3 리포트 저장소
- `.ai/gc-reports/YYYY-MM-DD.md` — 마크다운 형식
- 누적 보관 (향후 추이 분석 가능)

---

## 3. 스크립트 아키텍처

```javascript
// scripts/gc-weekly.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 1. 파일 시스템 스캔
const scanFiles = () => {
  // *.js, *.css, *.html 순회
  // 줄 수, 크기, import 패턴 수집
};

// 2. 패턴 매칭 (읽기 전용)
const analyzePatterns = () => {
  // onclick= 카운트
  // itdasy_* 키 추출
  // TD- 티켓 ID 찾기
  // import 문 파싱
};

// 3. 리포트 생성
const generateReport = () => {
  // 마크다운 형식 렌더링
  // .ai/gc-reports/YYYY-MM-DD.md 작성
  // 결과 객체 반환 (Issue 생성용)
};

// 4. 변화 감지
const hasChanges = () => {
  // 지난주 리포트와 비교
  // 신규 항목 있는지 체크
};

// 5. GitHub Issue 생성용 반환값
const issuePayload = {
  title: `[GC Weekly] ${date} · 청소 후보 ${items} 건`,
  body: `원영님용 쉬운 말로 작성된 리포트`
};
```

---

## 4. GitHub Actions 워크플로우

`.github/workflows/gc-weekly.yml`:
- **트리거:** `schedule` (Cron) + 수동 버튼 (dispatch)
- **시간:** 월 09:00 KST = Cron `0 0 * * 1` (UTC)
- **실행 흐름:**
  1. `scripts/gc-weekly.js` 실행 (--dry-run 옵션 기본)
  2. 결과 출력 → 환경변수 저장
  3. `gh issue create` 로 GitHub Issue 생성
  4. 라벨: `gc`, `needs-review`

---

## 5. 검증 계획

### 로컬 테스트
```bash
node scripts/gc-weekly.js --dry-run
```

### GitHub Actions 검증
1. 수동 실행 (`workflow_dispatch`)
2. 실제 Issue 생성 확인
3. 원영님이 Issue 댓글로 "예/아니오" 표시

### 자동화 체크
- [ ] 변화 없으면 Issue 생성 안 함 (스팸 방지)
- [ ] 에러 발생 시 workflow fail (CI 감지)
- [ ] 한국어 메시지 인코딩 (UTF-8)

---

## 6. 테스트 시나리오

| 상황 | 기대 결과 |
|------|---------|
| 파일 줄 수 증가 | 리포트 업데이트, Issue 생성 |
| 변화 없음 | Issue 생성 안 함 |
| 네트워크 에러 | workflow fail, 재시도 가능 |
| --dry-run 실행 | 파일 쓰기 안 함, 터미널 출력만 |

---

## 7. 일정

- **3단계 구현:** 1시간 (스크립트 + 워크플로우)
- **로컬 테스트:** 20분
- **자체 검증:** 30분 (10개 체크리스트)
- **PR + 리뷰:** 30분
- **총 예상 시간:** 2.5시간

---

## 8. 의존성 확인

- ✅ T-002 완료 (ESLint 설치, package.json 준비)
- ✅ Node.js 16+ (이미 설치됨)
- ✅ GitHub Actions (이미 구성됨)
- ✅ `.ai/gc-reports/` 디렉토리 (사전 생성됨)

---

## 다음 단계

1. T1(Architect) 승인 대기
2. 승인 후 3단계(구현) 시작
3. 로컬 테스트 (`--dry-run`)
4. 자체 검증 (10개 체크리스트)
5. PR 생성 및 리뷰
6. 머지 후 BOARD 갱신

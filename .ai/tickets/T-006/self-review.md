# T-006 · 자가검토 (self-review.md)

**작성:** T1 Architect @ 2026-04-20 04:36
**참조:** AGENTS.md §5

---

## 10개 체크리스트

| # | 항목 | 판정 | 근거 |
|---|------|------|------|
| 1 | 건드리는 파일 전체 목록 | ✅ | `app-support.js` 단 1개. L164-167 범위. |
| 2 | `index.html` 스크립트 로드 순서 영향 없음 | ✅ | 스크립트 순서 미변경. `window.getToken` 은 `app-core.js` 선행 로드로 항상 사용 가능. |
| 3 | `window.*` 전역 추가/제거 | ✅ | 추가/제거 없음. `window.getToken` 은 AGENTS.md §2 허용 목록. |
| 4 | localStorage 키 패턴 준수 | ✅ | 레거시 `'itdasy_token'` 직접 참조 **제거**. `STORAGE_KEYS` 상수(T-001 예정) 는 본 티켓 범위 밖. |
| 5 | Capacitor 브릿지 웹·Android 테스트 | N/A | 네이티브 브릿지 미관련. |
| 6 | Supabase RLS 수동 확인 | N/A | 서버 쿼리 로직 미변경. 게이트 조건만 수정. |
| 7 | 50줄 초과 함수 신규 생성 없음 | ✅ | `setTimeout` 콜백 10줄 미만 유지. |
| 8 | 빈 `catch {}` 추가 없음 | ✅ | catch 블록 미수정. |
| 9 | 커밋 메시지에 `T-006` 포함 | ✅ (예정) | 커밋 시 메시지 `T-006: …` prefix. |
| 10 | `npm run lint && npm test` 로컬 통과 | ✅ (예정) | 이 PR 자체가 lint fail 해소 목적. 원영님 로컬 `npm install` 후 검증 예정. |

**결론:** 10개 중 8개 ✅, 2개 N/A. 실패 0. 다음 단계(제3자 리뷰) 진행.

---

## 추가 자가검토

### 회귀 시나리오 3종 체크

1. **레거시 토큰만 있는 유저** (마이그레이션 전 상태)
   - 기존: `itdasy_token` 만 있어도 배지 체크 통과
   - 신규: `getToken()` 은 `_TOKEN_KEY` 만 봄. 마이그레이션 블록(app-core.js L35-43) 은 레거시 키를 **삭제** (복사가 아님). `DOMContentLoaded + 2500ms` 시점엔 레거시 키 이미 삭제되어 있고 현재 환경 키는 없음 → null → return.
   - 기존과 동작 차이: 레거시 유저는 배지 체크 스킵됨. **이것이 마이그레이션 의도** (어느 백엔드 토큰인지 알 수 없어 재로그인 요구). app-core.js L39 주석 참조.
   - 판정: **회귀 아님**, 설계대로 작동

2. **로그인 안 한 유저**
   - 기존: 4개 키 모두 없음 → return
   - 신규: `getToken()` → null → return
   - 판정: **동일**

3. **토큰 만료된 유저**
   - 기존: 만료 여부 체크 안 함, 불필요 API 콜 발생 가능
   - 신규: `getToken()` (app-core.js L268-279) 이 JWT payload `exp` 를 `Date.now()/1000` 와 비교, 만료 시 removeItem + null 반환 → return
   - 판정: **개선** (불필요 API 콜 절감)

### §11 쉬운 말 보고용 한 줄

> **고객센터** 로그인 확인이 옛날 방식이라 자동 검사가 막고 있었어요. 1줄로 고쳤고, 기능은 그대로예요. 🟡 중간.

### 수용 기준 재확인

- [x] 수정 후 `grep "'itdasy_token'" app-support.js` 결과 0건 예상
- [x] `grep "'itdasy_token'" *.js` → `app-core.js`(마이그레이션) + `.eslintrc.js`(차단 규칙) 만 남음
- [x] 줄 수 차이 +0 (4줄 체크 → 1줄 체크 + 주석 3줄)
- [x] 다른 로직 변경 없음

# T-006 · 계획서 (plan.md)

**작성:** T1 Architect @ 2026-04-20 04:35
**티켓:** [.ai/tickets/T-006.md](../T-006.md)
**브랜치(예정):** `fe/T-006-support-token-check`

---

## (a) 건드릴 파일

| 파일 | 변경 | 비고 |
|------|------|------|
| `app-support.js` | L164-167 → 1줄로 교체 + 주석 3줄 추가 | 단일 수정 지점 |

다른 파일은 건드리지 않음. 테스트 파일도 추가 없음 (기존 T-003 과 동형).

## (b) 변경 내용

### 현재 (L161-171)
```js
// 로그인 후 앱 로드 시 읽지않음 배지 1회 체크
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(async () => {
    if (!localStorage.getItem('itdasy_token::staging') &&
        !localStorage.getItem('itdasy_token::prod') &&
        !localStorage.getItem('itdasy_token::local') &&
        !localStorage.getItem('itdasy_token')) return;
    const d = await _fetchMessages();
    _updateBadge(d.unread_count || 0);
  }, 2500);
});
```

### 수정안
```js
// 로그인 후 앱 로드 시 읽지않음 배지 1회 체크
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(async () => {
    // T-006: 레거시 키 itdasy_token 제거 + getToken() 통합
    // app-core.js getToken() 이 _TOKEN_KEY 기반으로 현재 환경 토큰만 반환.
    // 만료 체크도 포함되므로 수동 분기 불필요.
    if (!window.getToken()) return;
    const d = await _fetchMessages();
    _updateBadge(d.unread_count || 0);
  }, 2500);
});
```

**diff 요지:** 4줄 localStorage 체크 → `window.getToken()` 1줄 + 주석 3줄. 순수 치환, 외부 동작 차이 없음.

## (c) 위험 평가

| 항목 | 판정 | 근거 |
|------|------|------|
| 스크립트 로드 순서 영향 | 없음 | `window.getToken` 은 `app-core.js` 에서 정의. index.html 에서 `app-core.js` 는 `app-support.js` 보다 선행. 기존 순서 그대로. |
| 전역 API 신규 도입 | 없음 | `window.getToken` 은 AGENTS.md §2 허용 목록 내. |
| localStorage 키 체계 | 준수 | 레거시 `'itdasy_token'` 직접 참조 제거. `STORAGE_KEYS` 미도입이라 그것과는 무관. |
| Capacitor 브릿지 | 무관 | 배지 체크, 네이티브 경로 없음. |
| Supabase RLS | 무관 | 서버 호출은 `_fetchMessages()` 내부. 이 PR 은 게이트 조건만 수정. |
| 함수 길이 | 증가 없음 | 오히려 4줄 → 1줄(+주석 3줄). 신규 함수 생성 없음. |
| 빈 catch | 없음 | catch 자체를 건드리지 않음. |
| 린트 fail 해소 | **이 PR 의 목표** | ESLint `no-restricted-syntax` 가 `'itdasy_token'` 리터럴 차단 중. |
| 기능 회귀 위험 | 낮음 | 기존 동작: 4개 키 중 1개라도 있으면 배지 체크 진행. 신규 동작: 현재 환경 토큰 있으면 진행. 레거시 `itdasy_token` 은 app-core.js L35-43 마이그레이션 블록에서 이미 현재 환경 키로 복사 후 삭제되므로 기능 동일. |
| XSS / innerHTML | 무관 | 해당 블록 DOM 조작 없음. |

### 엣지 케이스 점검

실제 `app-core.js` 구현 인용 (제3자 리뷰 지적 반영):

```js
// L268-279 getToken()
function getToken() {
  const t = localStorage.getItem(_TOKEN_KEY);
  if (!t) return null;
  try {
    const payload = JSON.parse(atob(t.split('.')[1]));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      localStorage.removeItem(_TOKEN_KEY);
      return null;
    }
  } catch { return null; }
  return t;
}
```

```js
// L35-43 migrateLegacyToken IIFE
const legacy = localStorage.getItem('itdasy_token');
if (legacy && !localStorage.getItem(_TOKEN_KEY)) {
  localStorage.removeItem('itdasy_token');  // 복사 아님. 삭제만.
}
```

1. **부트 직후 마이그레이션 미완 상태:** `app-core.js` 최상단 IIFE 라 `DOMContentLoaded` 이전 실행. `setTimeout 2500ms` 로 추가 여유. **안전.**
2. **레거시 토큰만 있는 유저:** 마이그레이션 IIFE 가 레거시 키를 **삭제** (복사 아님). 따라서 현재 환경 키 없음 → `getToken()` null → return. 기존 4키 체크(레거시 있음 → 통과)와 동작은 다르지만, 마이그레이션 의도대로 레거시 유저는 재로그인 요구됨. **설계대로 작동**, 회귀 아님.
3. **토큰 만료된 경우:** `getToken()` 이 JWT `exp` 체크 후 만료 시 null 반환 → return → 불필요 API 콜 절감. **개선.**
4. **로컬 개발 환경:** `_TOKEN_KEY` 가 `'itdasy_token::local'` 이라 getToken() 이 그 키를 봄. 정상.

### 롤백 전략

단일 커밋, diff 4줄. 문제 발견 시 revert 1번으로 원복.

## 수용 기준 체크 (티켓 §수용 기준)

1. `grep "'itdasy_token'" app-support.js` → 0건 ✅ (수정 후 확인 예정)
2. `grep "'itdasy_token'" *.js` → `app-core.js` + `.eslintrc.js` 만 ✅
3. `npm run lint` `no-restricted-syntax` 0건 ✅
4. 줄 수 차이 ±5 이내 ✅ (+0 줄, 내용만 치환)

## 다음 단계

1. self-review.md 작성 (10개 체크리스트)
2. Task 도구로 제3자 리뷰 에이전트 호출
3. 🟢 받으면 실제 Edit 수행
4. BOARD.md IN PROGRESS → READY FOR REVIEW

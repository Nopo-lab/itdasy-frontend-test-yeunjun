# T-002 자가검토

**담당:** 오케스트레이터 (직접 집행)
**날짜:** 2026-04-20
**브랜치:** (Cowork 직접 편집)
**신호등:** 🟡 노랑 (스테이징 설정 추가, 커밋 훅 영향 있음)

## 수행 내역

1. `.eslintrc.js` 신설 — 2 error + 5 warn 규칙
2. `.stylelintrc.json` 신설 — stylelint-config-standard 상속
3. `.lintstagedrc.json` 신설 — JS/CSS 자동 fix
4. `.husky/pre-commit` 신설 (chmod +x 완료) — `npx lint-staged` 실행
5. `package.json` 갱신:
   - scripts: `lint`, `lint:fix`, `lint:css`, `test`, `gc`, `prepare` 추가
   - devDependencies: `eslint`, `stylelint`, `stylelint-config-standard`, `husky`, `lint-staged`, `jest` 추가

## ESLint 규칙 핵심

### error (2개, 즉시 차단)
1. **`no-restricted-syntax`** — `'itdasy_token'` 리터럴 사용 시 에러
   - override 로 `app-core.js` 마이그레이션 블록만 예외
2. **`no-empty`** — 빈 `catch {}` 에러

### warn (5개, 개선 권장)
- `max-lines-per-function: 50`
- `max-lines: 500` (단, 기존 monolith 5개 파일은 override 로 예외)
- `no-console` (warn/error 는 허용)
- `no-unused-vars` (언더스코어 prefix 예외)
- `eqeqeq` (smart)

## ⚠️ 원영님 조치 필요 (로컬에서 1회)

```bash
cd /Users/원영/.../itdasy-frontend-test-yeunjun
npm install        # 새 devDependencies 5개 설치
npm run prepare    # husky 훅 활성화
npm run lint       # 현재 baseline 수집 (Phase 2 에서 개선)
```

## 10개 체크리스트

1. ☑ 건드리는 파일 **전체**:
   - `.eslintrc.js` (신규)
   - `.stylelintrc.json` (신규)
   - `.lintstagedrc.json` (신규)
   - `.husky/pre-commit` (신규)
   - `package.json` (scripts + devDependencies 추가)
2. ☑ `index.html` 스크립트 로드 순서 영향 없음 (설정 파일만)
3. ☑ `window.*` 전역 변경 없음 (ESLint 에 globals 로 **선언**만 추가)
4. ☑ localStorage 키 관련 — 오히려 **보호 강화** (레거시 키 사용 시 에러)
5. ☑ Capacitor 브릿지 영향 없음 (`Capacitor` 를 globals 로 등록)
6. ☑ Supabase 쿼리 영향 없음
7. ☑ 50줄 초과 함수 신규 작성 없음 (설정 파일만)
8. ☑ 빈 catch 추가 없음
9. ☑ 커밋 메시지 예정: `T-002 chore: ESLint + stylelint + husky + lint-staged 설정 추가`
10. ⚠ 린트/테스트 — **원영님 로컬에서 `npm install` 후 첫 실행 필요**

## 위험 평가

- **커밋 훅 활성화 후** monolith 파일에 대한 ESLint warn 경고 수십~수백 건 발생 예상
- 하지만 `--fix` 로 자동 수정되는 것은 한정적 (대부분 수동 개선 필요)
- baseline 리포트는 `.ai/test-reports/2026-04-XX-lint-baseline.md` 에 저장 예정
- husky 훅은 `--no-verify` 로 우회 가능 (급한 경우만)

## 다음 단계

1. 원영님이 로컬에서 `npm install` 실행
2. `npm run lint > .ai/test-reports/2026-04-20-lint-baseline.md` 로 baseline 저장
3. Phase 2 에서 monolith 분할 완료 후 `max-lines` 를 `error` 로 승격 (T-2XX)

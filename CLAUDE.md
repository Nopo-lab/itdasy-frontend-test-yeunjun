# itdasy-frontend-test-yeunjun (연준 스테이징)

## 📇 앱 기능 인덱스 (먼저 볼 것)

**"이 기능 없나?" 추측 전에 `.ai/APP_FEATURE_INDEX.md` 확인.** 이 앱은 방대함(프론트 ~250파일 + 백엔드 라우터 60·서비스 70·모델 56). DM 자동응답·네이버톡톡·카카오 알림톡·리텐션·리뷰요청·인사이트·OCR 등 **대부분 이미 구현돼 있음**. 상단 도메인맵 + 채널/DM 실제 상태표 참고. **기능 파일(`js/**`·`app-*.js`·백엔드 routers/services/models) 바꾸면 인덱스 해당 항목도 갱신**(SessionStart 훅이 요약 주입, PostToolUse 훅이 갱신 리마인드 — `.claude/settings.json`).

## ✅ 캐시 버전(`?v=`) — **배포가 자동으로 올린다** (2026-07-23~)

**이제 손으로 안 올려도 된다.** `deploy.yml` 의 `Auto-bump all ?v= cache busters` 단계가
매 배포마다 `index.html`·`js/load-groups.js` 의 **모든 `?v=` 를 빌드 버전으로 통일**한다
(`scripts/bump_cache_busters.py`, 실측 258건). `load-groups.js` 자신의 버전도 포함되며,
그게 안 바뀌면 배포를 **실패시킨다** — 그거 하나 빠지면 나머지가 전부 무효이기 때문.

- ✅ **새 파일도 자동이다** (2026-08-02 `c32683d` 부터). 스크립트의 `NO_VER` 가
  `?v=` 가 아직 안 붙은 로컬 js/css 에도 배포 때 새로 붙여준다.
  ⚠️ 이 자리엔 원래 "새 파일은 손으로 붙여야 한다 · 스크립트는 이미 붙어 있는 것만 갱신한다" 고
  적혀 있었는데 **NO_VER 가 들어온 뒤로 줄곧 거짓이었다** — 실제로 그걸 믿고
  "이 파일들은 캐시버스팅이 안 된다" 고 오진한 적이 있다(2026-09-12).
- 🔴 **여전히 수동인 곳**: `style.css` 의 `@import` — `TARGETS`(index.html · js/load-groups.js)
  밖이라 자동 범프가 안 닿는다. 손으로 올려야 한다.
- 외부 CDN(`https://…`)은 건드리지 않는다.
- 왜 자동화했나: 손으로 하면 반드시 빠뜨린다. 특히 `index.html` 의 `js/load-groups.js?v=` 를
  빼먹으면 **안의 버전을 아무리 올려도 무효**다 — 브라우저가 옛 load-groups 를 쓰고 그 안의
  옛 `?v=` 로 파일을 부른다. 2026-07-23 실측으로 잡았다: 파일엔 수정이 있는데 로드된 script 가
  `caption-text.js?v=20260714-fix-batch1`(9일 전)이었다.

<details><summary>참고 — 옛 수동 규칙(이제 안 해도 됨)</summary>


- 실제로 여러 번 당했다(2026-07-22 라운드 포함): 고친 기능이 라이브 파일엔 들어가 있는데 화면엔 안 나와서
  "코드가 틀렸나" 를 한참 뒤졌고, SW 캐시를 지우고서야 나왔다. **로컬 검증도 똑같이 속는다.**
- "고쳤는데 화면이 그대로" 면 → 코드보다 **캐시부터** 의심.
- `sw.js` 의 `CACHE_VERSION` 은 deploy.yml 이 자동 주입한다. **`?v=` 는 자동이 아니다 — 사람이 올려야 한다.**
- 🚨 **`js/load-groups.js` 자신의 `?v=` 도 같이 올려라** (index.html:2311).
  이걸 빼면 **안의 버전을 아무리 올려도 소용없다** — 브라우저가 옛 load-groups.js 를 그대로 쓰고,
  그 안에 적힌 옛 `?v=` 로 파일을 불러온다. 2026-07-23 실측으로 잡았다:
  파일엔 수정이 있고 load-groups 도 갱신했는데 화면은 그대로 → 로드된 script 태그가
  `caption-text.js?v=20260714-fix-batch1`(옛 버전)이었다. **버전 올리기가 통째로 무력화되는 지점.**
- 빠뜨리기 쉬운 것: `?v=` 가 아직 **안 붙은 항목**(`'app-backup.js',` 처럼) — 새로 붙여야 영영 캐시되지 않는다.
  그리고 CSS(`index.html` 의 `<link>`), `js/workspace/**` 같은 긴 경로.

```python
# 일괄 갱신 — FILES 만 바꿔 재사용
import io, re
V = '20260722-vXXX-이름'
FILES = ['app-foo.js', 'js/workspace/bar.js', 'css/screens/baz.css']
for t in ('js/load-groups.js', 'index.html'):
    s = io.open(t, encoding='utf-8').read()
    for f in FILES:
        s = re.sub(re.escape(f) + r'\?v=[^\'"?&]*', f + '?v=' + V, s)
    io.open(t, 'w', encoding='utf-8').write(s)
# 🚨 load-groups.js 자신의 버전도 반드시 — 안 올리면 위 갱신이 전부 무효
s = io.open('index.html', encoding='utf-8').read()
io.open('index.html', 'w', encoding='utf-8').write(
    re.sub(r'js/load-groups\.js\?v=[^\'"?&]*', 'js/load-groups.js?v=' + V, s))
```
</details>

## 🧪 기능별 전수 QA — `.ai/FEATURE_QA_PROMPT.md`

기능 하나를 골라 화면 요소를 전부 눌러보고 **12축**(동작·경계값·오류·시간·데이터안전·되돌리기·UX동선·카피·접근성·네비·보안심사·매출연결)으로 잡는 절차 + 붙여넣는 프롬프트.
검증 환경 세팅(토큰·`?api=staging`·SW 지우기), 헤드리스 함정(rAF 정지·뷰포트 0x0·파일업로드 pending),
LLM 쿼터 주의, 반복해서 나온 진짜 원인 패턴(래퍼 우회 직접호출·과한 필터·경로 둘 중 하나만 수정)까지 정리돼 있다.

## 🔎 도메인별 릴리즈 감사 — `.ai/RELEASE_AUDIT_MATRIX.md`

**출시 전 누락·위험을 도메인 12개로 나눠 하나씩 터는 틀.** 위 QA(12축)가 "어떻게 검증하나"라면 이건 **"무엇을 · 어느 순서로 · 어디까지 파나"**.
기능 등급(Critical/High/Medium/Low) · 결함 트리아지(P0/P1/P2) · 페르소나 8 × 도메인 시나리오 · 체크리스트 19+3(이 앱 기준 해당/비해당 판정 완료) ·
**구현 여부 파이프라인**(프론트 버튼→API→라우팅→권한→DB→실사용→dead/stub/TODO) · 10 케이스 · 하루 사용 흐름 · **붙여넣는 감사 프롬프트** + 진행 트래커.
👉 돌리는 순서: 인증 → 결제 → 회원권 → 예약(🔴) → 매출 → 고객 → DM → 댓글 → 잇비(🟠) → 작업실 → 연동 → 설정(🟡🟢).

## 🔐 보안 3원칙 — **코드 쓰면서 지켜라** (2026-08-02, 실제 사고 기반)

> 같은 실수가 계속 재발해서 규칙으로 굳혔다. **감사에서 잡는 게 아니라 쓸 때 안 만드는 게 목표다.**

### 1. URL·딥링크로 받은 값으로 **세션을 만들지 않는다**

```js
// ❌ 절대 금지 — 실제로 이렇게 돼 있었다
const t = params.get('_t'); setToken(t);              // 검증 0 (P0-1-b, 제거함)
const token = params.get('token'); /* sub 대조만 */ store(token);  // 무의미한 검사
```
`sub` 과 `/auth/me` 의 `id` 를 비교하는 건 **방어가 아니다** — 둘 다 같은 토큰에서 나오므로
공격자 자기 토큰이면 **항상 일치**한다. 걸러지는 건 위조·만료 토큰뿐.

✅ **세션은 서버 교환으로만.** 1회용 code + PKCE verifier (`/auth/oauth/exchange`) 또는 1회용 티켓.
URL 에 실을 수 있는 건 **그 자체로는 쓸모없는 값**(code·ticket)뿐이다.

- 실제 피해 경로: 공격자 링크 1클릭 → 원장님이 공격자 계정에 로그인 → 그날 입력한
  손님 연락처·시술이력·매출이 공격자에게 쌓임. `history.replaceState` 가 흔적까지 지운다.
- 왜 계속 생기나: 편해서. "Chrome 으로 넘길 때 토큰만 실어 보내면 되잖아" 가 시작이다.

### 2. 새 경로를 만들면 **레거시 경로를 같은 PR 에서 지운다**

PKCE(`?code=`)를 만들고 `?token=` 을 "전환기 호환"으로 남겼더니, 그게 **그대로 취약점으로 남았다.**
남겨야 한다면 **제거 티켓을 같이 만들고 기한을 박아라.** "나중에"는 안 온다.

- 지우기 전 확인: **생성 측이 살아 있는지 실측.** 소비 측만 지우면 기능이 깨진다.
  (`?token=` 은 지금도 BE 가 발급한다 — challenge 없이 authorize 하면 4-part state 가 온다)
- **grep 0건 ≠ 안 씀.** 런타임 조립(`sep = "?" if ... ; f"{t}{sep}token="`)은 리터럴 검색을 피한다.
  네이티브·CDN·외부 서비스가 붙일 수도 있다. 삭제 전 9개 표면을 본다
  (생성/소비/딥링크/OAuth/인프라/테스트·문서/외부서비스/형제레포/git 이력).

### 3. 유일성·멱등은 **DB 제약**으로. 앱레벨 SELECT 는 방어선이 아니다

```python
# ❌ read-then-write — 매출·결제에서 이미 두 번 뚫렸다
if db.query(X).filter(...).first(): raise HTTPException(409)
db.add(X(...)); db.commit()
```
✅ **UNIQUE 제약 + `except IntegrityError`**. 앱레벨 검사는 에러 메시지를 예쁘게 하는 용도지 방어가 아니다.

- 전례: 매출 멱등키(`0030`)·결제키(`0031`) 는 이 방식으로 고쳤는데 **`subscriptions` 만 빠졌다.**
- 검증은 **`Promise.all` 동시 100발.** 순차 테스트 통과는 증거가 아니다.
- ⚠️ 금액 CHECK 에 `amount >= 0` 은 금지 — **환불이 음수**다. 모델과 마이그레이션 **양쪽에** 넣어야
  기존 DB·신규 DB 둘 다 걸린다.

### 🚫 파라미터 이름 재사용 금지

`_t` 는 흔한 캐시버스터 이름이라 실제로 충돌했다 — 인스타 해제 후 하드리로드용으로
`searchParams.set('_t', Date.now())` 를 붙였더니 그 **타임스탬프가 토큰으로 저장**됐다.
캐시 무효화는 `_nc` 나 `?v=` 자동 범프를 쓴다. 인증용 파라미터 이름은 그 용도로만.

## 🚨 디자인 정책 (2026-05-28 ~ )

**다크모드 정비 보류 중** — 모든 디자인·CSS 작업은 **라이트모드 기준**으로만 진행.
`html[data-theme="dark"]` 블록(tokens.css)은 토큰 정리 끝난 뒤 일괄 재점검 예정.

- 새 컴포넌트 작성 시 다크모드 토큰 매핑 안 해도 OK
- 기존 다크모드 블록은 건드리지 말 것 (복원용)
- 다크모드 활성화 키: `app-theme.js DARK_MODE_DISABLED = false`

## 🚨 PC 레이아웃 — 풀스크린 오버레이/하위화면은 사이드바에 안 잘리게 (필수)

PC(`@media (width >= 768px)`)엔 고정 사이드바 `#sideNav`(`.side-nav.ms-side`, **폭 `var(--side-nav-width)` = 232px, ≥1200px 260px, z-index 10000**)가 있다. `position:fixed; inset:0` 오버레이는 그냥 두면 **사이드바가 왼쪽을 가려 콘텐츠가 잘린다**(반복 사고 — 9번+ 지적됨).

> **🔑 오프셋은 항상 `var(--side-nav-width)` 로 (하드코딩 232/260 금지).** SSOT = `style-components.css` `:root{--side-nav-width}`. 폭은 반응형(≥768px 232 · ≥1200px 260)이라 하드코딩하면 한쪽 breakpoint 에서 반드시 어긋난다. (v716, 2026-07-09)

- 설정 하위화면은 **`.subscreen-overlay` 클래스 재사용** → `style-responsive.css`에서 PC 오프셋(`left:var(--side-nav-width); top:var(--app-header-h)`)이 일괄 적용됨. ⚠️ 이 클래스는 `transform: translateX()` 슬라이드라 PC에서 `transform/inset`을 통째로 덮지 말 것(닫기 깨짐).
- 허브류 풀스크린은 `style-responsive.css`의 hub-overlay 셀렉터 목록(`inset: var(--app-header-h) 0 0 var(--side-nav-width)`)에 **새 ID/클래스를 반드시 등록**.
- 새 풀스크린 오버레이를 만들면 **무조건 `style-responsive.css`의 `@media (width >= 768px)` 블록에 등록**하고, PC 폭에서 왼쪽 잘림 없는지 확인. 모바일만 보고 만들지 말 것.

**언어**: 한국말, 쉬운말. 원영님은 코딩 초보.

- 역할: 연준 전용 프론트 검증 레포. 배포 `https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/`
- 🚨 **백엔드는 운영이다.** `PROD_API` = `https://itdasy-backend-staging-644329093453.asia-northeast3.run.app`
  이름은 staging 이지만 `env=production` 이고 **실사용자 DB(Supabase `itdasy-staging` / hsxxqomfbdernepykils)** 를 본다.
  이 사이트(`nopo-lab.github.io/itdasy-frontend-test-yeunjun/`)는 살아 있고, 여기서 넣은 돈은 진짜 돈이다.
  토큰 키: `itdasy_token::staging` (키 이름도 이름만 staging)
- 💾 **운영 DB 백업의 단일 소유자가 이 레포다.** `.github/workflows/supabase-backup.yml`
  매일 KST 03:00 · artifact 30일 · 실패 시 잡 FAIL + Discord 알림.
  다른 레포에 백업을 늘리지 마라 — 새벽에 어느 게 진짜인지 구분 못 한다.
- 상속: 루트 `../CLAUDE.md` + `../AGENTS.md §3, §4`
- 워크플로우: 1) 여기서 먼저 → 2) 검증 후 `itdasy-frontend`(운영) 승격
- 트랙: 4줄 이상 / API / Capacitor = 표준(티켓→플랜→승인→코드→T4→T1→머지), 문서·1~3줄 = 경량
- 코드 룰: **줄수 제한 없음**(2026-07-14 폐기, 루트 CLAUDE.md 참조). 분할은 재사용·독립테스트·동시작업 같은 실제 이유가 있을 때만. 큰 파일은 먼저 지울 게 없는지 본다
- 서버 호출: 직접 주소를 붙이지 말고 `window.apiUrl()` / `window.apiFetch()` 사용
- 분할 대상: `app-caption.js` / `app-portfolio.js` / `app-gallery.js` — Phase 2 (T-101/102/103)
- 로컬: `python3 -m http.server 8080` · `npx cap sync android` · Android 빌드는 GitHub Actions 권장
- Capacitor: scheme `itdasy://`, plugins = SplashScreen/StatusBar/Push/Camera/App
- Actions: `Android Build`(수동) · `Supabase Daily Backup`(UTC 18:00)

진행 상황: `.ai/ROADMAP.md` · 세션: `.ai/SESSION_STATE.md`

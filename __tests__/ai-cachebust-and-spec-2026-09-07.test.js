/**
 * @jest-environment node
 */
/* [AI 클로즈아웃 2026-09-07] 배포해도 사용자에게 **안 닿는 코드**를 만들지 않는다.
 *
 * 실측으로 잡은 두 가지 (둘 다 화면에서 증상이 보였다):
 *   ① `shared/schemas.json` 을 캐시 버스터 없이 fetch 해서, 페이지가 4개월 낡은 스펙을
 *      읽고 있었다. 디스크는 2026-09-07 판(tone 14종)인데 로드된 건 2026-04-16 판(3종).
 *      → 캡션이 **정상 생성될 때마다** "⚠ 스키마 불일치" 토스트가 떴다.
 *   ② index.html 의 로컬 script 13개에 `?v=` 가 아예 없었다. sw.js 는 app-*.js 를
 *      cache-first 로 잡으므로, 그 13개는 재방문 사용자에게 **영원히 옛 버전**이다.
 *      하필 그 안에 app-instant-caption.js(캡션 안내문 가드)와 app-spec-validator.js 가 있었다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const INDEX = read('index.html');

describe('① 스펙 검증기는 항상 최신 schemas.json 을 읽는다', () => {
  test('schemas.json fetch 에 배포 버전 캐시 버스터가 붙는다', () => {
    const src = read('app-spec-validator.js');
    expect(src).toMatch(/fetch\('shared\/schemas\.json\?v='/);
    expect(src).toMatch(/__LATEST_BUILD__/);
  });

  test('schemas.json 의 tone_override 가 실제 말투칩을 전부 포함한다', () => {
    // 표를 손으로 관리하다 어긋나서 정상 생성마다 경고가 떴다 — 이제 모델에서 뽑는다.
    const schemas = JSON.parse(read('shared/schemas.json'));
    const allowed = schemas.enums.tone_override;
    const chips = [...INDEX.matchAll(/data-tone="([a-z_]+)"/g)].map((m) => m[1]);
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      expect(allowed).toContain(chip);
    }
  });

  test('기본 말투(natural)가 스펙을 통과한다 — 여기가 깨지면 매 생성마다 경고가 뜬다', () => {
    const schemas = JSON.parse(read('shared/schemas.json'));
    expect(schemas.enums.tone_override).toContain('natural');
    expect(schemas.enums.length_tier).toEqual(
      expect.arrayContaining(['short', 'medium', 'long', 'max']),
    );
  });
});

describe('② 모든 로컬 스크립트가 배포마다 갱신된다', () => {
  const localScripts = [...INDEX.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((s) => !/^https?:\/\//.test(s));

  test('index.html 의 로컬 script 는 전부 ?v= 를 가진다', () => {
    const missing = localScripts.filter((s) => !s.includes('?v='));
    expect(missing).toEqual([]);
  });

  test('캡션 안내문 가드가 든 파일도 버스터를 가진다', () => {
    // app-instant-caption.js 는 clarification 가드를 들고 있다. 버스터가 없으면
    // 재방문 사용자에겐 그 가드가 영영 배포되지 않는다.
    const guarded = localScripts.filter((s) => /app-instant-caption\.js/.test(s));
    expect(guarded.length).toBe(1);
    expect(guarded[0]).toContain('?v=');
  });

  test('bump 스크립트가 다루는 확장자(.js/.css)로만 참조된다', () => {
    // bump_cache_busters.py 의 정규식은 .js/.css 만 재작성한다. 다른 확장자에 ?v= 를
    // 달면 배포 때 갱신되지 않아 오히려 영구 고착된다.
    for (const s of localScripts) {
      expect(s.split('?')[0]).toMatch(/\.js$/);
    }
  });
});

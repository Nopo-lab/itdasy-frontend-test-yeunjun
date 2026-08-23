/* IndexedDB 스키마 계약 — **버전·store·마이그레이션 분기**를 잠근다. [2026-08-23]
 *
 * 🔴 왜 필요한가: T8 모듈 9개를 운영 로더에 등록하고도 학습이 0 이었다.
 *    `app-gallery-db.js` 가 **v4** 라 `preferences`·`learning_signals`·`preference_versions`
 *    store 자체가 없었기 때문이다. 신호는 잡히고 commit 도 도는데 저장만 조용히 실패했다.
 *    모듈 매니페스트 가드(t8-runtime-manifest)는 이걸 못 잡는다 — 모듈은 다 있었으니까.
 *
 * 이 가드가 막는 것:
 *   · 버전을 임의로 낮추면 실패
 *   · 필수 store 가 하나라도 빠지면 실패
 *   · 마이그레이션 분기(구버전에서 올라오는 경로)가 사라지면 실패
 *   · store 를 새로 만들면서 버전을 안 올리면 실패
 *
 * ⚠️ 실제 업그레이드 동작은 브라우저에서만 확인된다(여기선 소스 계약만).
 *    2026-08-23 실측: v4 DB(slots 5·gallery 7·assets 1) → 앱 로드 → v6 승격 ·
 *    store 7개 · 기존 레코드·인덱스 보존 · 학습 4건 저장 · 새로고침 후 유지.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const src = fs.readFileSync(path.join(ROOT, 'app-gallery-db.js'), 'utf8');

/* 지금 스키마가 요구하는 것. store 를 늘릴 때는 **여기와 버전을 같이** 올려야 한다. */
const SCHEMA_VERSION = 6;
const REQUIRED_STORES = {
  slots: 'v1 작업 슬롯',
  gallery: 'v2 갤러리(+v3 customer_id)',
  assets: 'v4 자산',
  preferences: 'v5 T8 학습 — 이게 없으면 원장이 편집해도 아무것도 안 쌓인다',
  learning_signals: 'v5 T8 관측',
  preference_versions: 'v5 T8 롤백',
  photo_contexts: 'v6 사진 문맥 캐시'
};

function openVersion() {
  const m = src.match(/indexedDB\.open\(_GDB_NAME,\s*(\d+)\)/);
  return m ? Number(m[1]) : null;
}

describe('스키마 버전', () => {
  test(`open 버전이 ${SCHEMA_VERSION} 이다 — 낮추면 실패한다`, () => {
    expect(openVersion()).toBe(SCHEMA_VERSION);
  });

  test('🔑 버전을 내리면 이 테스트가 막는다', () => {
    // 버전이 내려가면 브라우저가 업그레이드를 안 돌리고, 새 store 없이 그대로 열린다.
    // 그게 정확히 운영에서 학습이 0 이던 상태다.
    expect(openVersion()).toBeGreaterThanOrEqual(SCHEMA_VERSION);
  });
});

describe('필수 store — 하나라도 빠지면 실패', () => {
  /* store 이름은 상수로 선언되기도(_GDB_STORE) 배열로 선언되기도(_LEARN_STORES) 한다.
     그래서 이름 문자열이 소스에 있고 + 실제로 createObjectStore 되는지 둘 다 본다. */
  test.each(Object.entries(REQUIRED_STORES))('%s (%s)', (name) => {
    expect(src).toContain(`'${name}'`);
  });

  test('T8 학습 store 3종이 한 묶음으로 선언돼 있다', () => {
    const m = src.match(/_LEARN_STORES\s*=\s*\[([^\]]+)\]/);
    expect(m).toBeTruthy();
    ['preferences', 'learning_signals', 'preference_versions'].forEach((n) => {
      expect(m[1]).toContain(n);
    });
  });

  test('선언된 store 가 전부 실제로 생성된다 (선언만 하고 안 만들면 무증상)', () => {
    const up = src.slice(src.indexOf('onupgradeneeded'), src.indexOf('req.onsuccess'));
    expect(up).toMatch(/createObjectStore\(_GDB_STORE/);
    expect(up).toMatch(/createObjectStore\(_GALLERY_STORE/);
    expect(up).toMatch(/createObjectStore\(_ASSET_STORE/);
    expect(up).toMatch(/_LEARN_STORES\.forEach/);
    expect(up).toMatch(/createObjectStore\(_PCTX_STORE/);
  });

  test('createObjectStore 개수가 필수 store 수와 맞는다 — 몰래 늘리면 드러난다', () => {
    const up = src.slice(src.indexOf('onupgradeneeded'), src.indexOf('req.onsuccess'));
    const n = (up.match(/createObjectStore\(/g) || []).length;
    // 학습 3종은 forEach 안에서 1번만 등장하므로: slots·gallery·assets·pctx(4) + forEach(1) = 5
    expect(n).toBe(5);
  });
});

describe('마이그레이션 분기 — 구버전에서 올라오는 경로가 살아 있다', () => {
  const up = src.slice(src.indexOf('onupgradeneeded'), src.indexOf('req.onsuccess'));

  test('🔑 모든 신설이 "없으면 만든다" 조건부다 — 무조건 만들면 기존 DB 가 깨진다', () => {
    ['_GDB_STORE', '_GALLERY_STORE', '_ASSET_STORE', '_PCTX_STORE'].forEach((s) => {
      expect(up).toMatch(new RegExp(`objectStoreNames\\.contains\\(${s}\\)`));
    });
    expect(up).toMatch(/objectStoreNames\.contains\(name\)/);      // 학습 store 3종
  });

  test('v2→v3 인덱스 마이그레이션(customer_id)이 남아 있다 — 구버전 직행도 처리해야 한다', () => {
    expect(up).toMatch(/indexNames\.contains\('customer_id'\)/);
  });

  test('기존 store 를 지우거나 갈아엎지 않는다', () => {
    expect(up).not.toMatch(/deleteObjectStore/);
    expect(up).not.toMatch(/deleteIndex/);
  });

  test('학습 store 에 tenantId 인덱스가 붙는다 — 격리 조회의 전제', () => {
    expect(up).toMatch(/createIndex\('tenantId'/);
  });
});

describe('저장 헬퍼 — store 만 있고 CRUD 가 없으면 역시 무증상 실패', () => {
  test.each(['wmLearnPut', 'wmLearnGet', 'wmLearnAll', 'wmLearnDel'])('%s 를 전역으로 낸다', (fn) => {
    expect(src).toMatch(new RegExp(`window\\.${fn}\\s*=`));
  });
});

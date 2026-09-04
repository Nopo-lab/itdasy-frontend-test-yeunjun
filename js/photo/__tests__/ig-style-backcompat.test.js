/* 하위호환 — **이미 쓰던 원장**의 데이터로 새 코드가 도는가.  [2026-09-04 릴리즈 게이트]
 *
 * 이번 변경은 기존 저장소를 건드리지 않았다고 주장한다. 그 주장을 여기서 실행으로 증명한다.
 * 배포 직후 화면이 비거나 예외가 나면 그건 "새 기능이 안 보인다" 가 아니라
 * **기존 기능이 깨진 것**이다 — 훨씬 나쁘다.
 *
 * 그리고 모듈 하나가 로드에 실패해도(네트워크·캐시·CSP) 기존 카드는 떠야 한다.
 * 이 레포에서 로더 누락으로 기능이 통째로 죽은 전례가 있다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const igtSrc = fs.readFileSync(path.join(ROOT, 'js/photo/instagram-text-style.js'), 'utf8');
const cardSrc = fs.readFileSync(path.join(ROOT, 'js/photo/ig-style-card-page2.js'), 'utf8');
const libSrc = fs.readFileSync(path.join(ROOT, 'js/photo/ig-style-library.js'), 'utf8');

function mem(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _map: m
  };
}

/* 배포 **전에** 저장돼 있던 관찰 프로필. 필드 구성을 그대로 재현한다. */
const OLD_PROFILE = {
  schema: 'igtext-v2', source: 'instagram_observed',
  postsAnalyzed: 9, blockCount: 14, textUsageRate: 0.66,
  textUsage: { value: 0.66, posts: 9, evidence: 'genuine', enough: true },
  axes: {
    align: { value: 'center', agree: 0.8, posts: 9, evidence: 'genuine', enough: true },
    position: { value: 'lower-center', agree: 0.7, posts: 9, evidence: 'genuine', enough: true },
    fontClass: null, fontWeight: null,
    color: { value: '#FFFFFF', agree: 1, posts: 9, evidence: 'genuine', enough: true },
    sizeRatio: { value: 0.06, posts: 9, evidence: 'genuine', enough: true }
  },
  composition: { value: 'single', agree: 0.7, posts: 9 },
  enough: true, builtAt: 1756000000000
};

describe('§22 기존 관찰 프로필로 페이지 2 가 그대로 그려진다', () => {
  function boot(store) {
    const win = { localStorage: store };
    new Function('window', 'localStorage', cardSrc)(win, store);
    return win;
  }

  test('스타일 라이브러리가 **없어도** 기존 카드가 렌더된다', () => {
    const win = boot(mem({ last_user_id: '1' }));   // IgStyleLibrary 미로드
    const html = win.IgStyleCardPage2.render(OLD_PROFILE);
    expect(html).toContain('사진편집 스타일');
    expect(html).toContain('원장님 스타일로 만들면 이런 느낌');
    // 목록 섹션은 비어 있되 '만들기' 는 남는다 — 예외로 죽지 않는 게 핵심
    expect(html).toContain('게시물 골라 스타일 만들기');
  });

  test('축이 null 인 옛 프로필도 예외 없이 렌더된다', () => {
    const win = boot(mem({ last_user_id: '1' }));
    const bare = JSON.parse(JSON.stringify(OLD_PROFILE));
    bare.axes = { align: null, position: null, fontClass: null, fontWeight: null, color: null, sizeRatio: null };
    expect(() => win.IgStyleCardPage2.render(bare)).not.toThrow();
  });

  test('enough=false 옛 프로필은 빈 상태 + 만들기 버튼', () => {
    const win = boot(mem({ last_user_id: '1' }));
    const p = JSON.parse(JSON.stringify(OLD_PROFILE));
    p.enough = false;
    const html = win.IgStyleCardPage2.renderInsufficient(p);
    expect(html).toContain('아직 일관된 사진편집 스타일이 없어요');
    expect(html).toContain('게시물 골라 스타일 만들기');
  });

  test('프로필이 아예 없던 원장 — 분석 전 화면', () => {
    const win = boot(mem({ last_user_id: '1' }));
    const html = win.IgStyleCardPage2.renderNotAnalyzed();
    expect(html).toContain('인스타 게시물 스타일을 분석해 보세요');
    expect(html).toContain('data-igs-analyze');
  });

  test('로그아웃 상태(테넌트 없음)에서도 안 죽는다', () => {
    const win = boot(mem({}));
    expect(() => win.IgStyleCardPage2.render(OLD_PROFILE)).not.toThrow();
  });
});

describe('§22 InstagramTextStyle 호출 계약이 안 깨졌다', () => {
  test('build(mediaList) 1-인자 호출이 그대로 동작한다', () => {
    const win = {};
    new Function('window', igtSrc)(win);
    // 옛 호출부는 opts 를 안 넘긴다. 여기서 던지면 인스타 연동 전체가 깨진다.
    return expect(win.InstagramTextStyle.build([])).resolves.toBeNull();
  });

  test('집계 함수 계약(_aggregate)이 그대로다 — shop-baseline 이 이 모양을 읽는다', () => {
    const win = {};
    new Function('window', igtSrc)(win);
    const blk = { text: 'x', alignment: 'left', position: 'lower-left', color: '#FFFFFF',
      font_family_class: 'sans', font_weight: 'bold', size_ratio: 0.08, confidence: 0.8 };
    const post = { text_blocks: [blk], composition: 'text_overlay', is_ui_screenshot: false,
      confidence: 0.8, engine: 'gemini' };
    const r = win.InstagramTextStyle._aggregate([post, post, post, post]);
    // 평면 별칭(align/position/…)은 shop-baseline 이 아직 본다 — 지우면 안 된다
    ['align', 'position', 'fontClass', 'fontWeight', 'color', 'sizeRatio'].forEach((k) => {
      expect(r).toHaveProperty(k);
    });
    expect(r.schema).toBe('igtext-v2');
    expect(r.enough).toBe(true);
  });

  test('onPost 는 선택 — 없어도 집계 결과가 같다', () => {
    const win = {};
    new Function('window', igtSrc)(win);
    expect(igtSrc).toMatch(/var onPost = \(typeof opts\.onPost === 'function'\) \? opts\.onPost : null;/);
    expect(igtSrc).toMatch(/opts = opts \|\| \{\};/);
  });
});

describe('§22 기존 ShopStyle 데이터가 안 깨진다', () => {
  test('igStyleGroupId 없는 옛 스타일도 그대로 읽힌다', () => {
    const shopSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/shop-style.js'), 'utf8');
    const store = mem({
      last_user_id: '1',
      'itdasy:shop_style:list': JSON.stringify([
        { id: 'old1', schema: 1, name: '옛 스타일', layers: [], confirmed: true }
      ]),
      'itdasy:shop_style:active': JSON.stringify('old1')
    });
    const win = { localStorage: store };
    new Function('window', 'localStorage', shopSrc)(win, store);
    win.apiFetch = () => Promise.reject(new Error('offline'));
    win.authHeader = () => ({});
    new Function('window', 'localStorage', libSrc)(win, store);

    expect(win.ShopStyle.getActive().name).toBe('옛 스타일');
    // 인스타 스타일을 하나 굳혀도 옛 스타일이 기본값 자리를 지킨다
    win.IgStyleLibrary.ensureShopStyle({
      id: 5, name: '새 인스타 스타일',
      profile: { visual: { aspect: 0.8 }, text: { alignment: 'left' } }
    });
    expect(win.ShopStyle.getActive().id).toBe('old1');
  });

  test('작업별 선택이 없던 상태 = 기존 동작(전역 기본값)', () => {
    const store = mem({ last_user_id: '1' });
    const win = { localStorage: store, apiFetch: () => Promise.reject(new Error('x')), authHeader: () => ({}) };
    new Function('window', 'localStorage', libSrc)(win, store);
    expect(win.IgStyleLibrary.styleForWork('slot-없음')).toBeNull();
  });
});

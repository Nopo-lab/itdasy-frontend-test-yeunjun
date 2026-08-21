/* Phase 1 관측 계층 계약 테스트.
 *
 * 이 테스트들이 잠그는 것은 "기능이 동작한다"가 아니라 **"동작을 바꾸지 않는다"** 이다.
 * Phase 1 의 계약은 관측뿐이므로, 여기서 깨지면 Phase 1 이 Phase 1 이 아니게 된다.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const pctxSrc = fs.readFileSync(path.join(ROOT, 'js/photo/photo-context.js'), 'utf8');
const metricsSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/wm-metrics.js'), 'utf8');
const shadowSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/edit-plan-shadow.js'), 'utf8');

function loadIntoWindow(srcList) {
  const win = {};
  const sandboxDoc = {
    createElement: () => {
      let W = 0, H = 0;
      return {
        set width(v) { W = v; }, get width() { return W; },
        set height(v) { H = v; }, get height() { return H; },
        getContext: () => ({
          drawImage() {},
          getImageData: (a, b, w, h) => {
            const d = new Uint8ClampedArray(w * h * 4);
            for (let y = 0; y < h; y++) {
              for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const skin = x > w * 0.66 && y > h * 0.66;
                d[i] = skin ? 200 : 40; d[i + 1] = skin ? 150 : 60;
                d[i + 2] = skin ? 130 : 180; d[i + 3] = 255;
              }
            }
            return { data: d };
          }
        })
      };
    }
  };
  global.window = win;
  global.document = sandboxDoc;
  global.performance = { now: () => 0 };
  global.Image = function () { setTimeout(() => this.onload && this.onload(), 0); };
  Object.defineProperty(global.Image.prototype, 'src', { set() {}, configurable: true });
  Object.defineProperty(global.Image.prototype, 'naturalWidth', { get() { return 480; }, configurable: true });
  Object.defineProperty(global.Image.prototype, 'naturalHeight', { get() { return 600; }, configurable: true });
  srcList.forEach((s) => { new Function('window', 'document', 'Image', 'performance', s)(win, sandboxDoc, global.Image, global.performance); });
  return win;
}

describe('[Phase 1] PhotoContext — 관측 전용 계약', () => {
  test('공개 API 는 of/peek/stats 뿐 — 배치를 바꾸는 함수가 없다', () => {
    const win = loadIntoWindow([pctxSrc]);
    expect(Object.keys(win.PhotoContext).sort()).toEqual(['SCHEMA', 'of', 'peek', 'stats']);
    // apply/place/layout 같은 '적용' 동사가 공개면 Phase 1 계약 위반
    expect(Object.keys(win.PhotoContext).join(',')).not.toMatch(/apply|place|layout|anchor/i);
  });

  test('subjectZone 을 실제로 계산한다 (피부 우하단 → lower-right)', async () => {
    const win = loadIntoWindow([pctxSrc]);
    const ctx = await win.PhotoContext.of('x.png');
    expect(ctx.subjectZone).toBe('lower-right');
    expect(ctx.subjectRegion).toBeTruthy();
  });

  test('실패는 던지지 않고 null — 이 모듈이 죽어도 앱은 그대로 동작해야 한다', async () => {
    const win = loadIntoWindow([pctxSrc]);
    await expect(win.PhotoContext.of('')).resolves.toBeNull();
    await expect(win.PhotoContext.of(null)).resolves.toBeNull();
  });

  test('결과에 원본 바이트·dataURL·EXIF·임베딩이 없다', async () => {
    const win = loadIntoWindow([pctxSrc]);
    const ctx = await win.PhotoContext.of('x.png');
    const json = JSON.stringify(ctx);
    expect(json).not.toMatch(/data:/);
    ['src', 'dataUrl', 'bytes', 'exif', 'embedding', 'landmarks'].forEach((k) => {
      expect(Object.prototype.hasOwnProperty.call(ctx, k)).toBe(false);
    });
  });

  test('같은 사진은 재계산하지 않는다 (L0 동일 객체 반환)', async () => {
    const win = loadIntoWindow([pctxSrc]);
    const a = await win.PhotoContext.of('x.png');
    const b = await win.PhotoContext.of('x.png');
    expect(b).toBe(a);
    expect(win.PhotoContext.stats().l0hit).toBeGreaterThan(0);
  });

  test('피부 임계가 safe-zone.js 와 동일하다 (같은 사진에 다른 답이 나오면 안 된다)', () => {
    const szSrc = fs.readFileSync(path.join(ROOT, 'js/itd-editor/safe-zone.js'), 'utf8');
    // YCbCr 범위 상수
    ['77', '130', '134', '176'].forEach((n) => {
      expect(pctxSrc).toContain(n);
      expect(szSrc).toContain(n);
    });
    expect(pctxSrc).toMatch(/0\.03/);
    expect(pctxSrc).toMatch(/0\.72/);
    expect(szSrc).toMatch(/0\.03/);
    expect(szSrc).toMatch(/0\.72/);
  });
});

describe('[Phase 1] WMMetrics — 격리와 무침습', () => {
  test('tenant 키는 T8 과 같은 last_user_id 를 쓴다 (격리 경계는 한 곳에서만 정의)', () => {
    expect(metricsSrc).toMatch(/getItem\('last_user_id'\)/);
    // 주석에는 사고 경위로 옛 키 이름이 남아 있을 수 있다 — 검사 대상은 **실제 getItem 호출**뿐.
    expect(metricsSrc).not.toMatch(/getItem\(['"]itdasy:tenant['"]\)/);
    const sigSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/work-memory-signals.js'), 'utf8');
    expect(sigSrc).toMatch(/getItem\('last_user_id'\)/);
  });

  test('WMSignals.begin 이 null 이면 세션을 세지 않는다 (유령 세션 방지)', () => {
    // QA 에서 실제로 발생했던 회귀 — 로그아웃 상태에서 세션·outcome 이 유령으로 쌓였다
    expect(metricsSrc).toMatch(/if \(!r\) \{ _cur = null; return r; \}/);
  });

  test('원본이 false 를 반환한 신호는 세지 않는다 (system 스코프 오염 차단)', () => {
    expect(metricsSrc).toMatch(/if \(r === true\)/);
  });

  test('preview_only·abandoned 는 계측 전용 — 학습(WMLearn)으로 넘기지 않는다', () => {
    expect(metricsSrc).toMatch(/preview_only/);
    expect(metricsSrc).toMatch(/abandoned/);
    /* 계측 모듈이 학습 API 를 **호출**하면 가중치 0 보장이 깨진다.
       주석에서 WMLearn 을 언급하는 건 문제가 아니다 — 잡아야 할 건 호출이다. */
    expect(metricsSrc).not.toMatch(/window\.WMLearn|WMLearn\s*\./);
    expect(metricsSrc).not.toMatch(/window\.WMPrefs|WMPrefs\s*\./);
  });

  test('T8 파일을 수정하지 않는다 — 래핑으로만 관측', () => {
    expect(metricsSrc).toMatch(/oNote\.apply/);
    expect(metricsSrc).toMatch(/oBegin\.apply/);
  });
});

describe('[§16] PhotoContext 는 편집 결과에 절대 영향을 주지 않는다', () => {
  /* Phase 1 의 정의 자체다. 여기가 깨지면 Phase 1 은 더 이상 관측 계층이 아니다.
     소비처가 생기는 순간(Phase 2) 이 테스트를 **의도적으로** 고치게 만드는 게 목적이다 —
     모르는 사이에 배치에 영향이 흘러드는 걸 막는다. */
  const SCAN_DIRS = ['js', '.'];
  function scanFiles() {
    const out = [];
    const walk = (d, depth) => {
      let ents;
      try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch (_e) { return; }
      for (const e of ents) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) {
          if (['node_modules', '.git', '__tests__', '.claude', 'audit_tests'].includes(e.name)) continue;
          if (depth > 0) walk(p, depth - 1);
          continue;
        }
        if (e.name.endsWith('.js') && e.name !== 'photo-context.js') out.push(p);
      }
    };
    walk(path.join(ROOT, 'js'), 6);
    for (const f of fs.readdirSync(ROOT)) {
      if (f.endsWith('.js') && f.startsWith('app-')) out.push(path.join(ROOT, f));
    }
    return out;
  }

  const callers = scanFiles().filter((f) => /PhotoContext\s*\.\s*(of|peek)\s*\(/.test(fs.readFileSync(f, 'utf8')));

  /* 허용 소비처는 **관측 모듈뿐**이다.
     - itd-editor : open 훅. 결과를 받지도 않는다(계산만 시키고 버린다).
     - wm-metrics : 겹침 baseline 측정. 결과를 쓰지만 **쓰는 곳이 지표**다.
     이 목록에 편집 결정 모듈이 들어오는 순간 Phase 1 계약이 깨진 것이다. */
  const ALLOWED_CONSUMERS = [
    'js/itd-editor/itd-editor.js',        // open 훅 — 결과를 받지도 않는다
    'js/workspace/wm-metrics.js',         // 겹침 baseline — 쓰는 곳이 지표
    'js/photo/shop-style-candidate.js'    // [Phase 2] 인스타 후보 생성 — 쓰는 곳이 candidate(미적용)
  ];

  test('PhotoContext 호출부는 관측 모듈뿐이다', () => {
    const rel = callers.map((f) => path.relative(ROOT, f)).sort();
    expect(rel).toEqual(ALLOWED_CONSUMERS.slice().sort());
  });

  test('편집기는 결과를 받지 않는다 (계산만 시키고 버린다)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/itd-editor/itd-editor.js'), 'utf8');
    // .then 으로 결과를 받아 쓰면 그 순간 편집에 흘러들 수 있다
    expect(src).not.toMatch(/PhotoContext\s*\.\s*of\s*\([^)]*\)\s*\.\s*then/);
  });

  test('관측 모듈의 소비 결과는 지표에만 쓰인다', () => {
    const src = fs.readFileSync(path.join(ROOT, 'js/workspace/wm-metrics.js'), 'utf8');
    const body = (src.match(/PhotoContext\.of\([\s\S]{0,900}?\}\)\.catch/) || [''])[0];
    expect(body).toMatch(/_mut\(/);                       // 지표 갱신
    // 레이어·좌표·폰트를 건드리는 흔적이 있으면 안 된다
    expect(body).not.toMatch(/\.layers\s*=|\.x\s*=|\.y\s*=|\.font\s*=|setLayer|applyLayer/);
  });

  test('편집 결정 모듈들은 PhotoContext 를 아예 모른다', () => {
    ['js/workspace/work-memory-engine.js', 'js/workspace/work-memory-personalize.js',
      'js/itd-editor/safe-zone.js', 'js/workspace/flow/layout.js'].forEach((rel) => {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src).not.toMatch(/PhotoContext/);
    });
  });
});

describe('[R8] 작은 표본을 성과로 오독할 수 없게 — sampleCount + status', () => {
  test('모든 비율 지표가 값·표본수·상태를 함께 낸다', () => {
    // 합성값 0.5(표본 2건)가 "겹침률 50%" 로 읽힐 뻔한 사고의 재발 방지
    expect(metricsSrc).toMatch(/status:\s*n === 0 \? 'NO_DATA' : \(enough \? 'OK' : 'INSUFFICIENT'\)/);
    expect(metricsSrc).toMatch(/value:\s*enough \? value : null/);
  });

  test('표본이 기준 미만이면 값 자체를 null 로 막는다 (숫자를 감춰서 오독 차단)', () => {
    expect(metricsSrc).toMatch(/var MIN_RATE = \d+/);
    expect(metricsSrc).toMatch(/var MIN_PCTL = \d+/);
  });

  test('baselineSubjectOverlapRate 는 _rateM 을 거친다 (날 숫자 금지)', () => {
    expect(metricsSrc).toMatch(/baselineSubjectOverlapRate:\s*_rateM\(/);
  });

  test('source 로 합성/테스트계정/실사용을 구분한다', () => {
    expect(metricsSrc).toMatch(/function _source\(\)/);
    expect(metricsSrc).toMatch(/'synthetic'/);
    expect(metricsSrc).toMatch(/'test_account'/);
    expect(metricsSrc).toMatch(/'production'/);
  });
});

describe('[R9] 기기 텔레메트리 — 최소 수집', () => {
  test('UA 전문을 저장하지 않는다 (지문화 방지)', () => {
    // userAgent 를 읽되 저장하는 건 os/cls/tier 라벨뿐이어야 한다
    expect(metricsSrc).toMatch(/return \{ os: os, class: cls, tier: tier, cores: cores, memoryGb: mem \};/);
    expect(metricsSrc).not.toMatch(/ua:\s*ua/);
    expect(metricsSrc).not.toMatch(/userAgent:\s*/);
  });

  test('계산 지연과 캐시 지연을 분리한다 (섞으면 p90 이 왜곡된다)', () => {
    expect(metricsSrc).toMatch(/latCompute:\s*\[\]/);
    expect(metricsSrc).toMatch(/latCache:\s*\[\]/);
    expect(metricsSrc).toMatch(/coldCompute:/);
    expect(metricsSrc).toMatch(/warmCache:/);
  });

  test('cores·memory 를 못 믿으면 tier 는 unknown (모르는 걸 mid 로 채우지 않는다)', () => {
    // iOS Safari 는 deviceMemory 를 안 준다. 'mid' 로 채우면 저가 안드로이드가 중급으로 둔갑한다
    expect(metricsSrc).toMatch(/var tier = 'unknown';/);
    expect(metricsSrc).toMatch(/if \(cores \|\| mem\) \{/);
  });

  test('연속 작업(5장·10장)을 버스트 구간으로 잰다', () => {
    expect(metricsSrc).toMatch(/burst:\s*\{ first: \[\], mid: \[\], deep: \[\] \}/);
    expect(metricsSrc).toMatch(/BURST_GAP_MS/);
  });

  test('기기 정보가 편집 결과에 영향을 주지 않는다 (관측 전용)', () => {
    // _device() 결과를 쓰는 곳은 저장·리포트뿐 — 분기 로직에 쓰이면 안 된다
    const uses = metricsSrc.match(/_device\(\)/g) || [];
    expect(uses.length).toBeLessThanOrEqual(3);
    expect(metricsSrc).not.toMatch(/if\s*\([^)]*_device\(\)/);
  });
});

describe('[Phase 1] 위치 학습 confound 방어 (Phase 0 center 75% 교훈)', () => {
  const prefSrc = fs.readFileSync(path.join(ROOT, 'js/workspace/work-memory-preferences.js'), 'utf8');

  test('BASE_FEATURES(무수정 유지 → positive)에 x/y 가 없다', () => {
    const m = prefSrc.match(/var BASE_FEATURES = \[([^\]]*(?:\][^;]*)*?)\];/);
    expect(m).toBeTruthy();
    expect(m[1]).not.toMatch(/'x'/);
    expect(m[1]).not.toMatch(/'y'/);
    expect(m[1]).toMatch(/font/);
  });

  test('위치는 position_changed 이벤트를 통해서만 학습된다', () => {
    expect(prefSrc).toMatch(/position_changed:\s*\[\['x',\s*'x'\],\s*\['y',\s*'y'\]\]/);
  });

  test('교체당한 좌표를 negative 로 세지 않는다 (옮긴 것 ≠ 싫어한 것)', () => {
    expect(prefSrc).toMatch(/교체당한 좌표/);
  });
});

describe('[Phase 2 준비] EditPlanShadow — 자기채점 금지', () => {
  test('wouldImprove 를 노출하지 않는다', () => {
    const win = loadIntoWindow([shadowSrc]);
    expect(Object.keys(win.EditPlanShadow)).not.toContain('wouldImprove');
    const A = win.EditPlanShadow.compareSafety([], [], null);
    expect(Object.prototype.hasOwnProperty.call(A, 'wouldImprove')).toBe(false);
  });

  test('Shadow A 와 B 는 별도 함수 — 한 점수로 합치지 않는다', () => {
    const win = loadIntoWindow([shadowSrc]);
    expect(typeof win.EditPlanShadow.compareSafety).toBe('function');
    expect(typeof win.EditPlanShadow.comparePersonalization).toBe('function');
    const A = win.EditPlanShadow.compareSafety([], [], null);
    const B = win.EditPlanShadow.comparePersonalization(null, null);
    expect(A.kind).toBe('A');
    expect(B.kind).toBe('B');
  });

  test('피사체를 모르면 wouldOverlap 은 null (모르는 걸 0 으로 쓰지 않는다)', () => {
    const win = loadIntoWindow([shadowSrc]);
    const r = win.EditPlanShadow.compareSafety(
      [{ type: 'text', x: 0.7, y: 0.7, w: 0.3, size: 0.06 }],
      [{ type: 'text', x: 0.2, y: 0.2, w: 0.3, size: 0.06 }], null);
    expect(r.wouldOverlap).toBeNull();
    expect(r.subjectKnown).toBe(false);
  });

  test('겹침을 실제로 계산한다', () => {
    const win = loadIntoWindow([shadowSrc]);
    const pctx = { subjectRegion: { x: 0.6, y: 0.6, w: 0.35, h: 0.35 } };
    const r = win.EditPlanShadow.compareSafety(
      [{ type: 'text', x: 0.75, y: 0.78, w: 0.3, size: 0.06 }],
      [{ type: 'text', x: 0.20, y: 0.15, w: 0.3, size: 0.06 }], pctx);
    expect(r.existing.overlapCount).toBe(1);
    expect(r.proposed.overlapCount).toBe(0);
    expect(r.wouldMove).toBe(1);
  });

  test('어디에서도 호출되지 않는다 (Phase 2 게이트 전 적용 0%)', () => {
    const jsDir = path.join(ROOT, 'js');
    const hits = [];
    (function walk(d) {
      fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (e.name !== '__tests__') walk(p); return; }
        if (!e.name.endsWith('.js') || e.name === 'edit-plan-shadow.js') return;
        if (/EditPlanShadow\./.test(fs.readFileSync(p, 'utf8'))) hits.push(p);
      });
    })(jsDir);
    expect(hits).toEqual([]);
  });
});

describe('[Phase 2] ShopStyleCandidate — 인스타 관찰은 "후보"지 "선호"가 아니다', () => {
  const sscSrc = fs.readFileSync(path.join(ROOT, 'js/photo/shop-style-candidate.js'), 'utf8');

  test('증거 출처를 instagram_observed 로 명시하고 weak 로 표시한다', () => {
    // 결과물 관찰은 원장이 그 값을 **골랐다는 증거가 아니다**(필터앱·조명일 수 있다).
    // editor_observed 로 승격하는 순간 T8 학습이 오염된다.
    expect(sscSrc).toMatch(/source:\s*'instagram_observed'/);
    expect(sscSrc).toMatch(/evidenceStrength:\s*'weak'/);
  });

  test('T8 학습 API 를 호출하지 않는다 (후보가 선호로 새지 않게)', () => {
    expect(sscSrc).not.toMatch(/window\.WMPrefs|WMPrefs\s*\./);
    expect(sscSrc).not.toMatch(/window\.WMLearn|WMLearn\s*\./);
    expect(sscSrc).not.toMatch(/window\.WMSignals|WMSignals\s*\./);
  });

  test('두 번째 픽셀 분석기를 만들지 않는다 — PhotoContext 재사용', () => {
    expect(sscSrc).toMatch(/window\.PhotoContext\.of\(/);
    expect(sscSrc).not.toMatch(/\.getImageData\(/);   // 자체 분석 금지(주석 언급은 무관)
  });

  test('표본 미달이면 visual 을 통째로 null 로 막는다', () => {
    expect(sscSrc).toMatch(/status:\s*n === 0 \? 'NO_DATA' : \(enough \? 'OK' : 'INSUFFICIENT'\)/);
    expect(sscSrc).toMatch(/if \(enough\) \{/);
  });

  test('피사체 위치를 대표값 하나로 뭉개지 않고 분포로 준다', () => {
    // Phase 0 에서 'center 75%' 를 선호로 오독할 뻔했다 — 읽는 쪽이 분포를 보게 한다
    expect(sscSrc).toMatch(/hist:\s*h/);
    expect(sscSrc).not.toMatch(/topZone|dominantZone/);
  });

  test('색은 평균이 아니라 빈도순 (핑크+민트 평균 = 없는 회색)', () => {
    expect(sscSrc).toMatch(/function _topColors/);
    expect(sscSrc).toMatch(/freq\[b\] - freq\[a\]/);
  });

  test('백엔드가 주는 필드명 `thumb` 을 쓴다 (실계정에서 12장이 전부 걸러졌던 버그)', () => {
    // _parse_media_items 가 {id, thumb, permalink, media_type} 로 정규화한다.
    // 원시 Graph 필드만 보면 실계정에서 조용히 0장이 된다 — 합성 테스트로는 못 잡는다.
    expect(sscSrc).toMatch(/m\.thumb \|\| m\.thumbnail_url \|\| m\.media_url/);
  });

  test('tenant 스코프 저장 — 키는 last_user_id', () => {
    expect(sscSrc).toMatch(/getItem\('last_user_id'\)/);
  });

  test('아직 아무도 소비하지 않는다 (Replay/Shadow 검증 전)', () => {
    const hits = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!['node_modules', '.git', '__tests__', '.claude'].includes(e.name)) walk(p); continue; }
        if (!e.name.endsWith('.js') || e.name === 'shop-style-candidate.js') continue;
        // [Phase 3] shop-baseline 은 **읽어서 고르기만** 하는 resolver — 적용이 아니다.
        //   그 자신도 소비처가 0 인지 Phase 3 테스트가 따로 감시한다.
        if (e.name === 'shop-baseline.js') continue;
        if (/ShopStyleCandidate\s*\./.test(fs.readFileSync(p, 'utf8'))) hits.push(path.relative(ROOT, p));
      }
    };
    walk(path.join(ROOT, 'js'));
    expect(hits).toEqual([]);
  });
});

describe('[Phase 3] 증거 계층 — 기본값을 사용자 의도로 오독하지 않는다', () => {
  const baseSrc = fs.readFileSync(path.join(ROOT, 'js/photo/shop-baseline.js'), 'utf8');
  const priorSrc = fs.readFileSync(path.join(ROOT, 'js/photo/category-prior.js'), 'utf8');

  test('BrandKit 은 **저장 여부**를 직접 확인한다 (get() 은 기본값을 채워 준다)', () => {
    /* QA 실측 버그: 아무 설정도 안 한 원장의 기본색(#D58A95)이 explicit confidence 1.0 으로
       인스타 실측 증거를 눌렀다. Phase 0 의 'center 75%'(스폰 기본값을 선호로 오독)와 같은 종류. */
    expect(baseSrc).toMatch(/localStorage\.getItem\(BK_KEY\)/);
    expect(baseSrc).toMatch(/if \(!raw\) return null;/);
    expect(baseSrc).toMatch(/saved\.brand_color != null/);
  });

  test('전역 이름은 window.BrandKit 이다 (ItdasyBrandKit 아님)', () => {
    expect(baseSrc).toMatch(/window\.BrandKit && window\.BrandKit\.get/);
    expect(baseSrc).not.toMatch(/window\.ItdasyBrandKit/);
    const bk = fs.readFileSync(path.join(ROOT, 'app-brand-kit.js'), 'utf8');
    expect(bk).toMatch(/window\.BrandKit = \{/);
  });

  test('instagram_observed 는 감쇠된다 — 표본이 커도 편집기 증거를 못 이긴다', () => {
    expect(baseSrc).toMatch(/IG_DECAY = 0\.6/);
    // 편집기 증거가 있으면 인스타를 보지 않는다(계층으로 자름, 빈도 평균 금지)
    expect(baseSrc).toMatch(/pColor\) out\.axes\.color = _axis\(pColor\.value, 'editor_observed'/);
  });

  test('cold start weighting 은 임계값 하드코딩이 아니라 연속 감쇠다', () => {
    expect(baseSrc).toMatch(/function priorWeight/);
    expect(baseSrc).toMatch(/1 \/ \(1 \+ n \/ 5\)/);
  });

  test('CategoryPrior 는 다른 사용자 데이터 집계가 아니라 코드 seed 다', () => {
    expect(priorSrc).toMatch(/evidenceStrength:\s*'seed'/);
    expect(priorSrc).not.toMatch(/apiFetch|fetch\(/);        // 외부에서 받아오지 않는다
    expect(priorSrc).toMatch(/MAX_PRIOR_CONF = 0\.5/);       // editor_observed(1.0)를 못 이긴다
  });

  test('업종 7종은 service-categories SSOT 와 같다', () => {
    const sc = fs.readFileSync(path.join(ROOT, 'js/service-categories.js'), 'utf8');
    const order = /var ORDER = \[([^\]]+)\]/.exec(sc)[1].match(/'(\w+)'/g).map(s => s.replace(/'/g, ''));
    order.forEach((c) => expect(priorSrc).toMatch(new RegExp('\\b' + c + ':')));
  });

  test('아직 아무도 소비하지 않는다', () => {
    const hits = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) { if (!['node_modules', '.git', '__tests__', '.claude'].includes(e.name)) walk(p); continue; }
        if (!e.name.endsWith('.js') || ['shop-baseline.js', 'category-prior.js'].includes(e.name)) continue;
        const s = fs.readFileSync(p, 'utf8');
        if (/ShopBaseline\s*\.|CategoryPrior\s*\./.test(s)) hits.push(path.relative(ROOT, p));
      }
    };
    walk(path.join(ROOT, 'js'));
    expect(hits).toEqual([]);
  });
});

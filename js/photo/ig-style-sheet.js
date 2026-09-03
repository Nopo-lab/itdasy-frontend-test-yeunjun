/* ig-style-sheet.js — '내 스타일' 전체보기 · 상세 · 직접 만들기.  [2026-09-04]
 *
 * [왜 분석 카드 안이 아니라 시트인가]
 *   분석 카드(360px 팝업)는 "내 인스타가 이렇더라" 를 **보여주는** 자리다.
 *   게시물 24장을 격자로 고르고 이름을 타이핑하는 건 그 안에서 하면 카드가 무너진다.
 *   그래서 카드엔 목록만 두고, 손이 많이 가는 건 여기로 뺀다.
 *
 * [기존 디자인 시스템을 그대로 쓴다]
 *   `.subscreen-overlay` + `.ss-*` — 설정 하위화면들이 쓰는 그 클래스다.
 *   PC 오프셋(`left: var(--side-nav-width)`)이 `style-responsive.css` 에서 **자동으로** 걸려서
 *   사이드바에 왼쪽이 잘리지 않는다. 새 오버레이를 만들면 그 등록을 또 빠뜨린다(9번 겪었다).
 *
 * [아이콘은 Lucide SVG 만]
 *   이모지(🤍🤎🖤)로 스타일을 구분하고 싶은 유혹이 있는데 OS 마다 다르게 렌더된다.
 *   대신 **그 스타일의 실제 팔레트 색**을 점으로 보여준다 — 더 정확하기도 하다.
 *
 * [게시물 제거 ≠ 인스타 게시물 삭제]
 *   문구로 못 박는다. 원장이 "내 인스타에서 사진이 지워지나?" 를 묻지 않아도 되게.
 *
 * 공개: window.IgStyleSheet.openList() / .openDetail(groupId) / .openCreate() / .close()
 */
(function () {
  'use strict';
  if (window.IgStyleSheet) return;

  var ID = 'igStyleSheet';
  var _media = null;          // [{id, thumb, permalink}] — 표시용. CDN 주소는 만료돼서 저장 안 한다.
  var _mediaAt = 0;
  var _view = null;           // 'list' | 'detail' | 'create'
  var _curId = null;
  var _picked = [];           // 만들기·편집 중 고른 media_id

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }
  function _toast(m) { try { if (window.showToast) window.showToast(m); } catch (_e) { void _e; } }
  function _haptic() { try { window.hapticLight && window.hapticLight(); } catch (_e) { void _e; } }
  function _L() { return window.IgStyleLibrary || null; }

  /* 썸네일. IG CDN 주소는 만료되므로 **그때그때 받는다**(저장하면 며칠 뒤 깨진 이미지를
     자신 있게 보여주게 된다). 5분은 재사용한다 — 목록↔상세를 오갈 때마다 부를 이유가 없다. */
  function _loadMedia() {
    if (_media && Date.now() - _mediaAt < 5 * 60 * 1000) return Promise.resolve(_media);
    if (!window.apiFetch) return Promise.resolve([]);
    var h = (typeof window.authHeader === 'function') ? window.authHeader() : {};
    return window.apiFetch('/instagram/recent-media?limit=24', { headers: h })
      .then(function (r) { return (r && r.ok) ? r.json() : null; })
      .then(function (j) {
        _media = (j && Array.isArray(j.media)) ? j.media : [];
        _mediaAt = Date.now();
        return _media;
      })
      .catch(function () { return _media || []; });
  }
  function _thumbOf(mediaId) {
    var m = (_media || []).filter(function (x) { return x && x.id === mediaId; })[0];
    return m ? (m.thumb || m.thumbnail_url || m.media_url || '') : '';
  }

  // ── 껍데기 ────────────────────────────────────────────────────────
  function _mount() {
    var el = document.getElementById(ID);
    if (el) return el;
    el = document.createElement('div');
    el.id = ID;
    el.className = 'subscreen-overlay';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<header class="ss-topbar">' +
        '<button type="button" class="ss-back" data-igs-back aria-label="뒤로">' +
          '<svg class="ic" aria-hidden="true"><use href="#ic-chevron-left"/></svg>' +
        '</button>' +
        '<div class="ss-title" id="igsTitle">내 스타일</div>' +
      '</header>' +
      '<div class="ss-body" id="igsBody"></div>';
    document.body.appendChild(el);
    el.addEventListener('click', _onClick);
    return el;
  }

  function _open(view, id) {
    var el = _mount();
    _view = view; _curId = id || null;
    el.setAttribute('aria-hidden', 'false');
    /* transform 슬라이드가 애니메이션 되려면 초기 상태가 **한 번 레이아웃** 돼야 한다.
       🔴 여기서 `requestAnimationFrame` 을 쓰면 안 된다 — 탭이 백그라운드거나 헤드리스면
          rAF 가 멈춰서 `is-open` 이 영영 안 붙고, **시트가 화면 밖에 그대로 남는다**
          (실측: PC 에서 상세를 눌렀는데 오른쪽에 반쯤 걸린 채 멈췄다).
          강제 리플로우는 항상 즉시 일어난다. */
    void el.offsetHeight;
    el.classList.add('is-open');
    /* 🔴 뒤로가기 등록. 안 하면 안드로이드 백버튼이 이 시트를 모르고 **앱을 종료한다**
       (이 레포에서 반복해서 난 사고라 규칙으로 굳어 있다). */
    try {
      if (typeof window._registerSheet === 'function') window._registerSheet(ID, close);
      if (typeof window._markSheetOpen === 'function') window._markSheetOpen(ID);
    } catch (_e) { void _e; }
    _render();
  }

  function close() {
    var el = document.getElementById(ID);
    if (!el) return;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    _view = null; _curId = null; _picked = [];
    try { if (typeof window._markSheetClosed === 'function') window._markSheetClosed(ID); }
    catch (_e) { void _e; }
  }

  /* 뒤로: 상세·만들기에서는 **목록으로**, 목록에서는 닫는다.
     한 번에 닫아버리면 원장이 "어디까지 왔더라" 를 잃는다(§45). */
  function _back() {
    if (_view === 'detail' || _view === 'create') { _open('list'); return; }
    close();
  }

  // ── 조각 ──────────────────────────────────────────────────────────
  function _dots(profile) {
    var pal = (profile && profile.visual && profile.visual.palette) || [];
    if (!pal.length) {
      return '<span style="width:34px;height:34px;border-radius:11px;background:#F2F4F6;flex-shrink:0;"></span>';
    }
    var cells = pal.slice(0, 3).map(function (c) {
      return '<span style="flex:1;background:' + _esc(c) + ';"></span>';
    }).join('');
    return '<span style="display:flex;width:34px;height:34px;border-radius:11px;overflow:hidden;' +
      'flex-shrink:0;border:1px solid var(--border);">' + cells + '</span>';
  }

  /* 확신이 낮으면 단정하지 않는다(§31). 숫자를 그대로 보여주지도 않는다 —
     원장에게 0.62 는 아무 뜻도 없다. */
  function _confBadge(c) {
    if (typeof c !== 'number' || c >= 0.6) return '';
    return '<span style="font-size:11px;font-weight:600;color:var(--text-subtle);' +
      'background:var(--surface-2,#F7F8FA);border-radius:999px;padding:3px 8px;">확인해 주세요</span>';
  }

  function _rowHTML(g) {
    var n = (g.media_ids || []).length;
    return '<button type="button" class="igs-row" data-igs-detail="' + g.id + '" ' +
      'style="width:100%;display:flex;align-items:center;gap:12px;padding:13px 14px;background:var(--surface);' +
      'border:1px solid var(--border);border-radius:14px;text-align:left;cursor:pointer;min-height:60px;">' +
      _dots(g.profile) +
      '<span style="flex:1;min-width:0;">' +
        '<span style="display:block;font-size:15px;font-weight:700;color:var(--text);' +
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + _esc(g.name) + '</span>' +
        '<span style="display:block;font-size:12px;color:var(--text-muted);margin-top:2px;">' +
          '게시물 ' + n + '개' + (g.usage_count ? ' · ' + g.usage_count + '번 사용' : '') +
        '</span>' +
      '</span>' + _confBadge(g.confidence) +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="color:var(--text-subtle);flex-shrink:0;">' +
      '<path d="m9 6 6 6-6 6"/></svg></button>';
  }

  /* 게시물 격자. 탭하면 고르기/빼기 — 터치 타깃은 칸 전체(최소 44px 훨씬 넘음). */
  function _gridHTML(mediaIds, opts) {
    opts = opts || {};
    var ids = mediaIds || [];
    if (!ids.length) {
      return '<div style="font-size:13px;color:var(--text-subtle);padding:18px 0;text-align:center;">' +
        (opts.emptyText || '게시물이 없어요') + '</div>';
    }
    return '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px;">' +
      ids.map(function (id) {
        var t = _thumbOf(id);
        var on = opts.selectable ? (_picked.indexOf(id) >= 0) : false;
        var cover = opts.cover === id;
        return '<button type="button" ' + (opts.selectable ? 'data-igs-pick="' : 'data-igs-cover="') + _esc(id) + '" ' +
          'aria-pressed="' + (on ? 'true' : 'false') + '" ' +
          'style="position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;border:' +
          (on || cover ? '2.5px solid var(--brand-strong)' : '1px solid var(--border)') +
          ';background:' + (t ? '#F2F4F6 url(' + _esc(t) + ') center/cover' : '#F2F4F6') +
          ';padding:0;cursor:pointer;">' +
          (on ? '<span style="position:absolute;right:5px;top:5px;width:20px;height:20px;border-radius:50%;' +
            'background:var(--brand-strong);color:#fff;display:flex;align-items:center;justify-content:center;">' +
            '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></span>' : '') +
          (cover ? '<span style="position:absolute;left:5px;bottom:5px;font-size:10px;font-weight:700;color:#fff;' +
            'background:rgba(0,0,0,.55);border-radius:999px;padding:2px 7px;">대표</span>' : '') +
          '</button>';
      }).join('') + '</div>';
  }

  // ── 화면 ──────────────────────────────────────────────────────────
  function _render() {
    var body = document.getElementById('igsBody');
    var title = document.getElementById('igsTitle');
    if (!body) return;
    if (_view === 'list') { title.textContent = '내 스타일'; _renderList(body); }
    else if (_view === 'detail') { title.textContent = '스타일 자세히'; _renderDetail(body); }
    else if (_view === 'create') { title.textContent = '스타일 만들기'; _renderCreate(body); }
  }

  /* 🔴 `skipRefresh` 가 없으면 **무한 루프**다.
     _renderList → L.list() → then(_renderList) → L.list() → … 로 서버를 끝없이 두드리고
     렌더러가 멈춘다(브라우저 카오스 QA 에서 실제로 탭이 얼어붙어 잡았다).
     캐시로 먼저 그리고 → 서버에서 한 번 받아 다시 그리고 → **거기서 끝낸다**. */
  function _renderList(body, skipRefresh) {
    var L = _L();
    var gs = L ? L.cached() : [];
    body.innerHTML =
      '<div class="ss-card">' +
        '<div class="ss-card-tt">내 스타일</div>' +
        '<div class="ss-card-sub">인스타 게시물에서 배운 사진 편집 스타일이에요. ' +
        '작업실에서 새 사진에 그대로 입힐 수 있어요.</div>' +
        '<div id="igsRows" style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">' +
          (gs.length ? gs.map(_rowHTML).join('')
            : '<div style="font-size:13px;color:var(--text-subtle);padding:16px 0;text-align:center;line-height:1.7;">' +
              '아직 만들어진 스타일이 없어요.<br>게시물을 골라 직접 만들어 보세요.</div>') +
        '</div>' +
        '<button type="button" class="ss-cta" data-igs-create>게시물 골라 직접 만들기</button>' +
      '</div>';
    // 서버에서 최신을 받아 조용히 갱신 — 캐시로 먼저 보여주고 나중에 맞춘다(빈 화면 방지).
    //   두 번째 렌더는 skipRefresh=true 라 여기서 멈춘다.
    if (L && !skipRefresh) {
      L.list().then(function () { if (_view === 'list') _renderList(body, true); }).catch(function () {});
    }
  }

  function _renderDetail(body) {
    var L = _L();
    var g = (L ? L.cached() : []).filter(function (x) { return x && x.id === _curId; })[0];
    if (!g) { body.innerHTML = '<div class="ss-card"><div class="ss-card-sub">스타일을 찾을 수 없어요.</div></div>'; return; }
    var prof = g.profile || {};
    var t = prof.text || {};
    var feat = [];
    if (t.alignment) feat.push({ k: '글자 정렬', v: ({ left: '왼쪽', center: '가운데', right: '오른쪽' })[t.alignment] || t.alignment });
    if (t.position) feat.push({ k: '글자 자리', v: _posKo(t.position) });
    if (typeof t.sizeRatio === 'number') feat.push({ k: '글자 크기', v: t.sizeRatio >= 0.09 ? '큼' : (t.sizeRatio >= 0.055 ? '보통' : '작게') });
    if (typeof t.usageRate === 'number') feat.push({ k: '글자 사용', v: t.usageRate < 0.3 ? '거의 안 넣음' : (t.usageRate > 0.7 ? '자주 넣음' : '가끔 넣음') });

    body.innerHTML =
      '<div class="ss-card">' +
        '<div style="display:flex;align-items:center;gap:12px;">' + _dots(prof) +
          '<div style="flex:1;min-width:0;">' +
            '<div style="font-size:17px;font-weight:800;color:var(--text);">' + _esc(g.name) + '</div>' +
            '<div style="font-size:12px;color:var(--text-muted);margin-top:3px;">게시물 ' +
              (g.media_ids || []).length + '개' + (g.usage_count ? ' · ' + g.usage_count + '번 사용' : '') + '</div>' +
          '</div>' + _confBadge(g.confidence) +
        '</div>' +
        (feat.length ?
          '<div style="margin-top:14px;display:flex;flex-direction:column;gap:0;">' +
          feat.map(function (f, i) {
            return '<div style="display:flex;justify-content:space-between;padding:9px 0;' +
              (i ? 'border-top:.5px solid var(--border);' : '') + '">' +
              '<span style="font-size:13px;color:var(--text-muted);">' + _esc(f.k) + '</span>' +
              '<span style="font-size:13px;font-weight:600;color:var(--text);">' + _esc(f.v) + '</span></div>';
          }).join('') + '</div>'
          /* 근거가 없으면 없다고 말한다. 그럴듯한 문장을 지어내면 원장이 그걸 믿는다. */
          : '<div style="margin-top:12px;font-size:13px;color:var(--text-subtle);line-height:1.7;">' +
            '아직 글자 습관은 못 배웠어요. 색감만으로 묶은 스타일이에요.</div>') +
        '<button type="button" class="ss-cta" data-igs-apply="' + g.id + '">이 스타일로 사진 만들기</button>' +
      '</div>' +

      '<div class="ss-card">' +
        '<div class="ss-card-tt">이름</div>' +
        '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;">' +
          '<input class="ss-input" id="igsName" maxlength="40" value="' + _esc(g.name) + '" style="flex:1;">' +
          '<button type="button" class="ss-action" data-igs-rename="' + g.id + '" ' +
          /* .ss-action 공통 높이는 32px 다. 다른 화면과 공유하는 클래스라 전역으로 못 올리고
             (관계없는 화면까지 흔든다), 손가락으로 누르는 버튼이라 여기서만 44px 를 보장한다. */
          'style="min-height:44px;">저장</button>' +
        '</div>' +
      '</div>' +

      '<div class="ss-card">' +
        '<div class="ss-card-tt">게시물 관리</div>' +
        /* 🔑 §14 — 이 문장이 없으면 원장이 "내 인스타에서 사진이 지워지나?" 를 걱정한다. */
        '<div class="ss-card-sub">탭해서 이 스타일에 넣거나 뺄 수 있어요. ' +
        '<b style="color:var(--text2);">빼도 인스타 게시물은 그대로예요.</b></div>' +
        '<div id="igsGrid"></div>' +
        '<button type="button" class="ss-cta" data-igs-savepost="' + g.id + '">게시물 저장</button>' +
      '</div>' +

      '<div class="ss-card">' +
        '<div class="ss-card-tt">스타일 삭제</div>' +
        '<div class="ss-card-sub">이 스타일만 지워져요. 인스타 게시물과 이미 만든 사진은 그대로예요.</div>' +
        '<button type="button" class="ss-action" data-igs-delete="' + g.id + '" ' +
        'style="margin-top:10px;min-height:44px;color:#C0392B;border-color:#F0C8C2;">스타일 삭제</button>' +
      '</div>';

    _picked = (g.media_ids || []).slice();
    _loadMedia().then(function (all) {
      var grid = document.getElementById('igsGrid');
      if (!grid || _view !== 'detail') return;
      // 이 스타일에 든 것 + 나머지 게시물 전부 — 탭으로 넣고 뺀다.
      var ids = (g.media_ids || []).slice();
      (all || []).forEach(function (m) { if (m && m.id && ids.indexOf(m.id) < 0) ids.push(m.id); });
      grid.innerHTML = _gridHTML(ids, { selectable: true, emptyText: '인스타 게시물을 불러오지 못했어요' });
    });
  }

  function _renderCreate(body) {
    body.innerHTML =
      '<div class="ss-card">' +
        '<div class="ss-card-tt">게시물 고르기</div>' +
        '<div class="ss-card-sub">비슷한 느낌의 게시물을 골라주세요. 3개 이상이면 좋아요.</div>' +
        '<div id="igsGrid"><div style="font-size:13px;color:var(--text-subtle);padding:18px 0;text-align:center;">' +
        '불러오는 중…</div></div>' +
      '</div>' +
      '<div class="ss-card">' +
        '<div class="ss-card-tt">스타일 이름</div>' +
        '<input class="ss-input" id="igsName" maxlength="40" placeholder="예: 웜 브라운" style="margin-top:8px;">' +
        '<button type="button" class="ss-cta" data-igs-savenew>스타일 만들기</button>' +
      '</div>';
    _picked = [];
    _loadMedia().then(function (all) {
      var grid = document.getElementById('igsGrid');
      if (!grid || _view !== 'create') return;
      grid.innerHTML = _gridHTML((all || []).map(function (m) { return m.id; }),
        { selectable: true, emptyText: '인스타 게시물을 불러오지 못했어요' });
    });
  }

  function _posKo(p) {
    var v = String(p || '').toLowerCase();
    var a = v.indexOf('upper') === 0 ? '위' : (v.indexOf('lower') === 0 ? '아래' : '가운데');
    var b = /right$/.test(v) ? '오른쪽' : (/left$/.test(v) ? '왼쪽' : '');
    return b ? (a + ' ' + b) : a;
  }

  /* 고른 게시물로 프로필을 만든다 — **자동 그룹과 같은 계산기**를 쓴다.
     여기서 따로 계산하면 수동 스타일과 자동 스타일의 성격이 달라지고,
     "직접 만든 건 왜 안 먹지" 가 된다. */
  function _profileFor(mediaIds) {
    try {
      if (!window.IgStyleGrouping || !window.IgPostAnalysis) return null;
      var by = Object.create(null);
      window.IgPostAnalysis.cached().forEach(function (p) { if (p && p.media_id) by[p.media_id] = p; });
      var members = mediaIds.map(function (id) { return by[id]; }).filter(Boolean);
      if (!members.length) return null;
      return window.IgStyleGrouping._profile(members);
    } catch (_e) { void _e; return null; }
  }

  // ── 동작 ──────────────────────────────────────────────────────────
  var _busy = false;   // 빠르게 여러 번 눌러도 요청은 한 번(§46)

  function _guard(fn) {
    if (_busy) return;
    _busy = true;
    Promise.resolve().then(fn).catch(function () {}).then(function () { _busy = false; });
  }

  function _onClick(e) {
    var t = e.target;
    if (t.closest('[data-igs-back]')) { _back(); return; }

    var row = t.closest('[data-igs-detail]');
    if (row) { _haptic(); _open('detail', Number(row.getAttribute('data-igs-detail'))); return; }

    if (t.closest('[data-igs-create]')) { _haptic(); _open('create'); return; }

    var pick = t.closest('[data-igs-pick]');
    if (pick) {
      var id = pick.getAttribute('data-igs-pick');
      var i = _picked.indexOf(id);
      if (i >= 0) _picked.splice(i, 1); else _picked.push(id);
      _haptic();
      // 격자만 다시 그린다 — 화면 전체를 재렌더하면 스크롤이 위로 튄다.
      var grid = document.getElementById('igsGrid');
      if (grid) {
        var ids = Array.prototype.map.call(grid.querySelectorAll('[data-igs-pick]'), function (b) {
          return b.getAttribute('data-igs-pick');
        });
        grid.innerHTML = _gridHTML(ids, { selectable: true });
      }
      return;
    }

    var ren = t.closest('[data-igs-rename]');
    if (ren) {
      var nm = (document.getElementById('igsName') || { value: '' }).value.trim();
      if (!nm) { _toast('이름을 적어주세요'); return; }
      _guard(function () {
        return _L().rename(Number(ren.getAttribute('data-igs-rename')), nm)
          .then(function () { _toast('이름을 바꿨어요'); _render(); })
          .catch(function (err) {
            _toast(err && err.code === 409 ? '같은 이름의 스타일이 이미 있어요' : '저장하지 못했어요');
          });
      });
      return;
    }

    var sp = t.closest('[data-igs-savepost]');
    if (sp) {
      _guard(function () {
        return _L().setPosts(Number(sp.getAttribute('data-igs-savepost')), _picked.slice())
          .then(function () { _toast('게시물을 저장했어요'); _render(); })
          .catch(function () { _toast('저장하지 못했어요'); });
      });
      return;
    }

    if (t.closest('[data-igs-savenew]')) {
      var name = (document.getElementById('igsName') || { value: '' }).value.trim();
      if (!name) { _toast('스타일 이름을 적어주세요'); return; }
      if (!_picked.length) { _toast('게시물을 하나 이상 골라주세요'); return; }
      var ids = _picked.slice();
      _guard(function () {
        return _L().create({
          name: name, origin: 'manual', media_ids: ids,
          profile: _profileFor(ids), cover_media_id: ids[0]
        }).then(function (g) { _toast('스타일을 만들었어요'); _open('detail', g.id); })
          .catch(function (err) {
            _toast(err && err.code === 409 ? '같은 이름의 스타일이 이미 있어요' : '만들지 못했어요');
          });
      });
      return;
    }

    var del = t.closest('[data-igs-delete]');
    if (del) {
      var did = Number(del.getAttribute('data-igs-delete'));
      _confirm('이 스타일을 지울까요?\n인스타 게시물과 이미 만든 사진은 그대로예요.').then(function (ok) {
        if (!ok) return;
        _guard(function () {
          return _L().remove(did)
            .then(function () { _toast('스타일을 지웠어요'); _open('list'); })
            .catch(function () { _toast('지우지 못했어요'); });
        });
      });
      return;
    }

    var ap = t.closest('[data-igs-apply]');
    if (ap) {
      var aid = Number(ap.getAttribute('data-igs-apply'));
      _guard(function () {
        return _applyToWorkspace(aid);
      });
      return;
    }
  }

  function _confirm(msg) {
    try {
      if (typeof window.nativeConfirm === 'function') return Promise.resolve(window.nativeConfirm('확인', msg));
    } catch (_e) { void _e; }
    return Promise.resolve(window.confirm(msg));
  }

  /* 스타일 → 작업실. 진행 중인 작업이 있으면 거기에 걸고, 없으면 작업실을 연다.
     🔑 전역 기본값을 바꾸지 않는다 — 이번 작업에만 건다(§22). */
  function _applyToWorkspace(groupId) {
    var L = _L();
    if (!L) { _toast('스타일 모듈을 불러오지 못했어요'); return Promise.resolve(); }
    var workId = null;
    try {
      /* 🔑 `getActiveSlot().slotId` 다. 이 이름을 지어내면 안 된다 —
         이 레포에서 남의 모듈 계약을 기억으로 쓰다가 여러 번 틀렸다(`thumb` 사건). */
      var _as = (window.WorkspaceFlow && window.WorkspaceFlow.getActiveSlot)
        ? window.WorkspaceFlow.getActiveSlot() : null;
      workId = (_as && _as.slotId) || null;
    } catch (_e) { void _e; }
    return L.apply(groupId, workId).then(function () {
      _toast(workId ? '이 작업에 스타일을 입혔어요' : '스타일을 골랐어요 — 사진을 올려보세요');
      close();
      try {
        if (window.WorkspaceFlow && window.WorkspaceFlow.open) window.WorkspaceFlow.open();
        else if (typeof window.goTab === 'function') window.goTab('workshop');
      } catch (_e) { void _e; }
    }).catch(function () { _toast('스타일을 적용하지 못했어요'); });
  }

  window.IgStyleSheet = {
    openList: function () { _open('list'); },
    openDetail: function (id) { _open('detail', id); },
    openCreate: function () { _open('create'); },
    close: close,
    // 테스트·디버그용
    _profileFor: _profileFor, _posKo: _posKo
  };
})();

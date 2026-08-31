/* [v534] 템플릿 레이어 수정 시트 — 좌 preview · 우 레이어 편집(목업 디자인).
   잇데이 로즈/크림 톤, 큰 radius, 부드러운 카드, sticky 액션바. 텍스트 슬롯만 수정(레이아웃/색은 고정).
   진입: window.WorkspaceTplEdit.open({ templateId, pairLabel, slotValues, beforeUrl, afterUrl, onApply, onCancel })
   - onApply({ slotValues, outputUrl }) 콜백으로 Pair별 결과/슬롯을 호출측(flow)이 저장한다.
   - preview 는 PhotoEditorBeautyPack 캔버스 렌더(입력 즉시 반영). 1080x1350 → 출력 dataURL 도 동일 렌더. */
(function () {
  'use strict';
  if (window.WorkspaceTplEdit) return;

  var CSS = [
    '.wtpl-ov{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;',
    'background:radial-gradient(120% 100% at 50% 0%,rgba(244,210,217,.55),rgba(247,239,240,.78));',
    '-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:wtpl-fade .2s ease;padding:18px;box-sizing:border-box}',
    '@keyframes wtpl-fade{from{opacity:0}to{opacity:1}}',
    '.wtpl-card{width:100%;max-width:1180px;max-height:94vh;display:flex;gap:0;background:#fff;border-radius:28px;overflow:hidden;',
    'box-shadow:0 24px 80px rgba(150,90,105,.18),0 2px 8px rgba(150,90,105,.08);animation:wtpl-pop .24s cubic-bezier(.32,1.1,.68,1)}',
    '@keyframes wtpl-pop{from{transform:translateY(14px) scale(.99);opacity:0}to{transform:none;opacity:1}}',
    /* LEFT */
    '.wtpl-left{flex:0 0 42%;max-width:460px;background:linear-gradient(170deg,#FCEFF1,#FBF5F2 60%,#fff);padding:26px 26px 20px;box-sizing:border-box;display:flex;flex-direction:column;overflow:auto}',
    '.wtpl-ltitle{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:800;color:#2A2024}',
    '.wtpl-pairbadge{font-size:12px;font-weight:800;color:#fff;background:#BC6675;border-radius:999px;padding:4px 12px}',
    '.wtpl-lsub{margin-top:6px;font-size:12.5px;color:#8A7A7E}',
    '.wtpl-preview{margin-top:16px;width:100%;border-radius:20px;overflow:hidden;box-shadow:0 12px 34px rgba(150,90,105,.16);background:#F7EFF0;aspect-ratio:4/5}',
    '.wtpl-preview canvas{width:100%;height:100%;display:block;object-fit:cover}',
    '.wtpl-ratiorow{margin-top:14px;display:flex;gap:8px;background:#F4E7EA;border-radius:14px;padding:5px}',
    '.wtpl-ratiotab{flex:1;height:38px;border:0;border-radius:11px;background:transparent;color:#9A858B;font-size:12.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px}',
    '.wtpl-ratiotab.on{background:#fff;color:#BC6675;box-shadow:0 2px 8px rgba(150,90,105,.12)}',
    '.wtpl-lnote{margin-top:12px;text-align:center;font-size:11.5px;color:#A9999E}',
    /* RIGHT */
    '.wtpl-right{flex:1;min-width:0;display:flex;flex-direction:column;background:#fff}',
    '.wtpl-rhead{display:flex;align-items:center;justify-content:space-between;padding:24px 26px 6px}',
    '.wtpl-rtitle{font-size:18px;font-weight:800;color:#2A2024}',
    '.wtpl-rtools{display:flex;align-items:center;gap:14px}',
    '.wtpl-reset{display:inline-flex;align-items:center;gap:5px;border:0;background:transparent;color:#BC6675;font-size:12.5px;font-weight:700;cursor:pointer}',
    '.wtpl-x{border:0;background:#F4E7EA;color:#9A858B;width:30px;height:30px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1}',
    '.wtpl-rsub{padding:0 26px 8px;font-size:12.5px;color:#8A7A7E}',
    '.wtpl-body{flex:1;overflow:auto;padding:8px 26px 16px;display:grid;grid-template-columns:1fr 1fr;gap:14px;align-content:start}',
    '.wtpl-sec{border:1px solid #F1DFE3;border-radius:18px;padding:15px 16px;background:#FFFCFD}',
    '.wtpl-sec--full{grid-column:1 / -1}',
    '.wtpl-sectitle{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:#BC6675;margin-bottom:11px}',
    '.wtpl-field{margin-bottom:11px}',
    '.wtpl-field:last-child{margin-bottom:0}',
    '.wtpl-flabel{font-size:11.5px;color:#8A7A7E;font-weight:600;margin-bottom:5px;display:block}',
    '.wtpl-inwrap{position:relative}',
    '.wtpl-in,.wtpl-ta{width:100%;box-sizing:border-box;border:1.5px solid #EEDDE2;border-radius:12px;padding:11px 52px 11px 13px;font-size:13.5px;color:#2A2024;font-family:inherit;background:#fff;outline:none;transition:border-color .15s}',
    '.wtpl-ta{padding:11px 13px;min-height:78px;line-height:1.55;resize:vertical}',
    '.wtpl-in:focus,.wtpl-ta:focus{border-color:#D58A95;box-shadow:0 0 0 3px rgba(213,138,149,.14)}',
    '.wtpl-count{position:absolute;right:12px;top:50%;transform:translateY(-50%);font-size:11px;color:#C0AEB3;pointer-events:none}',
    '.wtpl-ta+.wtpl-count{top:auto;bottom:10px;transform:none}',
    '.wtpl-infobox{grid-column:1 / -1;display:flex;gap:9px;align-items:flex-start;background:#FCF3F5;border-radius:14px;padding:12px 14px;font-size:11.5px;color:#9A858B;line-height:1.5}',
    '.wtpl-infobox b{color:#BC6675;font-weight:700}',
    /* ACTION BAR */
    '.wtpl-actions{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 26px;border-top:1px solid #F3E6EA;background:#fff}',
    '.wtpl-btn{border:0;border-radius:999px;font-size:13.5px;font-weight:800;cursor:pointer;height:46px;padding:0 22px;display:inline-flex;align-items:center;gap:7px}',
    '.wtpl-btn--ghost{background:#fff;border:1.5px solid #EEDDE2;color:#8A7A7E}',
    '.wtpl-btn--cancel{background:#F4E7EA;color:#8A7A7E}',
    '.wtpl-btn--apply{background:linear-gradient(135deg,#D58A95,#BC6675);color:#fff;box-shadow:0 8px 20px rgba(188,102,117,.32)}',
    '.wtpl-aright{display:flex;gap:10px}',
    /* MOBILE */
    '@media (max-width:860px){',
    '.wtpl-ov{padding:0;align-items:stretch}',
    '.wtpl-card{max-width:none;max-height:100vh;height:100vh;border-radius:0;flex-direction:column}',
    '.wtpl-left{flex:0 0 auto;max-width:none;flex-direction:row;align-items:center;gap:14px;padding:16px}',
    '.wtpl-left .wtpl-lhead{flex:1;min-width:0}',
    '.wtpl-preview{margin-top:0;width:108px;flex:0 0 108px}',
    '.wtpl-ratiorow,.wtpl-lnote{display:none}',
    '.wtpl-body{grid-template-columns:1fr;padding:10px 16px}',
    '.wtpl-actions{position:sticky;bottom:0}',
    '.wtpl-btn{padding:0 16px;font-size:13px}',
    '}'
  ].join('');

  var _styled = false;
  function _ensureStyle() { if (_styled) return; _styled = true; var s = document.createElement('style'); s.id = 'wtpl-style'; s.textContent = CSS; document.head.appendChild(s); }

  function _found(id) { var MD = window.PhotoEditorTemplateMarketData; return (MD && MD.lookupById && MD.lookupById(id)) || null; }
  function _defaults(id, found, shop) { var TS = window.PhotoEditorTemplateSlots; return (TS && TS.getDefaultValues) ? TS.getDefaultValues(id, found, { shopName: shop }) : {}; }
  function _esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // [#18] 게시 크기 선택(4:5/1:1) 반영 — 스토리/릴스(9:16) 템플릿만 원래 크기 유지.
  function _outSize(found) {
    var cat = found && found.cat;
    if (cat === 'story' || cat === 'reels') return { w: 1080, h: 1920 };
    var sq = false; try { sq = localStorage.getItem('itdasy:ws_format') === '11'; } catch (_e) { void _e; }
    return sq ? { w: 1080, h: 1080 } : { w: 1080, h: 1350 };
  }
  function _renderCanvas(canvas, id, found, sv, beforeImg, afterImg) {
    var sz = _outSize(found);
    canvas.width = sz.w; canvas.height = sz.h;
    var ctx = canvas.getContext('2d');
    var pal = found && found.palette;
    var data = {
      type: 'beautyPack', kicker: (found && found.prefillText) || '', palette: pal,
      head: sv.headline || (found && found.prefillText) || '', sub: sv.subtitle, shop: sv.shop_name, accent: pal && pal.accent,
      cta: sv.cta, customer: sv.customer_label, serviceName: sv.service_name, review: sv.review_text,
      beforeLabel: sv.before_label, afterLabel: sv.after_label, beforeCap: sv.before_caption, afterCap: sv.after_caption,
    };
    var has = beforeImg || afterImg;
    var state = has ? { editedImg: afterImg || beforeImg, originalImg: afterImg || beforeImg, img: afterImg || beforeImg, secondImg: beforeImg || afterImg } : null;
    var tplObj = { id: id, slotValues: sv, imageSlots: {} };
    try { window.PhotoEditorBeautyPack.draw(ctx, sz.w, sz.h, state, tplObj, data); } catch (_e) { /* draw 실패는 무해 */ }
  }

  // 편집 가능한 텍스트 필드 — 섹션별. textarea 는 후기만.
  var SECTIONS = [
    { title: '기본 정보', icon: 'ic-edit-3', items: [
      { key: 'headline', label: '제목 (헤드라인)', max: 40 },
      { key: 'subtitle', label: '부제 (서브타이틀)', max: 40 },
    ] },
    { title: '시술/매장 정보', icon: 'ic-tag', items: [
      { key: 'service_name', label: '시술명', max: 30 },
      { key: 'info_dur', label: '소요시간', max: 20 },
      { key: 'shop_name', label: '매장명', max: 20 },
    ] },
    { title: '전후 라벨', icon: 'ic-arrow-left-right', items: [
      { key: 'before_label', label: 'BEFORE 라벨', max: 12 },
      { key: 'after_label', label: 'AFTER 라벨', max: 12 },
    ] },
    { title: '후기 (고객 한마디)', icon: 'ic-message-circle', full: true, items: [
      { key: 'review_text', label: '', max: 200, ta: true },
    ] },
    { title: '고객 정보 (메타)', icon: 'ic-user', items: [
      { key: 'customer_label', label: '고객 메타', max: 30 },
    ] },
    { title: 'CTA 버튼', icon: 'ic-upload', items: [
      { key: 'cta', label: 'CTA 문구', max: 20 },
    ] },
  ];

  function _fieldHtml(it, val) {
    var v = String(val == null ? '' : val);
    var cnt = '<span class="wtpl-count" data-wtpl-count="' + it.key + '">' + v.length + '/' + it.max + '</span>';
    var lbl = it.label ? '<span class="wtpl-flabel">' + _esc(it.label) + '</span>' : '';
    if (it.ta) {
      return '<div class="wtpl-field">' + lbl + '<div class="wtpl-inwrap"><textarea class="wtpl-ta" data-wtpl-field="' + it.key + '" maxlength="' + it.max + '" rows="3">' + _esc(v) + '</textarea>' + cnt + '</div></div>';
    }
    return '<div class="wtpl-field">' + lbl + '<div class="wtpl-inwrap"><input class="wtpl-in" data-wtpl-field="' + it.key + '" maxlength="' + it.max + '" value="' + _esc(v) + '"></div>' + cnt + '</div>';
  }

  function open(cfg) {
    cfg = cfg || {};
    if (!(window.PhotoEditorBeautyPack && window.PhotoEditorTemplateMarketData)) { (window.showToast || function () {})('템플릿 렌더러를 불러오지 못했어요'); return; }
    _ensureStyle();
    var id = cfg.templateId;
    var found = _found(id);
    if (!found) { (window.showToast || function () {})('템플릿 정보를 불러오지 못했어요'); return; }
    var shop = ''; try { shop = localStorage.getItem('shop_name') || ''; } catch (_e) { shop = ''; }
    var base = _defaults(id, found, shop);
    var sv = Object.assign({}, base, cfg.slotValues || {});
    var orig = Object.assign({}, sv);
    var beforeImg = null, afterImg = null;

    var ov = document.createElement('div');
    ov.className = 'wtpl-ov';
    var secHtml = SECTIONS.map(function (sec) {
      var items = sec.items.map(function (it) { return _fieldHtml(it, sv[it.key]); }).join('');
      return '<div class="wtpl-sec' + (sec.full ? ' wtpl-sec--full' : '') + '">' +
        '<div class="wtpl-sectitle"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><use href="#' + sec.icon + '"/></svg>' + _esc(sec.title) + '</div>' +
        items + '</div>';
    }).join('');
    ov.innerHTML =
      '<div class="wtpl-card" role="dialog" aria-modal="true">' +
        '<div class="wtpl-left">' +
          '<div class="wtpl-lhead">' +
            '<div class="wtpl-ltitle">템플릿 수정하기 <span class="wtpl-pairbadge">' + _esc(cfg.pairLabel || 'Pair 1') + '</span></div>' +
            '<div class="wtpl-lsub">' + _esc(found.label || id) + ' (' + _esc(id) + ')</div>' +
          '</div>' +
          '<div class="wtpl-preview"><canvas data-wtpl-canvas></canvas></div>' +
          '<div class="wtpl-ratiorow">' +
            '<button class="wtpl-ratiotab on" type="button">모바일 4:5</button>' +
            '<button class="wtpl-ratiotab" type="button" disabled>데스크톱 1:1</button>' +
          '</div>' +
          '<div class="wtpl-lnote">실제 게시물은 모바일 4:5 비율로 제작됩니다.</div>' +
        '</div>' +
        '<div class="wtpl-right">' +
          '<div class="wtpl-rhead"><div class="wtpl-rtitle">템플릿 레이어 편집</div>' +
            '<div class="wtpl-rtools">' +
              '<button class="wtpl-reset" type="button" data-wtpl="reset"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><use href="#ic-refresh-cw"/></svg>초기화</button>' +
              '<button class="wtpl-x ss-close" type="button" data-wtpl="close"><svg class="ic" width="18" height="18" aria-hidden="true"><use href="#ic-x"/></svg></button>' +
            '</div>' +
          '</div>' +
          '<div class="wtpl-rsub">문구를 수정하면 미리보기에 바로 반영돼요.</div>' +
          '<div class="wtpl-body">' + secHtml +
            '<div class="wtpl-infobox"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" style="flex:0 0 auto;color:#BC6675"><use href="#ic-sparkles"/></svg>' +
              '<span><b>아이콘, 레이아웃, 색상은 템플릿 고정 요소예요.</b> 문구와 사진 슬롯만 수정할 수 있어요.</span></div>' +
          '</div>' +
          '<div class="wtpl-actions">' +
            '<button class="wtpl-btn wtpl-btn--ghost" type="button" data-wtpl="revert"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><use href="#ic-refresh-cw"/></svg>기본 문구로 되돌리기</button>' +
            '<div class="wtpl-aright">' +
              '<button class="wtpl-btn wtpl-btn--cancel" type="button" data-wtpl="cancel">취소</button>' +
              '<button class="wtpl-btn wtpl-btn--apply" type="button" data-wtpl="apply"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><use href="#ic-check"/></svg>수정 적용</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(ov);

    var canvas = ov.querySelector('[data-wtpl-canvas]');
    // [#18] 미리보기 박스 비율을 출력 규격에 맞춤(기본 CSS 는 4/5 고정).
    (function () { var _pv = ov.querySelector('.wtpl-preview'), _sz = _outSize(found); if (_pv) _pv.style.aspectRatio = _sz.w + ' / ' + _sz.h; })();
    function repaint() { _renderCanvas(canvas, id, found, sv, beforeImg, afterImg); }
    repaint();

    // [v535] 실제 전/후 사진(해당 Pair)만 preview 에 반영. 샘플/임의 사진은 주입하지 않는다 —
    //   사진이 없으면 렌더러가 깔끔한 플레이스홀더를 그린다('이상한 미리 적용 사진' 방지).
    function _load(url, set) { if (!url) return; var im = new Image(); im.onload = function () { set(im); repaint(); }; im.onerror = function () {}; im.src = url; }
    _load(cfg.beforeUrl, function (im) { beforeImg = im; });
    _load(cfg.afterUrl, function (im) { afterImg = im; });

    function close() { ov.style.opacity = '0'; ov.style.transition = 'opacity .14s'; setTimeout(function () { if (ov.parentNode) ov.parentNode.removeChild(ov); }, 150); }
    function _resetInputsFrom(values) {
      SECTIONS.forEach(function (sec) { sec.items.forEach(function (it) {
        var f = ov.querySelector('[data-wtpl-field="' + it.key + '"]'); if (!f) return;
        f.value = String(values[it.key] == null ? '' : values[it.key]);
        var c = ov.querySelector('[data-wtpl-count="' + it.key + '"]'); if (c) c.textContent = f.value.length + '/' + it.max;
      }); });
    }

    ov.addEventListener('input', function (e) {
      var f = e.target.closest('[data-wtpl-field]'); if (!f) return;
      var k = f.getAttribute('data-wtpl-field');
      sv[k] = f.value;
      var c = ov.querySelector('[data-wtpl-count="' + k + '"]'); if (c) c.textContent = (f.value || '').length + '/' + (f.getAttribute('maxlength') || '');
      repaint();
    });
    ov.addEventListener('click', function (e) {
      if (e.target === ov) return;   // 바깥 클릭으로 닫지 않음(실수 방지)
      var b = e.target.closest('[data-wtpl]'); if (!b) return;
      var a = b.getAttribute('data-wtpl');
      if (a === 'close' || a === 'cancel') { if (cfg.onCancel) cfg.onCancel(); return close(); }
      if (a === 'reset' || a === 'revert') {
        sv = Object.assign({}, base);   // 템플릿 기본 문구(defaultCopy)로 복구
        _resetInputsFrom(sv); repaint();
        (window.showToast || function () {})('기본 문구로 되돌렸어요');
        return;
      }
      if (a === 'apply') {
        var out = document.createElement('canvas');
        _renderCanvas(out, id, found, sv, beforeImg, afterImg);
        var url = ''; try { url = out.toDataURL('image/jpeg', 0.92); } catch (_e) { url = ''; }
        if (cfg.onApply) cfg.onApply({ slotValues: Object.assign({}, sv), outputUrl: url });
        return close();
      }
    });
    return { close: close };
  }

  window.WorkspaceTplEdit = { open: open };
})();

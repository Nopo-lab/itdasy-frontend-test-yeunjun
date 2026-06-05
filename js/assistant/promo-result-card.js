/* 잇비 Instagram Ready 홍보 결과 카드 */
(function () {
  'use strict';
  if (window.ItdasyPromoResultCard) return;

  function _escDefault(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function _photo(label, url, idx, isAfter, esc) {
    const attr = isAfter ? ` data-asst-photo-result="${idx}"` : '';
    return `<div style="min-width:0;">
      <div style="font-size:10px;font-weight:800;color:#6B7684;margin-bottom:5px;">${esc(label)}</div>
      <img${attr} src="${esc(url)}" alt="${esc(label)}" style="width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:12px;display:block;background:#F2F4F6;cursor:${isAfter ? 'zoom-in' : 'default'};" />
    </div>`;
  }

  function _imageBlock(p, idx, esc) {
    const before = p.beforeSource === 'real' ? (p.beforeDataUrl || '') : '';
    const after = p.afterDataUrl || p.dataUrl || '';
    if (before && after) {
      return `<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px;">
        ${_photo('Before', before, idx, false, esc)}
        ${_photo('After', after, idx, true, esc)}
      </div>`;
    }
    if (after) {
      return `<div style="margin-top:10px;">
        <img data-asst-photo-result="${idx}" src="${esc(after)}" alt="Instagram Ready" style="width:100%;max-height:360px;object-fit:cover;border-radius:14px;display:block;background:#F2F4F6;cursor:zoom-in;" />
        <div style="font-size:11px;color:#8B95A1;margin-top:6px;">홍보용 결과 이미지예요.</div>
      </div>`;
    }
    return `<div style="margin-top:10px;padding:18px;border-radius:14px;background:#F7F8FA;color:#6B7684;font-size:12px;font-weight:700;text-align:center;">홍보 결과를 준비했어요.</div>`;
  }

  function _captionBlock(caption, esc) {
    if (!caption) return '';
    return `<div style="margin-top:12px;padding:11px 12px;border-radius:12px;background:#F7F8FA;">
      <div style="font-size:10px;color:#8B95A1;font-weight:800;margin-bottom:5px;">캡션 초안</div>
      <div style="font-size:12.5px;color:#333D4B;line-height:1.5;white-space:pre-wrap;">${esc(caption)}</div>
    </div>`;
  }

  function _templateBlock(p, idx) {
    const ids = Array.isArray(p.templateRecos) ? p.templateRecos.slice(0, 3) : [];
    const TV = window.PhotoEditorTemplatesV2;
    if (!ids.length || !TV || typeof TV.recoCardHtml !== 'function') return '';
    const cards = ids.map(id => TV.recoCardHtml(id)).filter(Boolean).join('');
    if (!cards) return '';
    return `<div style="margin-top:12px;">
      <div style="font-size:10px;color:#8B95A1;font-weight:800;margin-bottom:7px;">추천 템플릿 3개</div>
      <div class="asst-tpl-recos" data-asst-tpl-recos="${idx}" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;">${cards}</div>
    </div>`;
  }

  function _button(action, idx, primary, esc) {
    const style = primary
      ? 'border:0;background:#191F28;color:#fff;font-weight:800;'
      : 'border:1px solid #E5E8EB;background:#fff;color:#4E5968;font-weight:700;';
    return `<button type="button" data-asst-hub-act="${idx}:${esc(action.id)}" data-hub-phase="${esc(action.phase || 'safe')}" style="${style}border-radius:999px;padding:9px 12px;font-size:12px;cursor:pointer;white-space:nowrap;">${esc(action.label)}</button>`;
  }

  function _actionsBlock(actions, idx, esc) {
    const list = Array.isArray(actions) ? actions.filter(a => a && a.id && a.label) : [];
    if (!list.length) return '';
    const primary = list.slice(0, 2).map(a => _button(a, idx, true, esc)).join('');
    const secondary = list.slice(2).map(a => _button(a, idx, false, esc)).join('');
    return `<div style="margin-top:12px;display:flex;flex-direction:column;gap:7px;">
      <div style="display:flex;flex-wrap:wrap;gap:7px;">${primary}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;">${secondary}</div>
    </div>`;
  }

  function render(message, idx, deps) {
    const p = message && message.promo_result;
    if (!p) return '';
    const esc = (deps && deps.esc) || _escDefault;
    const title = (p.beforeSource === 'real' && p.beforeDataUrl) ? 'Before / After' : '홍보 결과';
    const note = p.customerName
      ? `${p.customerName}님 기록 연결은 확인 후 진행돼요.`
      : '고객을 선택하면 시술 기록으로 저장할 수 있어요.';
    return `<div class="asst-promo-result" style="margin-bottom:10px;width:100%;max-width:360px;border:1px solid #E5E8EB;border-radius:16px;background:#fff;padding:12px;box-shadow:0 8px 22px rgba(25,31,40,.08);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span style="font-size:10px;font-weight:900;color:#4E5968;">${esc(title)}</span>
        <span style="font-size:10px;font-weight:900;color:#fff;background:#191F28;border-radius:999px;padding:5px 8px;">Instagram Ready</span>
      </div>
      ${_imageBlock(p, idx, esc)}
      <div style="margin-top:11px;font-size:12.5px;line-height:1.5;color:#191F28;font-weight:700;">${esc(p.effect || '홍보용으로 자연스럽게 정리했어요.')}</div>
      <div style="font-size:11px;color:#8B95A1;margin-top:3px;">${esc(p.industryLabel || '뷰티')} 사진 기준으로 정리했어요.</div>
      ${_captionBlock(p.caption, esc)}
      ${_templateBlock(p, idx)}
      ${_actionsBlock(message.hub_actions, idx, esc)}
      <div style="font-size:10.5px;color:#8B95A1;line-height:1.45;margin-top:9px;">${esc(note)} 실제 게시나 발송은 하지 않았어요.</div>
    </div>`;
  }

  window.ItdasyPromoResultCard = { render };
})();

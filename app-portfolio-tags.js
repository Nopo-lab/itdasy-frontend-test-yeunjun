// Itdasy Studio - 포트폴리오 태그 칩 편집

(function() {
  const EDITOR_HTML = `
    <div style="width:min(440px,100%);max-height:92vh;overflow:auto;border-radius:16px;background:#151516;color:white;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,0.45);">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;">
        <div style="font-size:15px;font-weight:900;">포트폴리오 태그</div>
        <button class="ss-close" data-close type="button" style="width:34px;height:34px;border-radius:50%;border:none;background:transparent;color:white;font-size:20px;line-height:1;cursor:pointer;"><svg class="ic" width="18" height="18" aria-hidden="true"><use href="#ic-x"/></svg></button>
      </div>
      <img data-img alt="" style="width:100%;max-height:48vh;object-fit:contain;border-radius:12px;background:#222;margin-bottom:14px;">
      <label style="display:block;font-size:11px;color:rgba(255,255,255,0.62);font-weight:800;margin-bottom:6px;">큰 태그</label>
      <input data-main-tag style="width:100%;box-sizing:border-box;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.08);color:white;padding:11px;font-size:14px;margin-bottom:12px;">
      <label style="display:block;font-size:11px;color:rgba(255,255,255,0.62);font-weight:800;margin-bottom:8px;">작은 태그</label>
      <div data-chip-wrap style="display:flex;flex-wrap:wrap;gap:8px;min-height:34px;margin-bottom:10px;"></div>
      <div style="display:flex;gap:8px;margin-bottom:12px;">
        <input data-new-tag placeholder="직접 추가" style="flex:1;min-width:0;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.08);color:white;padding:11px;font-size:13px;">
        <button data-add-tag type="button" style="width:72px;border:none;border-radius:10px;background:rgba(213,138,149,0.9);color:white;font-size:13px;font-weight:900;cursor:pointer;">추가</button>
      </div>
      <label style="display:block;font-size:11px;color:rgba(255,255,255,0.62);font-weight:800;margin-bottom:6px;">메모</label>
      <textarea data-memo rows="3" style="width:100%;box-sizing:border-box;border-radius:10px;border:1px solid rgba(255,255,255,0.14);background:rgba(255,255,255,0.08);color:white;padding:11px;font-size:13px;resize:vertical;margin-bottom:14px;"></textarea>
      <div style="display:flex;gap:8px;">
        <button data-delete type="button" style="flex:1;border:1px solid rgba(255,97,97,0.38);border-radius:10px;background:rgba(255,97,97,0.12);color:#ff8d8d;font-size:13px;font-weight:900;padding:12px;cursor:pointer;">삭제</button>
        <button data-save type="button" style="flex:1;border:none;border-radius:10px;background:linear-gradient(135deg,var(--accent),var(--accent2));color:white;font-size:13px;font-weight:900;padding:12px;cursor:pointer;">저장</button>
      </div>
    </div>
  `;

  function _splitTags(raw) {
    const seen = new Set();
    const tags = [];
    String(raw || '').split(',').forEach(value => {
      const tag = value.replace(/#/g, '').trim().replace(/\s+/g, ' ').slice(0, 18);
      if (!tag || seen.has(tag)) return;
      seen.add(tag);
      tags.push(tag);
    });
    return tags;
  }

  function _imageSrc(item) {
    const src = item._src || item.image_url || '';
    if (!src) return '';
    return src.startsWith('http') ? src : apiUrl(src);
  }

  function _close(overlay) {
    overlay.remove();
  }

  function _chip(tag, onRemove) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:7px 10px;border-radius:999px;border:1px solid rgba(213,138,149,0.28);background:rgba(213,138,149,0.1);color:var(--accent2);font-size:12px;font-weight:800;cursor:pointer;';
    chip.textContent = '#' + tag + ' x';
    chip.addEventListener('click', onRemove);
    return chip;
  }

  function _renderChips(wrap, state) {
    wrap.innerHTML = '';
    if (!state.tags.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px;color:rgba(255,255,255,0.55);';
      empty.textContent = '아직 작은 태그가 없어요.';
      wrap.appendChild(empty);
      return;
    }
    state.tags.forEach(tag => {
      wrap.appendChild(_chip(tag, () => {
        state.tags = state.tags.filter(t => t !== tag);
        _renderChips(wrap, state);
      }));
    });
  }

  function _addTag(input, wrap, state) {
    const tag = input.value.replace(/#/g, '').trim().replace(/\s+/g, ' ').slice(0, 18);
    if (!tag) return;
    if (!state.tags.includes(tag)) state.tags.push(tag);
    input.value = '';
    _renderChips(wrap, state);
  }

  async function _save(item, overlay, state) {
    const mainInput = overlay.querySelector('[data-main-tag]');
    const memoInput = overlay.querySelector('[data-memo]');
    const body = {
      main_tag: mainInput.value.trim(),
      tags: state.tags.join(','),
      memo: memoInput.value.trim(),
    };
    const res = await apiFetch('/portfolio/' + item.id, {
      method: 'PATCH',
      headers: { ...authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('태그 저장 실패');
    showToast('태그 저장 완료');
    _close(overlay);
    if (typeof loadPortfolio === 'function') loadPortfolio();
  }

  function _delete(item, overlay) {
    // [2026-06-10] confirm → _askConfirm + 실패 시 침묵(unhandled throw)이던 것 토스트로
    window._askConfirm('이 사진을 삭제할까요?', async () => {
      try {
        const res = await apiFetch('/portfolio/' + item.id, {
          method: 'DELETE',
          headers: authHeader(),
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        showToast('삭제 완료');
        _close(overlay);
        if (typeof loadPortfolio === 'function') loadPortfolio();
      } catch (e) {
        showToast('삭제 실패: ' + (window._humanError ? window._humanError(e) : e.message));
      }
    });
  }

  function _wire(overlay, item, state) {
    const chipWrap = overlay.querySelector('[data-chip-wrap]');
    const addInput = overlay.querySelector('[data-new-tag]');
    overlay.querySelector('[data-close]').addEventListener('click', () => _close(overlay));
    overlay.querySelector('[data-add-tag]').addEventListener('click', () => _addTag(addInput, chipWrap, state));
    overlay.querySelector('[data-save]').addEventListener('click', async () => {
      try { await _save(item, overlay, state); }
      catch (err) { showToast(err.message || '저장 실패'); }
    });
    overlay.querySelector('[data-delete]').addEventListener('click', async () => {
      try { await _delete(item, overlay); }
      catch (err) { showToast(err.message || '삭제 실패'); }
    });
    addInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      _addTag(addInput, chipWrap, state);
    });
    overlay.addEventListener('click', event => {
      if (event.target === overlay) _close(overlay);
    });
    _renderChips(chipWrap, state);
  }

  function openPortfolioTagEditor(item) {
    const state = { tags: _splitTags(item.tags) };
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.86);display:flex;align-items:center;justify-content:center;padding:18px;';
    overlay.innerHTML = EDITOR_HTML;
    overlay.querySelector('[data-img]').src = _imageSrc(item);
    overlay.querySelector('[data-main-tag]').value = item.main_tag || '';
    overlay.querySelector('[data-memo]').value = item.memo || '';
    document.body.appendChild(overlay);
    _wire(overlay, item, state);
  }

  document.addEventListener('itdasy:portfolio-edit', event => {
    if (!event.detail || !event.detail.item) return;
    event.detail.handled = true;
    openPortfolioTagEditor(event.detail.item);
  });
})();

/* ─────────────────────────────────────────────────────────────
   잇데이 — 해시태그 매니저 (SN-4)
   2026-05-19 v207

   기능:
     • 업종별 추천 해시태그 세트 (최대 10세트 저장)
     • 원터치 삽입 — 캡션 영역에 자동 추가

   진입: window.SNSHashtag.open()
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  if (window.SNSHashtag) return;

  const LS_KEY = 'itdasy_hashtag_sets';
  const MAX_SETS = 10;

  // 업종별 기본 추천 해시태그
  const DEFAULTS = {
    '헤어샵': ['#헤어스타일', '#헤어컬러', '#염색', '#커트', '#붙임머리', '#헤어디자이너', '#미용실', '#오늘의헤어', '#헤어변신', '#레이어드컷'],
    '네일아트': ['#네일아트', '#네일디자인', '#젤네일', '#손톱', '#네일스타그램', '#네일추천', '#패디', '#매니큐어', '#네일샵', '#오늘의네일'],
    '속눈썹': ['#속눈썹연장', '#래쉬', '#속눈썹펌', '#아이래쉬', '#속눈썹디자인', '#눈성형', '#뷰티', '#래쉬리프트', '#눈매교정', '#속눈썹추천'],
    '피부': ['#피부관리', '#피부과', '#스킨케어', '#여드름', '#모공', '#피부미인', '#피부개선', '#페이셜', '#피부관리실', '#클렌징'],
    '왁싱': ['#왁싱', '#브라질리언왁싱', '#제모', '#바디왁싱', '#슈가링', '#왁싱샵', '#여름준비', '#왁싱추천', '#매끈피부', '#왁싱전후'],
    '메이크업': ['#메이크업', '#웨딩메이크업', '#뷰티', '#화장', '#메이크업아티스트', '#오늘의메이크업', '#코스메틱', '#뷰티스타그램', '#아이메이크업', '#메이크업추천'],
    '반영구': ['#반영구', '#눈썹문신', '#반영구메이크업', '#아이라인', '#입술문신', '#헤어라인', '#엠보', '#콤보눈썹', '#반영구추천', '#자연눈썹'],
  };

  let _sets = []; // { id, name, tags:string[], usageCount }

  function _esc(s) { return window._esc(s); } /* [2026-06-11] 중복 제거 — app-core 정본 위임 */
  function _toast(msg) { if (window.showToast) window.showToast(msg); }

  function _load() {
    try { _sets = JSON.parse(localStorage.getItem(LS_KEY) || '[]'); }
    catch (err) {
      console.warn('[SNSHashtag] 저장된 세트 불러오기 실패', err);
      _sets = [];
    }
    // 첫 진입 시 업종 기반 기본 세트 생성
    if (_sets.length === 0) {
      const shopType = localStorage.getItem('itdasy_shop_type') || '헤어샵';
      const tags = DEFAULTS[shopType] || DEFAULTS['헤어샵'];
      _sets.push({ id: 'default', name: shopType + ' 기본', tags, usageCount: 0 });
      _sets.push({ id: 'common', name: '공통 인기', tags: ['#뷰티', '#일상', '#오늘', '#추천', '#맞팔', '#데일리', '#인스타그램', '#좋아요', '#팔로우', '#소통'], usageCount: 0 });
      _save();
    }
  }

  function _save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(_sets)); }
    catch (err) { console.warn('[SNSHashtag] 세트 저장 실패', err); }
  }

  function _open() {
    _load();
    let pop = document.getElementById('snsHashtagPop');
    if (!pop) {
      pop = document.createElement('div');
      pop.id = 'snsHashtagPop';
      pop.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;';
      document.body.appendChild(pop);
    }
    _renderPopup(pop);
    pop.style.display = 'flex';
    pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
  }

  function _renderPopup(pop) {
    pop.innerHTML = `
      <div style="background:var(--surface,#fff);width:100%;max-width:480px;border-radius:var(--r-xl,28px) var(--r-xl,28px) 0 0;padding:12px 16px calc(20px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));max-height:85vh;overflow-y:auto;">
        <div style="display:flex;justify-content:center;margin-bottom:14px;"><div style="width:40px;height:4px;border-radius:2px;background:#D1D6DB;"></div></div>
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
          <div style="width:36px;height:36px;border-radius:12px;background:var(--brand-bg);color:var(--brand-strong);display:flex;align-items:center;justify-content:center;flex:0 0 36px;">
            <svg width="18" height="18" aria-hidden="true"><use href="#ic-tag"/></svg>
          </div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:17px;font-weight:800;">해시태그 매니저</div>
            <div style="font-size:12.5px;color:var(--text-subtle);margin-top:2px;">${_sets.length}/${MAX_SETS} 세트 · 원터치로 캡션에 삽입</div>
          </div>
        </div>

        ${_sets.map((s, i) => `
          <div style="background:var(--surface,#fff);border:1.5px solid var(--border,#e5e5e5);border-radius:var(--r-md,14px);padding:14px;margin-bottom:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <div style="font-size:14px;font-weight:700;">${_esc(s.name)}</div>
              <div style="display:flex;gap:6px;">
                <button type="button" data-hashtag-act="copy" data-hashtag-idx="${i}" style="padding:4px 10px;border:1.5px solid var(--border,#ddd);border-radius:8px;background:transparent;font-size:11px;font-weight:600;cursor:pointer;">복사</button>
                <button type="button" data-hashtag-act="insert" data-hashtag-idx="${i}" style="padding:4px 10px;border:none;border-radius:8px;background:var(--brand,#D58A95);color:#fff;font-size:11px;font-weight:700;cursor:pointer;">삽입</button>
              </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px;">
              ${s.tags.map(tag => `<span style="padding:4px 10px;border-radius:var(--r-pill,999px);background:var(--brand-bg);color:var(--brand-strong);font-size:11px;font-weight:600;">${_esc(tag)}</span>`).join('')}
            </div>
            <div style="margin-top:8px;display:flex;gap:6px;">
              <button type="button" data-hashtag-act="edit" data-hashtag-idx="${i}" style="font-size:11px;color:var(--text-subtle);background:none;border:none;cursor:pointer;text-decoration:underline;">편집</button>
              ${s.id !== 'default' ? `<button type="button" data-hashtag-act="delete" data-hashtag-idx="${i}" style="font-size:11px;color:var(--danger,#ef4444);background:none;border:none;cursor:pointer;text-decoration:underline;">삭제</button>` : ''}
            </div>
          </div>
        `).join('')}

        ${_sets.length < MAX_SETS ? `<button type="button" data-hashtag-act="add" style="width:100%;height:44px;border:1.5px dashed var(--border,#ddd);border-radius:var(--r-md,14px);background:transparent;font-size:13px;font-weight:700;color:var(--brand-strong);cursor:pointer;">＋ 새 해시태그 세트 추가</button>` : ''}
      </div>`;
    _bindPopupEvents(pop);
  }

  function _bindPopupEvents(pop) {
    pop.querySelectorAll('[data-hashtag-act]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.hashtagIdx);
        const act = btn.dataset.hashtagAct;
        if (act === 'copy') void _copy(idx);
        if (act === 'insert') _insert(idx);
        if (act === 'edit') _editSet(idx);
        if (act === 'delete') _deleteSet(idx);
        if (act === 'add') _addSet();
      });
    });
  }

  async function _copy(idx) {
    const s = _sets[idx];
    if (!s) return;
    const text = s.tags.join(' ');
    try {
      await navigator.clipboard.writeText(text);
      _toast('해시태그 복사 완료!');
    } catch (err) {
      console.warn('[SNSHashtag] 복사 실패', err);
      _toast('복사 실패 — 수동으로 복사해 주세요');
    }
    s.usageCount = (s.usageCount || 0) + 1;
    _save();
  }

  function _insert(idx) {
    const s = _sets[idx];
    if (!s) return;
    const text = '\n\n' + s.tags.join(' ');
    // 캡션 영역에 삽입 시도
    const targets = ['#_igPreviewCaption', '#captionArea', 'textarea[data-caption]'];
    let inserted = false;
    for (const sel of targets) {
      const el = document.querySelector(sel);
      if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
        el.value = (el.value || '') + text;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        inserted = true;
        break;
      }
    }
    if (inserted) _toast('해시태그 삽입 완료!');
    else { void _copy(idx); _toast('캡션 영역을 찾지 못해 클립보드에 복사했어요'); }
    s.usageCount = (s.usageCount || 0) + 1;
    _save();
  }

  function _addSet() {
    if (_sets.length >= MAX_SETS) return _toast(`세트는 최대 ${MAX_SETS}개까지 저장 가능해요`);
    const name = prompt('세트 이름을 입력하세요', '내 해시태그');
    if (!name) return;
    const tagsStr = prompt('해시태그를 입력하세요 (공백으로 구분)\n예: #네일 #뷰티 #네일아트', '');
    if (!tagsStr) return;
    const tags = tagsStr.split(/\s+/).filter(t => t.startsWith('#'));
    if (tags.length === 0) return _toast('#으로 시작하는 해시태그를 입력해 주세요');
    _sets.push({ id: 'set-' + Date.now(), name: name.slice(0, 20), tags: tags.slice(0, 30), usageCount: 0 });
    _save();
    _renderPopup(document.getElementById('snsHashtagPop'));
    _toast('세트 추가 완료!');
  }

  function _editSet(idx) {
    const s = _sets[idx];
    if (!s) return;
    const tagsStr = prompt('해시태그 편집 (공백 구분)', s.tags.join(' '));
    if (tagsStr === null) return;
    s.tags = tagsStr.split(/\s+/).filter(t => t.startsWith('#')).slice(0, 30);
    _save();
    _renderPopup(document.getElementById('snsHashtagPop'));
    _toast('세트 수정 완료!');
  }

  function _deleteSet(idx) {
    // [2026-06-10] confirm → _askConfirm (인라인 다이얼로그)
    window._askConfirm('이 해시태그 세트를 삭제할까요?', () => {
      _sets.splice(idx, 1);
      _save();
      _renderPopup(document.getElementById('snsHashtagPop'));
      _toast('세트 삭제 완료');
    });
  }

  window.SNSHashtag = {
    open: _open,
    getSets: () => _sets,
    _copy, _insert, _addSet, _editSet, _deleteSet,
  };
})();

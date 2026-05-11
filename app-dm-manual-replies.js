/* DM 상황별 매뉴얼 멘트 — 사장님 자유 등록 (2026-04-30)
   사용:
     window.openDMManualReplies()
*/
(function () {
  'use strict';

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  async function _fetch(method, path, body) {
    const headers = window.authHeader ? window.authHeader() : {};
    if (body) headers['Content-Type'] = 'application/json';
    const res = await fetch(window.API + path, {
      method, headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.detail || ('HTTP ' + res.status));
    return d;
  }

  const _INTENT_LABEL = {
    pricing: '견적', booking: '예약', hours: '⏰ 시간',
    location: '📍 위치', review: '후기', greeting: '👋 인사',
    complaint: '위험', unknown: '❓ 모름',
  };
  const _CUST_LABEL = { all: '모두', new: '신규', regular: '단골', vip: 'VIP' };
  const _MODE_LABEL = { exact: '그대로 발송', as_base: 'AI 가 톤 다듬어 발송' };

  // [2026-04-30] 카테고리 6종 멘트 + 톤 자동 작성 통합 (이전: app-dm-autoreply.js 메인 시트)
  const _CAT_META = [
    ['greeting',  '인사',     'dmrTplIntro',    'ic-smile',         '안녕하세요! 어떤 시술 궁금하세요?'],
    ['pricing',   '가격 문의', 'dmrTplPricing',  'ic-dollar-sign',   '시술별로 달라요. 어떤 시술 궁금하세요?'],
    ['booking',   '예약 문의', 'dmrTplBooking',  'ic-calendar',      '원하시는 날짜·시간 알려주시면 확인 후 안내드릴게요'],
    ['hours',     '영업시간',  'dmrTplHours',    'ic-clock',         '평일 09:00~21:00, 일요일 휴무'],
    ['location',  '위치',      'dmrTplLocation', 'ic-flag',          '강남역 5번 출구 도보 3분'],
    ['review',    '후기',      'dmrTplReview',   'ic-sparkles',      '인스타 피드 참고해 주세요!'],
  ];
  const _CAT_TO_TPL_KEY = {
    greeting: 'template_intro',  pricing: 'template_pricing',  booking: 'template_booking',
    hours: 'template_hours',     location: 'template_location', review: 'template_review',
  };

  async function _fetchSettings() {
    if (window.DmSettingsCache?.get) {
      return window.DmSettingsCache.get().catch(() => null);
    }
    try {
      const res = await fetch(window.API + '/instagram/dm-reply/settings', { headers: window.authHeader() });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  function _ensureSheet() {
    let sheet = document.getElementById('dmManualSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'dmManualSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9989;background:rgba(0,0,0,0.5);display:none;align-items:flex-end;justify-content:center;';
    sheet.innerHTML = `
      <div id="dmrCard" style="width:100%;max-width:580px;background:#fff;border-radius:20px 20px 0 0;max-height:94vh;display:flex;flex-direction:column;padding:16px 18px max(16px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
          <span style="display:inline-flex;align-items:center;color:#7C3AED;"><i class="ph-duotone ph-pen" aria-hidden="true"></i></span>
          <strong style="font-size:17px;">멘트 관리</strong>
          <button id="dmrClose" aria-label="닫기" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#888;display:inline-flex;align-items:center;"><i class="ph-duotone ph-x" aria-hidden="true"></i></button>
        </div>

        <!-- 탭 -->
        <div role="tablist" style="display:flex;gap:0;background:#F4F4F8;border-radius:12px;padding:3px;margin-bottom:12px;">
          <button id="dmrTabBasic" role="tab" aria-selected="true" style="flex:1;padding:8px;border:none;background:#fff;color:#5B21B6;font-weight:700;font-size:12px;border-radius:9px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,0.05);">기본 멘트 (6종)</button>
          <button id="dmrTabAdvanced" role="tab" aria-selected="false" style="flex:1;padding:8px;border:none;background:transparent;color:#888;font-weight:700;font-size:12px;border-radius:9px;cursor:pointer;">상황별 매뉴얼</button>
        </div>

        <!-- 영역 (기본 멘트 6종) -->
        <div id="dmrBasicSection" style="flex:1;overflow-y:auto;display:block;">
          <button id="dmrAutoGen" type="button" style="width:100%;display:flex;align-items:center;gap:10px;padding:13px;border:1px solid #DDD6FE;border-radius:12px;background:linear-gradient(135deg,#FAF5FF,#E0E7FF);margin-bottom:14px;cursor:pointer;text-align:left;">
            <i class="ph-duotone ph-magic-wand" aria-hidden="true"></i>
            <div style="flex:1;">
              <div style="font-size:13px;font-weight:800;color:#5B21B6;">내 톤 분석 + 6종 멘트 자동 작성</div>
              <div style="font-size:11px;color:#5B21B680;margin-top:2px;line-height:1.4;">DM + 인스타 게시물에서 사장 말투 학습 → 자동 작성</div>
            </div>
            <span id="dmrAutoGenSpinner" style="display:none;width:14px;height:14px;border:2px solid #DDD6FE;border-top-color:#5B21B6;border-radius:50%;animation:plspin 0.8s linear infinite;"></span>
          </button>
          <div id="dmrBasicList"></div>
          <div style="margin-top:14px;display:flex;gap:8px;">
            <button id="dmrBasicSave" style="flex:1;padding:13px;border:none;background:linear-gradient(135deg,#7C3AED,#A78BFA);color:#fff;font-weight:800;font-size:13px;border-radius:12px;cursor:pointer;">기본 멘트 저장</button>
          </div>
        </div>

        <!-- 영역 (상황별 매뉴얼) -->
        <div id="dmrAdvancedSection" style="flex:1;overflow-y:auto;display:none;">
          <div style="font-size:11px;color:#888;margin-bottom:12px;line-height:1.5;">
            예시: <span style="color:#5B21B6;font-weight:600;">"점심시간 12~13시 → 1시 이후 답"</span> / <span style="color:#5B21B6;font-weight:600;">"단골 + 인사 → 언니 또 와주셨네"</span>
          </div>
          <button id="dmrAdd" style="margin-bottom:14px;padding:11px;border:none;border-radius:12px;background:linear-gradient(135deg,#7C3AED,#A78BFA);color:#fff;font-weight:800;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%;">
            <i class="ph-duotone ph-plus" aria-hidden="true"></i>새 매뉴얼 추가
          </button>
          <div id="dmrList"><div style="text-align:center;color:var(--text-subtle);padding:30px 0;font-size:13px;">불러오는 중…</div></div>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) close(); });
    sheet.querySelector('#dmrClose').addEventListener('click', close);
    sheet.querySelector('#dmrAdd').addEventListener('click', () => _openEdit(null));

    // 탭 전환
    const tabB = sheet.querySelector('#dmrTabBasic');
    const tabA = sheet.querySelector('#dmrTabAdvanced');
    const secB = sheet.querySelector('#dmrBasicSection');
    const secA = sheet.querySelector('#dmrAdvancedSection');
    function _switchTab(which) {
      const isB = which === 'basic';
      tabB.style.background = isB ? '#fff' : 'transparent';
      tabB.style.color = isB ? '#5B21B6' : '#888';
      tabB.style.boxShadow = isB ? '0 1px 2px rgba(0,0,0,0.05)' : 'none';
      tabB.setAttribute('aria-selected', isB ? 'true' : 'false');
      tabA.style.background = !isB ? '#fff' : 'transparent';
      tabA.style.color = !isB ? '#5B21B6' : '#888';
      tabA.style.boxShadow = !isB ? '0 1px 2px rgba(0,0,0,0.05)' : 'none';
      tabA.setAttribute('aria-selected', !isB ? 'true' : 'false');
      secB.style.display = isB ? 'block' : 'none';
      secA.style.display = !isB ? 'block' : 'none';
    }
    tabB.addEventListener('click', () => _switchTab('basic'));
    tabA.addEventListener('click', () => _switchTab('advanced'));

    // 톤 자동 작성
    const autoGenBtn = sheet.querySelector('#dmrAutoGen');
    autoGenBtn.addEventListener('click', async () => {
      const spinner = sheet.querySelector('#dmrAutoGenSpinner');
      if (spinner) spinner.style.display = 'inline-block';
      autoGenBtn.disabled = true;
      autoGenBtn.style.opacity = '0.7';
      try {
        await fetch(window.API + '/instagram/dm-reply/analyze-tone', {
          method: 'POST', headers: window.authHeader(),
        }).catch(() => null);
        const r = await fetch(window.API + '/instagram/dm-reply/auto-generate-templates', {
          method: 'POST', headers: window.authHeader(),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.detail || ('HTTP ' + r.status));
        const tmpls = d.templates || {};
        for (const [cat, , taId] of _CAT_META) {
          const t = tmpls[cat];
          const el = sheet.querySelector('#' + taId);
          if (el && t) {
            el.value = t;
            el.style.background = '#F0FDF4';
            setTimeout(() => { el.style.background = ''; }, 1500);
          }
        }
        if (window.showToast) window.showToast('사장님 톤으로 6개 멘트 작성됐어요. 검토 후 저장!');
      } catch (e) {
        if (window.showToast) window.showToast('자동 작성 실패: ' + (e.message || ''));
      } finally {
        if (spinner) spinner.style.display = 'none';
        autoGenBtn.disabled = false;
        autoGenBtn.style.opacity = '1';
      }
    });

    // 기본 멘트 저장
    sheet.querySelector('#dmrBasicSave').addEventListener('click', async () => {
      try {
        const cur = (await _fetchSettings()) || {};
        const payload = { ...cur };
        for (const [cat, , taId] of _CAT_META) {
          const el = sheet.querySelector('#' + taId);
          payload[_CAT_TO_TPL_KEY[cat]] = el ? el.value : '';
        }
        if (window.DmSettingsCache?.save) await window.DmSettingsCache.save(payload);
        else {
          const res = await fetch(window.API + '/instagram/dm-reply/settings', {
            method: 'POST',
            headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (!res.ok) throw new Error('HTTP ' + res.status);
        }
        if (window.showToast) window.showToast('기본 멘트 저장됐어요');
      } catch (e) {
        if (window.showToast) window.showToast('저장 실패: ' + (e.message || ''));
      }
    });

    return sheet;
  }

  // 카테고리 6종 textarea 채우기
  async function _renderBasicMents() {
    const settings = (await _fetchSettings()) || {};
    const list = document.getElementById('dmrBasicList');
    if (!list) return;
    list.innerHTML = _CAT_META.map(([cat, label, taId, icon, ph]) => {
      const tplKey = _CAT_TO_TPL_KEY[cat];
      const val = settings[tplKey] || '';
      return `
        <div style="margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">
            <svg width="13" height="13" aria-hidden="true" style="color:#7C3AED;"><use href="#${icon}"/></svg>
            <span style="font-size:12px;font-weight:700;color:#555;">${label}</span>
            <button type="button" data-regen="${cat}" class="dmr-regen-btn" style="margin-left:auto;font-size:10px;font-weight:700;color:#5B21B6;background:#FAF5FF;border:1px solid #DDD6FE;padding:3px 8px;border-radius:99px;cursor:pointer;display:inline-flex;align-items:center;gap:3px;">
              <i class="ph-duotone ph-magic-wand" aria-hidden="true"></i>다시 작성
            </button>
          </div>
          <textarea id="${taId}" placeholder="${ph}" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:10px;font-size:13px;box-sizing:border-box;min-height:54px;line-height:1.5;">${_esc(val)}</textarea>
        </div>
      `;
    }).join('');

    // 인라인 다시 작성 버튼
    list.querySelectorAll('.dmr-regen-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const cat = btn.dataset.regen;
        const meta = _CAT_META.find(m => m[0] === cat);
        if (!meta) return;
        const taId = meta[2];
        const ta = document.getElementById(taId);
        if (!ta) return;
        btn.disabled = true; btn.style.opacity = '0.6';
        try {
          const r = await fetch(window.API + '/instagram/dm-reply/auto-generate-templates?intent=' + cat, {
            method: 'POST', headers: window.authHeader(),
          });
          const d = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(d.detail || ('HTTP ' + r.status));
          const t = (d.templates || {})[cat];
          if (t) {
            ta.value = t;
            ta.style.background = '#F0FDF4';
            setTimeout(() => { ta.style.background = ''; }, 1500);
            if (window.showToast) window.showToast('다시 작성 완료');
          } else {
            if (window.showToast) window.showToast('생성 결과 없음 — 톤 분석 데이터 부족');
          }
        } catch (e) {
          if (window.showToast) window.showToast('실패: ' + (e.message || ''));
        } finally {
          btn.disabled = false; btn.style.opacity = '1';
        }
      });
    });
  }

  async function open() {
    const sheet = _ensureSheet();
    const card = sheet.querySelector('#dmrCard');
    if (window.SheetAnim) window.SheetAnim.open(sheet, card);
    else sheet.style.display = 'flex';
    // 두 영역 동시 채움 (사용자가 탭 전환해도 미리 준비됨)
    await Promise.all([_renderBasicMents(), _refresh()]);
  }
  function close() {
    const sheet = document.getElementById('dmManualSheet');
    if (!sheet) return;
    const card = sheet.querySelector('#dmrCard');
    if (window.SheetAnim) window.SheetAnim.close(sheet, card);
    else sheet.style.display = 'none';
  }

  async function _refresh() {
    const list = document.getElementById('dmrList');
    if (!list) return;
    try {
      const items = await _fetch('GET', '/dm-autoreply/manual-replies');
      if (!items.length) {
        list.innerHTML = `<div style="text-align:center;color:var(--text-subtle);padding:30px 0;font-size:13px;line-height:1.6;">아직 등록된 멘트가 없어요.<br>"새 멘트 추가" 로 첫 매뉴얼 만들어보세요.</div>`;
        return;
      }
      list.innerHTML = items.map(it => {
        const triggers = [];
        if (it.trigger_keywords && it.trigger_keywords.length) triggers.push(`키워드 [${it.trigger_keywords.slice(0,3).join(', ')}${it.trigger_keywords.length > 3 ? '+' : ''}]`);
        if (it.trigger_intent) triggers.push(_INTENT_LABEL[it.trigger_intent] || it.trigger_intent);
        if (it.trigger_time_start && it.trigger_time_end) triggers.push(`${it.trigger_time_start}~${it.trigger_time_end}`);
        if (it.trigger_customer_type && it.trigger_customer_type !== 'all') triggers.push(_CUST_LABEL[it.trigger_customer_type] || it.trigger_customer_type);
        const triggerSummary = triggers.length ? triggers.join(' · ') : '<span style="color:#dc3545;">트리거 없음 (매칭 안 됨)</span>';
        const modeColor = it.mode === 'exact' ? '#10B981' : '#7C3AED';
        return `
          <div data-id="${it.id}" style="padding:12px;background:#FAFAFA;border:1px solid #f0f0f0;border-radius:14px;margin-bottom:8px;${!it.enabled ? 'opacity:0.5;' : ''}">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
              <strong style="font-size:13px;flex:1;">${_esc(it.title || '(이름 없음)')}</strong>
              <span style="font-size:10px;font-weight:700;color:${modeColor};background:${modeColor}15;padding:2px 7px;border-radius:99px;">${_MODE_LABEL[it.mode] || it.mode}</span>
              ${it.use_count > 0 ? `<span style="font-size:10px;color:#888;">${it.use_count}회 사용</span>` : ''}
            </div>
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">${triggerSummary}</div>
            <div style="font-size:12px;color:#333;background:#fff;padding:8px 10px;border-radius:8px;line-height:1.5;margin-bottom:8px;">${_esc(it.reply_text)}</div>
            <div style="display:flex;gap:6px;">
              <button class="dmr-toggle" data-id="${it.id}" data-enabled="${it.enabled}" style="flex:1;padding:7px;border:1px solid #ddd;background:#fff;color:#555;font-weight:600;font-size:11px;border-radius:8px;cursor:pointer;">${it.enabled ? '⏸ 비활성' : '▶ 활성'}</button>
              <button class="dmr-edit" data-id="${it.id}" style="flex:1;padding:7px;border:1px solid #DDD6FE;background:#FAF5FF;color:#5B21B6;font-weight:700;font-size:11px;border-radius:8px;cursor:pointer;">✏️ 편집</button>
              <button class="dmr-del" data-id="${it.id}" style="padding:7px 12px;border:1px solid #FCA5A5;background:#fff;color:#B91C1C;font-weight:700;font-size:11px;border-radius:8px;cursor:pointer;">삭제</button>
            </div>
          </div>
        `;
      }).join('');
      list.querySelectorAll('.dmr-edit').forEach(b => {
        b.addEventListener('click', () => {
          const it = items.find(x => String(x.id) === b.dataset.id);
          if (it) _openEdit(it);
        });
      });
      list.querySelectorAll('.dmr-del').forEach(b => {
        b.addEventListener('click', async () => {
          if (!confirm('이 멘트를 삭제할까요?')) return;
          try {
            await _fetch('DELETE', `/dm-autoreply/manual-replies/${b.dataset.id}`);
            if (window.showToast) window.showToast('삭제됨');
            await _refresh();
          } catch (e) {
            if (window.showToast) window.showToast('실패: ' + e.message);
          }
        });
      });
      list.querySelectorAll('.dmr-toggle').forEach(b => {
        b.addEventListener('click', async () => {
          const id = b.dataset.id;
          const it = items.find(x => String(x.id) === id);
          if (!it) return;
          try {
            const next = !it.enabled;
            await _fetch('PATCH', `/dm-autoreply/manual-replies/${id}`, {
              ...it,
              enabled: next,
            });
            await _refresh();
          } catch (e) {
            if (window.showToast) window.showToast('실패: ' + e.message);
          }
        });
      });
    } catch (e) {
      list.innerHTML = `<div style="text-align:center;color:#dc3545;padding:20px;font-size:12px;">불러오기 실패: ${_esc(e.message)}</div>`;
    }
  }

  function _openEdit(item) {
    const it = item || {
      id: null,
      title: '',
      trigger_keywords: [],
      trigger_intent: null,
      trigger_time_start: null,
      trigger_time_end: null,
      trigger_customer_type: 'all',
      mode: 'exact',
      reply_text: '',
      priority: 0,
      enabled: true,
    };
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);display:flex;align-items:flex-end;justify-content:center;';
    overlay.innerHTML = `
      <div id="dmrEditCard" style="width:100%;max-width:560px;background:#fff;border-radius:20px 20px 0 0;max-height:94vh;overflow-y:auto;padding:18px 18px max(18px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;">
          <strong style="font-size:16px;">${it.id ? '멘트 편집' : '새 멘트 추가'}</strong>
          <button id="dmrEditClose" aria-label="닫기" style="margin-left:auto;background:none;border:none;cursor:pointer;color:#888;display:inline-flex;align-items:center;"><i class="ph-duotone ph-x" aria-hidden="true"></i></button>
        </div>

        <label style="font-size:11px;font-weight:700;color:#555;display:block;margin-bottom:4px;">제목 (사장만 보는 라벨)</label>
        <input id="dmrTitle" type="text" maxlength="80" value="${_esc(it.title)}" placeholder="예: 점심시간 안내" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:13px;margin-bottom:12px;box-sizing:border-box;">

        <label style="font-size:11px;font-weight:700;color:#555;display:block;margin-bottom:4px;">발송 멘트 (손님이 받을 답장)</label>
        <textarea id="dmrReplyText" maxlength="2000" rows="3" style="width:100%;padding:10px;border:1px solid #DDD6FE;background:#FAF5FF;border-radius:8px;font-size:13px;line-height:1.5;margin-bottom:12px;resize:vertical;box-sizing:border-box;font-family:inherit;">${_esc(it.reply_text)}</textarea>

        <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:10px;margin-bottom:14px;">
          <div style="font-size:11px;font-weight:800;color:#92400E;margin-bottom:8px;">📌 트리거 (이 조건 만족 시 매칭)</div>

          <label style="font-size:11px;font-weight:700;color:#555;display:block;margin-bottom:3px;">키워드 (쉼표 구분, 메시지에 포함되면 매칭)</label>
          <input id="dmrKeywords" type="text" value="${_esc((it.trigger_keywords || []).join(', '))}" placeholder="예: 점심, 식사, 자리비움" style="width:100%;padding:9px;border:1px solid #FBBF24;background:#fff;border-radius:8px;font-size:12px;margin-bottom:8px;box-sizing:border-box;">

          <label style="font-size:11px;font-weight:700;color:#555;display:block;margin-bottom:3px;">분류 (intent)</label>
          <select id="dmrIntent" style="width:100%;padding:9px;border:1px solid #FBBF24;background:#fff;border-radius:8px;font-size:12px;margin-bottom:8px;">
            <option value="">(모든 분류)</option>
            <option value="pricing"  ${it.trigger_intent === 'pricing'  ? 'selected' : ''}>견적</option>
            <option value="booking"  ${it.trigger_intent === 'booking'  ? 'selected' : ''}>예약</option>
            <option value="hours"    ${it.trigger_intent === 'hours'    ? 'selected' : ''}>⏰ 영업시간</option>
            <option value="location" ${it.trigger_intent === 'location' ? 'selected' : ''}>📍 위치</option>
            <option value="review"   ${it.trigger_intent === 'review'   ? 'selected' : ''}>후기</option>
            <option value="greeting" ${it.trigger_intent === 'greeting' ? 'selected' : ''}>👋 인사</option>
            <option value="complaint"${it.trigger_intent === 'complaint'? 'selected' : ''}>위험/불만</option>
          </select>

          <label style="font-size:11px;font-weight:700;color:#555;display:block;margin-bottom:3px;">시간대 (KST)</label>
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;">
            <input id="dmrTimeStart" type="time" value="${_esc(it.trigger_time_start || '')}" style="flex:1;padding:9px;border:1px solid #FBBF24;background:#fff;border-radius:8px;font-size:12px;">
            <span style="color:#888;">~</span>
            <input id="dmrTimeEnd" type="time" value="${_esc(it.trigger_time_end || '')}" style="flex:1;padding:9px;border:1px solid #FBBF24;background:#fff;border-radius:8px;font-size:12px;">
          </div>

          <label style="font-size:11px;font-weight:700;color:#555;display:block;margin-bottom:3px;">손님 타입</label>
          <select id="dmrCustType" style="width:100%;padding:9px;border:1px solid #FBBF24;background:#fff;border-radius:8px;font-size:12px;">
            <option value="all"     ${it.trigger_customer_type === 'all'     ? 'selected' : ''}>모든 손님</option>
            <option value="new"     ${it.trigger_customer_type === 'new'     ? 'selected' : ''}>신규 손님</option>
            <option value="regular" ${it.trigger_customer_type === 'regular' ? 'selected' : ''}>단골 손님</option>
            <option value="vip"     ${it.trigger_customer_type === 'vip'     ? 'selected' : ''}>VIP (회원권)</option>
          </select>
        </div>

        <label style="font-size:11px;font-weight:700;color:#555;display:block;margin-bottom:4px;">매칭 시 동작</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
          <label class="dmr-mode-card" data-mode="exact" style="padding:11px;border:2px solid ${it.mode === 'exact' ? '#10B981' : '#e5e5e5'};background:${it.mode === 'exact' ? '#10B98115' : '#fff'};border-radius:10px;cursor:pointer;text-align:center;">
            <div style="font-size:13px;font-weight:800;color:${it.mode === 'exact' ? '#10B981' : '#555'};">그대로 발송</div>
            <div style="font-size:10px;color:#888;margin-top:3px;">AI 안 거침 (빠름·비용 0)</div>
          </label>
          <label class="dmr-mode-card" data-mode="as_base" style="padding:11px;border:2px solid ${it.mode === 'as_base' ? '#7C3AED' : '#e5e5e5'};background:${it.mode === 'as_base' ? '#7C3AED15' : '#fff'};border-radius:10px;cursor:pointer;text-align:center;">
            <div style="font-size:13px;font-weight:800;color:${it.mode === 'as_base' ? '#7C3AED' : '#555'};">AI 톤 다듬기</div>
            <div style="font-size:10px;color:#888;margin-top:3px;">페르소나 톤으로 자연스럽게</div>
          </label>
        </div>
        <input id="dmrMode" type="hidden" value="${_esc(it.mode || 'exact')}">

        <label style="font-size:11px;color:#888;display:flex;align-items:center;gap:6px;margin-bottom:14px;">
          <input id="dmrPriority" type="number" min="0" max="999" value="${it.priority || 0}" style="width:80px;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:12px;">
          <span>우선순위 (여러 매뉴얼 동시 매칭 시 큰 숫자 우선)</span>
        </label>

        <div style="display:flex;gap:8px;">
          <button id="dmrCancel" style="flex:1;padding:13px;border:1px solid #ddd;background:#fff;color:#555;font-weight:700;font-size:13px;border-radius:12px;cursor:pointer;">취소</button>
          <button id="dmrSave" style="flex:2;padding:13px;border:none;background:linear-gradient(135deg,#7C3AED,#A78BFA);color:#fff;font-weight:800;font-size:13px;border-radius:12px;cursor:pointer;">${it.id ? '수정 저장' : '추가'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const closeEdit = () => overlay.remove();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeEdit(); });
    overlay.querySelector('#dmrEditClose').addEventListener('click', closeEdit);
    overlay.querySelector('#dmrCancel').addEventListener('click', closeEdit);
    overlay.querySelectorAll('.dmr-mode-card').forEach(c => {
      c.addEventListener('click', () => {
        const m = c.dataset.mode;
        overlay.querySelector('#dmrMode').value = m;
        overlay.querySelectorAll('.dmr-mode-card').forEach(x => {
          const on = x.dataset.mode === m;
          const color = x.dataset.mode === 'exact' ? '#10B981' : '#7C3AED';
          x.style.border = on ? `2px solid ${color}` : '2px solid #e5e5e5';
          x.style.background = on ? color + '15' : '#fff';
          const t = x.querySelector('div:first-child');
          if (t) t.style.color = on ? color : '#555';
        });
      });
    });
    overlay.querySelector('#dmrSave').addEventListener('click', async () => {
      const payload = {
        title: overlay.querySelector('#dmrTitle').value.trim(),
        reply_text: overlay.querySelector('#dmrReplyText').value.trim(),
        trigger_keywords: overlay.querySelector('#dmrKeywords').value.split(',').map(s => s.trim()).filter(Boolean),
        trigger_intent: overlay.querySelector('#dmrIntent').value || null,
        trigger_time_start: overlay.querySelector('#dmrTimeStart').value || null,
        trigger_time_end: overlay.querySelector('#dmrTimeEnd').value || null,
        trigger_customer_type: overlay.querySelector('#dmrCustType').value || 'all',
        mode: overlay.querySelector('#dmrMode').value || 'exact',
        priority: parseInt(overlay.querySelector('#dmrPriority').value, 10) || 0,
        enabled: it.enabled !== false,
      };
      if (!payload.reply_text) {
        if (window.showToast) window.showToast('발송 멘트를 적어주세요');
        return;
      }
      try {
        if (it.id) {
          await _fetch('PATCH', `/dm-autoreply/manual-replies/${it.id}`, payload);
          if (window.showToast) window.showToast('수정됐어요');
        } else {
          await _fetch('POST', '/dm-autoreply/manual-replies', payload);
          if (window.showToast) window.showToast('추가됐어요');
        }
        closeEdit();
        await _refresh();
      } catch (e) {
        if (window.showToast) window.showToast('저장 실패: ' + e.message);
      }
    });
  }

  window.openDMManualReplies = open;
  window.closeDMManualReplies = close;
})();

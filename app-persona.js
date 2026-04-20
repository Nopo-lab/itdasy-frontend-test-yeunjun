// Itdasy Studio - C3-B 페르소나 서명블록 설정
// 파일: app-persona.js  (신규)
// 의존: app-core.js 의 API, authHeader(), handle401()

// ── 세션 내 포스트 카운트 (ingest 응답 total_after 로만 업데이트)
// 주의: count API 없음 → 탭 재진입해도 값 유지되나 새 페이지 로드 시 0으로 초기화
let _pPostCount = 0;
let _detectCandidates = [];
let _pIdentityLoaded = null;
let _pNicknames = [];

// ── 기본정보 상수
const SUPPORTED_CATEGORIES = {"붙임머리":"extension","네일":"nail"};
const AGE_LABELS = {"10s":"10대","20s_early":"20대 초","20s_late":"20대 후","30s":"30대","40s_plus":"40대+"};
const GENDER_LABELS = {"female":"여성","male":"남성","both":"전체"};
const TONE_OPTIONS = [
  {key:"casual_friendly", label:"친근반말",  example:"오늘도 예쁘게 해줬어요~"},
  {key:"polite_formal",   label:"공손존댓",  example:"오늘도 예쁘게 해드렸습니다."},
  {key:"lively_emoji",    label:"활기이모지", example:"완성 🤍✨ 너무 예뻐요!!"},
  {key:"calm_premium",    label:"차분고급",  example:"차분한 무드로 마무리했습니다."},
  {key:"mixed",           label:"혼합",      example:"상황별로 다르게"},
];

// ── 공용 fetch 헬퍼 (app-caption.js 에서도 참조) ────────────────
async function _personaFetch(method, path, body) {
  const headers = { ...authHeader() };
  let bodyStr;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(body);
  }
  const res = await fetch(API + path, { method, headers, body: bodyStr });
  if (res.status === 401) { handle401(); throw new Error('401'); }
  return res;
}

// ── XSS 방지 ─────────────────────────────────────────────────────
function _esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── 진입점 (nav 버튼 onclick) ─────────────────────────────────────
async function initPersonaTab() {
  _renderShell();
  await Promise.all([
    _loadIdentity(),
    _loadConsent(),
    _loadInstaStatus(),
    _loadSignatureList(),
  ]);
  _syncDetectBtn();
}

// ─────────────────────────────────────────────────────────────────
// 셸 렌더
// ─────────────────────────────────────────────────────────────────
function _renderShell() {
  const root = document.getElementById('personaRoot');
  if (!root) return;
  root.innerHTML = `
<div style="padding:16px 16px 100px;">
  <div class="sec-title">페르소나 설정</div>
  <div class="sec-sub">포스트를 수집하고 서명블록을 관리합니다</div>

  ${_renderIdentityBlock()}

  ${_renderConsentBlock()}

  <!-- ── 블록 A: 포스트 수집 ──────────────────────── -->
  <div style="margin-bottom:16px; background:#fff; border-radius:16px; border:1px solid var(--border); padding:16px;">
    <div style="font-size:13px; font-weight:800; color:var(--text); margin-bottom:10px;">A. 포스트 수집</div>

    <div id="pA-status" style="font-size:12px; color:var(--text3); margin-bottom:10px;">확인 중…</div>
    <div id="pA-actions"></div>
    <div id="pA-ingestMsg" style="margin-top:8px; font-size:12px; color:var(--text3);"></div>

    <div style="margin-top:12px;">
      <button onclick="_toggleManual()" style="font-size:12px; color:var(--accent2); background:transparent; border:none; cursor:pointer; padding:0; text-decoration:underline;">수동 붙여넣기 ▾</button>
      <div id="pA-manual" style="display:none; margin-top:10px;">
        <textarea id="pA-manualText" rows="5"
          placeholder="게시글을 붙여넣으세요.&#10;빈 줄 2개(Enter 3번)로 게시글을 구분합니다."
          style="width:100%; box-sizing:border-box; font-size:12px; border:1px solid var(--border); border-radius:10px; padding:10px; resize:vertical;"></textarea>
        <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
          <button id="pA-manualBtn" onclick="_ingestManual()" style="padding:9px 20px; border-radius:10px; border:none; background:var(--accent); color:#fff; font-size:12px; font-weight:700; cursor:pointer;">추가</button>
          <span id="pA-manualMsg" style="font-size:12px; color:var(--text3);"></span>
        </div>
      </div>
    </div>
  </div>

  <!-- ── 블록 B: 자동 감지 ────────────────────────── -->
  <div style="margin-bottom:16px; background:#fff; border-radius:16px; border:1px solid var(--border); padding:16px;">
    <div style="font-size:13px; font-weight:800; color:var(--text); margin-bottom:8px;">B. 서명블록 자동 감지</div>
    <div id="pB-countMsg" style="font-size:12px; color:var(--text3); margin-bottom:10px;">—</div>
    <div style="display:flex; align-items:center; gap:10px;">
      <button id="pB-detectBtn" onclick="_runDetect()" disabled
        style="padding:10px 20px; border-radius:10px; border:none; background:var(--accent); color:#fff; font-size:12px; font-weight:700; cursor:pointer; opacity:0.4;">자동 감지</button>
      <span id="pB-detectHint" style="font-size:11px; color:var(--text3);">10건 이상 필요</span>
    </div>
    <div id="pB-detectResult" style="margin-top:12px;"></div>
  </div>

  <!-- ── 블록 C: 목록 ──────────────────────────────── -->
  <div style="background:#fff; border-radius:16px; border:1px solid var(--border); padding:16px;">
    <div style="font-size:13px; font-weight:800; color:var(--text); margin-bottom:12px;">C. 내 서명블록 목록</div>
    <div id="pC-list"><div style="font-size:12px; color:var(--text3);">불러오는 중…</div></div>

    <!-- 직접 추가 폼 -->
    <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--border);">
      <div style="font-size:12px; font-weight:700; color:var(--text3); margin-bottom:10px;">+ 직접 추가</div>
      <input id="pC-label" type="text" placeholder="이름 (예: 기본 서명블록)"
        style="width:100%; box-sizing:border-box; font-size:12px; border:1px solid var(--border); border-radius:8px; padding:8px 10px; margin-bottom:8px;">
      <textarea id="pC-content" rows="4" placeholder="서명블록 내용"
        style="width:100%; box-sizing:border-box; font-size:12px; border:1px solid var(--border); border-radius:8px; padding:8px 10px; resize:vertical; margin-bottom:8px;"></textarea>
      <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
        <select id="pC-position" style="font-size:12px; border:1px solid var(--border); border-radius:8px; padding:7px 10px; background:#fff;">
          <option value="bottom">하단</option>
          <option value="top">상단</option>
        </select>
        <label style="font-size:12px; color:var(--text2); display:flex; align-items:center; gap:4px; cursor:pointer;">
          <input type="checkbox" id="pC-isDefault"> 기본값으로 설정
        </label>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button id="pC-addBtn" onclick="_addManualSig()" style="padding:10px 20px; border-radius:10px; border:none; background:var(--accent); color:#fff; font-size:12px; font-weight:700; cursor:pointer;">추가</button>
        <span id="pC-addMsg" style="font-size:12px; color:var(--text3);"></span>
      </div>
    </div>
  </div>

  <!-- 말투 재분석 링크 -->
  <div style="text-align:center;padding:8px 0 4px;">
    <button onclick="_refreshFingerprint()" style="background:none;border:none;font-size:12px;color:var(--text3);cursor:pointer;text-decoration:underline;padding:4px 8px;">말투 다시 분석</button>
  </div>
</div>
  `;
}

// ─────────────────────────────────────────────────────────────────
// 말투 재분석 (POST /persona/fingerprint/refresh)
// ─────────────────────────────────────────────────────────────────
async function _refreshFingerprint() {
  showToast('분석 중...');
  try {
    const res = await _personaFetch('POST', '/persona/fingerprint/refresh');
    if (!res.ok) { showToast('분석 실패: ' + res.status); return; }
    const d = await res.json();
    const n = d.source_post_count ?? d.post_count ?? '';
    showToast('분석 완료' + (n ? ` (${n}개 포스트 반영)` : ''));
  } catch(e) {
    if (e.message !== '401') showToast('분석 오류: ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────
// 블록 A — 인스타 연동 상태 + 수집
// ─────────────────────────────────────────────────────────────────
async function _loadInstaStatus() {
  const statusEl  = document.getElementById('pA-status');
  const actionsEl = document.getElementById('pA-actions');
  if (!statusEl || !actionsEl) return;
  try {
    const res  = await _personaFetch('GET', '/instagram/status');
    if (!res.ok) throw new Error('status ' + res.status);
    const data = await res.json();

    if (data.connected) {
      statusEl.textContent = `✅ 인스타 연동됨: @${_esc(data.handle || '')}`;
      actionsEl.innerHTML  = `
        <button id="pA-instaBtn" onclick="_ingestInstagram()"
          style="padding:10px 20px; border-radius:10px; border:none; background:var(--accent); color:#fff; font-size:12px; font-weight:700; cursor:pointer;">
          인스타 포스트 가져오기
        </button>`;
    } else {
      statusEl.textContent = '⚠️ 인스타 미연동';
      const token  = getToken() || '';
      const origin = encodeURIComponent(
        window.location.origin +
        window.location.pathname.replace(/\/index\.html$/, '')
      );
      actionsEl.innerHTML  = `
        <button onclick="window.location.href='${_esc(API)}/instagram/go?token=${encodeURIComponent(token)}&origin=${origin}'"
          style="padding:10px 20px; border-radius:10px; border:none; background:var(--accent); color:#fff; font-size:12px; font-weight:700; cursor:pointer;">
          인스타 연동하기
        </button>`;
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = '인스타 상태 확인 실패: ' + e.message;
  }
}

async function _ingestInstagram() {
  const btn      = document.getElementById('pA-instaBtn');
  const msgEl    = document.getElementById('pA-ingestMsg');
  if (!btn || !msgEl) return;
  btn.disabled = true; btn.textContent = '처리중…';
  msgEl.textContent = '';
  try {
    const res  = await _personaFetch('POST', '/persona/posts/ingest/instagram');
    const data = await res.json();
    if (!res.ok) { msgEl.textContent = '오류: ' + (data.detail || res.status); return; }
    msgEl.textContent = `추가 ${data.inserted}건 · 중복 ${data.skipped_duplicates}건 · 빈값 ${data.skipped_empty}건 · 누적 ${data.total_after}건`;
    _pPostCount = data.total_after;
    _syncDetectBtn();
  } catch (e) {
    msgEl.textContent = '오류: ' + e.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '인스타 포스트 가져오기'; }
  }
}

function _toggleManual() {
  const el = document.getElementById('pA-manual');
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

async function _ingestManual() {
  const textEl = document.getElementById('pA-manualText');
  const btn    = document.getElementById('pA-manualBtn');
  const msgEl  = document.getElementById('pA-manualMsg');
  if (!textEl || !btn || !msgEl) return;

  const raw = textEl.value.trim();
  if (!raw) { msgEl.textContent = '내용을 입력하세요.'; return; }

  // 빈 줄 2개(=연속 3개 이상 개행)로 포스트 구분
  const posts = raw.split(/\n{3,}/).map(s => s.trim()).filter(Boolean);
  if (!posts.length) { msgEl.textContent = '포스트를 인식하지 못했습니다.'; return; }

  btn.disabled = true; btn.textContent = '처리중…';
  msgEl.textContent = `${posts.length}건 전송 중…`;
  try {
    window._assertSpec('POST /persona/posts/ingest/manual', { posts });
    const res  = await _personaFetch('POST', '/persona/posts/ingest/manual', { posts });
    const data = await res.json();
    if (!res.ok) { msgEl.textContent = '오류: ' + (data.detail || res.status); return; }
    msgEl.textContent = `추가 ${data.inserted}건 · 중복 ${data.skipped_duplicates}건 · 빈값 ${data.skipped_empty}건 · 누적 ${data.total_after}건`;
    textEl.value = '';
    _pPostCount = data.total_after;
    _syncDetectBtn();
  } catch (e) {
    msgEl.textContent = '오류: ' + e.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '추가'; }
  }
}

// ─────────────────────────────────────────────────────────────────
// 블록 B — 자동 감지
// ─────────────────────────────────────────────────────────────────
function _syncDetectBtn() {
  const btn     = document.getElementById('pB-detectBtn');
  const hintEl  = document.getElementById('pB-detectHint');
  const countEl = document.getElementById('pB-countMsg');
  const enough  = _pPostCount >= 10;

  if (countEl) {
    if (_pPostCount === 0) {
      countEl.textContent = '포스트를 먼저 수집하세요.';
    } else {
      countEl.textContent = `수집된 포스트: ${_pPostCount}건`;
    }
  }
  if (btn) {
    btn.disabled = !enough;
    btn.style.opacity = enough ? '1' : '0.4';
    btn.style.cursor  = enough ? 'pointer' : 'not-allowed';
  }
  if (hintEl) {
    hintEl.textContent = enough ? '' : '10건 이상 필요';
  }
}

async function _runDetect() {
  const btn      = document.getElementById('pB-detectBtn');
  const resultEl = document.getElementById('pB-detectResult');
  if (!btn || !resultEl) return;
  btn.disabled = true; btn.textContent = '처리중…';
  resultEl.innerHTML = '';
  try {
    const res  = await _personaFetch('POST', '/persona/signature/detect');
    const data = await res.json();
    if (!res.ok) {
      resultEl.innerHTML = `<div style="font-size:12px; color:var(--accent);">오류: ${_esc(data.detail || res.status)}</div>`;
      return;
    }
    _detectCandidates = data.candidates || [];
    if (!_detectCandidates.length) {
      resultEl.innerHTML = '<div style="font-size:12px; color:var(--text3);">감지된 후보가 없습니다.</div>';
      return;
    }
    resultEl.innerHTML = _detectCandidates.map((c, i) => `
      <div id="dcard-${i}" style="border:1px solid var(--border); border-radius:10px; padding:12px; margin-bottom:10px;">
        <div style="font-size:11px; color:var(--text3); margin-bottom:6px;">
          빈도 ${(c.frequency * 100).toFixed(1)}% · ${c.suggested_position === 'top' ? '상단' : '하단'}
        </div>
        <pre style="font-size:11px; color:var(--text); white-space:pre-wrap; word-break:break-all; margin:0 0 10px; background:var(--bg3); padding:8px; border-radius:8px; font-family:inherit;">${_esc(c.content)}</pre>
        <button id="dadd-${i}" onclick="_addDetected(${i})"
          style="padding:7px 14px; border-radius:8px; border:none; background:var(--accent); color:#fff; font-size:11px; font-weight:700; cursor:pointer;">
          추가
        </button>
      </div>
    `).join('');
  } catch (e) {
    resultEl.innerHTML = `<div style="font-size:12px; color:var(--accent);">오류: ${_esc(e.message)}</div>`;
  } finally {
    if (btn) {
      btn.textContent = '자동 감지';
      _syncDetectBtn(); // 10건 미만이면 다시 비활성
    }
  }
}

async function _addDetected(idx) {
  const c   = _detectCandidates[idx];
  const btn = document.getElementById('dadd-' + idx);
  if (!c || !btn) return;
  btn.disabled = true; btn.textContent = '처리중…';
  try {
    const sigBody = {
      label:              `자동감지 #${idx + 1}`,
      content:            c.content,
      position:           c.suggested_position,
      is_default:         true,
      source:             'detected',
      detected_frequency: c.frequency,
    };
    window._assertSpec('POST /persona/signature-blocks', sigBody);
    const res  = await _personaFetch('POST', '/persona/signature', sigBody);
    const data = await res.json();
    if (!res.ok) {
      btn.textContent = '오류';
      btn.disabled    = false;
      return;
    }
    btn.textContent = '추가됨 ✓';
    // 목록 갱신
    await _loadSignatureList();
  } catch (e) {
    btn.textContent = '오류';
    btn.disabled    = false;
  }
}

// ─────────────────────────────────────────────────────────────────
// 블록 C — 서명블록 목록
// ─────────────────────────────────────────────────────────────────
async function _loadSignatureList() {
  const listEl = document.getElementById('pC-list');
  if (!listEl) return;
  try {
    const res  = await _personaFetch('GET', '/persona/signature');
    const raw  = await res.json();
    if (!res.ok) {
      listEl.innerHTML = `<div style="font-size:12px; color:var(--text3);">불러오기 실패: ${_esc(raw.detail || res.status)}</div>`;
      return;
    }
    const sigs = Array.isArray(raw) ? raw : (raw.signatures || raw.items || []);
    if (!sigs.length) {
      listEl.innerHTML = '<div style="font-size:12px; color:var(--text3);">등록된 서명블록이 없습니다.</div>';
      return;
    }
    listEl.innerHTML = sigs.map(s => `
      <div id="sig-${s.id}" style="border:1px solid var(--border); border-radius:10px; padding:12px; margin-bottom:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;">
          <input value="${_esc(s.label || '')}" readonly
            style="flex:1; font-size:12px; font-weight:700; border:none; background:transparent; color:var(--text); padding:0; min-width:0;">
          <button onclick="_deleteSig(${s.id})"
            style="flex-shrink:0; padding:5px 10px; border-radius:8px; border:1px solid var(--border); background:#fff; font-size:11px; color:var(--text3); cursor:pointer;">
            삭제
          </button>
        </div>
        <textarea readonly rows="3"
          style="width:100%; box-sizing:border-box; font-size:11px; border:1px solid var(--border); border-radius:8px; padding:8px; resize:none; background:var(--bg3); color:var(--text); font-family:inherit;"
        >${_esc(s.content || '')}</textarea>
        <div style="display:flex; gap:12px; align-items:center; margin-top:8px; flex-wrap:wrap;">
          <select disabled style="font-size:11px; border:1px solid var(--border); border-radius:6px; padding:4px 8px; background:var(--bg3);">
            <option value="bottom" ${s.position !== 'top' ? 'selected' : ''}>하단</option>
            <option value="top"    ${s.position === 'top' ? 'selected' : ''}>상단</option>
          </select>
          <label style="font-size:11px; color:var(--text2); display:flex; align-items:center; gap:4px;">
            <input type="checkbox" disabled ${s.is_default ? 'checked' : ''}> 기본값
          </label>
          ${s.source ? `<span style="font-size:10px; color:var(--text3); background:var(--bg3); padding:2px 6px; border-radius:4px;">${_esc(s.source)}</span>` : ''}
        </div>
      </div>
    `).join('');
  } catch (e) {
    if (listEl) listEl.innerHTML = `<div style="font-size:12px; color:var(--text3);">오류: ${_esc(e.message)}</div>`;
  }
}

async function _deleteSig(id) {
  const itemEl = document.getElementById('sig-' + id);
  if (itemEl) { itemEl.style.opacity = '0.5'; }
  try {
    const res = await _personaFetch('DELETE', '/persona/signature/' + id);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      if (itemEl) { itemEl.style.opacity = '1'; itemEl.style.outline = '1.5px solid var(--accent)'; }
      return;
    }
    if (itemEl) itemEl.remove();
    // 목록이 비었으면 메시지 표시
    const listEl = document.getElementById('pC-list');
    if (listEl && !listEl.querySelector('[id^="sig-"]')) {
      listEl.innerHTML = '<div style="font-size:12px; color:var(--text3);">등록된 서명블록이 없습니다.</div>';
    }
  } catch (e) {
    if (itemEl) { itemEl.style.opacity = '1'; itemEl.style.outline = '1.5px solid var(--accent)'; }
  }
}

// ─────────────────────────────────────────────────────────────────
// 기본정보 블록 (C4-UI: 필수 5개)
// ─────────────────────────────────────────────────────────────────
function _renderIdentityBlock() {
  const ageKeys    = Object.keys(AGE_LABELS);
  const genderKeys = Object.keys(GENDER_LABELS);

  const audienceBoxes = ageKeys.map(age =>
    genderKeys.map(gender =>
      `<label style="font-size:11px;color:var(--text2);display:flex;align-items:center;gap:3px;cursor:pointer;white-space:nowrap;">
        <input type="checkbox" id="pid-aud-${age}_${gender}" value="${age}_${gender}" onchange="_updateIdStatus();">
        ${_esc(AGE_LABELS[age])}/${_esc(GENDER_LABELS[gender])}
      </label>`
    ).join('')
  ).join('');

  const svcBlocks = Object.entries(SUPPORTED_CATEGORIES).map(([label, key]) =>
    `<div style="margin-bottom:8px;">
      <label style="font-size:12px;display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" id="pid-svc-${key}" value="${key}" onchange="_updateIdStatus();">
        <span style="font-weight:600;">${_esc(label)}</span>
      </label>
      <div style="margin-top:5px;padding-left:20px;">
        <input id="pid-sub-${key}" type="text"
          placeholder="세부시술 (쉼표 구분, 최대 10개)"
          style="width:100%;box-sizing:border-box;font-size:11px;border:1px solid var(--border);border-radius:6px;padding:6px 8px;color:var(--text2);">
      </div>
    </div>`
  ).join('');

  const toneRadios = TONE_OPTIONS.map(t =>
    `<label style="display:flex;align-items:flex-start;gap:6px;margin-bottom:6px;cursor:pointer;">
      <input type="radio" name="pid-tone" id="pid-tone-${t.key}" value="${t.key}" style="margin-top:2px;" onchange="_updateIdStatus();">
      <span style="font-size:12px;">
        <span style="font-weight:700;color:var(--text);">${_esc(t.label)}</span>
        <span style="color:var(--text3);margin-left:6px;">${_esc(t.example)}</span>
      </span>
    </label>`
  ).join('');

  return `
  <div style="margin-bottom:16px;background:#fff;border-radius:16px;border:1px solid var(--border);padding:16px;">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <div style="font-size:13px;font-weight:800;color:var(--text);">기본정보</div>
      <span id="_pIdStatus" style="font-size:11px;color:var(--text3);">필수 0/5 완료</span>
    </div>

    <!-- Q1 shop_name_intro -->
    <div style="margin-bottom:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:6px;">Q1. 샵 소개 한 줄 <span style="color:var(--accent);">*</span></div>
      <div style="position:relative;">
        <input id="pid-shop_name_intro" type="text" maxlength="50"
          placeholder="예: 강남역 근처 붙임머리 전문 네일 샵"
          oninput="document.getElementById('pid-sni-count').textContent=this.value.length+'/50';_updateIdStatus();"
          style="width:100%;box-sizing:border-box;font-size:12px;border:1px solid var(--border);border-radius:8px;padding:8px 48px 8px 10px;">
        <span id="pid-sni-count" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:10px;color:var(--text3);">0/50</span>
      </div>
    </div>

    <!-- Q2 services -->
    <div style="margin-bottom:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:6px;">Q2. 제공 시술 <span style="color:var(--accent);">*</span></div>
      ${svcBlocks}
    </div>

    <!-- Q3 target_audience -->
    <div style="margin-bottom:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:6px;">Q3. 주요 고객층 <span style="color:var(--accent);">*</span></div>
      <div style="display:flex;flex-wrap:wrap;gap:6px 12px;">${audienceBoxes}</div>
    </div>

    <!-- Q4 tone_preference -->
    <div style="margin-bottom:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:6px;">Q4. 톤 선호도 <span style="color:var(--accent);">*</span></div>
      ${toneRadios}
    </div>

    <!-- Q8 location -->
    <div style="margin-bottom:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:6px;">Q8. 위치 <span style="color:var(--accent);">*</span></div>
      <input id="pid-location" type="text" maxlength="100"
        placeholder="예: 서울 강남구 역삼동"
        oninput="_updateIdStatus();"
        style="width:100%;box-sizing:border-box;font-size:12px;border:1px solid var(--border);border-radius:8px;padding:8px 10px;">
    </div>

    <!-- ── 선택 필드 구분선 ───────────── -->
    <div style="border-top:1px dashed var(--border);margin:14px 0 14px;"></div>
    <div style="font-size:11px;color:var(--text3);margin-bottom:12px;">선택 항목 (미입력 가능)</div>

    <!-- Q5 nicknames -->
    <div style="margin-bottom:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:6px;">Q5. 닉네임 <span style="font-size:10px;font-weight:400;color:var(--text3);">최대 5개</span></div>
      <div id="pid-nick-tags" style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:6px;min-height:24px;"></div>
      <div style="display:flex;gap:6px;align-items:center;">
        <input id="pid-nick-inp" type="text" placeholder="닉네임 입력 후 Enter"
          onkeydown="if(event.key==='Enter'){event.preventDefault();_addNicknameTag();}"
          style="flex:1;font-size:12px;border:1px solid var(--border);border-radius:8px;padding:7px 10px;">
        <span id="pid-nick-hint" style="font-size:11px;color:var(--text3);white-space:nowrap;"></span>
      </div>
    </div>

    <!-- Q6 signature_vocab -->
    <div style="margin-bottom:14px;">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:6px;">Q6. 자주 쓰는 표현 <span style="font-size:10px;font-weight:400;color:var(--text3);">쉼표 구분, 최대 20개</span></div>
      <input id="pid-sig-vocab" type="text"
        placeholder="예: 완성, 예쁘다, 추천"
        style="width:100%;box-sizing:border-box;font-size:12px;border:1px solid var(--border);border-radius:8px;padding:8px 10px;">
    </div>

    <!-- Q9 personality_line -->
    <div style="margin-bottom:16px;">
      <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:6px;">Q9. 브랜드 한 마디 <span style="font-size:10px;font-weight:400;color:var(--text3);">최대 200자</span></div>
      <div style="position:relative;">
        <textarea id="pid-personality" rows="3" maxlength="200"
          placeholder="예: 손님 한 분 한 분의 개성을 살려드리는 샵입니다."
          oninput="document.getElementById('pid-plc-count').textContent=this.value.length+'/200';"
          style="width:100%;box-sizing:border-box;font-size:12px;border:1px solid var(--border);border-radius:8px;padding:8px 10px 8px 10px;resize:vertical;"></textarea>
        <span id="pid-plc-count" style="position:absolute;right:10px;bottom:8px;font-size:10px;color:var(--text3);">0/200</span>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:10px;">
      <button id="pid-saveBtn" onclick="_saveIdentity()"
        style="padding:10px 24px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-size:12px;font-weight:700;cursor:pointer;">
        저장
      </button>
      <span id="pid-saveMsg" style="font-size:12px;color:var(--text3);"></span>
    </div>
  </div>`;
}

function _updateIdStatus() {
  let done = 0;
  if ((document.getElementById('pid-shop_name_intro')?.value || '').trim()) done++;
  if (Object.values(SUPPORTED_CATEGORIES).some(k => document.getElementById('pid-svc-' + k)?.checked)) done++;
  if (Object.keys(AGE_LABELS).some(a => Object.keys(GENDER_LABELS).some(g => document.getElementById(`pid-aud-${a}_${g}`)?.checked))) done++;
  if (document.querySelector('input[name="pid-tone"]:checked')) done++;
  if ((document.getElementById('pid-location')?.value || '').trim()) done++;
  const el = document.getElementById('_pIdStatus');
  if (el) el.textContent = `필수 ${done}/5 완료`;
}

async function _loadIdentity() {
  try {
    const [resData, resSt] = await Promise.all([
      _personaFetch('GET', '/persona/identity'),
      _personaFetch('GET', '/persona/identity/status'),
    ]);
    const data = resData.ok ? await resData.json() : null;
    const st   = resSt.ok  ? await resSt.json()   : null;

    if (data) {
      _pIdentityLoaded = data;

      // Q1
      const sniEl = document.getElementById('pid-shop_name_intro');
      if (sniEl && data.shop_name_intro) {
        sniEl.value = data.shop_name_intro;
        const cntEl = document.getElementById('pid-sni-count');
        if (cntEl) cntEl.textContent = data.shop_name_intro.length + '/50';
      }

      // Q2 services: [{category, sub_services:[]}] or {extension:[...], nail:[...]}
      if (data.services) {
        const svcMap = {};
        if (Array.isArray(data.services)) {
          data.services.forEach(s => { svcMap[s.category] = s.sub_services || []; });
        } else {
          Object.assign(svcMap, data.services);
        }
        Object.values(SUPPORTED_CATEGORIES).forEach(key => {
          if (svcMap[key] !== undefined) {
            const cb = document.getElementById('pid-svc-' + key);
            if (cb) cb.checked = true;
            const subEl = document.getElementById('pid-sub-' + key);
            if (subEl && Array.isArray(svcMap[key])) subEl.value = svcMap[key].join(', ');
          }
        });
      }

      // Q3 target_audience: ["10s_female", ...]
      if (Array.isArray(data.target_audience)) {
        data.target_audience.forEach(v => {
          const cb = document.getElementById('pid-aud-' + v);
          if (cb) cb.checked = true;
        });
      }

      // Q4 tone_preference
      if (data.tone_preference) {
        const r = document.getElementById('pid-tone-' + data.tone_preference);
        if (r) r.checked = true;
      }

      // Q8 location
      const locEl = document.getElementById('pid-location');
      if (locEl && data.location) locEl.value = data.location;

      // Q5 nicknames
      if (Array.isArray(data.nicknames)) {
        _pNicknames = data.nicknames.slice();
        _renderNicknameTags();
      }
      // Q6 signature_vocab
      if (Array.isArray(data.signature_vocab)) {
        const svEl = document.getElementById('pid-sig-vocab');
        if (svEl) svEl.value = data.signature_vocab.join(', ');
      }
      // Q9 personality_line
      if (data.personality_line) {
        const plEl = document.getElementById('pid-personality');
        if (plEl) {
          plEl.value = data.personality_line;
          const cntEl = document.getElementById('pid-plc-count');
          if (cntEl) cntEl.textContent = data.personality_line.length + '/200';
        }
      }
    }

    // 진행률: 서버 status 우선, 없으면 DOM 기반 계산
    if (st && typeof st.required_completed === 'number' && typeof st.required_total === 'number') {
      const el = document.getElementById('_pIdStatus');
      if (el) el.textContent = `필수 ${st.required_completed}/${st.required_total} 완료`;
    } else {
      _updateIdStatus();
    }
  } catch (e) {
    _updateIdStatus();
  }
}

async function _saveIdentity() {
  const btn   = document.getElementById('pid-saveBtn');
  const msgEl = document.getElementById('pid-saveMsg');
  if (!btn || !msgEl) return;
  btn.disabled = true; btn.textContent = '저장 중…';
  msgEl.textContent = '';

  // 현재 폼 수집
  const shop = (document.getElementById('pid-shop_name_intro')?.value || '').trim();
  const services = [];
  Object.values(SUPPORTED_CATEGORIES).forEach(key => {
    const cb = document.getElementById('pid-svc-' + key);
    if (cb?.checked) {
      const raw = (document.getElementById('pid-sub-' + key)?.value || '').trim();
      const sub = raw ? raw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 10) : [];
      services.push({category: key, sub_services: sub});
    }
  });
  const audience = [];
  Object.keys(AGE_LABELS).forEach(a => {
    Object.keys(GENDER_LABELS).forEach(g => {
      if (document.getElementById(`pid-aud-${a}_${g}`)?.checked) audience.push(`${a}_${g}`);
    });
  });
  const toneEl = document.querySelector('input[name="pid-tone"]:checked');
  const tone   = toneEl?.value || '';
  const loc    = (document.getElementById('pid-location')?.value || '').trim();

  // diff: 변경됐거나 처음 채운 필드만 body에 포함, 빈 값 제외
  const loaded = _pIdentityLoaded || {};
  const body   = {};

  if (shop && shop !== (loaded.shop_name_intro || ''))               body.shop_name_intro   = shop;
  if (services.length && JSON.stringify(services) !== JSON.stringify(loaded.services || []))
                                                                      body.services          = services;
  if (audience.length && JSON.stringify(audience.sort()) !== JSON.stringify((loaded.target_audience || []).slice().sort()))
                                                                      body.target_audience   = audience;
  if (tone && tone !== (loaded.tone_preference || ''))               body.tone_preference   = tone;
  if (loc  && loc  !== (loaded.location || ''))                      body.location          = loc;

  // 선택 4필드 (빈 배열/빈문자열도 변경이면 포함)
  const nicknames = _pNicknames.slice();
  if (JSON.stringify(nicknames) !== JSON.stringify(loaded.nicknames || []))
                                                                      body.nicknames         = nicknames;

  const svRaw   = (document.getElementById('pid-sig-vocab')?.value || '').trim();
  const sigVocab = svRaw ? svRaw.split(',').map(s => s.trim()).filter(Boolean).slice(0, 20) : [];
  if (JSON.stringify(sigVocab) !== JSON.stringify(loaded.signature_vocab || []))
                                                                      body.signature_vocab   = sigVocab;

  const pLine  = (document.getElementById('pid-personality')?.value || '').trim();
  if (pLine !== (loaded.personality_line || ''))                      body.personality_line  = pLine;

  if (!Object.keys(body).length) {
    msgEl.textContent = '변경 사항 없음';
    btn.disabled = false; btn.textContent = '저장';
    return;
  }

  try {
    window._assertSpec('PUT /persona/identity', body);
    const res  = await _personaFetch('PUT', '/persona/identity', body);
    const data = await res.json();
    if (!res.ok) { msgEl.textContent = '오류: ' + (data.detail || res.status); return; }

    // 저장 성공 → 로컬 캐시 갱신
    _pIdentityLoaded = Object.assign({}, loaded, body);
    msgEl.textContent = '저장됨 ✓';
    setTimeout(() => { const m = document.getElementById('pid-saveMsg'); if (m) m.textContent = ''; }, 2500);

    // status 재조회
    const resSt = await _personaFetch('GET', '/persona/identity/status');
    if (resSt.ok) {
      const st = await resSt.json();
      if (typeof st.required_completed === 'number') {
        const el = document.getElementById('_pIdStatus');
        if (el) el.textContent = `필수 ${st.required_completed}/${st.required_total} 완료`;
      }
    } else {
      _updateIdStatus();
    }
  } catch (e) {
    msgEl.textContent = '오류: ' + e.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '저장'; }
  }
}

// ─────────────────────────────────────────────────────────────────
// Q5 닉네임 태그 입력
// ─────────────────────────────────────────────────────────────────
function _addNicknameTag() {
  const inp = document.getElementById('pid-nick-inp');
  if (!inp) return;
  const val = inp.value.trim();
  if (!val || _pNicknames.length >= 5 || _pNicknames.includes(val)) { inp.value = ''; return; }
  _pNicknames.push(val);
  inp.value = '';
  _renderNicknameTags();
}

function _removeNicknameTag(i) {
  _pNicknames.splice(i, 1);
  _renderNicknameTags();
}

function _renderNicknameTags() {
  const el = document.getElementById('pid-nick-tags');
  if (!el) return;
  el.innerHTML = _pNicknames.map((t, i) =>
    `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:3px 10px 3px 12px;font-size:11px;color:var(--text2);">
      ${_esc(t)}
      <button onclick="_removeNicknameTag(${i})" style="background:none;border:none;cursor:pointer;padding:0;font-size:13px;color:var(--text3);line-height:1;margin-left:2px;">×</button>
    </span>`
  ).join('');
  const hint = document.getElementById('pid-nick-hint');
  if (hint) hint.textContent = _pNicknames.length >= 5 ? '최대 5개' : '';
}

// ─────────────────────────────────────────────────────────────────
// 동의 블록 (C4-UI-2)
// ─────────────────────────────────────────────────────────────────
function _renderConsentBlock() {
  return `
  <div id="pId-consent" style="margin-bottom:16px;background:#fff;border-radius:16px;border:1px solid var(--border);padding:16px;">
    <div style="font-size:13px;font-weight:800;color:var(--text);margin-bottom:12px;">서비스 동의</div>
    <div id="pcon-body"><div style="font-size:12px;color:var(--text3);">불러오는 중…</div></div>
  </div>`;
}

async function _loadConsent() {
  const bodyEl = document.getElementById('pcon-body');
  if (!bodyEl) return;
  try {
    const [resExist, resText] = await Promise.all([
      _personaFetch('GET', '/persona/consent'),
      _personaFetch('GET', '/persona/consent/text'),
    ]);
    const existing = resExist.ok ? await resExist.json() : null;

    // 이미 동의 완료 → 접힌 상태
    if (existing && existing.pipa_collect && existing.ai_processing) {
      const date = (existing.agreed_at || '').slice(0, 10);
      bodyEl.innerHTML = `<div style="font-size:12px;color:var(--text3);">✓ 동의 완료${date ? ' (' + date + ')' : ''}</div>`;
      return;
    }

    const texts  = resText.ok ? await resText.json() : {};
    // API 키 이름이 다를 수 있으므로 양쪽 시도
    const pipaText = texts.pipa_collect_v1_0 || texts['pipa_collect_v1.0'] || texts.pipa_collect || '';
    const aiText   = texts.ai_processing_v1_0 || texts['ai_processing_v1.0'] || texts.ai_processing || '';

    bodyEl.innerHTML = `
      <details style="margin-bottom:10px;">
        <summary style="font-size:12px;cursor:pointer;color:var(--text2);font-weight:600;padding:2px 0;">개인정보 수집·이용 동의서 보기</summary>
        <pre style="font-size:11px;color:var(--text3);white-space:pre-wrap;word-break:break-all;margin:8px 0 0;background:var(--bg3);padding:10px;border-radius:8px;font-family:inherit;max-height:180px;overflow-y:auto;">${_esc(pipaText)}</pre>
      </details>
      <details style="margin-bottom:14px;">
        <summary style="font-size:12px;cursor:pointer;color:var(--text2);font-weight:600;padding:2px 0;">AI 처리 동의서 보기</summary>
        <pre style="font-size:11px;color:var(--text3);white-space:pre-wrap;word-break:break-all;margin:8px 0 0;background:var(--bg3);padding:10px;border-radius:8px;font-family:inherit;max-height:180px;overflow-y:auto;">${_esc(aiText)}</pre>
      </details>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;cursor:pointer;font-size:12px;">
        <input type="checkbox" id="pcon-pipa" onchange="_syncConsentBtn();">
        개인정보 수집·이용 동의 <span style="color:var(--accent);">(필수)</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin-bottom:14px;cursor:pointer;font-size:12px;">
        <input type="checkbox" id="pcon-ai" onchange="_syncConsentBtn();">
        AI 처리 동의 <span style="color:var(--accent);">(필수)</span>
      </label>
      <div style="display:flex;align-items:center;gap:10px;">
        <button id="pcon-btn" onclick="_saveConsent()" disabled
          style="padding:10px 24px;border-radius:10px;border:none;background:var(--accent);color:#fff;font-size:12px;font-weight:700;cursor:not-allowed;opacity:0.4;">
          동의 저장
        </button>
        <span id="pcon-msg" style="font-size:12px;color:var(--text3);"></span>
      </div>`;
  } catch (e) {
    if (bodyEl) bodyEl.innerHTML = `<div style="font-size:12px;color:var(--text3);">불러오기 실패: ${_esc(e.message)}</div>`;
  }
}

function _syncConsentBtn() {
  const both = document.getElementById('pcon-pipa')?.checked && document.getElementById('pcon-ai')?.checked;
  const btn  = document.getElementById('pcon-btn');
  if (!btn) return;
  btn.disabled     = !both;
  btn.style.opacity = both ? '1' : '0.4';
  btn.style.cursor  = both ? 'pointer' : 'not-allowed';
}

async function _saveConsent() {
  const btn   = document.getElementById('pcon-btn');
  const msgEl = document.getElementById('pcon-msg');
  if (!btn || !msgEl) return;
  btn.disabled = true; btn.textContent = '저장 중…';
  msgEl.textContent = '';
  try {
    const consentBody = {
      pipa_collect: true, ai_processing: true,
      versions: {pipa_collect: '1.0', ai_processing: '1.0'},
    };
    window._assertSpec('POST /persona/consent', consentBody);
    const res  = await _personaFetch('POST', '/persona/consent', consentBody);
    const data = await res.json();
    if (!res.ok) {
      msgEl.textContent = '오류: ' + (data.detail || res.status);
      btn.disabled = false; btn.textContent = '동의 저장';
      return;
    }
    const bodyEl = document.getElementById('pcon-body');
    if (bodyEl) {
      const date = (data.agreed_at || new Date().toISOString()).slice(0, 10);
      bodyEl.innerHTML = `<div style="font-size:12px;color:var(--text3);">✓ 동의 완료 (${date})</div>`;
    }
  } catch (e) {
    if (msgEl) msgEl.textContent = '오류: ' + e.message;
    if (btn) { btn.disabled = false; btn.textContent = '동의 저장'; }
  }
}

async function _addManualSig() {
  const label     = (document.getElementById('pC-label')?.value   || '').trim();
  const content   = (document.getElementById('pC-content')?.value || '').trim();
  const position  = document.getElementById('pC-position')?.value  || 'bottom';
  const isDefault = document.getElementById('pC-isDefault')?.checked || false;
  const btn       = document.getElementById('pC-addBtn');
  const msgEl     = document.getElementById('pC-addMsg');
  if (!msgEl) return;

  if (!label)   { msgEl.textContent = '이름을 입력하세요.';   return; }
  if (!content) { msgEl.textContent = '내용을 입력하세요.';   return; }

  btn.disabled = true; btn.textContent = '처리중…';
  msgEl.textContent = '';
  try {
    const sigBody = { label, content, position, is_default: isDefault, source: 'manual' };
    window._assertSpec('POST /persona/signature-blocks', sigBody);
    const res  = await _personaFetch('POST', '/persona/signature', sigBody);
    const data = await res.json();
    if (!res.ok) { msgEl.textContent = '오류: ' + (data.detail || res.status); return; }
    msgEl.textContent = '추가 완료';
    document.getElementById('pC-label').value    = '';
    document.getElementById('pC-content').value  = '';
    document.getElementById('pC-isDefault').checked = false;
    await _loadSignatureList();
  } catch (e) {
    msgEl.textContent = '오류: ' + e.message;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '추가'; }
  }
}

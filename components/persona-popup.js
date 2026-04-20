/**
 * persona-popup.js
 * 말투분석 검증 팝업 — 토스식 Step 0~6
 *
 * Step 0: 서명블록 확인 ("고정된 글이 있나요?")
 * Step 1~3: 3축 선택 (scenario-selector.js 호출)
 * Step 4: 특이사항 자유입력 (scenario-selector 내부 처리)
 * Step 5: Mock AI 캡션 3개 + [맘에 들어요 / 다시 뽑아줘 / 살짝 고칠래요]
 * Step 6: 선택적 4단계 톤 조절
 *
 * export: openPersonaPopup()
 *
 * TODO(Phase 1-A-4): mockGenerateCaption → 실제 /persona/verify-scenario API로 교체
 */

import { renderScenarioSelector } from './scenario-selector.js';

/* ─────────────────────────────────────────────
   Mock API
   ───────────────────────────────────────────── */

/**
 * mockGenerateCaption(axes, special_context)
 * TODO(Phase 1-A-4): 실제 API로 교체
 */
function mockGenerateCaption(axes, special_context) {
  const isComplete = axes.situation === '시술완성';
  const isNew      = axes.customer  === '신규';
  const isPhoto    = axes.photo     === '완성샷';

  // special_context를 문맥에 맞게 자연스럽게 변환
  function _weaveExtra(ctx) {
    if (!ctx) return '';
    // 간단 패턴 치환 (자연어 형태로)
    const normalized = ctx
      .replace(/일본에서 오신/, '일본에서 찾아와 주신')
      .replace(/결혼식 앞두고/, '결혼을 앞두고')
      .replace(/타샵에서 망하고/, '다른 곳에서 아쉬운 경험 후')
      .replace(/10회 단골/, '10번이나 찾아주신')
      .trim();
    return normalized;
  }

  const extra = _weaveExtra(special_context);

  // 랜덤 요소 풀
  const EMOJIS_WARM  = ['🌸', '💕', '🥰', '✨', '💗'];
  const EMOJIS_COOL  = ['🎉', '💫', '🤍', '🙌', '😊'];
  const ENDINGS_SOFT = ['이에요', '예요', '했어요', '드렸어요'];
  const ENDINGS_FIRM = ['했습니다', '드렸습니다', '완성됐습니다', '마무리했어요'];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // 상황별 문구 풀 (랜덤 선택)
  const situationPool = isComplete
    ? ['시술이 완성', '오늘 시술도 마무리', '작업이 완성']
    : ['후기 감사', '소중한 리뷰 감사', '따뜻한 후기'];
  const customerPool = isNew
    ? ['처음 찾아주신 손님', '새로 인연이 된 손님', '첫 방문 손님']
    : ['오랫동안 찾아주신 손님', '자주 와주시는 단골 손님', '믿고 맡겨주시는 손님'];
  const photoPool = isPhoto
    ? ['완성된 모습', '마무리 사진', '완성샷']
    : ['변화 전후', '전후 사진', '비포애프터'];

  const situation = pick(situationPool);
  const customer  = pick(customerPool);
  const photo     = pick(photoPool);

  // extra 삽입 위치 결정
  const extraInline = extra ? ` ${extra}께` : '';
  const extraMid    = extra ? `\n${extra}이라 더욱 특별했어요.` : '';
  const extraEnd    = extra ? `\n${extra}, 감사해요!` : '';

  // 3개 캡션 — 톤/구성 확실히 다르게
  const c1 = `${customer}${extraInline} ${situation}${pick(ENDINGS_SOFT)} ${pick(EMOJIS_WARM)}\n${photo}으로 담아봤어요.`;
  const c2 = `오늘도 좋은 인연이었어요 ${pick(EMOJIS_WARM)}\n${customer}과 함께한 ${situation}!${extraMid}`;
  const c3 = `${situation} 기념으로 ${photo} 남겨요 ${pick(EMOJIS_COOL)}\n${customer}이라 더 뿌듯했어요.${extraEnd}`;

  return [c1, c2, c3];
}

/* ─────────────────────────────────────────────
   스타일
   ───────────────────────────────────────────── */

const PP_CSS = `
.pp-overlay {
  position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:9000;
  display:flex; align-items:flex-end; justify-content:center;
  animation: pp-bg-in .2s ease;
}
@keyframes pp-bg-in { from{opacity:0} to{opacity:1} }
.pp-sheet {
  width:100%; max-width:480px; background:#fff; border-radius:24px 24px 0 0;
  padding:32px 24px 40px; box-sizing:border-box;
  max-height:92vh; overflow-y:auto;
  animation: pp-sheet-in .22s cubic-bezier(.32,1.1,.68,1);
}
@keyframes pp-sheet-in { from{transform:translateY(60px);opacity:0} to{transform:none;opacity:1} }
.pp-handle { width:36px; height:4px; background:#e0e0e0; border-radius:2px; margin:0 auto 22px; }
.pp-title { font-size:20px; font-weight:800; color:#1a1a1a; margin-bottom:6px; line-height:1.35; }
.pp-sub   { font-size:14px; color:#888; margin-bottom:22px; line-height:1.5; }
.pp-btn {
  width:100%; padding:16px; border-radius:14px; border:none;
  font-size:16px; font-weight:700; cursor:pointer; transition:opacity .1s;
}
.pp-btn:active { opacity:.75; }
.pp-btn-primary { background:#1a1a1a; color:#fff; }
.pp-btn-ghost   { background:#f4f4f4; color:#333; margin-top:10px; }
.pp-caption-card {
  border:1.5px solid #e5e5e5; border-radius:14px; padding:16px 18px;
  margin-bottom:12px; font-size:14px; color:#222; line-height:1.65;
  white-space:pre-wrap; cursor:pointer; transition:border-color .12s;
}
.pp-caption-card.selected { border-color:#1a1a1a; background:#fafafa; }
.pp-caption-card:hover { border-color:#bbb; }
.pp-caption-actions { display:flex; gap:8px; margin-top:8px; flex-wrap:wrap; }
.pp-act-btn {
  flex:1; min-width:90px; padding:13px 8px; border-radius:12px; border:1.5px solid #e5e5e5;
  background:#fff; font-size:13px; font-weight:600; cursor:pointer; text-align:center;
  transition:border-color .12s, background .12s;
}
.pp-act-btn:hover { border-color:#aaa; }
.pp-act-btn.primary { border-color:#1a1a1a; background:#1a1a1a; color:#fff; }
.pp-tone-row { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
.pp-tone-chip {
  flex:1; min-width:70px; padding:13px 10px; border-radius:12px; border:1.5px solid #e5e5e5;
  background:#fff; font-size:13px; font-weight:600; cursor:pointer; text-align:center;
  transition:border-color .12s, background .12s, color .12s;
}
.pp-tone-chip.selected { border-color:#1a1a1a; background:#1a1a1a; color:#fff; }
.pp-signature-box {
  background:#f8f8f8; border-radius:12px; padding:12px 14px;
  font-size:13px; color:#555; line-height:1.6; margin-bottom:16px;
  white-space:pre-wrap; min-height:40px;
}
.pp-sig-group { margin-bottom:16px; }
.pp-sig-label { display:block; font-size:13px; font-weight:600; color:#555; margin-bottom:6px; }
.pp-sig-textarea {
  width:100%; min-height:60px; padding:12px; border:1.5px solid #e5e5e5; border-radius:12px;
  font-size:14px; line-height:1.5; resize:vertical; box-sizing:border-box;
  font-family:inherit;
}
.pp-sig-textarea:focus { outline:none; border-color:#1a1a1a; }
.pp-sig-textarea::placeholder { color:#bbb; }
.pp-loading { text-align:center; padding:32px 0; color:#aaa; font-size:14px; }
.pp-step-anim { animation: ss-fadein .18s ease; }
@keyframes ss-fadein { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:none} }
`;

function _injectPPStyles() {
  if (document.getElementById('pp-styles')) return;
  const el = document.createElement('style');
  el.id = 'pp-styles';
  el.textContent = PP_CSS;
  document.head.appendChild(el);
}

/* ─────────────────────────────────────────────
   팝업 상태
   ───────────────────────────────────────────── */

let _overlay = null;

function _close() {
  if (_overlay) { _overlay.remove(); _overlay = null; }
}

function _showToast(msg) {
  const t = document.createElement('div');
  t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:12px;font-size:14px;font-weight:600;z-index:9999;animation:ss-fadein .2s ease;white-space:nowrap;';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

function _buildOverlay() {
  const overlay = document.createElement('div');
  overlay.className = 'pp-overlay';
  overlay.addEventListener('click', e => { if (e.target === overlay) _close(); });

  const sheet = document.createElement('div');
  sheet.className = 'pp-sheet';
  sheet.id = 'pp-sheet';

  const handle = document.createElement('div');
  handle.className = 'pp-handle';
  sheet.appendChild(handle);

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);
  return { overlay, sheet };
}

function _getSheet() { return document.getElementById('pp-sheet'); }

/* ─────────────────────────────────────────────
   Step 렌더러
   ───────────────────────────────────────────── */

// Step 0: 서명블록 확인 (실제 API 연동)
async function _renderStep0() {
  const sheet = _getSheet();
  sheet.querySelectorAll('.pp-step').forEach(el => el.remove());

  const wrap = document.createElement('div');
  wrap.className = 'pp-step pp-step-anim';

  // 로딩 표시
  wrap.innerHTML = `<div class="pp-loading">서명 불러오는 중...</div>`;
  sheet.appendChild(wrap);

  // API에서 서명블록 가져오기
  let blocks = [];
  try {
    const res = await fetch(window.API + '/persona/signature', {
      headers: window.authHeader()
    });
    if (res.ok) blocks = await res.json();
  } catch (e) {
    console.warn('[persona-popup] 서명 조회 실패', e);
  }

  // position별로 분리
  const topBlock = blocks.find(b => b.position === 'top');
  const bottomBlock = blocks.find(b => b.position === 'bottom');

  // UI 렌더링
  wrap.innerHTML = `
    <div class="pp-title">캡션에 항상 넣는 말이 있나요?</div>
    <div class="pp-sub">분석에서 찾은 고정 문구예요. 수정해도 돼요.</div>

    <div class="pp-sig-group">
      <label class="pp-sig-label">글 앞에 고정 문구 (선택)</label>
      <textarea class="pp-sig-textarea" id="pp-sig-top" placeholder="예: 🌸 오늘의 시술 🌸">${topBlock?.content || ''}</textarea>
    </div>

    <div class="pp-sig-group">
      <label class="pp-sig-label">글 뒤에 고정 문구 (선택)</label>
      <textarea class="pp-sig-textarea" id="pp-sig-bottom" placeholder="예: 예약은 DM 주세요 💌 #잇데이네일">${bottomBlock?.content || ''}</textarea>
    </div>

    <button class="pp-btn pp-btn-primary" id="pp-sig-next">다음</button>
  `;

  // 원본값 저장 (변경 감지용)
  const origTop = topBlock?.content || '';
  const origBottom = bottomBlock?.content || '';
  const topId = topBlock?.id || null;
  const bottomId = bottomBlock?.id || null;

  document.getElementById('pp-sig-next').onclick = async () => {
    const newTop = document.getElementById('pp-sig-top').value.trim();
    const newBottom = document.getElementById('pp-sig-bottom').value.trim();

    // 변경사항 저장 (에러 무시, 콘솔 warn만)
    try {
      // Top 블록 처리
      if (newTop !== origTop) {
        if (newTop && topId) {
          // 업데이트
          await fetch(window.API + '/persona/signature/' + topId, {
            method: 'PUT',
            headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newTop, position: 'top' })
          });
        } else if (newTop && !topId) {
          // 새로 생성
          await fetch(window.API + '/persona/signature', {
            method: 'POST',
            headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newTop, position: 'top', label: '글 앞 고정', is_default: true, source: 'manual' })
          });
        } else if (!newTop && topId) {
          // 삭제 (soft delete)
          await fetch(window.API + '/persona/signature/' + topId, {
            method: 'DELETE',
            headers: window.authHeader()
          });
        }
      }

      // Bottom 블록 처리
      if (newBottom !== origBottom) {
        if (newBottom && bottomId) {
          await fetch(window.API + '/persona/signature/' + bottomId, {
            method: 'PUT',
            headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newBottom, position: 'bottom' })
          });
        } else if (newBottom && !bottomId) {
          await fetch(window.API + '/persona/signature', {
            method: 'POST',
            headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newBottom, position: 'bottom', label: '글 뒤 고정', is_default: true, source: 'manual' })
          });
        } else if (!newBottom && bottomId) {
          await fetch(window.API + '/persona/signature/' + bottomId, {
            method: 'DELETE',
            headers: window.authHeader()
          });
        }
      }
    } catch (e) {
      console.warn('[persona-popup] 서명 저장 실패 (계속 진행)', e);
    }

    // 다음 단계로 이동 (signature 객체 전달)
    _renderStep1to3({ top: newTop, bottom: newBottom });
  };
}

// Step 1~3 + Step 4 (scenario-selector 위임)
// signature: { top: string, bottom: string }
function _renderStep1to3(signature) {
  const sheet = _getSheet();
  sheet.querySelectorAll('.pp-step').forEach(el => el.remove());

  const wrap = document.createElement('div');
  wrap.className = 'pp-step pp-step-anim';

  const title = document.createElement('div');
  title.className = 'pp-title';
  title.textContent = '상황 하나만 골라주세요';
  wrap.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'pp-sub';
  sub.textContent = '이 상황을 가정해서 원장님 말투로 글을 써볼게요!';
  wrap.appendChild(sub);

  const selectorArea = document.createElement('div');
  wrap.appendChild(selectorArea);
  sheet.appendChild(wrap);

  renderScenarioSelector(selectorArea, ({ combo_id, axes, special_context }) => {
    _renderStep5(signature, combo_id, axes, special_context);
  });
}

// Step 5: 캡션 3개 + 피드백 버튼 (실제 API, Mock fallback)
function _renderStep5(signature, combo_id, axes, special_context) {
  const sheet = _getSheet();
  sheet.querySelectorAll('.pp-step').forEach(el => el.remove());

  const wrap = document.createElement('div');
  wrap.className = 'pp-step pp-step-anim';

  const loading = document.createElement('div');
  loading.className = 'pp-loading';
  loading.textContent = '글 만드는 중이에요...';
  wrap.appendChild(loading);
  sheet.appendChild(wrap);

  (async () => {
    let captions;
    try {
      const res = await fetch(window.API + '/persona/analyze-tone', {
        method: 'POST',
        headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ axes, special_context })
      });
      if (!res.ok) throw new Error('analyze_fail');
      const data = await res.json();
      captions = data.variants;
    } catch(e) {
      console.warn('[persona-popup] API 실패, Mock 사용', e);
      captions = mockGenerateCaption(axes, special_context);
    }

    wrap.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'pp-title';
    title.textContent = '원장님 말투로 만들어 봤어요!';
    wrap.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'pp-sub';
    sub.textContent = '방금 고르신 상황을 가정해서 쓴 글이에요. 어떤 게 원장님 말투에 가까울까요?';
    wrap.appendChild(sub);

    let selectedIdx = -1;

    captions.forEach((text, i) => {
      const card = document.createElement('div');
      card.className = 'pp-caption-card';
      card.textContent = text;
      card.onclick = () => {
        document.querySelectorAll('.pp-caption-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        selectedIdx = i;
        actRow.style.display = 'flex';
      };
      wrap.appendChild(card);
    });

    const actRow = document.createElement('div');
    actRow.className = 'pp-caption-actions';
    actRow.style.display = 'none';

    const btnGood = document.createElement('button');
    btnGood.className = 'pp-act-btn primary';
    btnGood.textContent = '맘에 들어요';
    btnGood.onclick = () => _renderStep6(captions[selectedIdx], selectedIdx, combo_id, captions, axes, special_context, false);

    const btnRetry = document.createElement('button');
    btnRetry.className = 'pp-act-btn';
    btnRetry.textContent = '다시 뽑아줘';
    btnRetry.onclick = () => _renderStep5(signature, combo_id, axes, special_context);

    const btnEdit = document.createElement('button');
    btnEdit.className = 'pp-act-btn';
    btnEdit.textContent = '살짝 고칠래요';
    btnEdit.onclick = () => _renderStep6(captions[selectedIdx], selectedIdx, combo_id, captions, axes, special_context, true);

    actRow.appendChild(btnGood);
    actRow.appendChild(btnRetry);
    actRow.appendChild(btnEdit);
    wrap.appendChild(actRow);

    const btnNone = document.createElement('button');
    btnNone.className = 'pp-btn pp-btn-ghost';
    btnNone.style.marginTop = '16px';
    btnNone.textContent = '다 별로예요, 다시 뽑아줘';
    btnNone.onclick = () => _renderStep5(signature, combo_id, axes, special_context);
    wrap.appendChild(btnNone);
  })();
}

// Step 6: 선택적 톤 조절 + 피드백 전송
function _renderStep6(selectedCaption, selectedIdx, combo_id, captions, axes, special_context, editMode = false) {
  const sheet = _getSheet();
  sheet.querySelectorAll('.pp-step').forEach(el => el.remove());

  const wrap = document.createElement('div');
  wrap.className = 'pp-step pp-step-anim';

  const title = document.createElement('div');
  title.className = 'pp-title';
  title.textContent = editMode ? '어떻게 고쳐볼까요?' : '톤을 조금 바꿔볼까요?';
  wrap.appendChild(title);

  const sub = document.createElement('div');
  sub.className = 'pp-sub';
  sub.textContent = '원하는 느낌이 있으면 골라주세요. 없으면 넘어가도 돼요.';
  wrap.appendChild(sub);

  const TONES = [
    { key: 'emoji',  label: '이모지 줄여줘' },
    { key: 'longer', label: '더 길게 써줘' },
    { key: 'casual', label: '더 친근하게' },
    { key: 'formal', label: '좀 더 격식있게' },
  ];

  const selected = new Set();

  const toneRow = document.createElement('div');
  toneRow.className = 'pp-tone-row';
  TONES.forEach(t => {
    const chip = document.createElement('button');
    chip.className = 'pp-tone-chip';
    chip.textContent = t.label;
    chip.onclick = () => {
      chip.classList.toggle('selected');
      selected.has(t.key) ? selected.delete(t.key) : selected.add(t.key);
    };
    toneRow.appendChild(chip);
  });
  wrap.appendChild(toneRow);

  let ta = null;
  if (editMode) {
    const editLabel = document.createElement('div');
    editLabel.style.cssText = 'font-size:13px;font-weight:600;color:#555;margin:14px 0 8px;';
    editLabel.textContent = '직접 수정해도 돼요';
    wrap.appendChild(editLabel);

    ta = document.createElement('textarea');
    ta.className = 'pp-signature-box';
    ta.style.cssText += 'width:100%;box-sizing:border-box;border:1.5px solid #e5e5e5;border-radius:12px;resize:none;outline:none;font-family:inherit;';
    ta.rows = 5;
    ta.value = selectedCaption;
    wrap.appendChild(ta);
  }

  function _sendFeedback() {
    fetch(window.API + '/persona/feedback', {
      method: 'POST',
      headers: { ...window.authHeader(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        combo_id,
        axes,
        special_context,
        variants: captions,
        selected_index: selectedIdx,
        action: editMode ? 'edit' : 'good',
        tone_tweaks: Array.from(selected),
        edited_caption: editMode && ta ? ta.value : null
      })
    }).catch(e => console.warn('[persona-popup] 피드백 저장 실패', e));
  }

  const btnDone = document.createElement('button');
  btnDone.className = 'pp-btn pp-btn-primary';
  btnDone.style.marginTop = '16px';
  btnDone.textContent = '완료!';
  btnDone.onclick = () => {
    _sendFeedback();
    _showToast(editMode ? '수정사항 저장 완료!' : '말투 학습 완료! 다음 캡션에 반영돼요 ✨');
    _close();
  };
  wrap.appendChild(btnDone);

  const btnSkip = document.createElement('button');
  btnSkip.className = 'pp-btn pp-btn-ghost';
  btnSkip.textContent = '이대로 완료';
  btnSkip.onclick = () => {
    _showToast('말투 학습 완료! 다음 캡션에 반영돼요 ✨');
    _close();
  };
  wrap.appendChild(btnSkip);

  sheet.appendChild(wrap);
}

/* ─────────────────────────────────────────────
   진입점
   ───────────────────────────────────────────── */

/**
 * openPersonaPopup()
 * 말투분석 검증 팝업 열기
 */
function openPersonaPopup() {
  if (_overlay) return; // 중복 방지
  _injectPPStyles();
  const { overlay } = _buildOverlay();
  _overlay = overlay;
  _renderStep0();
}

window.openPersonaPopup = openPersonaPopup;
export { openPersonaPopup };

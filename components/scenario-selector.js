/**
 * scenario-selector.js
 * 3축 선택 UI (Q1 상황 → Q2 손님 → Q3 사진)
 * Phase 1-A 말투분석 팝업 + Phase 1-F 캡션탭 양쪽 재사용 독립 컴포넌트
 *
 * export: renderScenarioSelector(container, onComplete)
 *   onComplete({ combo_id, axes, special_context }) 호출
 */

const SCENARIO_CARDS = [
  { combo_id: 'complete_new_photo',    axes: { situation: '시술완성', customer: '신규', photo: '완성샷' },   label: '첫 손님 완성샷 자랑' },
  { combo_id: 'complete_new_compare',  axes: { situation: '시술완성', customer: '신규', photo: '전후비교' }, label: '첫 손님 전후 변화' },
  { combo_id: 'complete_regular_photo',axes: { situation: '시술완성', customer: '단골', photo: '완성샷' },   label: '단골 완성샷 자랑' },
  { combo_id: 'complete_regular_compare',axes:{situation:'시술완성', customer:'단골', photo:'전후비교'},    label: '단골 전후 변화' },
  { combo_id: 'thanks_new_photo',      axes: { situation: '후기감사', customer: '신규', photo: '완성샷' },   label: '첫 손님 후기 감사' },
  { combo_id: 'thanks_new_compare',    axes: { situation: '후기감사', customer: '신규', photo: '전후비교' }, label: '첫 손님 전후 후기' },
  { combo_id: 'thanks_regular_photo',  axes: { situation: '후기감사', customer: '단골', photo: '완성샷' },   label: '단골 감사 후기' },
  { combo_id: 'thanks_regular_compare',axes:{situation:'후기감사', customer:'단골', photo:'전후비교'},      label: '단골 장기 변화 후기' },
];

const AXES_CONFIG = [
  { key: 'situation', question: '오늘 어떤 상황이에요?', options: ['시술완성', '후기감사', '직접 작성'] },
  { key: 'customer',  question: '손님은 어떤 분이에요?', options: ['신규', '단골', '직접 작성'] },
  { key: 'photo',     question: '사진 종류는요?',        options: ['완성샷', '전후비교', '직접 작성'] },
];

const SS_CSS = `
.ss-wrap { font-family: -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', sans-serif; }
.ss-step { animation: ss-fadein .18s ease; }
@keyframes ss-fadein { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
.ss-q { font-size:16px; font-weight:700; color:#1a1a1a; margin-bottom:14px; line-height:1.4; }
.ss-chips { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:6px; }
.ss-chip {
  flex:1; min-width:100px; padding:15px 12px; border-radius:14px; border:1.5px solid #e5e5e5;
  background:#fff; font-size:15px; font-weight:600; color:#333; cursor:pointer;
  text-align:center; transition:border-color .12s, background .12s, color .12s;
}
.ss-chip:hover { border-color:#aaa; }
.ss-chip.selected { border-color:#1a1a1a; background:#1a1a1a; color:#fff; }
.ss-progress { display:flex; gap:5px; margin-bottom:20px; }
.ss-dot { width:7px; height:7px; border-radius:50%; background:#e5e5e5; transition:background .15s; }
.ss-dot.done { background:#1a1a1a; }
.ss-dot.active { background:#666; }
.ss-special-label { font-size:14px; font-weight:600; color:#555; margin-bottom:8px; }
.ss-special-hint { font-size:12px; color:#aaa; margin-bottom:8px; }
.ss-special-ta {
  width:100%; box-sizing:border-box; border:1.5px solid #e5e5e5; border-radius:12px;
  padding:13px 15px; font-size:14px; color:#1a1a1a; resize:none; outline:none;
  font-family:inherit; transition:border-color .12s;
}
.ss-special-ta:focus { border-color:#aaa; }
.ss-confirm-btn {
  width:100%; margin-top:16px; padding:16px; border-radius:14px; border:none;
  background:#1a1a1a; color:#fff; font-size:16px; font-weight:700; cursor:pointer;
  transition:opacity .12s;
}
.ss-confirm-btn:active { opacity:.75; }
.ss-back { background:none; border:none; color:#aaa; font-size:13px; cursor:pointer; margin-bottom:16px; padding:0; }
.ss-back:hover { color:#555; }
`;

function _injectSSStyles() {
  if (document.getElementById('ss-styles')) return;
  const el = document.createElement('style');
  el.id = 'ss-styles';
  el.textContent = SS_CSS;
  document.head.appendChild(el);
}

function _findCard(axes) {
  return SCENARIO_CARDS.find(c =>
    c.axes.situation === axes.situation &&
    c.axes.customer  === axes.customer  &&
    c.axes.photo     === axes.photo
  ) || null;
}

/**
 * renderScenarioSelector(container, onComplete)
 *
 * @param {HTMLElement} container  - UI를 그릴 DOM 엘리먼트
 * @param {Function}    onComplete - 선택 완료 시 콜백
 *   onComplete({ combo_id: string, axes: object, special_context: string })
 */
function renderScenarioSelector(container, onComplete) {
  _injectSSStyles();

  const state = { situation: null, customer: null, photo: null };
  let currentStep = 0; // 0~2 = Q1~Q3, 3 = special_context

  function render() {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'ss-wrap';

    // 진행 점 표시
    const progress = document.createElement('div');
    progress.className = 'ss-progress';
    for (let i = 0; i < 4; i++) {
      const dot = document.createElement('div');
      dot.className = 'ss-dot' + (i < currentStep ? ' done' : i === currentStep ? ' active' : '');
      progress.appendChild(dot);
    }
    wrap.appendChild(progress);

    if (currentStep < 3) {
      _renderAxisStep(wrap, currentStep);
    } else {
      _renderSpecialContext(wrap);
    }

    container.appendChild(wrap);
  }

  function _renderAxisStep(wrap, stepIdx) {
    const cfg = AXES_CONFIG[stepIdx];

    if (stepIdx > 0) {
      const back = document.createElement('button');
      back.className = 'ss-back';
      back.textContent = '← 이전';
      back.onclick = () => { currentStep--; render(); };
      wrap.appendChild(back);
    }

    const step = document.createElement('div');
    step.className = 'ss-step';

    const q = document.createElement('div');
    q.className = 'ss-q';
    q.textContent = cfg.question;
    step.appendChild(q);

    const chips = document.createElement('div');
    chips.className = 'ss-chips';

    // Custom input area (hidden initially)
    const customArea = document.createElement('div');
    customArea.style.cssText = 'display:none; margin-top:12px;';

    const customInput = document.createElement('input');
    customInput.type = 'text';
    customInput.className = 'ss-special-ta';
    customInput.style.cssText = 'width:100%; box-sizing:border-box;';
    customInput.placeholder = '직접 입력해주세요';
    customInput.maxLength = 50;

    const customBtn = document.createElement('button');
    customBtn.className = 'ss-confirm-btn';
    customBtn.style.cssText = 'margin-top:10px; padding:12px;';
    customBtn.textContent = '확인';

    customArea.appendChild(customInput);
    customArea.appendChild(customBtn);

    cfg.options.forEach(opt => {
      const chip = document.createElement('button');
      chip.className = 'ss-chip' + (state[cfg.key] === opt ? ' selected' : '');
      chip.textContent = opt;
      chip.onclick = () => {
        if (opt === '직접 작성') {
          // Show custom input, highlight chip
          document.querySelectorAll('.ss-chip').forEach(c => c.classList.remove('selected'));
          chip.classList.add('selected');
          customArea.style.display = 'block';
          customInput.focus();
        } else {
          state[cfg.key] = opt;
          currentStep++;
          render();
        }
      };
      chips.appendChild(chip);
    });

    step.appendChild(chips);
    step.appendChild(customArea);

    // Custom input confirm handler
    const confirmCustom = () => {
      const val = customInput.value.trim();
      if (!val) return;
      state[cfg.key] = val; // Store the custom text as the axis value
      currentStep++;
      render();
    };
    customBtn.onclick = confirmCustom;
    customInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') confirmCustom();
    });

    wrap.appendChild(step);
  }

  function _renderSpecialContext(wrap) {
    const back = document.createElement('button');
    back.className = 'ss-back';
    back.textContent = '← 이전';
    back.onclick = () => { currentStep = 2; render(); };
    wrap.appendChild(back);

    const step = document.createElement('div');
    step.className = 'ss-step';

    const label = document.createElement('div');
    label.className = 'ss-special-label';
    label.textContent = '상황을 직접 써도 돼요 (선택)';
    step.appendChild(label);

    const hint = document.createElement('div');
    hint.className = 'ss-special-hint';
    hint.textContent = '예: 일본에서 오신 손님 / 결혼식 앞두고 오셨어요 / 타샵에서 망하고 다시 오셨어요';
    step.appendChild(hint);

    const ta = document.createElement('textarea');
    ta.className = 'ss-special-ta';
    ta.rows = 3;
    ta.maxLength = 200;
    ta.placeholder = '없으면 비워두고 완료 눌러주세요';
    step.appendChild(ta);

    const btn = document.createElement('button');
    btn.className = 'ss-confirm-btn';
    btn.textContent = '완료';
    btn.onclick = () => {
      const special_context = ta.value.trim();
      const card = _findCard(state);
      // If no matching card (custom values), generate a dynamic combo_id
      const combo_id = card ? card.combo_id : `custom_${state.situation}_${state.customer}_${state.photo}`;
      onComplete({ combo_id, axes: { ...state }, special_context });
    };
    step.appendChild(btn);

    wrap.appendChild(step);
  }

  render();
}

window.renderScenarioSelector = renderScenarioSelector;
export { renderScenarioSelector };

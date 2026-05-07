// Itdasy Studio - Instagram 연동 & 말투분석

// ===== 인스타 토큰 만료 배너 =====
// Instagram Graph API 장기 토큰은 60일 만료. 7일 이내 또는 이미 만료 시 재연동 배너 노출.
function _renderTokenExpiryBanner(expiresAtIso) {
  const existing = document.getElementById('tokenExpiryBanner');
  if (existing) existing.remove();
  if (!expiresAtIso) return;

  const expMs = new Date(expiresAtIso).getTime();
  if (isNaN(expMs)) return;
  const remainDays = Math.floor((expMs - Date.now()) / 86400000);
  if (remainDays > 7) return;  // 여유 있으면 표시 안 함

  const isExpired = remainDays < 0;
  const msg = isExpired
    ? '인스타 연동이 만료됐어요 — 재연동이 필요합니다'
    : `인스타 연동이 ${remainDays}일 뒤 만료돼요 — 지금 갱신하세요`;

  const banner = document.createElement('div');
  banner.id = 'tokenExpiryBanner';
  banner.setAttribute('role', 'alert');
  banner.className = `banner ${isExpired ? 'banner--danger' : 'banner--warn'}`;
  banner.innerHTML = `<span style="flex:1;">${msg}</span>
    <button class="banner__cta" onclick="(document.getElementById('connectInstaBtn')||{click:()=>{}}).click()">재연동</button>`;

  const homePost = document.getElementById('homePostConnect');
  if (homePost && homePost.firstElementChild) {
    homePost.insertBefore(banner, homePost.firstElementChild);
  }
}

// ===== 인스타그램 연동 =====
async function checkInstaStatus(fromLogin = false) {
  if (!getToken()) return;
  try {
    const res = await fetch(API + '/instagram/status', { headers: authHeader() });
    if (!res.ok) return;
    const data = await res.json();

    // 서버에 shop_name 있으면 → 재로그인 환영 (로그인 직후 1회만)
    if (fromLogin && data.shop_name) {
      showWelcome(data.shop_name);
    }

    // 3단계 인디케이터 상태 업데이트 (인스타 연동 / 말투 학습 / 첫 글 완성)
    const updateStep = (id, done) => {
      const el = document.querySelector('#' + id + ' .step-circle');
      if (!el) return;
      if (done) { el.style.background = 'linear-gradient(135deg,var(--accent),var(--accent2))'; el.style.color = '#fff'; }
      else      { el.style.background = '#f0f0f0'; el.style.color = '#aaa'; }
    };

    if (data.connected) {
      // 2026-05-01 ── 다음 방문 시 깜빡임 없게 캐시. checkInstaStatus 응답 오기 전에
      // 인라인 스크립트가 이 캐시 보고 즉시 homePostConnect 표시.
      try {
        localStorage.setItem('itdasy:ig_connected_cache', '1');
        // 프로필 사진/핸들도 캐시 — 내샵관리 등 다른 화면에서 즉시 사용
        if (data.profile_picture_url) localStorage.setItem('itdasy:ig_profile_pic', data.profile_picture_url);
        if (data.handle) localStorage.setItem('itdasy:ig_handle', data.handle);
      } catch (_e) { /* ignore */ }
      document.getElementById('homePreConnect').style.display = 'none';
      document.getElementById('homePostConnect').style.display = 'flex';
      // [2026-05-08 28차 2단계] 인스타 연결되면 dismissed 자동 해제 — 해제 후 다시 미연결 시 카드 다시 보이게
      try { localStorage.removeItem('itdasy_ipc_dismissed'); } catch (_e) { void _e; }
      _instaHandle = data.handle || '';
      updateHeaderProfile(_instaHandle, data.persona ? data.persona.tone : null, data.profile_picture_url || '');
      updateStep('stepInsta', true);
      _renderTokenExpiryBanner(data.expires_at);
      if (window.KillerWidgets && typeof window.KillerWidgets.renderRow === 'function') {
        window.KillerWidgets.renderRow('homeKillerWidgets').catch(() => {});
      }
      if (typeof window.renderHomeResume === 'function') {
        window.renderHomeResume().catch(() => {});
      }
      const persona = data.persona || {};
      const personaDone = !!(persona.style_summary);
      updateStep('stepPersona', personaDone);
      // [2026-05-08 hotfix] OAuth 직후 (?connected=success) 자동 분석이 곧 따라옴 → 옛 persona 안 깜빡이게 강제 숨김
      const justOAuthed = (function(){ try { return new URLSearchParams(location.search).get('connected') === 'success'; } catch (_) { return false; } })();
      if (personaDone && !justOAuthed) renderPersonaDash(persona);
      else document.getElementById('personaDash').style.display = 'none';
      // 첫 글 완성 여부는 generationLog 기반. 백엔드 지원 전까진 localStorage hint로
      updateStep('stepCaption', !!localStorage.getItem('_first_caption_done'));
    } else {
      try { localStorage.removeItem('itdasy:ig_connected_cache'); } catch (_e) { /* ignore */ }
      // [2026-05-08 28차 hotfix] 잇비 카드 / 메인홈 교차 표시 — 둘 다 보이면 스크롤 어색.
      //   미연결 + 카드 visible       → 잇비 카드만
      //   미연결 + 카드 dismissed     → 메인홈만
      //   연결됨                      → 메인홈만 (위 if(data.connected) 처리)
      const dismissed = (function(){ try { return localStorage.getItem('itdasy_ipc_dismissed') === '1'; } catch (_) { return false; } })();
      if (dismissed) {
        document.getElementById('homePreConnect').style.display = 'none';
        document.getElementById('homePostConnect').style.display = 'flex';
      } else {
        document.getElementById('homePreConnect').style.display = 'flex';
        document.getElementById('homePostConnect').style.display = 'none';
      }
      updateStep('stepInsta', false);
      updateStep('stepPersona', false);
      updateStep('stepCaption', false);
    }
  } catch(_e) { /* ignore */ }
}

function renderPersonaDash(p, showTestBtn) {
  document.getElementById('personaDash').style.display = 'block';
  const content = document.getElementById('personaContent');
  if (!content) return;
  // [2026-05-08 28차 [K]] tone 카테고리 (친근/정중/귀여움) 제거 — 사장님 본인 말투를 분류 X.
  // BE Persona.style_summary (한 줄 요약) 그대로 노출.
  const summary = (p && typeof p.style_summary === 'string' && p.style_summary.trim())
    ? p.style_summary.trim()
    : '아직 분석 전이에요. 분석 후에 사장님 말투 요약이 여기 보여요.';
  const _esc = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  content.innerHTML = `
    <div style="background:rgba(241,128,145,0.04); padding:14px; border-radius:14px; border:0.5px solid rgba(241,128,145,0.15); margin-bottom:16px;">
      <div style="margin-bottom:8px; font-size:11px; color:var(--accent2); font-weight:700; letter-spacing:-0.2px;">💬 사장님 말투</div>
      <div style="font-size:13px; color:var(--text); line-height:1.6; font-weight:500;">${_esc(summary)}</div>
    </div>
    <div style="display:flex; flex-direction:column; gap:8px;">
      ${showTestBtn ? `<button class="btn-primary" style="width:100%; height:44px; font-size:13px; font-weight:700;" onclick="showOnboardingCaptionPopup()">✍️ 내 말투로 테스트 글 만들기</button>` : ''}
      <button class="btn-copy" style="width:100%; height:42px; font-size:13px; font-weight:600; border:1px solid var(--accent2); background:white; color:var(--accent2); border-radius:10px;" onclick="showDetailedAnalysis()">📋 전체 분석 리포트 확인</button>
    </div>
  `;
}

function showDetailedAnalysis() {
  const raw = JSON.parse(localStorage.getItem('itdasy_latest_analysis') || '{}');
  if (!raw.tone_summary) {
    showToast('학습된 말투 데이터가 없습니다. 먼저 분석을 진행해주세요');
    return;
  }
  // 팝업 데이터 렌더링 (runPersonaAnalyze에 있는 로직 재사용)
  renderDetailedPopup({ raw_analysis: raw, persona: { avg_caption_length: raw.avg_caption_length || 0, emojis: raw.emojis, hashtags: raw.hashtags, style_summary: raw.style_summary } });
  document.getElementById('analyzeResultPopup').style.display = 'block';
}

function renderDetailedPopup(data) {
    const p = data.persona;
    const raw = data.raw_analysis || {};
    const tFeatures = raw.tone_features || raw.tone_traits || [];

    // 유연한 키 매핑 (Gemini 응답 변동성 대비)
    const top5 = raw.top5_analysis || raw.top_5_analysis || raw.top5 || raw.success_highlights || [];

    document.getElementById('analyzeResultBody').innerHTML = `
    <div style="margin-bottom:24px; padding:16px; background:rgba(241,128,145,0.04); border-radius:16px; border:1px solid rgba(241,128,145,0.08);">
        <div style="color:var(--accent2); font-size:11px; font-weight:700; margin-bottom:6px; letter-spacing:0.5px;">분석 완료</div>
        <div style="font-size:15px; font-weight:700; color:var(--text);">최근 게시물 기준 · 평균 ${p.avg_caption_length}자 글쓰기</div>
    </div>

    <div style="margin-bottom:28px;">
        <div style="color:var(--accent2); font-size:11px; font-weight:700; margin-bottom:10px; letter-spacing:0.5px;">사장님 말투 스타일</div>
        <div style="font-size:17px; font-weight:800; color:var(--text); margin-bottom:12px; line-height:1.4; word-break:keep-all;">"${raw.tone_summary || p.tone}"</div>
        <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${tFeatures.map(f => `<span style="background:rgba(241,128,145,0.07); color:var(--accent2); padding:6px 12px; border-radius:20px; font-size:12px; font-weight:600;">${f}</span>`).join('')}
        </div>
    </div>

    <div style="margin-bottom:32px;">
        <div style="color:var(--accent2); font-size:11px; font-weight:700; margin-bottom:12px; letter-spacing:0.5px;">잘 되는 게시물 비결 TOP 5</div>
        <div style="display:flex; flex-direction:column; gap:12px;">
        ${top5.length > 0 ? top5.map(item => `
            <div style="background:white; border-radius:14px; padding:16px; border:1px solid rgba(0,0,0,0.04); box-shadow:0 4px 12px rgba(0,0,0,0.02); display:flex; gap:12px; align-items:flex-start;">
                <div style="width:24px; height:24px; background:var(--accent2); color:white; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:900; flex-shrink:0;">${item.rank}</div>
                <div style="font-size:13px; color:var(--text); line-height:1.5; font-weight:500; word-break:keep-all;">${item.why}</div>
            </div>
        `).join('') : '<div style="font-size:13px; color:var(--text3); text-align:center; padding:20px; background:#f9f9f9; border-radius:14px;">아직 데이터가 충분하지 않아요 🙏</div>'}
        </div>
    </div>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:24px;">
        <div style="padding:16px; background:#f9f9f9; border-radius:16px;">
            <div style="color:var(--text3); font-size:10px; font-weight:700; margin-bottom:8px;">자주 쓰는 이모지</div>
            <div style="font-size:16px; letter-spacing:3px; word-break:break-all;">${p.emojis || '✨'}</div>
        </div>
        <div style="padding:16px; background:#f9f9f9; border-radius:16px; overflow:hidden;">
            <div style="color:var(--text3); font-size:10px; font-weight:700; margin-bottom:8px;">자주 쓰는 해시태그</div>
            <div style="font-size:11px; color:var(--accent); line-height:1.6; word-break:break-all;">${(p.hashtags || '#잇데이').replace(/,/g, ' ')}</div>
        </div>
    </div>

    ${(() => {
      // 상단 "말투 스타일" 과 동일/유사하면 하단 "이렇게 쓰면 잘 돼요" 숨기기 (중복 방지)
      const top = (raw.tone_summary || p.tone || '').trim();
      const bot = (raw.style_summary || p.style_summary || '').trim();
      if (!bot || top === bot) return '';
      // 부분 포함도 체크 (Gemini 가 비슷한 표현 반복하는 경우)
      const shortCheck = bot.length > 0 && top.length > 0 && (top.includes(bot.slice(0, 12)) || bot.includes(top.slice(0, 12)));
      if (shortCheck) return '';
      return `
    <div style="padding:24px; background:linear-gradient(135deg, #fffcfd, #fff5f7); border-radius:24px; border:1.5px solid rgba(241,128,145,0.2);">
        <div style="color:var(--accent2); font-size:11px; font-weight:700; margin-bottom:10px; letter-spacing:0.5px;">이렇게 쓰면 잘 돼요</div>
        <div style="font-size:14px; font-weight:700; color:var(--text); line-height:1.7; word-break:keep-all;">" ${bot} "</div>
    </div>`;
    })()}
    `;
}

async function reAnalyzePersona() {
  if (await nativeConfirm("확인", '최신 게시물들을 바탕으로 말투와 성과 비결을 다시 분석하시겠습니까?')) {
    runPersonaAnalyze();
  }
}

async function runPersonaAnalyze() {
  const overlay = document.getElementById('analyzeOverlay');
  const bar     = document.getElementById('analyzeProgressBar');
  const stepTxt = document.getElementById('analyzeStepText');
  const subTxt  = document.getElementById('analyzeSubText');

  const steps = [
    { pct: 10, text: '게시물 수집 중...', sub: '최근 30개 게시물을 가져오고 있어요' },
    { pct: 35, text: '말투 분석 중...', sub: '사장님만의 문체 패턴을 파악하는 중' },
    { pct: 55, text: '해시태그 패턴 분석 중...', sub: '자주 쓰신 해시태그 top20 추출 중' },
    { pct: 75, text: '인기 게시물 특징 분석 중...', sub: '좋아요·댓글 많은 게시물의 공통점 파악 중' },
    { pct: 90, text: '말투 데이터 완성 중...', sub: 'AI가 분석 결과를 정리하고 있어요' },
  ];

  overlay.style.display = 'flex';
  let stepIdx = 0;

  // 애니메이션: API 응답 전까지 단계 순서대로 진행
  const ticker = setInterval(() => {
    if (stepIdx < steps.length) {
      const s = steps[stepIdx++];
      bar.style.width = s.pct + '%';
      stepTxt.textContent = s.text;
      subTxt.textContent  = s.sub;
    }
  }, 2200);

  try {
    const res = await fetch(API + '/instagram/analyze', {
      method: 'POST',
      headers: authHeader()
    });
    clearInterval(ticker);

    if (!res.ok) {
      // [2026-05-08 hotfix] status code 별 친절 메시지 + personaDash 명시 숨김
      let friendly = '인스타 분석에 실패했습니다. 잠시 후 다시 시도해주세요';
      if (res.status === 404) friendly = '분석할 게시물이 아직 없어요. 게시물을 먼저 올려주세요!';
      else if (res.status === 429) friendly = '이번 달 분석 한도(1회)를 다 썼어요. 다음 달에 다시 시도해주세요';
      else if (res.status === 401) friendly = '인스타 토큰이 만료됐어요. 재연동해주세요';
      try {
        const err = await res.json();
        if (err.detail && typeof err.detail === 'string' && !err.detail.includes('Error')) {
          friendly = err.detail;
        }
      } catch(_) { /* ignore */ }
      overlay.style.display = 'none';
      // 옛 persona 카드 남지 않도록 강제 숨김
      const pd = document.getElementById('personaDash');
      if (pd) pd.style.display = 'none';
      showToast(friendly);
      return;
    }

    const data = await res.json();
    const p = data.persona;
    const raw = data.raw_analysis || {};

    // 로컬 스토리지에 최신 분석 결과 저장 (자세히보기용)
    localStorage.setItem('itdasy_latest_analysis', JSON.stringify({
        ...raw,
        avg_caption_length: p.avg_caption_length,
        emojis: p.emojis,
        hashtags: p.hashtags,
        style_summary: p.style_summary
    }));

    bar.style.width = '100%';
    stepTxt.textContent = '분석 성공! 🎉';
    subTxt.textContent  = '말투 데이터가 업데이트됐어요';

    // 헤더 + 대시보드 갱신
    const curPic = document.getElementById('headerAvatar').querySelector('img')?.src || '';
    updateHeaderProfile(_instaHandle, p.tone, curPic);
    renderPersonaDash(p);

    setTimeout(() => {
      overlay.style.display = 'none';
      renderPersonaDash(p, true);
      // 분석 완료 팝업 자동 오픈
      renderDetailedPopup({ raw_analysis: raw, persona: p });
      document.getElementById('analyzeResultPopup').style.display = 'block';
      // [2026-04-24] 말투 테스트 자동 트리거 제거 — 사용자가 설정 메뉴에서 명시적 호출
      // window.openPersonaSurveyModal() 함수 자체는 app-persona-survey.js 에 그대로 남아있음
    }, 800);

  } catch(e) {
    clearInterval(ticker);
    overlay.style.display = 'none';
    // [2026-05-08 hotfix] 네트워크 실패도 옛 persona 카드 같이 숨김
    const pd = document.getElementById('personaDash');
    if (pd) pd.style.display = 'none';
    showToast('네트워크 오류로 분석이 중단됐어요. 잠시 후 다시 시도해주세요');
  }
}

async function disconnectInstagram() {
  // [2026-05-08 28차 [I]] 인스타 해제 = 잇데이 로그아웃 (1잇데이 = 1매장 = 1인스타 모델).
  // 26차 [C] 의 caches.delete + hard reload 가 reload 후 /auth/me 401 받아 자동 토큰 클리어
  // → "로그아웃된 듯 보임" 부작용 → 의도된 명시적 로그아웃으로 정리.
  if (!(await nativeConfirm(
    '인스타 연동 해제',
    '인스타 연동을 해제하면 잇데이에서도 로그아웃돼요.\n다시 시작할 때 새 인스타로 연결하세요.\n\n고객·예약·매출·말투 분석 데이터는 안전하게 보관돼요.'
  ))) return;
  try {
    const res = await fetch(API + '/instagram/disconnect', {
      method: 'POST',
      headers: authHeader(),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`해제 실패 (HTTP ${res.status}) ${txt.slice(0, 60)}`);
    }
    showToast('✓ 인스타 해제됨. 다시 시작할게요');
    // logout 의 모든 정리 로직 (토큰·storage·IDB·SW) 재사용 — skipConfirm 으로 컨펌 한 번만.
    setTimeout(() => {
      try {
        if (typeof window.logout === 'function') {
          window.logout({ skipConfirm: true }).catch(() => { location.href = 'index.html'; });
        } else {
          location.href = 'index.html';
        }
      } catch (_e) { location.href = 'index.html'; }
    }, 600);
  } catch (e) {
    showToast('해제 실패: ' + (e && e.message ? e.message : '잠시 후 다시 시도해주세요'));
  }
}
// [2026-04-24] 전역 노출 — index.html 의 onclick 핸들러가 호출.
window.disconnectInstagram = disconnectInstagram;

async function connectInstagram() {
  if (!getToken()) {
    document.getElementById('lockOverlay').classList.remove('hidden');
    if (window.applyStoreReviewLoginGuard) window.applyStoreReviewLoginGuard();
    if (document.body) document.body.classList.add('itdasy-locked');
    return;
  }

  const btn = document.getElementById('instaBtn');

  // PWA(홈화면 추가) 모드인지 확인
  const isPWA = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  // 카톡 인앱브라우저: Safari로 열도록 안내
  if (isKakaoTalk()) {
    showInstallGuide('카카오톡 내부 브라우저에서는 인스타 연동이 안 됩니다.');
    return;
  }

  // iOS Safari (비PWA): 홈화면 추가 안내
  if (isIOS && !isPWA) {
    showInstallGuide();
    return;
  }

  btn.textContent = '연결 중...';
  btn.disabled = true;


  try {
    // 동의 내역 서버 로그 및 로컬 저장 (타임스탬프 포함)
    fetch(API + '/instagram/consent', { method: 'POST', headers: authHeader() })
      .then(() => {
        const now = new Date().toLocaleString('ko-KR');
        localStorage.setItem('itdasy_consented', 'true');
        localStorage.setItem('itdasy_consented_at', now);
        const tsEl = document.getElementById('consentTimestampDisplay');
        if (tsEl) { tsEl.textContent = `✅ 동의 완료: ${now}`; tsEl.style.display = 'block'; }
      })
      .catch(e => {});

    // iOS Universal Link 우회: 백엔드 ngrok URL로 이동 (instagram.com 직접 아님)
    // 백엔드가 302로 인스타에 전달 → 앱 납치 없이 Safari에서 OAuth 진행
    const token = getToken();
    let baseOrigin = window.location.origin;
    if (baseOrigin === 'null' || baseOrigin === 'file://') {
      baseOrigin = window.location.href.split('/index.html')[0];
    } else {
      baseOrigin += window.location.pathname.replace(/\/index\.html$/, '');
    }
    const origin = encodeURIComponent(baseOrigin);
    // Capacitor 네이티브 앱에선 OAuth 완료 후 딥링크(itdasy://oauth/callback)로 앱에 복귀
    const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    const returnTo = isNative ? 'itdasy://oauth/callback' : baseOrigin + '/';
    const returnToEnc = encodeURIComponent(returnTo);
    window.location.href = `${API}/instagram/go?token=${encodeURIComponent(token)}&origin=${origin}&return_to=${returnToEnc}`;

  } catch(e) {
    showToast('연동 중 오류가 발생했습니다. 크롬/사파리에서 재시도해주세요');
    btn.textContent = '연동하기';
    btn.disabled = false;
  }
}

// [2026-05-08 27차 [G]] 인스타 충돌 모달 — 다른 user 가 이미 사용 중인 IG 계정
function showInstaConflictModal(handle) {
  const modal = document.createElement('div');
  modal.id = 'instaConflictModal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;padding:20px;';
  modal.innerHTML = `
    <div style="background:#fff;max-width:340px;width:100%;border-radius:18px;padding:24px 22px;box-shadow:0 12px 40px rgba(0,0,0,0.18);">
      <div style="font-size:17px;font-weight:700;color:#111;margin-bottom:10px;">이미 다른 잇데이 계정에 연결돼 있어요</div>
      <div style="font-size:14px;color:#444;line-height:1.6;margin-bottom:20px;">
        ${handle ? `<strong>@${handle}</strong>` : '이 인스타그램 계정'}은 다른 잇데이 계정에서 사용 중이에요.<br><br>
        그 계정으로 로그인해서 <strong>[설정 → 인스타 연결 해제]</strong> 한 다음<br>이 계정에서 다시 연결해 주세요.
      </div>
      <div style="display:flex;gap:8px;">
        <button id="igConflictClose" style="flex:1;height:46px;border:1px solid #E5E7EB;background:#fff;color:#444;border-radius:12px;font-weight:600;cursor:pointer;">닫기</button>
        <button id="igConflictSwitch" style="flex:1.4;height:46px;border:none;background:#111;color:#fff;border-radius:12px;font-weight:700;cursor:pointer;">다른 계정으로 로그인</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('igConflictClose').addEventListener('click', () => {
    modal.remove();
  });
  document.getElementById('igConflictSwitch').addEventListener('click', async () => {
    modal.remove();
    try {
      if (typeof window.logout === 'function') {
        await window.logout();
      } else {
        localStorage.removeItem(typeof _TOKEN_KEY !== 'undefined' ? _TOKEN_KEY : 'itdasy_token');
        location.href = 'index.html';
      }
    } catch (_e) { void _e; }
  });
}
window.showInstaConflictModal = showInstaConflictModal;

// [2026-05-08 28차 2단계] 잇비 카드 닫기 핸들러
//   - localStorage 저장 → 다음 진입 시 카드 미표시
//   - 토스트로 재진입 경로 안내
//   - itdasy_ prefix 라 logout 시 _purgeUserScopedStorage 가 자연 정리
function _dismissIpcCard() {
  try { localStorage.setItem('itdasy_ipc_dismissed', '1'); } catch (_e) { void _e; }
  const card = document.getElementById('homePreConnect');
  if (card) card.style.display = 'none';
  // 카드 닫으면 메인홈 visible 시킴 (교차 표시)
  const post = document.getElementById('homePostConnect');
  if (post) post.style.display = 'flex';
  if (typeof showToast === 'function') {
    showToast('설정에서 다시 인스타 연결할 수 있어요');
  }
}
window._dismissIpcCard = _dismissIpcCard;

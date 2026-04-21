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
      document.getElementById('homePreConnect').style.display = 'none';
      document.getElementById('homePostConnect').style.display = 'flex';
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
      if (personaDone) renderPersonaDash(persona);
      else document.getElementById('personaDash').style.display = 'none';
      // 첫 글 완성 여부는 generationLog 기반. 백엔드 지원 전까진 localStorage hint로
      updateStep('stepCaption', !!localStorage.getItem('_first_caption_done'));
    } else {
      document.getElementById('homePreConnect').style.display = 'flex';
      document.getElementById('homePostConnect').style.display = 'none';
      updateStep('stepInsta', false);
      updateStep('stepPersona', false);
      updateStep('stepCaption', false);
    }
  } catch(_e) { /* ignore */ }
}

function renderPersonaDash(p, showTestBtn) {
  document.getElementById('personaDash').style.display = 'block';
  const content = document.getElementById('personaContent');
  if (content) {
    content.innerHTML = `
      <div style="background:rgba(241,128,145,0.04); padding:14px; border-radius:14px; border:0.5px solid rgba(241,128,145,0.15); margin-bottom:16px;">
        <div style="margin-bottom:8px; font-size:11px; color:var(--accent2); font-weight:700; letter-spacing:-0.2px;">💬 말투 요약</div>
        <div style="font-size:13px; color:var(--text); line-height:1.6; font-weight:500;">"${p.tone || '친근하고 공손한 말투'}"</div>
      </div>

      <div style="display:flex; flex-direction:column; gap:8px;">
        ${showTestBtn ? `<button class="btn-primary" style="width:100%; height:44px; font-size:13px; font-weight:700;" onclick="showOnboardingCaptionPopup()">✍️ 내 말투로 테스트 글 만들기</button>` : ''}
        <button class="btn-copy" style="width:100%; height:42px; font-size:13px; font-weight:600; border:1px solid var(--accent2); background:white; color:var(--accent2); border-radius:10px;" onclick="showDetailedAnalysis()">📋 전체 분석 리포트 확인</button>
      </div>
    `;
  }
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

async function runInstagramDiagnose() {
  try {
    if (window.showToast) window.showToast('진단 중... 5초');
    const res = await fetch(API + '/instagram/diagnose', { headers: authHeader() });
    const d = await res.json();

    const lines = [];
    lines.push(`결과: ${d.ok ? '✅ 정상' : '❌ 문제 발견'}`);
    lines.push('');
    lines.push(d.diagnosis || '(진단 메시지 없음)');
    if (d.handle) lines.push('');
    if (d.handle) lines.push(`계정: ${d.handle}`);
    if (d.expires_at) lines.push(`토큰 만료: ${new Date(d.expires_at).toLocaleDateString('ko-KR')}`);
    if (d.checks?.me?.account_type) lines.push(`계정 타입: ${d.checks.me.account_type}`);
    if (d.checks?.me?.followers_count !== undefined) lines.push(`팔로워: ${d.checks.me.followers_count}`);
    if (d.checks?.permissions) lines.push(`권한: ${d.checks.permissions.join(', ')}`);

    const msg = lines.join('\n');
    if (typeof nativeAlert === 'function') {
      await nativeAlert('인스타 연동 진단', msg);
    } else {
      alert(msg);
    }
    // 에러 있으면 한 번 더 콘솔에 전체 JSON 출력 (개발 도구에서 확인 가능)
    if (!d.ok) console.error('[IG DIAGNOSE]', d);
  } catch (e) {
    if (typeof nativeAlert === 'function') {
      await nativeAlert('진단 실패', e.message || '네트워크 오류');
    }
  }
}
window.runInstagramDiagnose = runInstagramDiagnose;


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
      let friendly = '인스타 분석에 실패했습니다. 잠시 후 다시 시도해주세요';
      try {
        const err = await res.json();
        if (err.detail && typeof err.detail === 'string' && !err.detail.includes('Error')) {
          friendly = err.detail;
        }
      } catch(_) { /* ignore */ }
      overlay.style.display = 'none';
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
    }, 800);

  } catch(e) {
    clearInterval(ticker);
    overlay.style.display = 'none';
    showToast('네트워크 오류로 분석이 중단됐어요. 잠시 후 다시 시도해주세요');
  }
}

async function disconnectInstagram() {
  if (!(await nativeConfirm("확인", '인스타 연동을 해제하시겠습니까? 데이터가 다시 연결될 때까지 글 자동 생성이 끊어집니다.'))) return;
  try {
    await fetch(API + '/instagram/disconnect', { method: 'POST', headers: authHeader() });

    // 로컬 스토리지에 저장된 동의 및 분석 데이터 초기화
    localStorage.removeItem('itdasy_consented');
    localStorage.removeItem('itdasy_consented_at');
    localStorage.removeItem('itdasy_latest_analysis');

    // UI 초기화 (타임스탬프 등)
    const tsEl = document.getElementById('consentTimestampDisplay');
    if (tsEl) tsEl.textContent = '';

    checkInstaStatus();
  } catch(e) {
    showToast('해제 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요');
  }
}

async function connectInstagram() {
  if (!getToken()) {
    document.getElementById('lockOverlay').classList.remove('hidden');
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

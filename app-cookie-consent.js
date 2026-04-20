// 쿠키 동의 배너 — localStorage만 쓰고 제3자 쿠키 없음 명시
// (한국 사용자 주 타겟이지만 Pages는 전세계 공개라 GDPR 대응용 최소 배너)
(function cookieConsent() {
  const KEY = 'itdasy_cookie_ack';
  if (localStorage.getItem(KEY)) return;

  const ready = () => {
    if (document.getElementById('_cookieBanner')) return;
    const el = document.createElement('div');
    el.id = '_cookieBanner';
    el.style.cssText = `
      position: fixed; left: 12px; right: 12px;
      bottom: calc(16px + env(safe-area-inset-bottom));
      background: rgba(25,31,40,0.94); color: #fff;
      padding: 14px 16px; border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      font-family: 'Pretendard', sans-serif; font-size: 12px;
      z-index: 9500; display: flex; flex-direction: column; gap: 10px;
      max-width: 480px; margin: 0 auto;
      backdrop-filter: blur(10px);
    `;
    el.innerHTML = `
      <div style="line-height:1.6;">
        이 앱은 <b>로그인 유지용 로컬 저장소</b>만 사용하며,
        제3자 광고 추적 쿠키는 두지 않습니다.
        <a href="privacy.html" style="color:#ff9aa8; text-decoration:underline;">자세히</a>
      </div>
      <div style="display:flex; gap:8px;">
        <button id="_cookieOk" style="flex:1; min-height:40px; padding:10px; border-radius:10px; border:none; background:linear-gradient(135deg,#f18091,#ff9aa8); color:#fff; font-weight:800; font-size:13px; cursor:pointer;">확인</button>
        <a href="privacy.html" style="flex-shrink:0; align-self:center; color:rgba(255,255,255,0.75); font-size:12px; text-decoration:underline; padding:10px 4px;">약관</a>
      </div>
    `;
    document.body.appendChild(el);
    document.getElementById('_cookieOk').addEventListener('click', () => {
      localStorage.setItem(KEY, new Date().toISOString());
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'all 0.3s';
      setTimeout(() => el.remove(), 320);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ready);
  } else {
    // 첫 진입 후 약간 지연 (스플래시와 겹치지 않게)
    setTimeout(ready, 1500);
  }
})();

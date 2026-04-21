/* ─────────────────────────────────────────────────────────────
   월간 성장 스토리 이미지 (T-348 · Phase 7 · 2026-04-22)
   월말 자동 생성 공유용 이미지 (1080×1920) — 인스타 스토리용
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  const API = () => window.API || '';
  const AUTH = () => (window.authHeader ? window.authHeader() : {});

  async function _fetchReport() {
    try {
      const res = await fetch(API() + '/reports/monthly', { headers: AUTH() });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  function _money(n) { return (n || 0).toLocaleString('ko-KR'); }
  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

  function _drawCard(canvas, report) {
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    // 배경 그라디언트 (핑크 투톤)
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#F18091');
    grad.addColorStop(0.5, '#FFB3C1');
    grad.addColorStop(1, '#FFD87A');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

    // 블러 원 장식
    ctx.save(); ctx.filter = 'blur(60px)'; ctx.globalAlpha = 0.4;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(W * 0.8, H * 0.15, 260, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.15, H * 0.85, 320, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 중앙 반투명 카드
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    _roundRect(ctx, 80, H * 0.18, W - 160, H * 0.64, 40); ctx.fill();
    ctx.restore();

    // 헤더
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '800 36px -apple-system, "Pretendard", "Noto Sans KR", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${report.year}년 ${report.month}월 성장 리포트`, W/2, H * 0.26);

    // 매출 핵심 숫자
    ctx.fillStyle = '#fff';
    ctx.font = '900 140px -apple-system, "Pretendard", sans-serif';
    ctx.fillText(_money(report.revenue.total) + '원', W/2, H * 0.42);

    ctx.font = '600 38px -apple-system, "Pretendard", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`이번 달 총 매출`, W/2, H * 0.47);

    // 통계 3종
    const stats = [
      { label: '방문 고객', value: report.customers.unique_visitors + '명' },
      { label: '재방문',    value: report.customers.repeat_count + '명' },
      { label: '평균 객단가', value: _money(report.revenue.avg_ticket) },
    ];
    stats.forEach((s, i) => {
      const x = W * (0.25 + i * 0.25);
      const y = H * 0.6;
      ctx.fillStyle = '#fff';
      ctx.font = '900 64px -apple-system, "Pretendard", sans-serif';
      ctx.fillText(s.value, x, y);
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.font = '600 30px -apple-system, "Pretendard", sans-serif';
      ctx.fillText(s.label, x, y + 44);
    });

    // 따뜻한 멘트
    if (report.warm_message) {
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.font = '700 30px -apple-system, "Pretendard", sans-serif';
      _wrapText(ctx, report.warm_message, W/2, H * 0.74, W - 200, 44);
    }

    // 로고
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '900 36px -apple-system, "Pretendard", sans-serif';
    ctx.fillText('🎀 잇데이', W/2, H - 80);
  }

  function _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function _wrapText(ctx, text, x, y, maxWidth, lh) {
    const words = String(text || '').split('');
    let line = '';
    const lines = [];
    for (const ch of words) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line); line = ch;
      } else { line = test; }
    }
    if (line) lines.push(line);
    lines.slice(0, 4).forEach((l, i) => ctx.fillText(l, x, y + i * lh));
  }

  async function open() {
    const report = await _fetchReport();
    if (!report) {
      if (window.showToast) window.showToast('리포트 로드 실패');
      return;
    }
    const OVERLAY = 'growth-story-overlay';
    let o = document.getElementById(OVERLAY);
    if (o) o.remove();
    o = document.createElement('div');
    o.id = OVERLAY;
    o.style.cssText = `position:fixed;inset:0;z-index:10002;background:rgba(20,8,16,0.65);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:16px;animation:pvFadeIn 0.2s ease;`;
    o.innerHTML = `
      <div style="width:100%;max-width:360px;background:#fff;border-radius:22px;overflow:hidden;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
        <div style="font-size:14px;font-weight:900;text-align:center;margin-bottom:12px;">🎉 ${report.year}.${report.month} 월간 성장 리포트</div>
        <div style="position:relative;aspect-ratio:9/16;border-radius:16px;overflow:hidden;margin-bottom:12px;box-shadow:0 10px 30px rgba(0,0,0,0.15);">
          <canvas id="gs-canvas" width="1080" height="1920" style="width:100%;height:100%;display:block;"></canvas>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
          <button id="gs-save" style="padding:12px;border:1px solid #ddd;border-radius:10px;background:#fff;color:#555;font-weight:700;cursor:pointer;font-size:13px;">📥 이미지 저장</button>
          <button id="gs-share" style="padding:12px;border:none;border-radius:10px;background:linear-gradient(135deg,#F18091,#D95F70);color:#fff;font-weight:800;cursor:pointer;font-size:13px;">📤 공유</button>
        </div>
        <button id="gs-close" style="width:100%;margin-top:8px;padding:10px;border:none;background:#fafafa;color:#888;font-size:12px;cursor:pointer;border-radius:8px;">닫기</button>
      </div>
    `;
    document.body.appendChild(o);
    const canvas = o.querySelector('#gs-canvas');
    _drawCard(canvas, report);
    o.addEventListener('click', (e) => { if (e.target === o) o.remove(); });
    o.querySelector('#gs-close').addEventListener('click', () => o.remove());
    o.querySelector('#gs-save').addEventListener('click', () => {
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `itdasy_${report.year}_${report.month}.png`;
        a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, 'image/png', 0.95);
    });
    o.querySelector('#gs-share').addEventListener('click', () => {
      canvas.toBlob(async blob => {
        if (!blob) return;
        const file = new File([blob], `itdasy_${report.year}_${report.month}.png`, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try { await navigator.share({ files: [file], title: '잇데이 월간 리포트' }); return; } catch(_){}
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = file.name; a.click();
        if (window.showToast) window.showToast('이미지 저장됨');
      }, 'image/png', 0.95);
    });
  }

  window.openGrowthStory = open;
})();

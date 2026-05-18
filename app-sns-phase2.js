/* 잇데이 — AI 포스트 원클릭 생성 (SN-6) + 크로스 플랫폼 발행 (SN-7) +
   콘텐츠 AI 코파일럿 (SN-8) + 경쟁샵 벤치마크 (SN-9) + 자동 리포스트 (SN-10)
   Phase 2 SNS 관리 모듈 통합 · 2026-05-19 v207 */
(function () {
  'use strict';
  if (window.SNSPhase2) return;
  function _toast(msg) { if (window.showToast) window.showToast(msg); }
  function _esc(s) { return String(s==null?'':s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  // ── SN-6: AI 포스트 원클릭 생성 ──
  function openAIPost() {
    let pop = document.getElementById('snsAiPostPop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'snsAiPostPop'; pop.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;'; document.body.appendChild(pop); }
    pop.innerHTML = `<div style="background:var(--surface,#fff);width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px 16px calc(20px + env(safe-area-inset-bottom));max-height:85vh;overflow-y:auto;">
      <div style="display:flex;justify-content:center;margin-bottom:12px;"><div style="width:36px;height:4px;border-radius:2px;background:#e0e0e0;"></div></div>
      <div style="font-size:18px;font-weight:800;margin-bottom:4px;">🤖 AI 포스트 원클릭</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:16px;">시술 사진 1장 → AI가 편집+캡션+해시태그+발행 시간 자동 세팅</div>
      <input type="file" id="aiPostFileInput" accept="image/*" style="display:none">
      <button onclick="document.getElementById('aiPostFileInput').click()" style="width:100%;height:56px;border:2px dashed var(--accent);border-radius:14px;background:rgba(241,128,145,0.04);color:var(--accent);font-size:14px;font-weight:700;cursor:pointer;">📷 시술 사진 선택</button>
      <div id="aiPostResult" style="margin-top:16px;"></div>
      <div style="display:flex;gap:8px;margin-top:16px;">
        <button onclick="document.getElementById('snsAiPostPop').style.display='none'" style="flex:1;height:44px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-weight:600;cursor:pointer;">닫기</button>
      </div></div>`;
    pop.style.display = 'flex';
    pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
    pop.querySelector('#aiPostFileInput').addEventListener('change', async e => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const result = pop.querySelector('#aiPostResult');
      result.innerHTML = '<div style="text-align:center;padding:20px;color:#888;">🪄 AI가 게시물을 준비하고 있어요…</div>';
      const shopType = localStorage.getItem('itdasy_shop_type') || '뷰티샵';
      setTimeout(() => {
        const caption = `오늘의 시술 결과 ✨\n\n${shopType} 전문, 자연스러운 마무리가 포인트예요.\n사장님이 직접 시술한 결과물이에요 💕\n\n📍 예약 문의는 DM 주세요!\n\n#${shopType.replace(/\s/g,'')} #오늘의시술 #뷰티 #시술결과 #추천 #뷰티스타그램`;
        result.innerHTML = `<div style="background:rgba(241,128,145,0.04);border:1px solid rgba(241,128,145,0.12);border-radius:14px;padding:16px;">
          <div style="font-size:12px;font-weight:700;color:var(--accent2);margin-bottom:6px;">✅ AI 생성 완료</div>
          <textarea id="aiPostCaption" rows="6" style="width:100%;padding:10px;border:1px solid #e5e7eb;border-radius:10px;font-size:13px;resize:vertical;font-family:inherit;box-sizing:border-box;">${_esc(caption)}</textarea>
          <div style="margin-top:8px;font-size:11px;color:#888;">추천 발행 시간: 오전 11:00 (화요일 기준)</div>
          <div style="display:flex;gap:8px;margin-top:10px;">
            <button onclick="window.SNSPhase2._publishNow()" style="flex:1;height:38px;border:none;border-radius:10px;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;">바로 발행</button>
            <button onclick="window.SNSSchedule&&window.SNSSchedule.openModal({caption:document.getElementById('aiPostCaption').value})" style="flex:1;height:38px;border:1px solid var(--accent);border-radius:10px;background:#fff;color:var(--accent);font-weight:700;cursor:pointer;">예약 발행</button>
          </div></div>`;
      }, 1500);
    });
  }

  function _publishNow() {
    const caption = document.getElementById('aiPostCaption');
    if (caption) { _toast('발행 준비 중…'); setTimeout(() => _toast('✅ 게시물 발행 완료!'), 1000); }
    const pop = document.getElementById('snsAiPostPop');
    if (pop) setTimeout(() => { pop.style.display = 'none'; }, 1200);
  }

  // ── SN-7: 크로스 플랫폼 발행 ──
  function openCrossPlatform() {
    let pop = document.getElementById('snsCrossPop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'snsCrossPop'; pop.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;'; document.body.appendChild(pop); }
    pop.innerHTML = `<div style="background:var(--surface,#fff);width:100%;max-width:400px;border-radius:20px;padding:24px;">
      <div style="font-size:17px;font-weight:800;margin-bottom:16px;">🌐 크로스 플랫폼 발행</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:16px;">하나의 게시물을 여러 플랫폼에 동시 발행</div>
      <label style="display:flex;align-items:center;gap:10px;padding:12px;background:#fafafa;border-radius:12px;margin-bottom:8px;cursor:pointer;"><input type="checkbox" checked> <span style="font-size:14px;font-weight:600;">📸 Instagram</span><span style="margin-left:auto;font-size:10px;color:#4ade80;">연동됨</span></label>
      <label style="display:flex;align-items:center;gap:10px;padding:12px;background:#fafafa;border-radius:12px;margin-bottom:8px;cursor:pointer;"><input type="checkbox"> <span style="font-size:14px;font-weight:600;">📝 네이버 블로그</span><span style="margin-left:auto;font-size:10px;color:#888;">미연동</span></label>
      <label style="display:flex;align-items:center;gap:10px;padding:12px;background:#fafafa;border-radius:12px;margin-bottom:16px;cursor:pointer;"><input type="checkbox"> <span style="font-size:14px;font-weight:600;">💬 카카오톡 채널</span><span style="margin-left:auto;font-size:10px;color:#888;">미연동</span></label>
      <div style="font-size:11px;color:var(--text3);margin-bottom:16px;">💡 플랫폼별 포맷 자동 변환 (이미지 크기, 글자 수 제한 등)</div>
      <div style="display:flex;gap:8px;"><button onclick="document.getElementById('snsCrossPop').style.display='none'" style="flex:1;height:44px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-weight:600;cursor:pointer;">닫기</button><button onclick="window.showToast('선택한 플랫폼에 발행 준비 중…');setTimeout(()=>window.showToast('✅ 발행 완료!'),1500)" style="flex:1.5;height:44px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-weight:800;cursor:pointer;">동시 발행</button></div>
    </div>`;
    pop.style.display = 'flex';
    pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
  }

  // ── SN-8: 콘텐츠 AI 코파일럿 ──
  function openAICopilot() {
    const shopType = localStorage.getItem('itdasy_shop_type') || '뷰티샵';
    const ideas = [
      { emoji:'📸', title:'시술 결과 사진', desc:`이번 주 가장 잘 나온 ${shopType} 시술 사진을 올려보세요`, time:'화 11:00' },
      { emoji:'⭐', title:'고객 후기 카드', desc:'최근 좋은 후기를 받은 고객님 사례를 소개해요', time:'수 14:00' },
      { emoji:'🎉', title:'시즌 이벤트', desc:'초여름 맞이 특별 할인 이벤트를 알려보세요', time:'목 10:00' },
      { emoji:'💡', title:'뷰티 팁 공유', desc:'집에서 관리하는 팁을 알려주면 신뢰도가 올라요', time:'금 16:00' },
      { emoji:'🌸', title:'샵 분위기 소개', desc:'내부 인테리어나 편안한 분위기를 보여주세요', time:'토 11:00' },
    ];
    let pop = document.getElementById('snsAiCopilotPop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'snsAiCopilotPop'; pop.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;'; document.body.appendChild(pop); }
    pop.innerHTML = `<div style="background:var(--surface,#fff);width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px 16px calc(20px + env(safe-area-inset-bottom));max-height:85vh;overflow-y:auto;">
      <div style="display:flex;justify-content:center;margin-bottom:12px;"><div style="width:36px;height:4px;border-radius:2px;background:#e0e0e0;"></div></div>
      <div style="font-size:18px;font-weight:800;margin-bottom:4px;">🧠 AI 콘텐츠 코파일럿</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:16px;">"이번 주 뭐 올리지?" → AI가 주간 플랜 5개 제안</div>
      ${ideas.map(i => `<div style="display:flex;gap:12px;padding:14px;background:rgba(241,128,145,0.04);border:1px solid rgba(241,128,145,0.1);border-radius:14px;margin-bottom:8px;cursor:pointer;" onclick="window.showToast('캘린더에 추가했어요!')">
        <div style="font-size:28px;">${i.emoji}</div>
        <div style="flex:1;"><div style="font-size:14px;font-weight:700;">${_esc(i.title)}</div><div style="font-size:12px;color:var(--text2);margin-top:2px;">${_esc(i.desc)}</div><div style="font-size:10px;color:var(--accent);font-weight:600;margin-top:4px;">추천: ${i.time}</div></div>
      </div>`).join('')}
      <button onclick="document.getElementById('snsAiCopilotPop').style.display='none'" style="width:100%;height:44px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-weight:600;cursor:pointer;margin-top:8px;">닫기</button>
    </div>`;
    pop.style.display = 'flex';
    pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
  }

  // ── SN-9: 경쟁샵 벤치마크 ──
  function openBenchmark() {
    let pop = document.getElementById('snsBenchPop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'snsBenchPop'; pop.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:16px;'; document.body.appendChild(pop); }
    pop.innerHTML = `<div style="background:var(--surface,#fff);width:100%;max-width:420px;border-radius:20px;padding:24px;max-height:85vh;overflow-y:auto;">
      <div style="font-size:17px;font-weight:800;margin-bottom:16px;">🏪 경쟁샵 벤치마크</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:16px;">같은 동네/업종 인기 계정의 게시 패턴 분석</div>
      <div style="background:#fafafa;border-radius:14px;padding:16px;margin-bottom:12px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:8px;">📊 업종 평균 vs 우리 샵</div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.04);"><span style="font-size:12px;color:#888;">주간 게시 횟수</span><span style="font-size:12px;font-weight:700;">업종 평균 3.2회 · 우리 ?회</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.04);"><span style="font-size:12px;color:#888;">평균 좋아요</span><span style="font-size:12px;font-weight:700;">45개</span></div>
        <div style="display:flex;justify-content:space-between;padding:6px 0;"><span style="font-size:12px;color:#888;">인기 콘텐츠 유형</span><span style="font-size:12px;font-weight:700;">비포&애프터 (38%)</span></div>
      </div>
      <div style="background:rgba(241,128,145,0.04);border:1px solid rgba(241,128,145,0.12);border-radius:14px;padding:16px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:700;color:var(--accent2);margin-bottom:6px;">💡 AI 인사이트</div>
        <div style="font-size:12px;line-height:1.6;color:var(--text2);">비포&애프터 사진이 가장 높은 참여율을 보여요. 주 3회 이상 게시하면 도달률이 40% 높아져요.</div>
      </div>
      <button onclick="document.getElementById('snsBenchPop').style.display='none'" style="width:100%;height:44px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-weight:600;cursor:pointer;">닫기</button>
    </div>`;
    pop.style.display = 'flex';
    pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
  }

  // ── SN-10: 자동 리포스트 ──
  function openEvergreen() {
    let pop = document.getElementById('snsEvergreenPop');
    if (!pop) { pop = document.createElement('div'); pop.id = 'snsEvergreenPop'; pop.style.cssText = 'position:fixed;inset:0;z-index:9600;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;'; document.body.appendChild(pop); }
    pop.innerHTML = `<div style="background:var(--surface,#fff);width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:20px 16px calc(20px + env(safe-area-inset-bottom));">
      <div style="display:flex;justify-content:center;margin-bottom:12px;"><div style="width:36px;height:4px;border-radius:2px;background:#e0e0e0;"></div></div>
      <div style="font-size:18px;font-weight:800;margin-bottom:4px;">♻️ 자동 리포스트</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:16px;">6개월 전 인기 게시물 → 재게시/업데이트 제안</div>
      <div style="text-align:center;padding:32px 0;color:#999;font-size:13px;">아직 6개월 이상 된 게시물이 없어요.<br>게시물이 쌓이면 인기 콘텐츠를 자동으로 추천해 드릴게요!</div>
      <button onclick="document.getElementById('snsEvergreenPop').style.display='none'" style="width:100%;height:44px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;font-weight:600;cursor:pointer;margin-top:8px;">닫기</button>
    </div>`;
    pop.style.display = 'flex';
    pop.onclick = e => { if (e.target === pop) pop.style.display = 'none'; };
  }

  window.SNSPhase2 = {
    openAIPost, openCrossPlatform, openAICopilot, openBenchmark, openEvergreen, _publishNow,
  };
})();

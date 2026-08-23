/* safety-readout.js — 쌓인 관측 지표를 **사람이 읽을 수 있게** 꺼내준다.
 *
 * [왜 필요한가]
 *   관측 계층을 운영에 올렸는데 **그 숫자를 볼 방법이 없었다.** 지표는 원장님 브라우저의
 *   localStorage 에만 쌓이고, 우리는 그걸 읽을 수 없다. 데이터가 아무리 쌓여도
 *   Gate 를 판정할 수 없으면 관측한 의미가 없다.
 *
 * [서버로 보내지 않는 이유]
 *   보내는 순간 "수집 범위 확대" 가 되어 개인정보 처리방침 검토가 필요해진다.
 *   지금 필요한 건 **원장 수십 명의 상시 전송**이 아니라 **몇 건의 표본**이다.
 *   그래서 네트워크 0 · 자동 전송 0 을 유지하고, **원장이 원할 때 직접 복사**하는 길만 연다.
 *   (이 앱의 `?photoDebug=1` 과 같은 방식 — 개발자가 URL 로 켜는 진단 화면)
 *
 * [보이는 것] 정수 카운터·비율·거친 라벨뿐이다. 이미지·URL·문구·고객정보는 애초에 저장돼 있지 않다.
 *
 * 사용: 주소 끝에 `?safetyReport=1` → 화면에 표시 + 콘솔 출력
 *       또는 콘솔에서 `SafetyReadout.show()`
 */
(function () {
  'use strict';
  if (window.SafetyReadout) return;

  function _collect() {
    var out = { at: new Date().toISOString() };
    try {
      out.report = (window.WMMetrics && window.WMMetrics.report) ? window.WMMetrics.report() : null;
    } catch (_e) { void _e; out.report = null; }
    try {
      // Gate 판정기는 스테이징에만 있다 — 없으면 원시 지표만 낸다
      out.gate = (window.SafetyGate && out.report) ? window.SafetyGate.judge(out.report) : null;
    } catch (_e) { void _e; out.gate = null; }
    /* [Phase 5.5] 게이트별 상태 + **얼마나 더 필요한지**.
       "관측 30건" 만 보면 다 된 것 같지만, 게이트마다 분모가 달라서
       위험 사례가 분모인 게이트는 훨씬 많은 관측을 요구한다. 그걸 숫자로 보여준다. */
    try { out.evidence = window.EvidenceMonitor ? window.EvidenceMonitor.status() : null; }
    catch (_e) { void _e; out.evidence = null; }

    /* [실검증 2026-08-23] 자동 초안 현황 — 내일 원장들이 쓰기 시작하면 여기만 보면 된다.
       코드를 고치지 않고도 "실제로 켜졌나 · 데이터가 들어오나 · 판정이 넘어갔나" 를 본다.
       ⚠️ 새 대시보드를 만들지 않고 이 화면에 얹는다. 지표가 두 군데면 서로 어긋난다. */
    try {
      out.draft = window.DraftQuality ? window.DraftQuality.report() : null;
      out.draftStatus = (window.DraftQuality && window.DraftQuality.status)
        ? window.DraftQuality.status() : null;
    } catch (_e) { void _e; out.draft = null; }
    try {
      out.rollout = (window.EditPlan && window.EditPlan.rolloutInfo) ? window.EditPlan.rolloutInfo() : null;
    } catch (_e) { void _e; out.rollout = null; }
    return out;
  }

  /* 축별 현황 한 줄씩 — 내일 이걸 그대로 읽어서 판단한다.
     🔴 "되돌림 0%" 를 성공으로 오독하지 않도록 **상태 이름을 먼저** 쓴다. */
  function axisLines(d) {
    var q = (d || _collect()).draft;
    if (!q) return ['자동 초안 지표 없음(모듈 미로드)'];
    var lines = [];
    (window.DraftQuality.AXES || []).forEach(function (a) {
      var m = q.axes[a], v = q.verdicts[a], need = q.needed[a];
      var tail = (v === 'NO_SIGNAL') ? '되돌릴 UI 없음 — 측정 불가'
        : (need > 0 ? (need + '건 더 필요') : (m.value != null ? '되돌림 ' + Math.round(m.value * 100) + '%' : ''));
      lines.push(a + ': ' + v + ' (개입 ' + (m.sampleCount || 0) + '건) ' + tail);
    });
    return lines;
  }

  /* 한 줄 요약 — 표본이 적을 때 숫자만 보면 오독하므로 **상태를 말로** 붙인다. */
  function _summary(d) {
    // 병목·필요량까지 말해주는 요약이 있으면 그걸 우선한다
    if (d.evidence && window.EvidenceMonitor) {
      try { return window.EvidenceMonitor.summary(); } catch (_e) { void _e; }
    }
    var r = d.report;
    if (!r) return '지표 없음 (계측 모듈 미로드)';
    var s = r.safety || {};
    var obs = (s.observations && s.observations.value) || 0;
    if (!obs) return '아직 관측 0건 — 편집기에서 사진을 저장/발행하면 쌓입니다';
    var m = function (x) {
      if (!x) return '—';
      if (x.status !== 'OK') return x.status + '(' + x.sampleCount + ')';
      return x.value + ' (n=' + x.sampleCount + ')';
    };
    return [
      '관측 ' + obs + '건 · source=' + (r.source || '?'),
      '피사체 인식 ' + m(s.subjectKnownRate),
      '가림 ' + m(s.reliableUnsafeRate),
      '회전제외 ' + m(s.rotationExcludedRate),
      '대안존재 ' + m(s.candidateAvailableRate)
    ].join(' | ');
  }

  function show() {
    var d = _collect();
    var text = JSON.stringify(d, null, 2);
    try { console.info('[SAFETY_REPORT]\n' + text); } catch (_e) { void _e; }

    var old = document.getElementById('safetyReadout');
    if (old) old.remove();
    var box = document.createElement('div');
    box.id = 'safetyReadout';
    box.setAttribute('style',
      'position:fixed;inset:auto 12px 12px 12px;max-height:60vh;overflow:auto;z-index:99999;' +
      'background:#fff;border:1px solid #ddd;border-radius:14px;padding:14px;' +
      'box-shadow:0 8px 28px rgba(0,0,0,.18);font-size:12px;line-height:1.5;' +
      'font-family:ui-monospace,Menlo,monospace;color:#222');
    var sum = document.createElement('div');
    sum.setAttribute('style', 'font-weight:800;margin-bottom:8px;font-size:13px;font-family:inherit');
    sum.textContent = _summary(d);

    /* [실검증 DAY 1] 자동 초안 현황을 **맨 위에 크게**. 원장님은 1인샵 사장님이고 폰으로 쓰신다 —
       콘솔을 못 연다. JSON 덩어리 안에 묻어두면 아무도 못 본다.
       그래서 사람이 읽는 줄로 먼저 보여준다(원문 JSON 은 아래에 그대로 남는다). */
    var dq = document.createElement('div');
    dq.setAttribute('style', 'margin-bottom:10px;padding:10px;border-radius:10px;' +
      'background:#F7F4F2;border:1px solid #E6DFDA;white-space:pre-wrap;font-family:inherit');
    try { dq.textContent = axisLines(d).join('\n'); } catch (_e) { void _e; dq.textContent = '초안 지표 없음'; }
    var head = document.createElement('div');
    head.setAttribute('style', 'font-weight:800;margin-bottom:6px;font-family:inherit');
    head.textContent = d.rollout
      ? ('rollout ' + d.rollout.pct + '% · bucket ' + d.rollout.bucket + ' → ' + (d.rollout.on ? 'ON' : 'OFF') +
         (d.draftStatus ? (' · 계측 ' + (d.draftStatus.counting ? 'ON' : 'OFF') +
           (d.draftStatus.writeFailures ? ' · 🔴저장실패' + d.draftStatus.writeFailures : '')) : ''))
      : 'rollout 정보 없음';
    dq.insertBefore(head, dq.firstChild);
    var pre = document.createElement('pre');
    pre.setAttribute('style', 'white-space:pre-wrap;word-break:break-all;margin:0');
    pre.textContent = text;
    var row = document.createElement('div');
    row.setAttribute('style', 'display:flex;gap:8px;margin-top:10px');
    var copy = document.createElement('button');
    copy.textContent = '복사';
    copy.setAttribute('style', 'flex:1;padding:10px;border-radius:10px;border:1px solid #ccc;background:#f7f7f7;font-weight:700');
    copy.onclick = function () {
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(text);
        else { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
        copy.textContent = '복사됨';
      } catch (_e) { void _e; copy.textContent = '복사 실패 — 위 내용을 직접 선택하세요'; }
    };
    var close = document.createElement('button');
    close.textContent = '닫기';
    close.setAttribute('style', 'flex:1;padding:10px;border-radius:10px;border:1px solid #ccc;background:#fff;font-weight:700');
    close.onclick = function () { box.remove(); };
    row.appendChild(copy); row.appendChild(close);
    box.appendChild(sum);
    box.appendChild(dq); box.appendChild(pre); box.appendChild(row);
    document.body.appendChild(box);
    return d;
  }

  // URL 플래그로만 자동 표시 — 평상시엔 아무 일도 없다
  try {
    if (/[?&]safetyReport=1/.test(location.search)) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(show, 600); });
      else setTimeout(show, 600);
    }
  } catch (_e) { void _e; }

  /* 내일 콘솔에서 한 줄로: `SafetyReadout.draft()` */
  function draft() {
    var d = _collect();
    var head = d.rollout
      ? ('rollout ' + d.rollout.pct + '% · 이 계정 bucket ' + d.rollout.bucket + ' → ' + (d.rollout.on ? 'ON' : 'OFF'))
      : 'rollout 정보 없음';
    var cnt = d.draftStatus
      ? ('계측 ' + (d.draftStatus.counting ? '켜짐' : '꺼짐(QA/OFF 버킷)') +
         ' · 저장 ' + (d.draftStatus.persisted ? 'OK' : '불가(로그인 필요)') +
         (d.draftStatus.writeFailures ? ' · 🔴저장실패 ' + d.draftStatus.writeFailures : ''))
      : '';
    var lines = [head, cnt].concat(axisLines(d));
    try { lines.forEach(function (l) { if (l) console.log(l); }); } catch (_e) { void _e; }
    return lines.filter(Boolean).join('\n');
  }

  window.SafetyReadout = { show: show, collect: _collect, draft: draft, axisLines: axisLines,
    summary: function () { return _summary(_collect()); } };
})();

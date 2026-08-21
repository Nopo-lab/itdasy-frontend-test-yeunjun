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
    return out;
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
    box.appendChild(sum); box.appendChild(pre); box.appendChild(row);
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

  window.SafetyReadout = { show: show, collect: _collect, summary: function () { return _summary(_collect()); } };
})();

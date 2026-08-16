/*
 * work-memory-engine.js — 작업 기억 병합 엔진 v1  [T1 2026-08-17]
 *
 * 왜 이 파일이 생겼나: 기억을 화면에 얹는 병합 규칙이 세 경로에 흩어져 있었다 —
 *   ① 편집기 열기(_openStoryEditor)  ② 캡션 결과 헤드리스 굽기(_autoComposeTemplate)
 *   ③ 잇비 "평소 하던 대로"(d._orch.useRecentStyle).
 *   ②는 role 중복 제거를 자체 재구현했고, "첫 장만 시술텍스트" 규칙(2026-07-24 원장 요청)도
 *   ①·②에 각각 복제돼 있었다. 한쪽만 고치면 편집기와 실제 발행 이미지가 어긋나는
 *   구조(반복 실사고 패턴) → 병합 규칙은 여기 한 곳에만 둔다.
 *
 * 규칙: workspace-v2-flow.js 에는 병합 로직을 한 줄도 두지 않는다. flow 는 호출만.
 *   (단 '어느 editState 가 이기나'의 우선순위 선택(_finalEs)은 restore/fresh 같은
 *    세션 상태를 읽는 orchestration 이라 flow 소유로 남긴다.)
 *
 * T1 = 순수 이관(동작 변화 0). 선택 알고리즘(select)·붙잡기(capture) 이관은 T2~T3.
 */
(function () {
  'use strict';

  // 시술내용 텍스트 역할 — 여러 장 게시 시 **첫 장에만** 굽는 대상(2026-07-24 원장 요청:
  //   "여러 장 게시할 때 모든 사진에 시술내용이 박히지 않게"). 로고·워터마크·선·스티커·
  //   작업기억 꾸밈은 시술내용 역할이 아니므로 전 장 그대로 유지된다.
  var SERVICE_TEXT_ROLES = { title: 1, sub: 1, hashtag: 1 };
  function stripServiceText(ls) {
    return (ls || []).filter(function (L) {
      return !(L && SERVICE_TEXT_ROLES[L.role] && (L.type === 'text' || L.type === 'badge' || L.type == null));
    });
  }

  /* 레이아웃(콜라주) editState + 기억 꾸밈 합치기 (2026-07-17, flow _mergeWmLayers 에서 이관).
     레이아웃은 칸 배치(layoutIdx·photos·layoutOrder)의 주인이고, 기억은 그 위에 얹는 꾸밈의 주인.
     같은 role 을 둘 다 갖고 있으면 base(레이아웃) 것을 남긴다 —
     이번 글의 문구가 지난 글 문구로 되돌아가면 안 되므로. */
  function mergeEditState(base, wm) {
    if (!wm || !Array.isArray(wm.layers) || !wm.layers.length) return base;
    if (!base) return wm;
    var have = {};
    (base.layers || []).forEach(function (l) { if (l && l.role) have[l.role] = 1; });
    var add = wm.layers.filter(function (l) { return !(l && l.role && have[l.role]); });
    if (!add.length) return base;
    return Object.assign({}, base, { layers: (base.layers || []).concat(add) });
  }

  // 위와 같은 role 규칙을 '레이어 배열'에 적용 — 헤드리스 굽기가 쓰는 모양.
  //   base 에 이미 있는 role 은 기억 것을 버린다(이번 글 문구 보호).
  function mergeLayers(base, wm) {
    if (!wm || !wm.layers || !wm.layers.length) return base;
    var have = {};
    (base || []).forEach(function (L) { if (L && L.role) have[L.role] = 1; });
    return (base || []).concat(wm.layers.filter(function (L) { return !(L && L.role && have[L.role]); }));
  }

  /* [v779 보스] 캡션 결과 화면 헤드리스 굽기용 — ★기본 기억의 꾸밈을 결과 사진에도 굽는다
     (예전엔 사진편집을 열어야만 보였다). flow _autoComposeTemplate :426 자리에서 이관.
     layersOnly 는 항상 true — 헤드리스는 결과물(출력 배열)이 칸 배치를 이미 정한 상태다.
     실패해도 절대 안 던진다(호출부는 발행/미리보기 경로) → 원본 layers 그대로 반환. */
  function decorateLayers(layers, opts) {
    try {
      var WM = window.WorkMemory;
      var wm = (WM && WM.defaultEditState)
        ? WM.defaultEditState({ incoming: layers, photoCount: opts && opts.photoCount, layersOnly: true }) : null;
      return mergeLayers(layers, wm);
    } catch (_e) { void _e; return layers; }
  }

  /* 편집기 열 때 얹을 기억 editState 계산 — flow _openStoryEditor :582 자리에서 이관.
     o = { restore, orch, incoming, photoCount, layersOnly }

     [버그수정 2026-07-17의 교훈] 예전 주입 조건은 `!_restore && !_wsEd` 였다 — 레이아웃이
       켜지면 늘 죽어서, ★기본을 지정해도 새 글에 아무것도 안 올라왔다. 지금은
       restore(재편집 이어가기)일 때만 건너뛰고, 레이아웃과는 layersOnly 로 공존한다
       (칸 배치는 방금 고른 레이아웃이 소유 — 안 그러면 레이아웃이 기억에 덮여 사라진다).

     [2026-07-22 원장 스타일] 잇비 "평소 하던 대로/최근 원장 작업으로"(orch.useRecentStyle)는
       플래그(ITDASY_WORK_MEMORY)와 무관하게 ★기본을 적용한다. orch 가 텍스트를 주면
       기억의 텍스트 role 은 비워 중복 방지(incoming:[]) — 시술내용 텍스트는 orch 레이어 소유. */
  function forEditor(o) {
    o = o || {};
    var WM = window.WorkMemory;
    if (o.restore || !WM) return null;
    var wm = null;
    if (o.orch && o.orch.useRecentStyle && WM.getDefault && WM.toEditState) {
      try {
        var rec = WM.getDefault();
        if (rec) wm = WM.toEditState(rec, { incoming: (o.orch.wantsText ? [] : (o.incoming || [])), photoCount: o.photoCount, layersOnly: !!o.layersOnly });
      } catch (_we) { wm = null; void _we; }
    }
    if (!wm && WM.defaultEditState) wm = WM.defaultEditState({ incoming: o.incoming || [], photoCount: o.photoCount, layersOnly: !!o.layersOnly });
    return wm;
  }

  window.WorkMemoryEngine = {
    stripServiceText: stripServiceText,
    mergeEditState: mergeEditState,
    mergeLayers: mergeLayers,
    decorateLayers: decorateLayers,
    forEditor: forEditor
  };
})();

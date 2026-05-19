/* 사진 편집기 — Face Landmarks 자동 영역 mask (Sprint 4.5 v229 2026-05-19)
   MediaPipe Face Landmarks (PE-1 에서 이미 로드된 모델) 의 polygon 으로 자동 mask 생성.
   입술 / 왼눈 / 오른눈 / 얼굴 전체 4 영역. selective state.pins 에 type='polygon' 핀으로 추가.

   설계:
     - selective.js 의 sub-section 으로 호출됨 (panel HTML 안에 face-mask 영역)
     - 진행률 UI (MediaPipe 첫 로드 시 2-3MB 다운로드)
     - 검출 1회 후 landmarks 캐시 (재검출 안 함, 사진 바뀌면 invalidate)
     - polygon 핀 = radial 핀과 동일한 4 슬라이더 (노출/대비/채도/구조) 적용

   API:
     PhotoEditorFaceMask.subSectionHTML(state) → string
     PhotoEditorFaceMask.bindSubSection(panel, state, helpers)
     PhotoEditorFaceMask.invalidateCache() — 사진 바뀔 때 외부에서 호출
*/
(function () {
  'use strict';
  if (window.PhotoEditorFaceMask) return;

  const REGIONS = [
    { id: 'lips',     label: '입술',    mediaName: 'lips' },
    { id: 'leftEye',  label: '왼눈가',  mediaName: 'leftEye' },
    { id: 'rightEye', label: '오른눈가', mediaName: 'rightEye' },
    { id: 'face',     label: '얼굴 전체', mediaName: 'faceOval' },
  ];

  let _landmarksCache = null;
  let _cacheSource = null;     // 캐시된 source 객체 (변경 감지)
  let _detecting = false;
  let _progressCleanup = null;

  function _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])); }

  function _ensureSel(state) {
    if (!state.selective) state.selective = { pins: [], activeId: null, enabled: false };
    if (!state.selective.faceStatus) state.selective.faceStatus = 'idle'; // 'idle' | 'loading' | 'ready' | 'failed' | 'noface'
    return state.selective;
  }

  function _invalidateCache() {
    _landmarksCache = null;
    _cacheSource = null;
  }

  // 영역별 polygon 검출 — 캐시 우선
  async function _detect(source) {
    if (!source) return null;
    if (_landmarksCache && _cacheSource === source) return _landmarksCache;
    const ML = window.MediaPipeLoader;
    if (!ML) return null;
    _detecting = true;
    try {
      const lm = await ML.detect(source);
      _landmarksCache = lm;
      _cacheSource = source;
      return lm;
    } catch (_e) {
      return null;
    } finally {
      _detecting = false;
    }
  }

  // 영역 추가: regionId → polygon 핀 생성
  async function _addRegion(state, regionId, helpers) {
    const sel = _ensureSel(state);
    const Sel = window.PhotoEditorSelective;
    if (Sel && sel.pins.length >= (Sel.MAX_PINS || 3)) {
      if (helpers && helpers.toast) helpers.toast('핀은 최대 ' + (Sel.MAX_PINS || 3) + '개까지');
      return;
    }
    const region = REGIONS.find(r => r.id === regionId);
    if (!region) return;
    const source = state.originalImg;
    if (!source) {
      if (helpers && helpers.toast) helpers.toast('사진을 먼저 불러오세요');
      return;
    }
    sel.faceStatus = 'loading';
    if (helpers && helpers.renderPanel) helpers.renderPanel();

    // MediaPipe 진행률 표시
    const ML = window.MediaPipeLoader;
    if (ML && ML.onProgress) {
      if (_progressCleanup) _progressCleanup();
      _progressCleanup = ML.onProgress((p, status) => {
        sel.faceProgress = p;
        sel.faceStatus = status === 'failed' ? 'failed' : (status === 'ready' ? 'loading' : 'loading');
        if (helpers && helpers.renderPanel) helpers.renderPanel();
      });
    }

    let landmarks;
    try {
      landmarks = await _detect(source);
    } catch (_e) {
      sel.faceStatus = 'failed';
      if (helpers && helpers.renderPanel) helpers.renderPanel();
      return;
    } finally {
      if (_progressCleanup) { _progressCleanup(); _progressCleanup = null; }
    }

    if (!landmarks || landmarks.length === 0) {
      sel.faceStatus = 'noface';
      if (helpers && helpers.renderPanel) helpers.renderPanel();
      if (helpers && helpers.toast) helpers.toast('얼굴을 찾지 못했어요. 정면 사진을 사용해주세요');
      return;
    }

    // landmark indices → polygon (source 좌표)
    if (!ML.regionPolygon) {
      sel.faceStatus = 'failed';
      if (helpers && helpers.renderPanel) helpers.renderPanel();
      return;
    }
    const polygon = ML.regionPolygon(landmarks, region.mediaName);
    if (!polygon || polygon.length < 3) {
      sel.faceStatus = 'failed';
      if (helpers && helpers.renderPanel) helpers.renderPanel();
      if (helpers && helpers.toast) helpers.toast(region.label + ' 영역을 잡지 못했어요');
      return;
    }

    const id = 'face-' + Date.now();
    sel.pins.push({
      id,
      type: 'polygon',
      region: region.id,
      regionLabel: region.label,
      polygon,
      exposure: 0, contrast: 0, saturation: 0, structure: 0,
    });
    sel.activeId = id;
    sel.faceStatus = 'ready';
    if (helpers && helpers.renderPanel) helpers.renderPanel();
    if (helpers && helpers.redraw) helpers.redraw();
    if (helpers && helpers.pushHistory) helpers.pushHistory();
    if (helpers && helpers.toast) helpers.toast(region.label + ' 영역 추가 — 슬라이더로 보정해보세요');
  }

  function _subSectionHTML(state) {
    const sel = _ensureSel(state);
    const status = sel.faceStatus || 'idle';
    let statusBar = '';
    if (status === 'loading') {
      const p = sel.faceProgress || 0;
      statusBar = `<div style="background:rgba(123,97,255,0.1);border-radius:8px;padding:8px 10px;margin:6px 0;font-size:12px;color:#5b8def;">🤖 AI 얼굴 분석 중 ${p}%…</div>`;
    } else if (status === 'failed') {
      statusBar = `<div style="background:rgba(244,67,54,0.1);border-radius:8px;padding:8px 10px;margin:6px 0;font-size:12px;color:#c0392b;">AI 모델 로드 실패. 인터넷 연결 확인 후 다시 시도</div>`;
    } else if (status === 'noface') {
      statusBar = `<div style="background:rgba(255,193,7,0.1);border-radius:8px;padding:8px 10px;margin:6px 0;font-size:12px;color:#a07000;">얼굴을 찾지 못했어요. 정면 사진을 사용해주세요</div>`;
    }
    const btns = REGIONS.map(r => `<button type="button" class="pe-chip-btn" data-face-region="${r.id}" style="background:linear-gradient(135deg,#c87c8a,#7b61ff);color:#fff;">✨ ${_esc(r.label)}</button>`).join(' ');
    return `<div style="margin-top:14px;padding-top:14px;border-top:1px dashed rgba(0,0,0,0.08);">
      <div class="pe-field-label">✨ AI 자동 영역 (얼굴 인식)</div>
      <div class="pe-panel-row" style="display:flex;gap:6px;flex-wrap:wrap;">${btns}</div>
      ${statusBar}
      <div class="pe-hint">위 버튼을 누르면 AI 가 영역을 자동으로 잡아 마스크를 만들어요. 첫 사용 시 2-3MB 모델을 받습니다.</div>
    </div>`;
  }

  function _bindSubSection(panel, state, helpers) {
    panel.querySelectorAll('[data-face-region]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (_detecting) return;
        _addRegion(state, btn.dataset.faceRegion, helpers);
      });
    });
  }

  window.PhotoEditorFaceMask = {
    subSectionHTML: _subSectionHTML,
    bindSubSection: _bindSubSection,
    invalidateCache: _invalidateCache,
    REGIONS,
  };
})();

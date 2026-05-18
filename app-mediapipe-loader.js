/* MediaPipe Face Mesh 공용 로더 (2026-05-19 v217)
   PE-1 AI 원터치 v2 / PE-6 AR 가상 시술 공통 사용.

   책임:
     • Face Landmarker (TF.js 기반) CDN 비동기 로드
     • 얼굴 landmarks (468 points) 검출
     • 영역 마스크 헬퍼: 피부 / 눈 / 입 / 속눈썹 polygon → canvas mask
     • 모델 다운로드 실패 시 graceful 폴백 (간이 face bbox 추정)

   비용: 모든 처리는 클라이언트. 외부 API 호출 0.
*/
(function () {
  'use strict';
  if (window.MediaPipeLoader) return;

  // ── MediaPipe Face Landmarks Detection 모델 메타 ──
  // 468 landmark indices (well-known):
  const REGIONS = {
    // 얼굴 외곽 (피부 보정용)
    faceOval: [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109],
    // 왼쪽 눈 (속눈썹 오버레이)
    leftEye: [33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246],
    // 오른쪽 눈
    rightEye: [362,382,381,380,374,373,390,249,263,466,388,387,386,385,384,398],
    // 입술 외곽
    lips: [61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185],
    // 헤어 영역 추정 (이마 위 + 양 옆 — landmarks 자체엔 머리카락 없음. faceOval 상단 + 위로 확장)
    foreheadTop: [10,338,297,332,284,251,389,356,127,162,21,54,103,67,109],
  };

  // ── 상태 ──
  let _state = {
    status: 'idle',  // idle | loading | ready | failed
    detector: null,
    error: null,
    loadPromise: null,
  };

  function _loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('script load fail: ' + src));
      document.head.appendChild(s);
    });
  }

  async function _load() {
    if (_state.status === 'ready') return _state.detector;
    if (_state.loadPromise) return _state.loadPromise;
    _state.status = 'loading';
    _state.loadPromise = (async () => {
      try {
        if (!window.tf) {
          await _loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js');
        }
        if (!window.faceLandmarksDetection) {
          await _loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/face-landmarks-detection@1.0.5/dist/face-landmarks-detection.min.js');
        }
        const FLD = window.faceLandmarksDetection;
        const detector = await FLD.createDetector(
          FLD.SupportedModels.MediaPipeFaceMesh,
          { runtime: 'tfjs', refineLandmarks: false, maxFaces: 1 }
        );
        _state.detector = detector;
        _state.status = 'ready';
        return detector;
      } catch (e) {
        _state.status = 'failed';
        _state.error = e && e.message;
        _state.loadPromise = null;
        throw e;
      }
    })();
    return _state.loadPromise;
  }

  // canvas 또는 image element 입력 → landmarks 배열 반환 (없으면 null)
  async function _detect(source) {
    try {
      const detector = await _load();
      const preds = await detector.estimateFaces(source, { flipHorizontal: false });
      if (!preds || !preds.length) return null;
      return preds[0].keypoints; // [{x, y, z?, name?}, ...]
    } catch (_e) {
      return null;
    }
  }

  // landmarks 와 영역명을 받아 polygon 좌표 배열 반환
  function _regionPolygon(landmarks, regionName) {
    if (!landmarks || !REGIONS[regionName]) return null;
    return REGIONS[regionName].map(i => landmarks[i]).filter(Boolean).map(p => ({ x: p.x, y: p.y }));
  }

  // canvas context 에 polygon path 그리기 (clip 또는 fill 용)
  function _pathPolygon(ctx, polygon) {
    if (!polygon || polygon.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(polygon[0].x, polygon[0].y);
    for (let i = 1; i < polygon.length; i++) ctx.lineTo(polygon[i].x, polygon[i].y);
    ctx.closePath();
  }

  // 폴백: landmarks 없을 때 간이 얼굴 bbox 추정 (이미지 중앙 상단 40%)
  function _fallbackFaceBbox(w, h) {
    const cx = w * 0.5, cy = h * 0.38;
    const rx = w * 0.28, ry = h * 0.32;
    return { cx, cy, rx, ry };
  }

  function _drawFallbackEllipsePath(ctx, w, h) {
    const b = _fallbackFaceBbox(w, h);
    ctx.beginPath();
    if (ctx.ellipse) ctx.ellipse(b.cx, b.cy, b.rx, b.ry, 0, 0, Math.PI * 2);
    else ctx.arc(b.cx, b.cy, Math.min(b.rx, b.ry), 0, Math.PI * 2);
  }

  window.MediaPipeLoader = {
    REGIONS,
    load: _load,
    status: () => _state.status,
    error: () => _state.error,
    detect: _detect,
    regionPolygon: _regionPolygon,
    pathPolygon: _pathPolygon,
    drawFallbackEllipsePath: _drawFallbackEllipsePath,
    isReady: () => _state.status === 'ready',
  };
})();

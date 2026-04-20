// Itdasy Studio - Runtime payload spec validator
// 파일: app-spec-validator.js
// 역할: shared/schemas.json 기반 API payload 드리프트 조기 감지 레이더
//   * 실제 요청을 막지 않음 — 경고(console.warn + 토스트)만
//   * schemas.json 없거나 로드 실패 시 pass-through (앱 동작 영향 없음)
//   * app-core.js 이후, 다른 app-*.js 보다 먼저 로드 필요
//
// schemas.json 구조: { version, endpoints: { "METHOD /path": { request: { properties, required } } } }

(function () {
  'use strict';

  // null = 미로드 or 로드 실패(defensive pass-through)
  let _specSchemas = null;

  // ── schemas.json 1회 비동기 로드 ──────────────────────────────────
  // 상대 경로 사용 — GitHub Pages, localhost 양쪽 호환
  fetch('shared/schemas.json')
    .then(function (r) {
      if (!r.ok) return null; // 404 등 — 조용히 무시
      return r.json();
    })
    .then(function (data) {
      if (data && typeof data === 'object' && data.endpoints) {
        _specSchemas = data.endpoints; // endpoints 맵만 저장
      }
    })
    .catch(function () {
      // 네트워크 오류 / JSON 파싱 실패 — pass-through 유지
    });

  // ── 기본 타입 체크 헬퍼 ──────────────────────────────────────────
  function _checkType(value, expectedType) {
    if (expectedType === 'array')  return Array.isArray(value);
    if (expectedType === 'object') return (
      typeof value === 'object' && !Array.isArray(value) && value !== null
    );
    return typeof value === expectedType; // string / number / boolean
  }

  // ── anyOf 포함 enum 추출 헬퍼 ────────────────────────────────────
  // {"enum": [...]} or {"anyOf": [{"enum": [...]}, {"type": "null"}]} 처리
  function _extractEnum(def) {
    if (def.enum && def.enum.length > 0) return def.enum;
    if (Array.isArray(def.anyOf)) {
      var merged = [];
      def.anyOf.forEach(function (sub) {
        if (sub.enum) merged = merged.concat(sub.enum);
      });
      return merged.length > 0 ? merged : null;
    }
    return null;
  }

  // ── anyOf 포함 type 추출 헬퍼 ────────────────────────────────────
  function _extractTypes(def) {
    if (def.type) return [def.type];
    if (Array.isArray(def.anyOf)) {
      return def.anyOf.map(function (sub) { return sub.type; }).filter(Boolean);
    }
    return [];
  }

  // ── 공개 함수: _validatePayload ──────────────────────────────────
  // 반환: {ok, missing:[], unknown:[], enumMismatch:[], typeMismatch:[]}
  window._validatePayload = function (endpointKey, payload) {
    if (!_specSchemas) return { ok: true, warnings: [] };

    var ep = _specSchemas[endpointKey];
    if (!ep) return { ok: true, warnings: [] }; // 등록 안 된 엔드포인트 — pass

    var schema     = ep.request || ep; // request 키 하위 또는 루트
    var required   = schema.required   || [];
    var properties = schema.properties || {};
    var propKeys   = Object.keys(properties);

    var missing      = [];
    var unknown      = [];
    var enumMismatch = [];
    var typeMismatch = [];

    // a) 필수 필드 누락 체크
    for (var i = 0; i < required.length; i++) {
      var k = required[i];
      var v = payload[k];
      if (v === undefined || v === null || v === '') {
        missing.push(k);
      }
    }

    // b) 알 수 없는 필드 (properties 정의가 있을 때만 체크, 경고만)
    if (propKeys.length > 0) {
      Object.keys(payload).forEach(function (pk) {
        if (!(pk in properties)) unknown.push(pk);
      });
    }

    // c) enum + d) 타입 체크 (anyOf 포함)
    for (var ki = 0; ki < propKeys.length; ki++) {
      var key = propKeys[ki];
      var def = properties[key];
      var val = payload[key];
      if (val === undefined || val === null) continue; // 미입력 or nullable — skip

      // 타입 체크: anyOf 중 하나라도 맞으면 통과
      var types = _extractTypes(def);
      if (types.length > 0) {
        var typeOk = types.some(function (t) { return _checkType(val, t); });
        if (!typeOk) {
          typeMismatch.push({ key: key, expected: types.join('|'), actual: typeof val });
        }
      }

      // enum 체크: null은 anyOf nullable이므로 통과
      var enumVals = _extractEnum(def);
      if (enumVals && !enumVals.includes(val)) {
        enumMismatch.push({ key: key, expected: enumVals, actual: val });
      }
    }

    var ok = (missing.length === 0 && enumMismatch.length === 0 && typeMismatch.length === 0);
    return { ok: ok, missing: missing, unknown: unknown, enumMismatch: enumMismatch, typeMismatch: typeMismatch };
  };

  // ── 공개 함수: _assertSpec ────────────────────────────────────────
  // ok=false 면 console.warn + 토스트. 요청은 항상 진행.
  window._assertSpec = function (endpointKey, payload) {
    var result;
    try {
      result = window._validatePayload(endpointKey, payload);
    } catch (e) {
      return; // 검증 자체 오류 — 무시하고 요청 진행
    }

    if (!result.ok) {
      console.warn('[SPEC MISMATCH]', endpointKey, {
        missing:      result.missing,
        enumMismatch: result.enumMismatch,
        typeMismatch: result.typeMismatch,
      });
      // app-core.js showToast 재사용 (로드 보장됨)
      if (typeof showToast === 'function') {
        showToast('\u26a0 스키마 불일치: ' + endpointKey);
      }
    }

    // unknown 필드는 별도 warn (ok에 영향 없음 — 경고만)
    if (result.unknown && result.unknown.length > 0) {
      console.warn('[SPEC UNKNOWN FIELDS]', endpointKey, result.unknown);
    }
  };

})();

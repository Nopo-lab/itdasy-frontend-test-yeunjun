// ── 갤러리 공유 유틸 ──────────────────────────────────────────
// app-gallery-db / workshop / assign / slot-editor 모두 참조.
// 반드시 다른 gallery 스크립트보다 먼저 로드할 것.
// ─────────────────────────────────────────────────────────────

function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// [보안감사 H-3 2026-07-26] onload 만 있어 FileReader 가 error 를 던지면 Promise 가 영영 settle 안 됐다.
//   손상 파일·iCloud 미다운로드 placeholder·백그라운드 전환 중 읽기 중단(모두 2MB 이하일 수 있어
//   _resizeIfNeeded 의 15초 안전망도 안 탐) → addFiles 의 Promise.all 이 영구 대기 = "사진이 안 올라가요".
//   어떤 경우에도 settle 하게 하고, 실패 시 null 을 돌려 호출부가 걸러내게 한다.
function _fileToDataUrl(file) {
  return new Promise(resolve => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    try {
      const r = new FileReader();
      r.onload = e => finish(e.target && e.target.result);
      r.onerror = () => finish(null);
      r.onabort = () => finish(null);
      setTimeout(() => finish(null), 15000); // 최후 안전망
      r.readAsDataURL(file);
    } catch (_e) { void _e; finish(null); }
  });
}

// [A9] 2MB 초과 이미지 리사이징 — 업로드 전 클라이언트에서 축소
// [v779] ① HEIC(아이폰 기본 포맷) 먼저 JPEG 로 변환 — 안 하면 <img>/canvas 가 못 읽어 빈 화면·깨진 발행.
//        ② img.onerror + 타임아웃 방어 — 예전엔 onerror 가 없어, 디코드 실패(HEIC·손상·초대형)면 Promise 가
//           영영 안 끝나 addFiles 가 무한 행(빈 화면 고착)이었다. 실패해도 원본 파일로 진행해 안 멈추게 한다.
async function _resizeIfNeeded(file, maxWidth = 1920) {
  try {
    if (window.HeicConvert && window.HeicConvert.isHeic && window.HeicConvert.isHeic(file)) {
      file = await window.HeicConvert.toJpeg(file);   // 변환 실패면 throw → 아래 catch 로 원본 유지
    }
  } catch (_he) { void _he; }
  /* [2026-09-03] 예전엔 여기서 `file.size < 2MB` 면 **무조건** 원본을 돌려줬다.
     그런데 우리가 막으려는 건 바이트가 아니라 **픽셀 수**다 — iOS Safari 는 canvas 총 픽셀에 상한이 있어서
     (기기에 따라 16.7M / 구형은 4096×4096) 넘으면 그리기가 조용히 실패해 **검은 저장본**이 나온다.
     평평한 그래픽·스크린샷·긴 세로 이미지는 9000px 짜리도 2MB 아래로 압축되므로 그 관문을 그냥 통과했다.
     이제 한 번 디코드해서 **긴 변**으로 판정한다. 작으면 원본 파일을 그대로 반환(재인코딩 없음 = 무손실·무회귀). */
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    let done = false;
    const finish = (result) => { if (done) return; done = true; try { URL.revokeObjectURL(url); } catch (_e) { void _e; } resolve(result); };
    img.onload = () => {
      try {
        const longSide = Math.max(img.width, img.height);
        // 긴 변이 한도 안이고 파일도 작으면 손대지 않는다 — 예전 빠른 경로와 같은 결과(원본 그대로).
        if (longSide <= maxWidth && file.size < 2 * 1024 * 1024) return finish(file);
        /* [2026-09-03] `maxWidth / img.width` 는 **가로만** 봤다. 1200×9000 같은 세로 긴 사진은
           width 1200 < 1920 이라 scale=1 → 축소가 통째로 건너뛰어져 10.8M 픽셀이 그대로 canvas 로 갔다.
           긴 변 기준으로 바꿔야 어떤 방향이든 한도 안에 들어온다. */
        const scale = Math.min(1, maxWidth / longSide);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          blob => finish(blob ? new File([blob], file.name, { type: 'image/jpeg' }) : file),
          'image/jpeg', 0.85
        );
      } catch (_e) { finish(file); }
    };
    img.onerror = () => finish(file);        // 디코드 실패 → 원본 그대로(최소한 무한 행 방지)
    setTimeout(() => finish(file), 15000);   // 최후 안전망 — 무슨 일이 있어도 15초 뒤엔 진행
    img.src = url;
  });
}

function _dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime  = parts[0].match(/:(.*?);/)[1];
  const bin   = atob(parts[1]);
  const arr   = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

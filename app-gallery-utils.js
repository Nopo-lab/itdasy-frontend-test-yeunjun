// ── 갤러리 공유 유틸 ──────────────────────────────────────────
// app-gallery-db / workshop / assign / slot-editor 모두 참조.
// 반드시 다른 gallery 스크립트보다 먼저 로드할 것.
// ─────────────────────────────────────────────────────────────

function _uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function _fileToDataUrl(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.readAsDataURL(file);
  });
}

// [A9] 2MB 초과 이미지 리사이징 — 업로드 전 클라이언트에서 축소
async function _resizeIfNeeded(file, maxWidth = 1920) {
  if (file.size < 2 * 1024 * 1024) return file; // 2MB 이하면 그대로
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        blob => resolve(new File([blob], file.name, { type: 'image/jpeg' })),
        'image/jpeg', 0.85
      );
    };
    img.src = URL.createObjectURL(file);
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

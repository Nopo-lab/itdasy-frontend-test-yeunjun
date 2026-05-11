/* ─────────────────────────────────────────────────────────────
   이전 도우미 온보딩 (2026-04-21)

   기존 관리 앱에서 잇데이로 데이터 옮기는 3가지 방법을 시각적으로 안내.
   3스텝 카드 → 선택 → 기존 /imports/* 시트로 연결.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function _ensureSheet() {
    let sheet = document.getElementById('migSheet');
    if (sheet) return sheet;
    sheet = document.createElement('div');
    sheet.id = 'migSheet';
    sheet.style.cssText = 'position:fixed;inset:0;z-index:9999;display:none;background:rgba(0,0,0,0.5);';
    sheet.innerHTML = `
      <div style="position:absolute;inset:auto 0 0 0;background:var(--bg,#fff);border-radius:20px 20px 0 0;max-height:92vh;display:flex;flex-direction:column;padding:18px;padding-bottom:max(20px,env(safe-area-inset-bottom));">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
          <span style="font-size:22px;">📦</span>
          <strong style="font-size:17px;">이전 앱에서 쉽게 옮기기</strong>
          <button onclick="closeMigration()" style="margin-left:auto;background:rgba(0,0,0,0.05);border:none;width:32px;height:32px;border-radius:50%;font-size:16px;cursor:pointer;">✕</button>
        </div>
        <div id="migBody" style="flex:1;overflow-y:auto;"></div>
      </div>
    `;
    document.body.appendChild(sheet);
    sheet.addEventListener('click', (e) => { if (e.target === sheet) closeMigration(); });
    return sheet;
  }

  function _renderBody() {
    const body = document.getElementById('migBody');
    body.innerHTML = `
      <!-- Hero -->
      <div style="padding:18px;background:linear-gradient(135deg,var(--brand) 0%,var(--brand-strong) 100%);border-radius:16px;color:#fff;margin-bottom:16px;">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px;opacity:0.9;">쌓아둔 데이터, 버리지 마세요</div>
        <div style="font-size:22px;font-weight:900;line-height:1.25;margin-bottom:8px;">3가지 중 편한 방법으로<br>잇데이로 옮겨드려요 🎀</div>
        <div style="font-size:12px;opacity:0.85;line-height:1.5;">완전 무료 · 중복 자동 제거 · 개인정보 안전</div>
      </div>

      <!-- 방법 1: 엑셀 파일 -->
      <div data-mig="file" style="padding:14px;background:#fff;border:1px solid rgba(0,0,0,0.08);border-radius:14px;margin-bottom:10px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#4ECDC4,#44A08D);display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;flex-shrink:0;">📄</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <strong style="font-size:14px;">엑셀·CSV 내보내기</strong>
              <span style="font-size:9px;padding:1px 6px;background:rgba(76,175,80,0.15);color:#388e3c;border-radius:3px;font-weight:700;">가장 정확</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);line-height:1.5;margin-bottom:6px;">쓰시던 앱의 "내보내기 / Export" 기능 → 엑셀 파일 받기 → 여기 업로드</div>
            <div style="font-size:10px;color:#8B5CF6;font-weight:700;">가장 정확한 방법 · 고객 · 매출 · 예약 전부 가능</div>
          </div>
          <span style="color:#bbb;font-size:18px;">›</span>
        </div>
      </div>

      <!-- 방법 2: 사진 OCR -->
      <div data-mig="photo" style="padding:14px;background:#fff;border:1px solid rgba(255,179,71,0.3);border-radius:14px;margin-bottom:10px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,#FFB347,#FF8A5C);display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;flex-shrink:0;">📸</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <strong style="font-size:14px;">사진 한 장으로</strong>
              <span style="font-size:9px;padding:1px 6px;background:rgba(255,143,71,0.15);color:#E65100;border-radius:3px;font-weight:700;">AI 자동</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);line-height:1.5;margin-bottom:6px;">이전 앱의 고객 목록·매출 화면을 사진으로 찍어 올리세요. AI가 자동으로 인식해요.</div>
            <div style="font-size:10px;color:#E65100;font-weight:700;">내보내기 기능 없어도 OK · 스크린샷으로 간편</div>
          </div>
          <span style="color:#bbb;font-size:18px;">›</span>
        </div>
      </div>

      <!-- 방법 3: 카톡 복붙 -->
      <div data-mig="text" style="padding:14px;background:#fff;border:1px solid rgba(241,128,145,0.3);border-radius:14px;margin-bottom:10px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--brand),var(--brand-strong));display:flex;align-items:center;justify-content:center;font-size:22px;color:#fff;flex-shrink:0;">📋</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
              <strong style="font-size:14px;">카톡·메모 복사 붙여넣기</strong>
              <span style="font-size:9px;padding:1px 6px;background:rgba(241,128,145,0.15);color:var(--brand-strong);border-radius:3px;font-weight:700;">즉시</span>
            </div>
            <div style="font-size:11px;color:var(--text-muted);line-height:1.5;margin-bottom:6px;">단골 카톡 대화나 메모장에 쌓아둔 고객 연락처를 텍스트로 복사 → 붙여넣기</div>
            <div style="font-size:10px;color:var(--brand-strong);font-weight:700;">관리 앱 없이도 시작 가능</div>
          </div>
          <span style="color:#bbb;font-size:18px;">›</span>
        </div>
      </div>

      <!-- FAQ -->
      <div style="margin-top:20px;padding:16px;background:#fafafa;border-radius:12px;">
        <div style="font-size:12px;font-weight:700;margin-bottom:10px;color:#333;">🤔 자주 묻는 질문</div>
        <details style="margin-bottom:8px;">
          <summary style="cursor:pointer;font-size:12px;color:#555;font-weight:600;">고객 연락처 안전한가요?</summary>
          <div style="font-size:11px;color:var(--text-muted);line-height:1.6;margin-top:6px;padding-left:12px;">모든 데이터는 원장님 계정 전용 공간에 저장되고, 외부로 공유되지 않아요. 개인정보처리방침 준수.</div>
        </details>
        <details style="margin-bottom:8px;">
          <summary style="cursor:pointer;font-size:12px;color:#555;font-weight:600;">중복 고객 자동 제거되나요?</summary>
          <div style="font-size:11px;color:var(--text-muted);line-height:1.6;margin-top:6px;padding-left:12px;">이름 + 연락처 조합으로 자동 중복 체크. 이미 있는 고객은 건너뛰어요.</div>
        </details>
        <details>
          <summary style="cursor:pointer;font-size:12px;color:#555;font-weight:600;">잘못 올렸으면 되돌릴 수 있나요?</summary>
          <div style="font-size:11px;color:var(--text-muted);line-height:1.6;margin-top:6px;padding-left:12px;">가져오기 이력(설정 → 가져오기 이력)에서 되돌리기 가능.</div>
        </details>
      </div>
    `;
    body.querySelectorAll('[data-mig]').forEach(el => el.addEventListener('click', () => {
      const m = el.dataset.mig;
      closeMigration();
      // 기존 import 시트로 진입. 내부에서 탭 선택.
      if (typeof window.openImport === 'function') {
        window.openImport();
        // 자동 탭 선택은 import 내부 구조 의존 → 안내 토스트
        if (window.showToast) {
          const hint = m === 'file' ? '"파일" 탭을 눌러 엑셀을 올리세요' :
                       m === 'photo' ? '"사진 OCR" 탭에서 화면 캡처를 올리세요' :
                       '"붙여넣기" 탭에 텍스트를 붙여넣으세요';
          setTimeout(() => window.showToast(hint), 300);
        }
      }
    }));
  }

  window.openMigration = function () {
    _ensureSheet();
    document.getElementById('migSheet').style.display = 'block';
    document.body.style.overflow = 'hidden';
    _renderBody();
  };

  window.closeMigration = function () {
    const sheet = document.getElementById('migSheet');
    if (sheet) sheet.style.display = 'none';
    document.body.style.overflow = '';
  };
})();

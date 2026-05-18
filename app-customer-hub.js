/* ─────────────────────────────────────────────────────────────
   고객 허브 — v209 (목업 mockup-customer-v4 기반)
   진입: window.openCustomerHub()
   v208 까지: 자체 overlay + HubPrototypeRender.customer (구버전 디자인)
   v209 부터: app-customer.js 의 openCustomers (v4 디자인) 로 위임.
   엑셀 임포트만 별도 유지.
   ──────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  function openCustomerHub() {
    // 우선 v4 시트(openCustomers) 표시. 시트 안에서 엑셀 버튼 합성.
    if (typeof window.openCustomers === 'function') {
      window.openCustomers();
      // 시트 떴으면 헤더 우상단에 엑셀 버튼 끼워넣기 (한 번만)
      setTimeout(_injectExcelBtn, 0);
    }
  }
  function closeCustomerHub() {
    if (typeof window.closeCustomers === 'function') window.closeCustomers();
  }

  function _injectExcelBtn() {
    const sheet = document.getElementById('customerSheet');
    if (!sheet) return;
    if (sheet.querySelector('.cv4-excel-btn')) return;
    const hd = sheet.querySelector('.cv4-hd');
    if (!hd) return;
    const addBtn = hd.querySelector('.cv4-hd-add');
    if (!addBtn) return;
    const excel = document.createElement('button');
    excel.type = 'button';
    excel.className = 'cv4-excel-btn';
    excel.setAttribute('aria-label', '엑셀 불러오기');
    excel.title = '엑셀 불러오기';
    excel.style.cssText = 'background:none;border:none;cursor:pointer;color:#999;font-size:13px;margin-right:6px;display:inline-flex;align-items:center;gap:3px;';
    excel.innerHTML = '<i class="ph-duotone ph-download-simple" aria-hidden="true"></i>엑셀';
    excel.addEventListener('click', _openExcelImport);
    hd.insertBefore(excel, addBtn);
  }

  function _openExcelImport() {
    const fi = document.createElement('input');
    fi.type = 'file'; fi.accept = '.csv,.xlsx,.xls'; fi.style.display = 'none';
    fi.addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (window.ImportWizard?.open) {
        window.ImportWizard.open({
          file: f, kind: 'customer',
          onDone: async () => {
            try { window.CustomerCache?.clear?.(); } catch (_) { void 0; }
            sessionStorage.removeItem('ch_cache');
            if (typeof window.openCustomers === 'function') window.openCustomers();
          },
        });
      }
    });
    document.body.appendChild(fi); fi.click(); fi.remove();
  }

  window.openCustomerHub  = openCustomerHub;
  window.closeCustomerHub = closeCustomerHub;
  window.CustomerHub = {
    refresh: async () => {
      try { window.CustomerCache?.clear?.(); } catch (_) { void 0; }
      sessionStorage.removeItem('ch_cache');
      // 시트가 떠있으면 다시 호출해서 갱신, 아니면 no-op.
      const sheet = document.getElementById('customerSheet');
      if (sheet && sheet.classList.contains('dt-shown') && typeof window.openCustomers === 'function') {
        window.openCustomers();
      }
    },
    focusSearch: () => document.querySelector('#customerSheet #customerSearch')?.focus(),
  };
  // 외부 진입점 (예: app-revenue-hub.js, app-today-morning.js)
  // openCustomerHub(customerId) 형태로 호출되는 경우는 customerId 무시하고 일단 hub 만 띄움.
  // (상세 화면 jump 가 필요하면 후속 fetch 결과 보고 _renderCustomerDetail 로 분기 — 백로그)
})();

/* itd-decos.js — 편집기 데코 스티커 51종 (원본 SVG, data URL)
   [B-분할] itd-editor.js 에서 분리(2026-06-30). svgStk 는 빌드 전용(IIFE 내부), 노출은 window.ItdDecos 만.
   itd-editor.js IIFE 가 `var DECO = window.ItdDecos` 로 alias → 호출부 그대로. */
(function () {
  'use strict';
  function svgStk(inner) {
    return 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">' + inner + '</svg>');
  }
  window.ItdDecos = [
    svgStk('<path d="M60 104 24 64c-12-13-11-30 2-39 11-7 24-3 32 8 8-11 21-15 32-8 13 9 14 26 2 39z" fill="#E8536B"/>'),
    svgStk('<path d="M60 14 72 46l34 2-26 22 8 33-28-18-28 18 8-33-26-22 34-2z" fill="#E6B45A"/>'),
    svgStk('<path d="M60 16c4 22 6 24 28 28-22 4-24 6-28 28-4-22-6-24-28-28 22-4 24-6 28-28z" fill="#F6D365"/>'),
    svgStk('<g fill="#F2A6B6"><circle cx="60" cy="32" r="16"/><circle cx="88" cy="52" r="16"/><circle cx="78" cy="84" r="16"/><circle cx="42" cy="84" r="16"/><circle cx="32" cy="52" r="16"/></g><circle cx="60" cy="58" r="13" fill="#E6B45A"/>'),
    svgStk('<path d="M30 34 40 58 22 58z M90 34 80 58 98 58z" fill="#C9A78F"/><circle cx="60" cy="64" r="34" fill="#E8D3C2"/><circle cx="49" cy="60" r="4" fill="#3a2a22"/><circle cx="71" cy="60" r="4" fill="#3a2a22"/><path d="M55 72q5 5 10 0" stroke="#3a2a22" stroke-width="2.5" fill="none" stroke-linecap="round"/>'),
    svgStk('<ellipse cx="30" cy="52" rx="12" ry="20" fill="#B07A4F"/><ellipse cx="90" cy="52" rx="12" ry="20" fill="#B07A4F"/><circle cx="60" cy="62" r="32" fill="#D9A36B"/><circle cx="50" cy="58" r="4" fill="#3a2a22"/><circle cx="70" cy="58" r="4" fill="#3a2a22"/><ellipse cx="60" cy="72" rx="6" ry="4" fill="#3a2a22"/>'),
    svgStk('<circle cx="38" cy="40" r="12" fill="#B98A5E"/><circle cx="82" cy="40" r="12" fill="#B98A5E"/><circle cx="60" cy="62" r="32" fill="#D2A878"/><circle cx="50" cy="58" r="3.5" fill="#3a2a22"/><circle cx="70" cy="58" r="3.5" fill="#3a2a22"/><circle cx="60" cy="70" r="7" fill="#7a5638"/>'),
    svgStk('<ellipse cx="48" cy="28" rx="8" ry="22" fill="#F0E0E6"/><ellipse cx="72" cy="28" rx="8" ry="22" fill="#F0E0E6"/><circle cx="60" cy="70" r="30" fill="#FBF1F4"/><circle cx="51" cy="66" r="3.5" fill="#C06A7A"/><circle cx="69" cy="66" r="3.5" fill="#C06A7A"/><circle cx="60" cy="76" r="4" fill="#E8839A"/>'),
    svgStk('<path d="M58 60 28 42v36z M62 60 92 42v36z" fill="#E07A99"/><circle cx="60" cy="60" r="9" fill="#C85F82"/>'),
    svgStk('<g fill="#ffffff" stroke="#D9CFC9" stroke-width="2"><circle cx="44" cy="66" r="18"/><circle cx="70" cy="60" r="22"/><circle cx="86" cy="70" r="14"/></g><rect x="40" y="70" width="50" height="16" rx="8" fill="#ffffff"/>'),
    svgStk('<path d="M28 84 24 44l18 16 18-26 18 26 18-16-4 40z" fill="#E6B45A"/><rect x="28" y="84" width="64" height="8" rx="3" fill="#D29B3E"/>'),
    svgStk('<path d="M60 56c-10-12-30-10-34 0 6 4 6 10 0 12 12 10 24 10 34 4 10 6 22 6 34-4-6-2-6-8 0-12-4-10-24-12-34 0z" fill="#D64C6A"/>'),
    svgStk('<rect x="14" y="20" width="92" height="56" rx="16" fill="#ffffff" stroke="#E6C9D2" stroke-width="2"/><path d="M40 76 38 94 56 76z" fill="#ffffff" stroke="#E6C9D2" stroke-width="2"/><text x="60" y="54" font-family="Pretendard,sans-serif" font-size="22" font-weight="800" fill="#BC6675" text-anchor="middle">예뻐요</text>'),
    svgStk('<g stroke="#7C8B9A" stroke-width="5" fill="none" stroke-linecap="round"><circle cx="34" cy="84" r="10"/><circle cx="34" cy="54" r="10"/><path d="M42 78 96 36M42 60 96 100"/></g>'),
    svgStk('<circle cx="34" cy="40" r="14" fill="#B9B2AE"/><circle cx="86" cy="40" r="14" fill="#B9B2AE"/><circle cx="60" cy="64" r="30" fill="#CFC8C3"/><circle cx="50" cy="60" r="3.5" fill="#3a2a22"/><circle cx="70" cy="60" r="3.5" fill="#3a2a22"/><circle cx="60" cy="70" r="4" fill="#E89BB0"/>'),
    svgStk('<path d="M30 30 44 56 22 54z" fill="#E08A4E"/><path d="M90 30 76 56 98 54z" fill="#E08A4E"/><path d="M60 30c18 0 30 14 30 34 0 14-14 26-30 26S30 78 30 64c0-20 12-34 30-34z" fill="#E89B5E"/><path d="M60 64c-9 0-16 8-16 16 0 8 7 14 16 14s16-6 16-14c0-8-7-16-16-16z" fill="#fff"/><circle cx="50" cy="58" r="3.5" fill="#3a2a22"/><circle cx="70" cy="58" r="3.5" fill="#3a2a22"/><circle cx="60" cy="74" r="3" fill="#3a2a22"/>'),
    svgStk('<circle cx="34" cy="36" r="12" fill="#2b2b2b"/><circle cx="86" cy="36" r="12" fill="#2b2b2b"/><circle cx="60" cy="64" r="32" fill="#ffffff" stroke="#E2DAD5" stroke-width="2"/><ellipse cx="48" cy="62" rx="8" ry="10" fill="#2b2b2b"/><ellipse cx="72" cy="62" rx="8" ry="10" fill="#2b2b2b"/><circle cx="60" cy="76" r="4" fill="#2b2b2b"/>'),
    svgStk('<circle cx="60" cy="64" r="30" fill="#F6D365"/><path d="M60 32c3-8 12-10 12-10s-3 9-12 10z" fill="#F2A33C"/><circle cx="52" cy="60" r="3.5" fill="#3a2a22"/><circle cx="68" cy="60" r="3.5" fill="#3a2a22"/><path d="M56 70 60 76 64 70z" fill="#EF8B2C"/>'),
    svgStk('<ellipse cx="60" cy="66" rx="22" ry="16" fill="#F4C443"/><path d="M50 54v24M62 52v28M74 56v18" stroke="#2b2b2b" stroke-width="5"/><ellipse cx="44" cy="46" rx="12" ry="8" fill="#F2D5D9" stroke="#D58A95" stroke-width="1.5" transform="rotate(-25 44 46)"/><ellipse cx="76" cy="46" rx="12" ry="8" fill="#F2D5D9" stroke="#D58A95" stroke-width="1.5" transform="rotate(25 76 46)"/><circle cx="60" cy="40" r="3" fill="#2b2b2b"/>'),
    svgStk('<path d="M60 60c-6-22-40-26-40-4 0 16 26 18 40 8z" fill="#E07A99"/><path d="M60 60c6-22 40-26 40-4 0 16-26 18-40 8z" fill="#E07A99"/><path d="M60 60c-5 18-30 22-30 4 0-12 20-14 30-8z" fill="#F2A6B6"/><path d="M60 60c5 18 30 22 30 4 0-12-20-14-30-8z" fill="#F2A6B6"/><rect x="58" y="40" width="4" height="44" rx="2" fill="#5a4636"/>'),
    svgStk('<circle cx="60" cy="64" r="28" fill="#E24B4A"/><path d="M60 36v56" stroke="#2b2b2b" stroke-width="3"/><ellipse cx="60" cy="38" rx="14" ry="10" fill="#2b2b2b"/><circle cx="48" cy="56" r="5" fill="#2b2b2b"/><circle cx="72" cy="56" r="5" fill="#2b2b2b"/><circle cx="50" cy="74" r="5" fill="#2b2b2b"/><circle cx="70" cy="74" r="5" fill="#2b2b2b"/>'),
    svgStk('<rect x="48" y="54" width="24" height="46" rx="4" fill="#C9A227"/><path d="M50 54h20l-2-22c0-6-16-6-16 0z" fill="#D64C6A"/>'),
    svgStk('<rect x="46" y="56" width="28" height="42" rx="6" fill="#E07A99"/><rect x="54" y="40" width="12" height="18" fill="#6E5A50"/><rect x="52" y="32" width="16" height="9" rx="2" fill="#3a2a22"/>'),
    svgStk('<rect x="44" y="52" width="32" height="46" rx="7" fill="#F2D5D9" stroke="#D58A95" stroke-width="2"/><rect x="54" y="40" width="12" height="14" fill="#bcd9ea"/><rect x="52" y="30" width="16" height="10" rx="2" fill="#C9A227"/><rect x="46" y="64" width="28" height="20" rx="3" fill="#E6C9D2"/>'),
    svgStk('<circle cx="60" cy="48" r="24" fill="#dce8f0" stroke="#C9A227" stroke-width="4"/><rect x="56" y="72" width="8" height="28" rx="4" fill="#C9A227"/>'),
    svgStk('<path d="M40 80 16 56a14 14 0 0 1 24-14 14 14 0 0 1 24 14z" fill="#E8839A"/><path d="M76 92 52 68a14 14 0 0 1 24-14 14 14 0 0 1 24 14z" fill="#E8536B"/>'),
    svgStk('<circle cx="60" cy="60" r="20" fill="#F6C545"/><g stroke="#F6C545" stroke-width="5" stroke-linecap="round"><path d="M60 24v12M60 84v12M24 60h12M84 60h12M35 35l8 8M77 77l8 8M85 35l-8 8M43 77l-8 8"/></g>'),
    svgStk('<path d="M72 28a34 34 0 1 0 20 58A28 28 0 0 1 72 28z" fill="#F0D98C"/>'),
    svgStk('<path d="M18 90a42 42 0 0 1 84 0" fill="none" stroke="#E24B4A" stroke-width="7"/><path d="M28 90a32 32 0 0 1 64 0" fill="none" stroke="#F2A33C" stroke-width="7"/><path d="M38 90a22 22 0 0 1 44 0" fill="none" stroke="#CFA7AE" stroke-width="7"/><path d="M48 90a12 12 0 0 1 24 0" fill="none" stroke="#8B95A1" stroke-width="7"/>'),
    svgStk('<path d="M34 46h44v26a22 22 0 0 1-44 0z" fill="#ffffff" stroke="#C9B8AE" stroke-width="2"/><path d="M78 52h10a10 10 0 0 1 0 20h-10" fill="none" stroke="#C9B8AE" stroke-width="3"/><path d="M44 36c0-6 6-6 6-12M56 36c0-6 6-6 6-12M68 36c0-6 6-6 6-12" stroke="#C9B8AE" stroke-width="3" fill="none"/>'),
    svgStk('<rect x="30" y="52" width="60" height="42" rx="4" fill="#E07A99"/><rect x="30" y="46" width="60" height="14" rx="3" fill="#C85F82"/><rect x="55" y="46" width="10" height="48" fill="#F2C84B"/><path d="M60 46c-8-14-24-6-16 2 4 4 16-2 16-2zM60 46c8-14 24-6 16 2-4 4-16-2-16-2z" fill="#F2C84B"/>'),
    svgStk('<ellipse cx="60" cy="50" rx="22" ry="26" fill="#E8536B"/><path d="M60 76l-4 8h8z" fill="#E8536B"/><path d="M60 84c0 8 6 8 6 16" stroke="#C9B8AE" stroke-width="2" fill="none"/>'),
    svgStk('<g fill="#C9A78F"><ellipse cx="60" cy="74" rx="18" ry="14"/><circle cx="38" cy="52" r="8"/><circle cx="52" cy="42" r="8"/><circle cx="68" cy="42" r="8"/><circle cx="82" cy="52" r="8"/></g>'),
    svgStk('<circle cx="60" cy="60" r="34" fill="#CFA7AE"/><path d="M44 62l11 11 22-24" stroke="#ffffff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
    svgStk('<rect x="14" y="24" width="92" height="52" rx="14" fill="#BC6675"/><path d="M40 76 38 92 56 76z" fill="#BC6675"/><text x="60" y="58" font-family="Pretendard,sans-serif" font-size="24" font-weight="800" fill="#ffffff" text-anchor="middle">NEW</text>'),
    svgStk('<path d="M60 16l10 10 14-2 2 14 10 10-10 10-2 14-14-2-10 10-10-10-14 2-2-14L18 60l10-10-2-14 14 2z" fill="#E24B4A"/><text x="60" y="68" font-family="Pretendard,sans-serif" font-size="19" font-weight="800" fill="#ffffff" text-anchor="middle">SALE</text>'),
    svgStk('<path d="M30 36 40 58 24 56z" fill="#E8A23C"/><path d="M90 36 80 58 96 56z" fill="#E8A23C"/><circle cx="60" cy="64" r="32" fill="#F2B454"/><path d="M44 50v10M52 46v12M68 46v12M76 50v10" stroke="#7a4a1a" stroke-width="3"/><circle cx="50" cy="62" r="3.5" fill="#3a2a22"/><circle cx="70" cy="62" r="3.5" fill="#3a2a22"/><path d="M54 74h12" stroke="#3a2a22" stroke-width="3" stroke-linecap="round"/>'),
    svgStk('<circle cx="60" cy="62" r="32" fill="#F2B0C0"/><ellipse cx="60" cy="70" rx="14" ry="10" fill="#E68AA0"/><circle cx="52" cy="70" r="2.6" fill="#7a3a4a"/><circle cx="68" cy="70" r="2.6" fill="#7a3a4a"/><circle cx="50" cy="56" r="3" fill="#3a2a22"/><circle cx="70" cy="56" r="3" fill="#3a2a22"/><path d="M36 44 30 36M84 44 90 36" stroke="#E68AA0" stroke-width="8" stroke-linecap="round"/>'),
    svgStk('<circle cx="60" cy="64" r="32" fill="#8DBE5A"/><circle cx="44" cy="44" r="12" fill="#8DBE5A"/><circle cx="76" cy="44" r="12" fill="#8DBE5A"/><circle cx="44" cy="44" r="7" fill="#fff"/><circle cx="76" cy="44" r="7" fill="#fff"/><circle cx="44" cy="44" r="3.5" fill="#222"/><circle cx="76" cy="44" r="3.5" fill="#222"/><path d="M48 70q12 8 24 0" stroke="#2c4a1a" stroke-width="3" fill="none" stroke-linecap="round"/>'),
    svgStk('<ellipse cx="60" cy="60" rx="26" ry="32" fill="#2b3a4a"/><ellipse cx="60" cy="66" rx="18" ry="24" fill="#fff"/><path d="M60 50 52 60h16z" fill="#E8A23C"/><circle cx="51" cy="48" r="3" fill="#222"/><circle cx="69" cy="48" r="3" fill="#222"/><path d="M40 78 30 88M80 78 90 88" stroke="#E8A23C" stroke-width="6" stroke-linecap="round"/>'),
    svgStk('<circle cx="60" cy="58" r="30" fill="#C9A06A"/><circle cx="44" cy="58" r="14" fill="#F0E0C0"/><circle cx="76" cy="58" r="14" fill="#F0E0C0"/><circle cx="48" cy="56" r="4" fill="#222"/><circle cx="72" cy="56" r="4" fill="#222"/><path d="M40 36 34 26M80 36 86 26" stroke="#C9A06A" stroke-width="7" stroke-linecap="round"/><path d="M54 70q6 6 12 0" stroke="#7a5638" stroke-width="3" fill="none" stroke-linecap="round"/>'),
    svgStk('<ellipse cx="60" cy="72" rx="30" ry="20" fill="#D58A95"/><circle cx="60" cy="44" r="22" fill="#E8C7CD"/><circle cx="52" cy="42" r="4" fill="#222"/><circle cx="68" cy="42" r="4" fill="#222"/><path d="M50 52q10 8 20 0" stroke="#8F5E67" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M40 28 34 20M80 28 86 20" stroke="#E8C7CD" stroke-width="6" stroke-linecap="round"/>'),
    svgStk('<path d="M60 28c-3 0-6 8-6 18 0 6 4 9 6 9s6-3 6-9c0-10-3-18-6-18z" fill="#E6B45A"/><circle cx="60" cy="72" r="26" fill="#fff"/><path d="M60 46c-14 0-26 12-26 26 0 8 6 14 14 14h24c8 0 14-6 14-14 0-14-12-26-26-26z" fill="#F7F1EF"/><path d="M54 64q6-5 12 0" stroke="#C06A7A" stroke-width="2.5" fill="none"/><circle cx="50" cy="68" r="3" fill="#3a2a22"/><circle cx="70" cy="68" r="3" fill="#3a2a22"/><path d="M44 54l-8-6M76 54l8-6" stroke="#E6B45A" stroke-width="4" stroke-linecap="round"/>'),
    svgStk('<path d="M44 96c-4-18-4-30 0-42 3-9 9-14 16-14s13 5 16 14c4 12 4 24 0 42z" fill="#D58A95"/><ellipse cx="60" cy="40" rx="18" ry="20" fill="#F2D5D9"/><circle cx="60" cy="44" r="9" fill="#6B4A2A"/>'),
    svgStk('<circle cx="60" cy="60" r="30" fill="#F4C98A"/><circle cx="60" cy="60" r="16" fill="#6B4A2A"/><g fill="#fff"><circle cx="50" cy="52" r="2"/><circle cx="70" cy="54" r="2"/><circle cx="60" cy="70" r="2"/><circle cx="48" cy="66" r="2"/><circle cx="72" cy="68" r="2"/></g><path d="M36 40q24-14 48 0" stroke="#E89B5E" stroke-width="6" fill="none"/>'),
    svgStk('<path d="M40 56h40l-4 36a8 8 0 0 1-8 7H52a8 8 0 0 1-8-7z" fill="#F6D7A0"/><rect x="36" y="48" width="48" height="12" rx="6" fill="#E08A6E"/><circle cx="50" cy="42" r="5" fill="#E8536B"/><circle cx="62" cy="38" r="5" fill="#F4C443"/><circle cx="74" cy="42" r="5" fill="#CFA7AE"/>'),
    svgStk('<path d="M60 96 38 72c-6-7-6-16 0-22 5-5 14-4 19 2l3 4 3-4c5-6 14-7 19-2 6 6 6 15 0 22z" fill="#E8536B"/><path d="M48 60h8M64 60h8" stroke="#fff" stroke-width="3" stroke-linecap="round"/>'),
    svgStk('<circle cx="60" cy="66" r="22" fill="#E24B4A"/><path d="M58 44c0-8 8-12 8-12s2 8-6 12z" fill="#D58A95"/><circle cx="53" cy="62" r="2.4" fill="#fff"/><circle cx="64" cy="66" r="2.4" fill="#fff"/>'),
    svgStk('<path d="M44 30c0 10 16 10 16 0M76 30c0 10-16 10-16 0" stroke="#6B4A2A" stroke-width="4" fill="none"/><circle cx="48" cy="62" r="18" fill="#E24B4A"/><circle cx="72" cy="62" r="18" fill="#C0392B"/><circle cx="44" cy="56" r="3" fill="#fff"/><circle cx="68" cy="56" r="3" fill="#fff"/>'),
    svgStk('<path d="M40 46h40l-3 18H43z" fill="#F2A6B6"/><path d="M43 64h34l-3 28a6 6 0 0 1-6 5H52a6 6 0 0 1-6-5z" fill="#F6D7A0"/><circle cx="60" cy="40" r="6" fill="#E8536B"/>'),
    svgStk('<rect x="46" y="40" width="22" height="40" rx="4" fill="#F0E0C0"/><path d="M46 56c-8 0-12 6-12 12s6 12 14 12h20V56z" fill="#F0E0C0"/><path d="M68 40h6a14 14 0 0 1 0 28h-6" fill="none" stroke="#C9A06A" stroke-width="4"/><circle cx="56" cy="58" r="4" fill="#fff"/>')
  ];

  // [#5] 스티커 확장 — 카테고리별 이모지 + 캘리 글자스티커(텍스트레이어) + Y2K배지·무드 SVG.
  //   손글씨 글자 스티커는 SVG-img가 웹폰트를 못 써서 텍스트 레이어로(앱 손글씨 폰트 사용). 배지/무드는 SVG.
  var badgeSvg = [
    svgStk('<rect x="16" y="44" width="88" height="34" rx="17" fill="#15181D"/><text x="60" y="67" font-family="Arial,sans-serif" font-size="21" font-weight="900" fill="#fff" text-anchor="middle" letter-spacing="1.5">NEW</text>'),
    svgStk('<rect x="16" y="44" width="88" height="34" rx="17" fill="#E24B4A"/><text x="60" y="67" font-family="Arial,sans-serif" font-size="21" font-weight="900" fill="#fff" text-anchor="middle" letter-spacing="1.5">HOT</text>'),
    svgStk('<rect x="12" y="44" width="96" height="34" rx="17" fill="#BC6675"/><text x="60" y="67" font-family="Arial,sans-serif" font-size="21" font-weight="900" fill="#fff" text-anchor="middle" letter-spacing="1.5">SALE</text>'),
    svgStk('<rect x="14" y="44" width="92" height="34" rx="17" fill="#E6B45A"/><text x="60" y="67" font-family="Arial,sans-serif" font-size="20" font-weight="900" fill="#15181D" text-anchor="middle" letter-spacing="1">BEST</text>'),
    svgStk('<rect x="20" y="44" width="80" height="34" rx="17" fill="#8B95A1"/><text x="60" y="67" font-family="Arial,sans-serif" font-size="22" font-weight="900" fill="#fff" text-anchor="middle">1+1</text>'),
    svgStk('<rect x="18" y="44" width="84" height="34" rx="17" fill="#CFA7AE"/><text x="60" y="67" font-family="Arial,sans-serif" font-size="20" font-weight="900" fill="#fff" text-anchor="middle" letter-spacing="1">OPEN</text>'),
    svgStk('<rect x="18" y="44" width="84" height="34" rx="17" fill="#fff" stroke="#E6C9D2" stroke-width="2"/><text x="60" y="67" font-family="Pretendard,AppleSDGothicNeo,sans-serif" font-size="19" font-weight="900" fill="#BC6675" text-anchor="middle">신상</text>'),
    svgStk('<path d="M60 16l10 10 14-2 2 14 10 10-10 10-2 14-14-2-10 10-10-10-14 2-2-14L18 60l10-10-2-14 14 2z" fill="#E24B4A"/><text x="60" y="67" font-family="Pretendard,AppleSDGothicNeo,sans-serif" font-size="15" font-weight="900" fill="#fff" text-anchor="middle">예약중</text>'),
    // [다양성 팩 2026-07-12] 한국어 커머스 배지 + CTA행 + ★평점 — 1인샵 홍보 실사용(할인·마감임박·예약가능·예약하기·별점).
    svgStk('<rect x="18" y="44" width="84" height="34" rx="17" fill="#BC6675"/><text x="60" y="67" font-family="Pretendard,AppleSDGothicNeo,sans-serif" font-size="22" font-weight="900" fill="#fff" text-anchor="middle" letter-spacing="1">할인</text>'),
    svgStk('<rect x="6" y="44" width="108" height="34" rx="17" fill="#E24B4A"/><text x="60" y="66" font-family="Pretendard,AppleSDGothicNeo,sans-serif" font-size="18" font-weight="900" fill="#fff" text-anchor="middle">마감임박</text>'),
    svgStk('<rect x="6" y="44" width="108" height="34" rx="17" fill="#CFA7AE"/><text x="60" y="66" font-family="Pretendard,AppleSDGothicNeo,sans-serif" font-size="18" font-weight="900" fill="#fff" text-anchor="middle">예약가능</text>'),
    svgStk('<rect x="4" y="44" width="112" height="34" rx="17" fill="#BC6675"/><text x="50" y="66" font-family="Pretendard,AppleSDGothicNeo,sans-serif" font-size="18" font-weight="900" fill="#fff" text-anchor="middle">예약하기</text><path d="M92 61h13m-5-5 5 5-5 5" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'),
    svgStk('<rect x="6" y="44" width="108" height="34" rx="17" fill="#8B95A1"/><text x="60" y="66" font-family="Pretendard,AppleSDGothicNeo,sans-serif" font-size="18" font-weight="900" fill="#fff" text-anchor="middle">예약오픈</text>'),
    svgStk('<rect x="14" y="44" width="92" height="34" rx="17" fill="#15181D"/><text x="60" y="67" font-family="Pretendard,AppleSDGothicNeo,sans-serif" font-size="19" font-weight="900" text-anchor="middle"><tspan fill="#F5A623">★</tspan><tspan fill="#fff"> 5.0</tspan></text>'),
    svgStk('<rect x="10" y="46" width="100" height="30" rx="15" fill="#fff" stroke="#EED9A8" stroke-width="2"/><text x="60" y="68" font-family="Arial,sans-serif" font-size="19" fill="#F5A623" text-anchor="middle" letter-spacing="2">★★★★★</text>')
  ];
  var moodSvg = [
    svgStk('<rect x="20" y="16" width="80" height="88" rx="6" fill="#fff" stroke="#E6DCD6" stroke-width="2"/><rect x="28" y="24" width="64" height="52" rx="3" fill="#EAD9CE"/><path d="M40 62l10-12 8 8 8-10 10 14v10a2 2 0 0 1-2 2H40z" fill="#C9B3A5"/><circle cx="72" cy="40" r="5" fill="#F0E0D2"/></rect>'),
    svgStk('<rect x="14" y="30" width="92" height="60" rx="5" fill="#1B1B1F"/><rect x="14" y="30" width="92" height="8" fill="#2C2C31"/><rect x="14" y="82" width="92" height="8" fill="#2C2C31"/><g fill="#0B0B0D"><rect x="18" y="31" width="7" height="6"/><rect x="30" y="31" width="7" height="6"/><rect x="42" y="31" width="7" height="6"/><rect x="54" y="31" width="7" height="6"/><rect x="66" y="31" width="7" height="6"/><rect x="78" y="31" width="7" height="6"/><rect x="90" y="31" width="7" height="6"/><rect x="18" y="83" width="7" height="6"/><rect x="30" y="83" width="7" height="6"/><rect x="42" y="83" width="7" height="6"/><rect x="54" y="83" width="7" height="6"/><rect x="66" y="83" width="7" height="6"/><rect x="78" y="83" width="7" height="6"/><rect x="90" y="83" width="7" height="6"/></g><rect x="30" y="44" width="60" height="34" rx="2" fill="#E7D5C8"/>'),
    svgStk('<path d="M60 20c3 20 8 25 28 28-20 3-25 8-28 28-3-20-8-25-28-28 20-3 25-8 28-28z" fill="#F6D365"/><path d="M96 30c1.5 7 3 9 10 10-7 1.5-9 3-10 10-1.5-7-3-9-10-10 7-1.5 9-3 10-10z" fill="#F2C84B"/><path d="M30 74c1.2 6 2.5 7.5 8.5 8.5-6 1.2-7.5 2.5-8.5 8.5-1.2-6-2.5-7.5-8.5-8.5 6-1.2 7.5-2.5 8.5-8.5z" fill="#F2C84B"/>'),
    svgStk('<g fill="#F2A6B6"><path d="M40 40l4 8 8 4-8 4-4 8-4-8-8-4 8-4z"/><path d="M78 60l3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/><path d="M56 76l2.5 5 5 2.5-5 2.5-2.5 5-2.5-5-5-2.5 5-2.5z"/></g>'),
    svgStk('<path d="M60 58c-9-2-30-4-34 6-3 8 8 14 20 10 6-2 12-8 14-16z" fill="#E68AA0"/><path d="M60 58c9-2 30-4 34 6 3 8-8 14-20 10-6-2-12-8-14-16z" fill="#E68AA0"/><path d="M60 58l-8 30h16z" fill="#D4708A"/><circle cx="60" cy="58" r="8" fill="#BC6675"/></path>')
  ];

  window.ItdStickers = {
    // 이모지 세트
    beautyEmoji: ['💅', '💄', '💇‍♀️', '✨', '💎', '👑', '💋', '🧴', '🪞', '💐', '🦋', '🌟'],
    cuteEmoji: ['🎀', '🐰', '🌷', '🍒', '🧸', '🫧', '🌸', '🍓', '🐻', '🩰', '🍰', '🧁', '🌈', '☁️', '🐣'],
    mzEmoji: ['🫶', '🤍', '🖤', '✨', '🥹', '🔥', '💯', '🫰', '😙', '💫', '🥰', '😮‍💨'],
    shopEmojiByType: {
      '네일': ['💅', '💎', '✨', '🎀'], '네일아트': ['💅', '💎', '✨', '🎀'],
      '헤어': ['💇‍♀️', '💈', '✨', '🪞'], '붙임머리': ['💇‍♀️', '✨', '🪞', '🌟'],
      '속눈썹': ['👁️', '👀', '✨', '🦋'], '왁싱': ['✨', '🌿', '🧴'],
      '반영구': ['✍️', '👁️', '✨'], '피부': ['🧴', '🪞', '💧', '✨']
    },
    // 캘리 글자 스티커 → 텍스트 레이어(손글씨 폰트). {t:문구, f:폰트키}
    textStk: [
      { t: '찐예쁨', f: 'gamja' }, { t: '인생샷', f: 'pen' }, { t: '오늘도 예쁨', f: 'gaegu' },
      { t: '완성 ♡', f: 'pen' }, { t: '재방문각', f: 'gamja' }, { t: '믿고 맡겨요', f: 'gaegu' },
      { t: '예약 찜', f: 'pen' }, { t: '갓생네일', f: 'gamja' }, { t: '느좋', f: 'himelody' },
      { t: '머릿결 좋아', f: 'gaegu' }, { t: '컬링샷', f: 'pen' }, { t: '유리피부', f: 'gamja' }
    ],
    badgeSvg: badgeSvg,
    moodSvg: moodSvg
  };
})();

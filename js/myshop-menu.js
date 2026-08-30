/* 내샵관리 메뉴 정본 — 2026-08-30
 *
 * 왜 만들었나
 *   같은 8개 메뉴가 네 군데에 복붙돼 있었다.
 *     ① app-myshop-v3.js 모바일 리스트
 *     ② app-myshop-v3.js PC 사이드바
 *     ③ index.html 정적 #sideNav
 *     ④ index.html 좌측 드로어 #shopDrawer
 *   그래서 이미 어긋나 있었다 — '내 샵 정보'가 ②에선 ic-settings, ①③④에선
 *   ph-gear-six 였다. 이름 하나 바꾸려면 네 곳을 고쳐야 하고, 한 곳을 빠뜨리는
 *   순간 또 갈라진다. 정의를 여기 한 벌만 두고 네 곳이 전부 이걸 읽게 한다.
 *
 * 아이콘 규칙
 *   전부 index.html 의 lucide 스프라이트(#ic-*)만 쓴다. Phosphor(ph-duotone)는
 *   듀오톤이라 아웃라인 세트와 섞이면 한 화면에서 두 패밀리로 보인다 — 금지.
 */
(function () {
  'use strict';

  function _icon(id, size) {
    const s = size || 20;
    return `<svg width="${s}" height="${s}" aria-hidden="true"><use href="#${id}"/></svg>`;
  }

  // act: 화면마다 액션 이름이 다르다. mv=app-myshop-v3(data-mv-act),
  //      st=index.html 정적 사이드바(data-static-action), dr=드로어(data-drawer-route)
  const ITEMS = [
    { group: '운영 관리', key: 'booking',      name: '예약관리',      icon: 'ic-calendar-check',  color: 'teal',
      mv: 'booking',      st: 'calendar',       dr: 'bookings' },
    { group: '운영 관리', key: 'customer',     name: '고객관리',      icon: 'ic-users',           color: 'blue',
      mv: 'customer',     st: 'customer',       dr: 'customer' },
    { group: '운영 관리', key: 'revenue',      name: '매출관리',      icon: 'ic-wallet',          color: 'amber',
      mv: 'revenue',      st: 'revenue',        dr: 'revenue' },

    // 인스타 로고를 그대로 쓰면 '인스타로 가는 버튼'처럼 보인다. 여기서 하는 일은
    // 손님 문의에 답하는 것이므로 기능을 상징하는 말풍선을 쓴다.
    { group: '손님 문의', key: 'dm',           name: '인스타 DM',     icon: 'ic-message-circle',  color: 'pink',
      mv: 'dmHub',        st: 'insta-dm',       dr: 'insta_dm' },
    { group: '손님 문의', key: 'comment',      name: '인스타 댓글',   icon: 'ic-messages-square', color: 'lavender',
      mv: 'comment',      st: 'insta-comment',  dr: 'insta_comment' },

    { group: '내 정보',  key: 'integrations', name: '연결된 서비스', icon: 'ic-share-nodes',     color: 'blue',
      meta: '인스타 · 네이버 · 카카오',
      mv: 'integrations', st: 'integrations',   dr: 'integrations' },
    // gear 를 쓰면 '앱 설정'으로 읽힌다. 여기는 원장님의 샵 자체를 관리하는 곳이다.
    { group: '내 정보',  key: 'settings',     name: '샵 관리',       icon: 'ic-store',           color: 'teal',
      meta: '샵 정보 · 데이터 · 백업',
      mv: 'settings',     st: 'settings-hub',   dr: 'settings_hub' },
    // 왕관은 안 쓴다. VIP 등급이 아니라 '지금 내가 쓰고 있는 플랜'이 요점이다.
    { group: '내 정보',  key: 'plan',         name: '이용 플랜',     icon: 'ic-ticket',          color: 'lavender',
      mv: 'plan',         st: 'plan',           dr: 'plan' },
  ];

  const GROUPS = ['운영 관리', '손님 문의', '내 정보'];

  function byGroup(g) { return ITEMS.filter(i => i.group === g); }

  window.ItdasyMenu = {
    ITEMS,
    GROUPS,
    byGroup,
    icon: _icon,
  };
})();

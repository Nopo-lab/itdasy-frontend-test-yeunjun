/* 작업실 플로우 스텝 레지스트리 (flow/steps.js) — 단일 진실원(SSOT).
 *
 * [refactor S1] 기존엔 스텝 1개가 SCREENS·VISIBLE_SCREENS·TITLE·CTA 4개 맵에 흩어져
 *   플래그별로 3~4번씩 patch 됐다 → 워크플로 바꿀 때마다 여러 곳 수정, 하나 놓치면 고아(쓰레기)코드.
 * 이제 스텝의 제목·CTA를 여기 STEP 사전 한 곳에서 정의하고, 파생 구조(SCREENS/VISIBLE/TITLE/CTA)를
 *   build() 가 한 번에 산출한다. **S1은 무동작변경** — 기존 인라인 로직과 값이 100% 동일하게 재현.
 *
 * ⚠️ 순서 두 종류:
 *   - master(SCREENS): 슬라이드 방향 계산용 인덱스(workspace-v2-flow.js 의 SCREENS.indexOf). connect 가 preview 앞 — 기존 동작 보존.
 *   - visible(VISIBLE_SCREENS): 진행바/다음화면 UX 순서. preview 가 connect 앞.
 */
(function () {
  'use strict';

  function build() {
    // [cleanup 2026-07-12] HYPER+SIMPLE_FLOW 를 라이브 상수로 고정(롤백 플래그 제거) — 아래는 기존 build({hyper:true,simple:true}) 산출과 동일.
    // 스텝 사전 — 제목·CTA 정의(변경은 여기 한 곳)
    var STEP = {
      upload:   { title: '사진 업로드',     cta: { l: '레이아웃 고르기 →', to: 'layout' } },   // 업로드 다음 = 레이아웃 고르기
      layout:   { title: '레이아웃 고르기', cta: { l: '이대로 게시글 쓰기', to: 'caption' } },
      edit:     { title: '편집',            cta: { l: '저장하고 게시글 쓰기', to: 'caption' } },
      template: { title: '템플릿 선택',     cta: { l: '이대로 게시글 쓰기', to: 'caption' } },
      // [통합 2026-07-13] 캡션 결과 = 인스타 미리보기 통합(요청6). 캡션 화면 아래로 스크롤하면 발행+피드 미리보기가 같이 뜸.
      //   → 별도 preview 스텝으로 넘어가지 않고 캡션 화면에서 바로 '저장하고 완료'. (preview 스텝은 플러밍 보존용으로만 정의 유지, 진입 없음)
      // [2026-08-30 원영] 캡션 화면의 주 행동은 화면 안 '인스타에 바로 올리기' 하나. 하단 고정 버튼은
      //   지금 안 올릴 때의 탈출구일 뿐이라 '나중에 이어서하기'(약한 회색 고스트)로 낮춘다 — 로즈 CTA 2개 금지.
      caption:  { title: '캡션 생성',       cta: { l: '나중에 이어서하기', to: '__save', ghost: true } },
      connect:  { title: '고객 연결',       cta: { l: '저장하고 완료', to: '__save' } },
      // [보스 2026-07-12] 고객연결은 인스타 업로드 '후'에만 — 미리보기의 발행 전 '고객 연결로' 지름길 제거.
      //   미리보기(=이제 캡션 화면 하단) '피드에 올리기' 버튼 → 발행 성공 시 connect 화면으로(workspace-v2-flow.js publish 성공부).
      preview:  { title: '인스타 미리보기', cta: { l: '저장하고 완료', to: '__save' } },
    };

    // master 순서(슬라이드 방향 인덱스: connect 가 preview 앞 — 기존 SCREENS 보존, layout 은 upload 다음)
    var master = ['upload', 'layout', 'edit', 'template', 'caption', 'connect', 'preview'];
    // visible 순서(진행바/다음화면) — [통합 2026-07-13] preview 제거(캡션 화면에 흡수). upload→layout→caption→connect.
    var visible = ['upload', 'layout', 'caption', 'connect'];

    var TITLE = {}, CTA = {};
    master.forEach(function (id) { TITLE[id] = STEP[id].title; CTA[id] = STEP[id].cta; });

    return { SCREENS: master, VISIBLE_SCREENS: visible, TITLE: TITLE, CTA: CTA, STEP: STEP };
  }

  window.WSFlowSteps = { build: build };
})();

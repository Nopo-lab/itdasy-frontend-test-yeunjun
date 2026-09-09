/* AI 잇비 — 사진편집 말 명령 */
(function () {
  'use strict';

  const COMMANDS = [
    { id: 'instagram', test: /(인스타|instagram|sns).*(업로드|올려|발행|게시|준비)/, action: 'instagram' },
    { id: 'ba', test: /(비포|애프터|전후|before|after|b\/a|b&a)/i, tab: 'ba', card: 'ba', label: '비포/애프터 비교를 열었어요' },
    { id: 'bg', test: /(누끼|배경).*(제거|바꿔|교체|흰|깔끔)|배경\s*누끼/, tab: 'bg', card: 'bg', label: '배경·누끼 화면을 열었어요' },
    { id: 'template', test: /(홍보|템플릿|가격표|후기|카드).*(만들|열|보여|준비)/, tab: 'template', card: 'template', label: '홍보 템플릿을 열었어요' },
    { id: 'text', test: /(텍스트|문구|글자|가격|이벤트).*(넣|추가|작성|써)/, tab: 'text', card: 'text', label: '텍스트 넣기를 열었어요' },
    { id: 'brand', test: /(워터마크|브랜드|로고).*(넣|추가|관리|열)/, tab: 'brand', card: 'brand', label: '브랜드 화면을 열었어요' },
    { id: 'save', test: /(저장|내보내기|다운로드|사이즈|비율).*(열|해|준비)?/, tab: 'export', card: 'save', label: '저장 화면을 열었어요' },
    { id: 'hair-volume', test: /(헤어|머리|모발).*(풍성|볼륨|숱|정수리)|(풍성하게).*(헤어|머리|모발)/, tab: 'beauty', card: 'hair',
      patch: { beautyFocus: 'hair', beauty: { hairVolume: 62, hairShine: 36, hairDetail: 30, scalpBoost: 26 } }, label: '헤어 풍성감과 윤기를 올렸어요' },
    { id: 'hair-detail', test: /(머리결|모발\s*결|윤기|찰랑|염색|컬러).*(살려|보정|강조|정리)?/, tab: 'beauty', card: 'hair',
      patch: { beautyFocus: 'hair', beauty: { hairShine: 48, hairDetail: 42, hairEndsClean: 30, hairColorPop: 24 } }, label: '머리결과 컬러 디테일을 살렸어요' },
    { id: 'eye-sparkle', test: /(눈빛|눈동자|반짝|초롱|속눈썹|아이).*(살려|보정|강조|반짝)?/, tab: 'beauty', card: 'detail',
      patch: { beautyFocus: 'lash', beauty: { catchLight: 58, irisClear: 44, lashSharp: 34, eyeRedness: 24 } }, label: '눈빛 반짝임과 눈가 선명도를 올렸어요' },
    { id: 'nail-gloss', test: /(네일|손톱|패디|손).*(광택|반짝|선명|경계|피부톤)/, tab: 'beauty', card: 'detail',
      patch: { beautyFocus: 'nail', beauty: { nailGloss: 58, nailShape: 34, handSkin: 30, coolness: 18 } }, label: '네일 광택과 손 피부톤을 정리했어요' },
    { id: 'skin-detail', test: /(피부|붉은기|잡티|결|톤).*(정리|보정|완화|지워|매끈)|잡티/, tab: 'beauty', card: 'detail',
      patch: { beautyFocus: 'skin', beauty: { skin: 34, redness: 38, blemish: 42, textureSmooth: 26, yellowness: 18 } }, label: '피부톤, 붉은기, 잡티를 자연스럽게 정리했어요' },
    { id: 'relight', test: /(조명|빛|역광|어둡|그림자).*(살려|보정|밝게|정리)?/, tab: 'relight', card: 'relight',
      patch: { relight: { intensity: 48, ambientBoost: 28, warmth: 8 } }, label: '조명을 보정했어요' },
    { id: 'bright', test: /(밝기|밝게|환하게|노출).*(올려|보정|해)?/, tab: 'tune', card: 'tune',
      patch: { adjust: { brightness: 116, sharpness: 18 } }, label: '밝기를 올렸어요' },
    { id: 'vivid', test: /(채도|색감|선명|쨍하게|또렷).*(올려|보정|해)?/, tab: 'tune', card: 'tune',
      patch: { adjust: { saturate: 118, sharpness: 36 } }, label: '색감과 선명도를 올렸어요' },
    { id: 'warm', test: /(따뜻|웜톤|노란빛).*(보정|해|올려)?/, tab: 'tune', card: 'tune',
      patch: { adjust: { temperature: 16 } }, label: '따뜻한 톤으로 맞췄어요' },
    { id: 'cool', test: /(차갑|쿨톤|푸른빛).*(보정|해|맞춰)?/, tab: 'tune', card: 'tune',
      patch: { adjust: { temperature: -16 } }, label: '차가운 톤으로 맞췄어요' },
    { id: 'auto', test: /(자동\s*보정|자동보정|빠른\s*보정|한\s*번에|예쁘게).*(해|적용|보정)?/, tab: 'auto', card: 'auto',
      patch: { adjust: { brightness: 105, saturate: 110, sharpness: 24, temperature: 5 } }, label: '빠른 자동보정을 적용했어요' },
    { id: 'open', test: /(사진|이미지|포토)\s*(편집|보정|수정|꾸미|예쁘게|만들|업로드)|편집기|보정\s*화면/, tab: null, card: null, label: '사진 편집기를 열었어요' },
  ];

  function _toast(msg) { if (window.showToast) window.showToast(msg); }

  // [2026-07-22] 옛 PhotoEditor 기준 게이트 → 현재 작업실 기준으로 이관.
  //   PE 를 지워도 사진 자연어 명령이 통째로 죽지 않게 하는 핵심 지점.
  function _editorReady() {
    return !!(window.WorkspaceFlow && typeof window.WorkspaceFlow.command === 'function');
  }

  function _shopName() {
    try { return (window.WorkspaceAdapter && window.WorkspaceAdapter.shopName && window.WorkspaceAdapter.shopName()) || ''; }
    catch (_e) { return ''; }
  }

  // [2026-07-22] _mergePatch/_applyCommand/_textPatch 제거 — 옛 PhotoEditor._internal.applyStatePatch 에
  //   patch 를 꽂던 경로. 7/22 편집기 일원화 때부터 호출부가 없어 이미 死코드였고(모든 명령이
  //   _openEditor 로 감), PE 삭제에 맞춰 정리. 보정은 작업실 편집기에서 직접 조정.

  function _openEditor(cmd, _text) {
    // [2026-07-22] 옛 PhotoEditor 대신 현재 인스타식 편집기(ItdEditor)로 재연결. 자동 보정 patch(밝기 등)는
    //   편집기에서 직접 조정(옛 PE 화면 안 띄움). 소스 사진은 채팅 SourceImage.
    let src = '';
    try { const s = window.ItdasySourceImage && window.ItdasySourceImage.resolve && window.ItdasySourceImage.resolve(); src = (s && s.dataUrl) || ''; } catch (_e) { src = ''; }
    const go = () => {
      try { if (typeof window.closeAssistant === 'function') window.closeAssistant(); } catch (_c) { void _c; }
      if (window.WorkspaceFlow && typeof window.WorkspaceFlow.command === 'function') {
        window.WorkspaceFlow.command({ type: 'storyedit', photoUrls: src ? [src] : null });
      } else if (window.showToast) {
        window.showToast('작업실을 여는 중이에요. 잠시 후 다시 눌러주세요');   // [2026-07-22] 옛 PhotoEditor 폴백 제거
      }
    };
    if (window.AppLoader && window.AppLoader.ensure && !(window.AppLoader.loaded && window.AppLoader.loaded('photo'))) {
      Promise.resolve(window.AppLoader.ensure('photo')).then(go, go);
    } else { go(); }
    _toast(cmd.label);
  }

  function _currentCanvasUrl() {
    const cv = document.getElementById('peCanvas');
    if (!cv || !cv.width || !cv.height) return '';
    try { return cv.toDataURL('image/jpeg', 0.92); }
    catch (_e) { return ''; }
  }

  function _caption() {
    const shop = _shopName();   // [2026-07-22] 옛 PE 내부 state → 작업실 어댑터(샵이름 복구)
    return (shop ? shop + ' 시술 사진입니다. ' : '') + '문의는 DM 주세요.';
  }

  function _openInstagram() {
    const src = _currentCanvasUrl();
    if (src && typeof window.openInstagramPreview === 'function') {
      window.openInstagramPreview({ src, ratio: '4:5', caption: _caption(), enableUpload: true });
      _toast('인스타 업로드 준비를 열었어요');
      return;
    }
    _openEditor({ tab: 'export', card: 'save', label: '저장 화면을 열었어요' }, '');
    _toast('사진을 먼저 고른 뒤 인스타 업로드라고 말해 주세요');
  }

  function tryRun(input, q, deps) {
    const text = String(q || input?.value || '').trim();
    if (!_editorReady() || !text) return false;
    // [QA퍼징 2026-06-12] "고객/예약/매출 카드 보여줘"는 사진 템플릿 명령이 아니다 —
    //   template 커맨드의 /(…|카드).*(보여|열)/ 가 도메인 조회를 오매칭해 편집기를 열던 버그 차단.
    if (/(고객|손님|예약|매출|회원|명단|연락처|통계|차트|일정)\s*(카드|명단|목록|정보|리스트|내역|보여)/.test(text)) return false;
    // [P0 2026-09-10 실측] 아래 COMMANDS 의 정규식은 뒤 동사 그룹이 전부 **선택(`?`)** 이라
    //   사실상 "염색"·"컬러"·"윤기"·"속눈썹"·"빛"·"밝기" 같은 낱말 하나만 있으면 매칭된다.
    //   그래서 시술명이 들어간 **고객 메모 요청이 통째로 작업실로 끌려갔다.**
    //
    //   실측(배포본 9ada6d8 · 실 Chrome · 계측 없이 재현):
    //     "E2E_F_회원권만님 메모에 염색 농도 낮게 추가해줘"
    //     → 잇비 시트가 닫히고 작업실(wsv2Flow)이 열림 · "사진이 없어요" 화면
    //     → 사용자 말풍선조차 안 생김 · 답변 없음 · 메모도 안 생김
    //   원장이 "염색 진하게 선호" · "펌 약하게" 같은 메모를 쓸 때마다 요청이 사라진다.
    //
    //   위 2026-06-12 가드는 `(고객|…)\s*(카드|목록|…)` 처럼 **두 낱말이 붙어 있을 때만** 막아서
    //   "메모에 염색 …" 을 못 걸렀다. 도메인 요청을 먼저 빼는 규칙을 추가한다.
    //   단, 사진 낱말이 명시된 요청("이 사진 손님 기록에 붙여줘")은 통과시킨다 — 그건 진짜 사진 명령이다.
    const _hasPhotoWord = /(사진|이미지|포토|촬영본|편집기|보정\s*화면|누끼|배경|템플릿|워터마크|필터|썸네일)/.test(text);
    if (!_hasPhotoWord) {
      const _domainNoun = /(메모|노트|알러지|알레르기|주의사항|특이사항|잔액|회원권|정액권|선불금|매출|지출|정산|환불|결제|예약금|예약|노쇼|단골|고객|손님)/;
      const _domainVerb = /(추가|등록|기록|입력|저장|남겨|달아|적어|넣어|삭제|지워|수정|변경|바꿔|충전|차감|사용|취소|알려|보여|확인|있어|있나|뭐야|얼마)/;
      if (_domainNoun.test(text) && _domainVerb.test(text)) return false;
    }
    const cmd = COMMANDS.find(c => c.test.test(text));
    if (!cmd) return false;
    if (deps && typeof deps.clearInput === 'function') deps.clearInput(input);
    else if (input) input.value = '';
    if (cmd.action === 'instagram') _openInstagram();
    else _openEditor(cmd, text);
    return true;
  }

  window.ItdasyAssistantPhotoCommands = { tryRun };
})();

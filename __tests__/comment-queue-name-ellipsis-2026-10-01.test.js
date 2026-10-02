/* [2026-10-01 mobile-ux-08] 댓글 큐 카드의 긴 인스타 사용자명이 말줄임 없이 뚝 잘린다.
 *  실측(390px): 'guest_long_name_customer_abcdefghijklmnop' → span scrollWidth 342 > clientWidth 284, ellipsis 없음.
 *  원인: app-comment-reply-queue.js _cardHtml 의 이름 span 이 white-space:nowrap;overflow:hidden 만 있고
 *        text-overflow:ellipsis·min-width:0 이 없다(같은 파일의 제목은 ellipsis 를 쓴다).
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'app-comment-reply-queue.js'), 'utf8');

test('발신자 이름 span 에 text-overflow:ellipsis + min-width:0 + title(전체 이름)', () => {
  const m = src.match(/<span([^>]*)>' \+ _esc\(it\.name\) \+ '<\/span>/);
  expect(m).not.toBeNull();
  const attrs = m[1];
  expect(attrs).toMatch(/white-space:nowrap/);
  expect(attrs).toMatch(/overflow:hidden/);
  expect(attrs).toMatch(/text-overflow:ellipsis/);
  expect(attrs).toMatch(/min-width:0/);
  expect(attrs).toMatch(/title="' \+ _esc\(it\.name\) \+ '"/);
});

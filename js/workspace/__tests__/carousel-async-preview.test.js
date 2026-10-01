/** @jest-environment jsdom */
const fs = require('fs');
const path = require('path');
beforeEach(() => {
  window.eval(fs.readFileSync(path.join(__dirname, '../flow/util.js'), 'utf8'));
  document.body.innerHTML = '<section class="is-open" id="flow"><div data-fl-carslide="first"><div class="ig-car__img" style="background-image:url(old-first)"></div></div><div data-fl-carslide="second"><div class="ig-car__img" style="background-image:url(old-second)"></div></div><textarea>원장님 입력 중</textarea></section>';
});
test('finished image updates in place without losing Korean caption input, selection or node identity', () => {
  const root = document.getElementById('flow'), input = root.querySelector('textarea');
  input.focus(); input.setSelectionRange(3, 5);
  const first = root.querySelector('.ig-car__img');
  window.WSFlowUtil.refreshCarouselImage(root, 'first', 'blob:edited-first');
  expect(root.querySelector('.ig-car__img')).toBe(first);
  expect(first.style.backgroundImage).toContain('blob:edited-first');
  expect(root.querySelectorAll('.ig-car__img')[1].style.backgroundImage).toContain('old-second');
  expect(document.activeElement).toBe(input);
  expect(input.value).toBe('원장님 입력 중');
  expect([input.selectionStart, input.selectionEnd]).toEqual([3, 5]);
});
test('closed flow and absent photo cannot update another preview', () => {
  const root = document.getElementById('flow'); root.classList.remove('is-open');
  window.WSFlowUtil.refreshCarouselImage(root, 'first', 'blob:wrong');
  expect(root.querySelector('.ig-car__img').style.backgroundImage).toContain('old-first');
  root.classList.add('is-open'); window.WSFlowUtil.refreshCarouselImage(root, 'missing', 'blob:wrong');
  expect(root.querySelector('.ig-car__img').style.backgroundImage).toContain('old-first');
});

test('pre-caption carousel and output pair IDs refresh with their displayed item IDs', () => {
  const root = document.getElementById('flow');
  root.innerHTML = '<div data-fl-carslide="pair-2"><div class="cap-car__img" style="background-image:url(old-output)"></div></div>';
  window.WSFlowUtil.refreshCarouselImage(root, 'pair-2', 'blob:edited-output');
  expect(root.querySelector('.cap-car__img').style.backgroundImage).toContain('blob:edited-output');
});

const fs = require('fs');
const path = require('path');
const vm = require('vm');
let recipes;
beforeEach(() => {
  const context = { window: { ItdPhotoLab: { active: a => !!a.exposure } } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../photo-recipes.js'), 'utf8'), context);
  recipes = context.window.ItdPhotoRecipes;
});
function edited() {
  return { photos: ['pink-cutout', 'original-2'], photoIdx: 1, adj: [{ exposure: 2 }, {}],
    fgMask: { 0: 'mask-1' }, photoBg: { 0: { color: '#E8C7CD' } }, origPhotos: ['original-1'],
    photoDraw: { 0: 'drawing' }, presetByPhoto: { 0: 'clean' },
    layersByPhoto: { 0: [{ text: 'first' }], 1: [] }, layers: [], ratio: '4:5', fitMode: 'contain' };
}
test('non-active cutout exports its complete editable recipe', () => {
  const per = recipes.collect(edited(), { width: 432, height: 540 });
  const first = per.find(e => e.idx === 0);
  expect(first.photoUrl).toBe('pink-cutout');
  expect(first.editState.adj[0].exposure).toBe(2);
  expect(first.editState.fgMask[0]).toBe('mask-1');
  expect(first.editState.photoBg[0].color).toBe('#E8C7CD');
  expect(first.editState.photoDraw[0]).toBe('drawing');
});
test('mixed full and single-photo states preserve cutout, corrections and masks on reopen', () => {
  const full = edited(), first = recipes.collect(full, {}).find(e => e.idx === 0);
  const restored = recipes.restoreCarousel([{editState: first.editState}, {editState: full}],
    Object.assign({}, full, {photos: ['original-1', 'original-2']}), 1);
  expect(Array.from(restored.photos)).toEqual(['pink-cutout', 'original-2']);
  expect(restored.fgMask[0]).toBe('mask-1');
  expect(restored.adj[0].exposure).toBe(2);
  expect(restored.layersByPhoto[0][0].text).toBe('first');
  expect(restored.layersByPhoto[1]).toEqual([]);
  expect(restored.photoDraw[0]).toBe('drawing');
  expect(restored.origPhotos[0]).toBe('original-1');
});
test('untouched photo does not inherit active-photo text or cutout', () => {
  const full = edited(); full.photoIdx = 0; full.layers = [{text:'first'}];
  const restored = recipes.restoreCarousel([{editState: full}, {}], full, 1);
  expect(restored.layersByPhoto[1]).toEqual([]);
  expect(restored.fgMask[1]).toBeUndefined();
});
test('active photo uses its last edited text instead of the previous switch snapshot', () => {
  const full = edited(); full.photoIdx = 0; full.layers = [{text:'latest'}];
  const restored = recipes.restoreCarousel([{editState: full}, {}], full, 0);
  expect(restored.layersByPhoto[0][0].text).toBe('latest');
  expect(restored.layers[0].text).toBe('latest');
});
test('legacy single-photo state never assigns its mask or corrections to an untouched photo', () => {
  const single = { photos: ['cutout-2'], photoIdx: 0, adj: [{exposure:4}], fgMask:{0:'mask-2'}, layers:[] };
  const restored = recipes.restoreCarousel([{}, {editState:single}],
    Object.assign({}, single, {photos:['original-1','original-2']}), 1);
  expect(restored.photos[0]).toBe('original-1');
  expect(restored.adj[0].exposure).toBeUndefined();
  expect(restored.fgMask[0]).toBeUndefined();
  expect(restored.fgMask[1]).toBe('mask-2');
});

test('untouched restored photos keep a missing original eligible for first cutout', () => {
  const full=edited(), restored=recipes.restoreCarousel([{editState:full},{}],full,1);
  expect(restored.origPhotos[0]).toBe('original-1');expect(restored.origPhotos[1]).toBeNull();
});

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../itd-editor.js'), 'utf8');
const cutoutSource = source.slice(source.indexOf('  function _cancelCutout('), source.indexOf('  // 배경(색/이미지)'));
const undoSource = source.slice(source.indexOf('  function undoCutout('), source.indexOf('  function toastIt('));
const inverseSource = source.slice(source.indexOf('  function _applyInverse('), source.indexOf('  function _undo('));
const doneStart = source.indexOf("    refs.done.addEventListener('click', function () {");
const doneSource = source.slice(doneStart, source.indexOf('\n  }\n  // 저장 시 레이어', doneStart));
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
function state() { return { photos: ['original-first','original-second'], origPhotos: [], matte: {}, fgMask: {}, cutSet: {}, photoBg:{0:{color:'#E8C7CD'}}, adjSel:0, layout:{}, layers:[] }; }
function harness(compose) {
  let done;
  const ctx = { S:state(), window:{PhotoEditorBgCompose:{compose}}, root:{classList:{contains:()=>true}},
    refs:{adjCut:{classList:{add(){},remove(){}}},photo:{style:{}},done:{addEventListener:(event,fn)=>{done=fn;}}},
    toastIt:jest.fn(), isSingleL:()=>true, _cssUrl:x=>x, _pushOp:jest.fn(), renderAdjust(){},renderLayoutStrip(){},renderCollage(){},applyAdjToDisplay(){},applyPhotoTransform(){},
    exportComposite:jest.fn(), SAVE_WATCHDOG_MS:30000,setTimeout:()=>1,clearTimeout(){} };
  vm.createContext(ctx); vm.runInContext(cutoutSource+undoSource+inverseSource+doneSource,ctx);
  return {ctx,done:()=>done()};
}
test('Done on another photo waits for every in-flight cutout, then allows saving', async () => {
  const job=deferred(), {ctx,done}=harness(jest.fn(()=>job.promise));
  ctx.doCutout(0,false); ctx.S.adjSel=1; await flush(); done();
  expect(ctx.exportComposite).not.toHaveBeenCalled(); expect(ctx.S._saving).toBeUndefined();
  expect(ctx.toastIt).toHaveBeenCalledWith('배경 적용 중이에요. 적용이 끝나면 완료를 눌러 주세요');
  job.resolve({composedDataUrl:'pink-first',removedBgDataUrl:'matte'}); await flush();
  expect(Array.from(ctx.S.photos)).toEqual(['pink-first','original-second']); done();
  expect(ctx.exportComposite).toHaveBeenCalledTimes(1);
});
test('rapid color choices share one provider result and apply the latest color', async () => {
  const job=deferred(), compose=jest.fn().mockImplementationOnce(()=>job.promise).mockResolvedValue({composedDataUrl:'latest-pink',removedBgDataUrl:'matte'});
  const {ctx}=harness(compose); ctx.doCutout(0,false); await flush();
  ctx.S.photoBg[0]={color:'#D58A95'}; ctx.doCutout(0,false);
  expect(compose).toHaveBeenCalledTimes(1);
  job.resolve({composedDataUrl:'old-pink',removedBgDataUrl:'matte'}); await flush();
  expect(compose).toHaveBeenCalledTimes(2); expect(compose.mock.calls[1][0].preRemovedBgUrl).toBe('matte');
  expect(compose.mock.calls[1][0].bg.color).toBe('#D58A95'); expect(ctx.S.photos[0]).toBe('latest-pink');
  expect(Object.keys(ctx.S._cutoutPending)).toHaveLength(0);
});
test('a rejected or synchronously throwing provider frees the pending guard', async () => {
  for (const compose of [jest.fn().mockRejectedValue(new Error('network')),jest.fn(()=>{throw new Error('network');})]) {
    const {ctx}=harness(compose); ctx.doCutout(0,true); await flush();
    expect(Object.keys(ctx.S._cutoutPending)).toHaveLength(0); expect(ctx.S.photos[0]).toBe('original-first');
  }
});
test('old cancelled session response cannot mutate or unlock a newer session', async () => {
  const old=deferred(), {ctx}=harness(jest.fn(()=>old.promise));ctx.doCutout(0,false);await flush();
  const originalSession=ctx.S;ctx.S=state();ctx.S.photos[0]='new-session';ctx.S._cutoutPending={0:{}};
  old.resolve({composedDataUrl:'old-session-result',removedBgDataUrl:'old-matte'});await flush();
  expect(ctx.S.photos[0]).toBe('new-session');expect(Object.keys(ctx.S._cutoutPending)).toHaveLength(1);
  expect(Object.keys(originalSession._cutoutPending)).toHaveLength(0);
});

test('original cancels pending success or failure and permits saving', async () => {
  for (const failed of [false,true]) {
    const old=deferred(), {ctx,done}=harness(jest.fn(()=>old.promise));ctx.doCutout(0,false);await flush();
    ctx.undoCutout();done();expect(ctx.exportComposite).toHaveBeenCalledTimes(1);ctx.toastIt.mockClear();
    if(failed) old.reject(new Error('network'));else old.resolve({composedDataUrl:'late-cutout',removedBgDataUrl:'late-matte'});
    await flush();expect(ctx.S.photos[0]).toBe('original-first');expect(ctx.S.matte[0]).toBeUndefined();
    expect(ctx.toastIt).not.toHaveBeenCalled();
  }
});
test('undo/redo invalidates an old photo job without clearing a replacement job', async () => {
  for(const undo of [true,false]) {
    const old=deferred(), newer=deferred(), compose=jest.fn().mockImplementationOnce(()=>old.promise).mockImplementationOnce(()=>newer.promise);
    const {ctx}=harness(compose);ctx.doCutout(0,false);await flush();
    ctx._applyInverse({op:'photo',idx:0,before:{url:'undo-photo',cut:false},after:{url:'redo-photo',cut:true}},undo);
    ctx.doCutout(0,false);await flush();const current=ctx.S._cutoutPending[0];
    old.resolve({composedDataUrl:'stale-photo',removedBgDataUrl:'stale-matte'});await flush();
    expect(ctx.S.photos[0]).toBe(undo?'undo-photo':'redo-photo');expect(ctx.S._cutoutPending[0]).toBe(current);
    newer.resolve({composedDataUrl:'new-photo',removedBgDataUrl:'new-matte'});await flush();
    expect(ctx.S.photos[0]).toBe('new-photo');expect(Object.keys(ctx.S._cutoutPending)).toHaveLength(0);
  }
});

test('reopened legacy empty originals initialize from the selected photo', async () => {
  const compose=jest.fn().mockResolvedValue({composedDataUrl:'cutout-second',removedBgDataUrl:'matte'});
  const {ctx}=harness(compose);ctx.S.origPhotos=['original-first',''];ctx.S.adjSel=1;ctx.doCutout();await flush();
  expect(compose.mock.calls[0][0].srcUrl).toBe('original-second');expect(ctx.S.photos[1]).toBe('cutout-second');
});
test('restore original with no saved original cannot blank the photo', () => {
  const {ctx}=harness(jest.fn());ctx.S.origPhotos=[''];ctx.undoCutout();
  expect(ctx.S.photos[0]).toBe('original-first');expect(ctx.toastIt).toHaveBeenCalledWith('되돌릴 원본이 없어요');
});

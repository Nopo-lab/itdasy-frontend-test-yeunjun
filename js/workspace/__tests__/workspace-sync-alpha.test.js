const fs=require('fs');
const path=require('path');
const vm=require('vm');
const s=fs.readFileSync(path.join(__dirname,'../workspace-sync.js'),'utf8');
const fn=s.slice(s.indexOf('  function _dataUrlToUploadBlob('),s.indexOf('  // 세션 캐시'));
async function convert(dataUrl) {
  const fillRect=jest.fn(),drawImage=jest.fn(),canvas={toBlob:jest.fn((cb,mime)=>cb({type:mime})),getContext:()=>({fillRect,drawImage})};
  class Img { constructor(){this.naturalWidth=1600;this.naturalHeight=800;}set src(x){this.onload();} }
  const ctx={Image:Img,document:{createElement:()=>canvas}};vm.createContext(ctx);vm.runInContext(fn,ctx);
  const blob=await ctx._dataUrlToUploadBlob(dataUrl);return {blob,canvas,fillRect,drawImage};
}
test.each(['png','webp'])('transparent %s layer skips the white cover and uses lossless PNG',async fmt=>{
  const r=await convert('data:image/'+fmt+';base64,synthetic');
  expect(r.blob.type).toBe('image/png');expect(r.fillRect).not.toHaveBeenCalled();
  expect(r.canvas.width).toBe(1440);expect(r.canvas.height).toBe(720);expect(r.drawImage).toHaveBeenCalledTimes(1);
});
test('flattened JPEG retains existing compression and white fill',async()=>{
 const r=await convert('data:image/jpeg;base64,synthetic');expect(r.blob.type).toBe('image/jpeg');
 expect(r.fillRect).toHaveBeenCalledWith(0,0,1440,720);expect(r.canvas.toBlob.mock.calls[0][2]).toBe(0.86);
});

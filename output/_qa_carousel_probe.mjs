import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
const page = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
const errs=[]; page.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await page.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(3800);
// 색이 다른 2장 dataURL 생성
const urls = await page.evaluate(()=>{
  const mk=(hue)=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle=`hsl(${hue},60%,55%)`;g.fillRect(0,0,600,800);g.fillStyle='#fff';g.font='bold 120px sans-serif';g.fillText(String(hue),120,420);return c.toDataURL('image/jpeg',0.9);};
  return [mk(10),mk(200)];
});
const files = urls.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));
// 업로드 화면 열기
await page.evaluate(()=>{ WorkspaceFlow.open({ startScreen:'upload', cat:'ba' }); });
await page.waitForTimeout(1200);
// 실제 파일 업로드
await page.setInputFiles('[data-fl-file]', files);
await page.waitForTimeout(2000);
const up = await page.evaluate(()=>({
  tiles: document.querySelectorAll('[data-fl-tile]').length,
  selected: document.querySelectorAll('[data-fl-tile].sel, [data-fl-tile].on, [data-fl-tile][aria-selected="true"]').length,
  ctaText: (document.querySelector('[data-fl="cta"]')||{}).textContent||null,
}));
await page.screenshot({path:'output/responsive-qa/final/_car-upload.png'});
console.log('UPLOAD', JSON.stringify(up));
// 모든 타일 선택(미선택이면)
await page.evaluate(()=>{ document.querySelectorAll('[data-fl-tile]').forEach(t=>{ if(!t.className.match(/sel|on/) && t.getAttribute('aria-selected')!=='true'){ t.click(); }}); });
await page.waitForTimeout(800);
// CTA → edit
await page.click('[data-fl="cta"]');
await page.waitForTimeout(2500);
const ed = await page.evaluate(()=>({
  editsel: document.querySelectorAll('[data-fl-editsel]').length,
  edswipe: document.querySelectorAll('[data-fl-edswipe]').length,
  counter: (document.querySelector('.ed-carnav__count')||{}).textContent||null,
  pill: (document.querySelector('.ed-carnav__pill')||{}).textContent||null,
}));
await page.screenshot({path:'output/responsive-qa/final/_car-edit.png'});
console.log('EDIT', JSON.stringify(ed));
console.log('ERRS', JSON.stringify(errs.slice(0,5)));
await b.close();

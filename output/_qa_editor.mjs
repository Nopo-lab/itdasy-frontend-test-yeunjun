import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const page = await ctx.newPage();
const errs=[];
page.on('console', m=>{ if(m.type()==='error') errs.push(m.text().slice(0,140)); });
page.on('pageerror', e=>errs.push('PAGEERR:'+String(e).slice(0,140)));
await page.addInitScript(([tok])=>{ try{ localStorage.setItem('itdasy_token::staging', tok); }catch(e){} }, [access_token]);
await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(3800);

// 2장의 raster 테스트 이미지 생성(canvas) + 편집화면 진입
const opened = await page.evaluate(async ()=>{
  function mk(hue){ const c=document.createElement('canvas'); c.width=600;c.height=800; const g=c.getContext('2d');
    g.fillStyle=`hsl(${hue},40%,70%)`; g.fillRect(0,0,600,800);
    g.fillStyle='#f1c9a5'; g.beginPath(); g.ellipse(300,360,180,230,0,0,7); g.fill();
    g.fillStyle='#5b3a29'; g.beginPath(); g.ellipse(240,320,22,14,0,0,7); g.fill(); g.beginPath(); g.ellipse(360,320,22,14,0,0,7); g.fill();
    return c.toDataURL('image/jpeg',0.9); }
  const imgs=[mk(210),mk(20)];
  if(typeof WorkspaceFlow==='undefined') return {err:'no WorkspaceFlow'};
  try{ WorkspaceFlow.open({ photoUrls: imgs, startScreen:'edit', cat:'ba' }); }catch(e){ return {err:String(e)}; }
  return {ok:true};
});
console.log('open:', JSON.stringify(opened));
await page.waitForTimeout(2500);

const R={};
// 진입 상태
R.enter = await page.evaluate(()=>({
  isOpen: (typeof WorkspaceFlow!=='undefined') && WorkspaceFlow.isOpen && WorkspaceFlow.isOpen(),
  editSection: !!document.querySelector('[data-fs="edit"]'),
  dots: document.querySelectorAll('[data-fl-editsel]').length,
  counter: (document.querySelector('.ed-carnav__count')||{}).textContent||null,
  pill: (document.querySelector('.ed-carnav__pill')||{}).textContent||null,
  tabs: [...document.querySelectorAll('[data-fl-edtab]')].map(t=>t.getAttribute('data-fl-edtab')),
  edPhoto: !!document.querySelector('.ed-photo'),
}));
await page.screenshot({path:'output/responsive-qa/final/_editor-enter.png'}).catch(()=>{});
console.log('ENTER', JSON.stringify(R.enter));
console.log('ERRS', JSON.stringify(errs.slice(0,6)));
await b.close();

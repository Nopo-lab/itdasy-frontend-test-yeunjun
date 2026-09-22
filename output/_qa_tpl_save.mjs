import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForTimeout(3600);
const homeBefore = await p.evaluate(()=>document.querySelectorAll('.wsv2-card,[data-fl-slot],.ws-card,[data-fl-tile]').length);
async function mkFiles(n){const urls=await p.evaluate((n)=>{const o=[];for(let i=0;i<n;i++){const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle=`hsl(${i*70},65%,55%)`;g.fillRect(0,0,600,800);g.fillStyle='#fff';g.font='bold 160px sans-serif';g.fillText('P'+(i+1),150,440);o.push(c.toDataURL('image/jpeg',0.9));}return o;},n);return urls.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));}
await p.evaluate(()=>{ WorkspaceFlow.open({ startScreen:'upload', cat:'ba' }); }); await p.waitForTimeout(900);
await p.setInputFiles('[data-fl-file]', await mkFiles(2)); await p.waitForTimeout(1600);
await p.evaluate(()=>{ document.querySelectorAll('[data-fl-tile]').forEach(t=>{ if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true') t.click(); }); }); await p.waitForTimeout(600);
await p.click('[data-fl="cta"]'); await p.waitForTimeout(2000);
const R={};
// 템플릿 fold 열기(접혀있으면) → 칩 적용
await p.evaluate(()=>{ const f=document.querySelector('[data-fl-fold="tpl"]'); if(f) f.scrollIntoView(); });
await p.evaluate(()=>{ const f=document.querySelector('[data-fl-fold="tpl"]'); if(f && f.getAttribute('aria-expanded')!=='true' && !/open|on/.test(f.className)) f.click(); });
await p.waitForTimeout(1000);
R.chipsVisible = await p.evaluate(()=>[...document.querySelectorAll('[data-fl-tplchip]')].filter(c=>c.offsetParent!==null).length);
const chip = await p.$('[data-fl-tplchip]:not([disabled])');
if(chip){ await chip.scrollIntoViewIfNeeded(); await chip.click(); await p.waitForTimeout(4000); }
R.tpl_applied = await p.evaluate(()=>({
  hasResultImg: !!document.querySelector('[data-fl-carslide] .cap-car__img, .cap-car__img, [data-fl-carousel]'),
  edPhotoChanged: (getComputedStyle(document.querySelector('.ed-photo')||document.body).backgroundImage||'').includes('data:'),
}));
await p.screenshot({path:'output/responsive-qa/final/_tpl-applied.png'});
// 저장→캡션→저장/홈
await p.click('text=저장하고 게시글 쓰기').catch(()=>{});
await p.waitForTimeout(2500);
R.afterSaveCta = await p.evaluate(()=>({
  screen: (document.querySelector('[data-fl-step]')||{}).textContent||null,
  captionScreen: !!document.querySelector('#toneCards, [data-fl-capbody], [data-fl-scenario]'),
  saveBtns: [...document.querySelectorAll('button')].map(x=>x.textContent.trim()).filter(t=>/저장|게시|완료|홈/.test(t)).slice(0,8),
}));
await p.screenshot({path:'output/responsive-qa/final/_after-savecta.png'});
console.log(JSON.stringify(R,null,1));
console.log('ERRS', JSON.stringify(errs.slice(0,5)));
await b.close();

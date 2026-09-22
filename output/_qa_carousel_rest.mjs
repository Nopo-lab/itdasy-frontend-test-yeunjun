import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
const p = await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForTimeout(3600);
// 홈 카드 수(업로드 전)
const homeBefore = await p.evaluate(()=>document.querySelectorAll('.wsv2-card, [data-fl-slot], .ws-card, .grid-cell').length);
async function mkFiles(n){const urls=await p.evaluate((n)=>{const o=[];for(let i=0;i<n;i++){const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle=`hsl(${i*70},65%,55%)`;g.fillRect(0,0,600,800);g.fillStyle='#fff';g.font='bold 160px sans-serif';g.fillText('P'+(i+1),150,440);o.push(c.toDataURL('image/jpeg',0.9));}return o;},n);return urls.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));}
await p.evaluate(()=>{ WorkspaceFlow.open({ startScreen:'upload', cat:'ba' }); }); await p.waitForTimeout(900);
await p.setInputFiles('[data-fl-file]', await mkFiles(2)); await p.waitForTimeout(1600);
await p.evaluate(()=>{ document.querySelectorAll('[data-fl-tile]').forEach(t=>{ if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true') t.click(); }); }); await p.waitForTimeout(600);
await p.click('[data-fl="cta"]'); await p.waitForTimeout(2000);
const cnt=()=>p.evaluate(()=>(document.querySelector('.ed-carnav__count')||{}).textContent);
const R={};
R.before_swipe = await cnt();
// 스와이프 좌(다음)
await p.evaluate(()=>{
  const vp=document.querySelector('[data-fl-edvp]')||document.querySelector('.ed-photo-vp')||document.querySelector('.ed-photo');
  function ft(type,x){const t=new Touch({identifier:1,target:vp,clientX:x,clientY:400});vp.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],targetTouches:type==='touchend'?[]:[t],changedTouches:[t]}));}
  ft('touchstart',320); ft('touchmove',260); ft('touchmove',120); ft('touchend',120);
});
await p.waitForTimeout(900);
R.after_swipe_left = await cnt();
// 스와이프 우(이전)
await p.evaluate(()=>{
  const vp=document.querySelector('[data-fl-edvp]')||document.querySelector('.ed-photo-vp')||document.querySelector('.ed-photo');
  function ft(type,x){const t=new Touch({identifier:1,target:vp,clientX:x,clientY:400});vp.dispatchEvent(new TouchEvent(type,{bubbles:true,cancelable:true,touches:type==='touchend'?[]:[t],targetTouches:type==='touchend'?[]:[t],changedTouches:[t]}));}
  ft('touchstart',100); ft('touchmove',200); ft('touchmove',320); ft('touchend',320);
});
await p.waitForTimeout(900);
R.after_swipe_right = await cnt();
// 템플릿: tpl fold 열고 첫 칩 적용
R.tpl = await p.evaluate(()=>({ foldExists: !!document.querySelector('[data-fl-fold="tpl"]'), chips: document.querySelectorAll('[data-fl-tplchip]').length }));
try{
  const fold=await p.$('[data-fl-fold="tpl"]'); if(fold){ await fold.click(); await p.waitForTimeout(800);}
  const chip=await p.$('[data-fl-tplchip]'); if(chip){ await chip.click(); await p.waitForTimeout(3500); }
  R.tpl_after = await p.evaluate(()=>({ resultCarousel: !!document.querySelector('[data-fl-carousel]'), pills: document.querySelectorAll('.tpl-car__pill').length, dots: document.querySelectorAll('.cap-car__dot').length }));
}catch(e){ R.tpl_after={err:String(e).slice(0,80)}; }
await p.screenshot({path:'output/responsive-qa/final/_car-template.png'});
console.log(JSON.stringify(R,null,1));
console.log('ERRS', JSON.stringify(errs.slice(0,5)));
await b.close();

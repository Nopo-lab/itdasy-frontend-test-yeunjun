import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b=await chromium.launch();
const p=await(await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3600);
// 2장(전/후) 업로드 → 편집
const files=await p.evaluate(()=>{const o=[];for(let i=0;i<2;i++){const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle=`hsl(${i*180},60%,55%)`;g.fillRect(0,0,600,800);g.fillStyle='#fff';g.font='bold 160px sans-serif';g.fillText(i===0?'전':'후',180,440);o.push(c.toDataURL('image/jpeg',0.9));}return o;});
const fl=files.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));
await p.evaluate(()=>{WorkspaceFlow.open({startScreen:'upload',cat:'ba'});}); await p.waitForTimeout(800);
await p.setInputFiles('[data-fl-file]',fl); await p.waitForTimeout(1500);
await p.evaluate(()=>{document.querySelectorAll('[data-fl-tile]').forEach(t=>{if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true')t.click();});}); await p.waitForTimeout(500);
await p.click('[data-fl="cta"]'); await p.waitForTimeout(1800);
// 템플릿 fold 열기 → 전후 칩 → 첫 전후 템플릿 적용
await p.click('[data-fl-fold="tpl"]').catch(()=>{}); await p.waitForTimeout(700);
await p.evaluate(()=>{ const c=[...document.querySelectorAll('[data-fl-tplchip]')].find(x=>/전후/.test(x.textContent)); if(c) c.click(); }); await p.waitForTimeout(700);
const tplItem = await p.$('[data-fl-tpl]');
const R={tplFound: !!tplItem};
if(tplItem){ await tplItem.click(); await p.waitForTimeout(4000); }
// 적용 후 구조
R.afterApply = await p.evaluate(()=>({
  inlineResult: !!document.querySelector('.tplres'),
  badge: (document.querySelector('.tplres__badge')||{}).textContent||null,
  resultImg: ((document.querySelector('.tplres__img')||{}).style?.backgroundImage||'').slice(0,42),
  toggleLabel: (document.querySelector('[data-fl-fold="tpl"] span')||{}).textContent||null,
  hasOldCarousel: !!document.querySelector('.tpl-applied'),  // 옛 분리 carousel 잔존?
}));
const img1 = await p.evaluate(()=>((document.querySelector('.tplres__img')||{}).style?.backgroundImage||''));
// 보정(밝기) → 결과 재합성 확인
await p.evaluate(()=>{ try{ showTab; }catch(e){} });
const sl = await p.$('[data-fl-range="brightness"]');
if(sl){ await sl.evaluate(s=>{ s.value=70; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); }); await p.waitForTimeout(2500); }
const img2 = await p.evaluate(()=>((document.querySelector('.tplres__img')||{}).style?.backgroundImage||''));
R.editRecomposite = { changed: img1 !== img2 && img2.length>40, brightnessSliderFound: !!sl };
await p.screenshot({path:'output/responsive-qa/final/_v559-tpl-result.png'});
// 280px 홈
const p2=await(await b.newContext({viewport:{width:280,height:653}})).newPage();
await p2.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p2.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p2.waitForTimeout(3600);
R.home280_hScroll = await p2.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
R.errs = errs.slice(0,6);
console.log(JSON.stringify(R,null,1));
await b.close();

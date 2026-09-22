import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b=await chromium.launch();
const p=await(await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,140)));
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3600);
const files=await p.evaluate(()=>{const o=[];for(let i=0;i<2;i++){const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle=`hsl(${i*180},60%,55%)`;g.fillRect(0,0,600,800);g.fillStyle='#fff';g.font='bold 160px sans-serif';g.fillText(i===0?'전':'후',180,440);o.push(c.toDataURL('image/jpeg',0.9));}return o;});
const fl=files.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));
await p.evaluate(()=>{WorkspaceFlow.open({startScreen:'upload',cat:'ba'});}); await p.waitForTimeout(800);
await p.setInputFiles('[data-fl-file]',fl); await p.waitForTimeout(1500);
await p.evaluate(()=>{document.querySelectorAll('[data-fl-tile]').forEach(t=>{if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true')t.click();});}); await p.waitForTimeout(500);
await p.click('[data-fl="cta"]'); await p.waitForTimeout(1800);
// 그리드 이미 열림. '전후' 칩 → 첫 템플릿 적용 (fold 클릭 안 함)
await p.evaluate(()=>{ const c=[...document.querySelectorAll('[data-fl-tplchip]')].find(x=>/전후/.test(x.textContent)); if(c) c.click(); }); await p.waitForTimeout(700);
const item=await p.$('[data-fl-tpl]');
const R={tplItems: await p.evaluate(()=>document.querySelectorAll('[data-fl-tpl]').length)};
if(item){ await item.scrollIntoViewIfNeeded(); await item.click(); await p.waitForTimeout(4500); }
R.afterApply=await p.evaluate(()=>({
  inlineResult: !!document.querySelector('.tplres'),
  badge:(document.querySelector('.tplres__badge')||{}).textContent||null,
  hasResultImg: ((document.querySelector('.tplres__img')||{}).style?.backgroundImage||'').includes('data:'),
  toggleLabel:(document.querySelector('[data-fl-fold="tpl"] span')||{}).textContent?.trim()||null,
  oldCarousel: !!document.querySelector('.tpl-applied'),
}));
const img1=await p.evaluate(()=>((document.querySelector('.tplres__img')||{}).style?.backgroundImage||''));
// 밝기 보정 → 결과 재합성
const sl=await p.$('[data-fl-range="brightness"]');
if(sl){ await sl.evaluate(s=>{ s.value=75; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); }); await p.waitForTimeout(3000); }
const img2=await p.evaluate(()=>((document.querySelector('.tplres__img')||{}).style?.backgroundImage||''));
R.editRecomposite={ changed: img1!==img2 && img2.includes('data:'), len1:img1.length, len2:img2.length };
await p.screenshot({path:'output/responsive-qa/final/_v559-tpl-result.png'});
R.errs=errs.slice(0,6);
console.log(JSON.stringify(R,null,1));
await b.close();

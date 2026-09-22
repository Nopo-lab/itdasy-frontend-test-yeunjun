import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b=await chromium.launch();
const p=await(await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3400);
// 4장(색·라벨 다름) 업로드
const files=await p.evaluate(()=>{const lbl=['A전','B후','C전','D후'];const o=[];for(let i=0;i<4;i++){const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle=`hsl(${i*70},65%,55%)`;g.fillRect(0,0,600,800);g.fillStyle='#fff';g.font='bold 120px sans-serif';g.fillText(lbl[i],120,440);o.push(c.toDataURL('image/jpeg',0.9));}return o;});
const fl=files.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));
await p.evaluate(()=>{WorkspaceFlow.open({startScreen:'upload',cat:'ba'});}); await p.waitForTimeout(700);
await p.setInputFiles('[data-fl-file]',fl); await p.waitForTimeout(1600);
// 전부 선택
await p.evaluate(()=>{document.querySelectorAll('[data-fl-tile]').forEach(t=>{if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true')t.click();});}); await p.waitForTimeout(500);
// 역할 지정: 0=before,1=after,2=before,3=after → 2 pair
for(const sr of ['0:before','1:after','2:before','3:after']){ await p.evaluate(s=>{const btn=document.querySelector(`[data-fl-setrole="${s}"]`); if(btn) btn.click();}, sr); await p.waitForTimeout(250); }
const R={};
R.rolesSet = await p.evaluate(()=>[...document.querySelectorAll('[data-fl-setrole].on')].map(b=>b.getAttribute('data-fl-setrole')));
await p.screenshot({path:'output/responsive-qa/v559-template-result-ui/_multipair-upload.png'});
await p.click('[data-fl="cta"]'); await p.waitForTimeout(1800);
// 전후 템플릿 적용
await p.evaluate(()=>{ const c=[...document.querySelectorAll('[data-fl-tplchip]')].find(x=>/전후/.test(x.textContent)); if(c) c.click(); }); await p.waitForTimeout(500);
const it=await p.$('[data-fl-tpl]'); if(it){ await it.scrollIntoViewIfNeeded(); await it.click(); await p.waitForTimeout(6000); }
R.pairChips = await p.evaluate(()=>[...document.querySelectorAll('[data-fl-pairsel]')].map(c=>({id:c.getAttribute('data-fl-pairsel'),label:c.textContent.trim(),on:/\bon\b/.test(c.className)})));
const img1 = await p.evaluate(()=>((document.querySelector('.tplres__img')||{}).style?.backgroundImage||''));
// pair 2 로 전환
const chips = await p.$$('[data-fl-pairsel]');
if(chips.length>1){ await chips[1].click(); await p.waitForTimeout(1200); }
R.afterSwitch = await p.evaluate(()=>({active:[...document.querySelectorAll('[data-fl-pairsel]')].map(c=>/\bon\b/.test(c.className)), badge:(document.querySelector('.tplres__badge')||{}).textContent}));
const img2 = await p.evaluate(()=>((document.querySelector('.tplres__img')||{}).style?.backgroundImage||''));
R.resultChangedOnSwitch = img1 !== img2 && img2.includes('data:');
await p.screenshot({path:'output/responsive-qa/v559-template-result-ui/_multipair-pair2.png'});
R.errs = errs.slice(0,5);
console.log(JSON.stringify(R,null,1));
await b.close();

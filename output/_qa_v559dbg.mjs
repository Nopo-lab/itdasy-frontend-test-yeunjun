import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b=await chromium.launch();
const p=await(await b.newContext({viewport:{width:390,height:844}})).newPage();
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3600);
const files=await p.evaluate(()=>{const o=[];for(let i=0;i<2;i++){const c=document.createElement('canvas');c.width=600;c.height=800;c.getContext('2d').fillRect(0,0,600,800);o.push(c.toDataURL('image/jpeg',0.9));}return o;});
const fl=files.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));
await p.evaluate(()=>{WorkspaceFlow.open({startScreen:'upload',cat:'ba'});}); await p.waitForTimeout(800);
await p.setInputFiles('[data-fl-file]',fl); await p.waitForTimeout(1500);
await p.evaluate(()=>{document.querySelectorAll('[data-fl-tile]').forEach(t=>{if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true')t.click();});}); await p.waitForTimeout(500);
await p.click('[data-fl="cta"]'); await p.waitForTimeout(1800);
const before=await p.evaluate(()=>({foldBtn:!!document.querySelector('[data-fl-fold="tpl"]'), tplItems:document.querySelectorAll('[data-fl-tpl]').length, foldHtml:(document.querySelector('[data-fl-fold="tpl"]')||{}).outerHTML?.slice(0,80)}));
// fold 클릭
const fb=await p.$('[data-fl-fold="tpl"]'); if(fb){ await fb.scrollIntoViewIfNeeded(); await fb.click(); }
await p.waitForTimeout(900);
const after=await p.evaluate(()=>({tplItems:document.querySelectorAll('[data-fl-tpl]').length, chips:document.querySelectorAll('[data-fl-tplchip]').length, grid:!!document.querySelector('.tpl-grid2'), edTplHtmlLen:(document.querySelector('[data-ed-tpl]')||{}).innerHTML?.length}));
console.log('BEFORE', JSON.stringify(before));
console.log('AFTER_FOLD_CLICK', JSON.stringify(after));
await p.screenshot({path:'output/responsive-qa/final/_v559-dbg.png'});
await b.close();

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
await p.evaluate(()=>{WorkspaceFlow.open({startScreen:'upload',cat:'ba'});}); await p.waitForTimeout(700);
await p.setInputFiles('[data-fl-file]',fl); await p.waitForTimeout(1500);
await p.evaluate(()=>{document.querySelectorAll('[data-fl-tile]').forEach(t=>{if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true')t.click();});}); await p.waitForTimeout(400);
await p.click('[data-fl="cta"]'); await p.waitForTimeout(1600);
await p.evaluate(()=>{ const c=[...document.querySelectorAll('[data-fl-tplchip]')].find(x=>/전후/.test(x.textContent)); if(c) c.click(); }); await p.waitForTimeout(500);
const it=await p.$('[data-fl-tpl]'); if(it){ await it.scrollIntoViewIfNeeded(); await it.click(); await p.waitForTimeout(4000); }
await p.click('text=저장하고 게시글 쓰기').catch(()=>{}); await p.waitForTimeout(1800);
const si=await p.$('[data-fl-service]'); if(si){ await si.fill('젤네일 핑크'); await si.press('Enter'); await p.waitForTimeout(9000); }
function dump(){ return p.evaluate(()=>({ step:(document.querySelector('[data-fl-step]')||{}).textContent, btns:[...document.querySelectorAll('button,[data-fl]')].filter(x=>x.offsetParent!==null).map(x=>({t:(x.textContent||'').trim().slice(0,14),fl:x.getAttribute&&x.getAttribute('data-fl')})).filter(x=>x.t||x.fl).slice(0,30) })); }
console.log('CAPTION_SCREEN', JSON.stringify(await dump()));
// cta 한번(다음) → 다음 화면 버튼
const cta=await p.$('[data-fl="cta"]'); if(cta){ await cta.click(); await p.waitForTimeout(2200); }
console.log('NEXT_SCREEN', JSON.stringify(await dump()));
await b.close();

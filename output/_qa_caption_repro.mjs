import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
const sent=[]; p.on('request', r=>{ if(r.url().includes('/persona/generate')&&r.method()==='POST'){ try{ sent.push(JSON.parse(r.postData()||'{}')); }catch(e){} } });
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3800);
async function mkFiles(n){const urls=await p.evaluate((n)=>{const o=[];for(let i=0;i<n;i++){const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle=`hsl(${i*70},65%,55%)`;g.fillRect(0,0,600,800);o.push(c.toDataURL('image/jpeg',0.9));}return o;},n);return urls.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));}
// 메인 워크플로: 업로드→편집→캡션
await p.evaluate(()=>{ WorkspaceFlow.open({ startScreen:'upload', cat:'flex' }); }); await p.waitForTimeout(900);
await p.setInputFiles('[data-fl-file]', await mkFiles(1)); await p.waitForTimeout(1500);
await p.evaluate(()=>{ document.querySelectorAll('[data-fl-tile]').forEach(t=>{ if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true') t.click(); }); }); await p.waitForTimeout(600);
await p.click('[data-fl="cta"]'); await p.waitForTimeout(1800);   // → edit
await p.click('text=저장하고 게시글 쓰기').catch(()=>{}); await p.waitForTimeout(2000);  // → caption
// 시술내역 입력창에 '젤네일 핑크핑크 반짝' 타이핑
const svcInput = await p.$('[data-fl-service]');
const R={ hasSvcInput: !!svcInput };
if(svcInput){
  await svcInput.fill('젤네일 핑크핑크 반짝');
  await p.waitForTimeout(400);
  await svcInput.press('Enter');   // Enter → _triggerCaptionGenerate
  await p.waitForTimeout(10000);
}
R.sentPayloads = sent.map(s=>({ photo_context:(s.photo_context||'').slice(0,120), treatment_keyword:s.treatment_keyword, service:s.service, category:s.category }));
R.caption = await p.evaluate(()=>{ const el=document.querySelector('[data-fl-igcap],[data-fl-capbody]'); return el?(el.textContent||el.value||''):''; });
const LEAK=['붙임머리','긴머리','손상모','머릿결','24인치','레이어드'];
R.leaks = LEAK.filter(w=>(R.caption||'').includes(w));
console.log(JSON.stringify(R,null,1));
await b.close();

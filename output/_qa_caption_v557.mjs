import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
const LEAK=['붙임머리','긴머리','손상모','머릿결','24인치','레이어드','네일','속눈썹'];
async function run(input, regen=0){
  const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
  const sent=[]; p.on('request', r=>{ if(r.url().includes('/persona/generate')&&r.method()==='POST'){ try{sent.push(JSON.parse(r.postData()||'{}'));}catch(e){} } });
  await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
  await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3600);
  const f=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;c.getContext('2d').fillRect(0,0,600,800);return c.toDataURL('image/jpeg',0.9);});
  const file={name:'p.jpg',mimeType:'image/jpeg',buffer:Buffer.from(f.split(',')[1],'base64')};
  await p.evaluate(()=>{ WorkspaceFlow.open({ startScreen:'upload', cat:'flex' }); }); await p.waitForTimeout(800);
  await p.setInputFiles('[data-fl-file]', [file]); await p.waitForTimeout(1400);
  await p.evaluate(()=>{ document.querySelectorAll('[data-fl-tile]').forEach(t=>{ if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true') t.click(); }); }); await p.waitForTimeout(500);
  await p.click('[data-fl="cta"]'); await p.waitForTimeout(1600);
  await p.click('text=저장하고 게시글 쓰기').catch(()=>{}); await p.waitForTimeout(1800);
  const si=await p.$('[data-fl-service]'); await si.fill(input); await p.waitForTimeout(300); await si.press('Enter'); await p.waitForTimeout(9000);
  const caps=[];
  caps.push(await p.evaluate(()=>{const el=document.querySelector('[data-fl-igcap],[data-fl-capbody]');return el?(el.textContent||el.value||''):'';}));
  // 다시 생성 regen 회
  for(let i=0;i<regen;i++){
    await p.evaluate(()=>{ const btn=[...document.querySelectorAll('button,[data-fl-var]')].find(x=>/다시 쓰기|다시생성|다시 생성/.test(x.textContent||'')||x.getAttribute('data-fl-var')==='regen'); if(btn) btn.click(); });
    await p.waitForTimeout(9000);
    caps.push(await p.evaluate(()=>{const el=document.querySelector('[data-fl-igcap],[data-fl-capbody]');return el?(el.textContent||el.value||''):'';}));
  }
  const tk = sent.length? sent[sent.length-1].treatment_keyword : null;
  await p.context().close();
  return { caps, tk, pcLead:(sent[0]?.photo_context||'').slice(0,50) };
}
const out={};
for(const inp of ['젤네일 핑크핑크 반짝','레이어드컷','속눈썹펌']){
  const r = await run(inp, inp==='젤네일 핑크핑크 반짝'?2:0);
  // 누출: 입력에 없는 LEAK 단어만
  const inWords = LEAK.filter(w=>inp.includes(w));
  const leaks = r.caps.map(c=>LEAK.filter(w=>!inp.includes(w) && c.includes(w)));
  out[inp]={ tk:r.tk, caps:r.caps, leaks };
}
console.log(JSON.stringify(out,null,1));
await b.close();

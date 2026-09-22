import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b=await chromium.launch();
const ctx=await b.newContext({viewport:{width:390,height:844}});
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3600);
const R={};
R.homeCardsBefore = await p.evaluate(()=>document.querySelectorAll('.wsv2-card').length);
const files=await p.evaluate(()=>{const o=[];for(let i=0;i<2;i++){const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle=`hsl(${i*180},60%,55%)`;g.fillRect(0,0,600,800);g.fillStyle='#fff';g.font='bold 150px sans-serif';g.fillText(i===0?'전':'후',180,440);o.push(c.toDataURL('image/jpeg',0.9));}return o;});
const fl=files.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));
await p.evaluate(()=>{WorkspaceFlow.open({startScreen:'upload',cat:'ba'});}); await p.waitForTimeout(700);
await p.setInputFiles('[data-fl-file]',fl); await p.waitForTimeout(1500);
await p.evaluate(()=>{document.querySelectorAll('[data-fl-tile]').forEach(t=>{if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true')t.click();});}); await p.waitForTimeout(400);
await p.click('[data-fl="cta"]'); await p.waitForTimeout(1600);
// 템플릿 적용
await p.evaluate(()=>{ const c=[...document.querySelectorAll('[data-fl-tplchip]')].find(x=>/전후/.test(x.textContent)); if(c) c.click(); }); await p.waitForTimeout(500);
const it=await p.$('[data-fl-tpl]'); if(it){ await it.scrollIntoViewIfNeeded(); await it.click(); await p.waitForTimeout(4500); }
// 캡션 진입 → 시술문구 입력 → 생성
await p.click('text=저장하고 게시글 쓰기').catch(()=>{}); await p.waitForTimeout(1800);
const si=await p.$('[data-fl-service]'); if(si){ await si.fill('젤네일 핑크 글리터'); await p.waitForTimeout(300); }
const gen=await p.$('[data-fl-cgen]'); if(gen){ await gen.click(); await p.waitForTimeout(9000); }
R.captionMade = await p.evaluate(()=>(((document.querySelector('[data-fl-capbody]')||{}).value)||'').length>0);
// 저장/게시완료 진행: cta(다음)로 connect→preview, 거기서 저장/준비 액션
for(let i=0;i<3;i++){
  const moved=await p.evaluate(()=>{ const m=[...document.querySelectorAll('button,[data-fl]')].find(x=>/다음|게시글 저장|저장하고|완료|준비|올리기|copycap|saveimg/.test((x.textContent||'')+(x.getAttribute&&x.getAttribute('data-fl')||'')) && x.offsetParent!==null); if(m){m.click(); return (m.textContent||m.getAttribute('data-fl')||'').trim().slice(0,16);} return null; });
  await p.waitForTimeout(2200);
  if(!moved) break;
}
// 저장 액션(saveimg/copycap) 직접 트리거 시도
await p.evaluate(()=>{ const s=[...document.querySelectorAll('[data-fl]')].find(x=>/saveimg|copycap/.test(x.getAttribute('data-fl')||'')); if(s) s.click(); }); await p.waitForTimeout(2000);
// 홈으로
await p.evaluate(()=>{ const h=[...document.querySelectorAll('button,[data-tab],[data-fl]')].find(x=>/^홈$/.test((x.textContent||'').trim())||x.getAttribute('data-tab')==='home'||/close|홈으로/.test(x.getAttribute('data-fl')||'')); if(h) h.click(); }); await p.waitForTimeout(2500);
R.homeCardsAfter = await p.evaluate(()=>document.querySelectorAll('.wsv2-card').length);
R.dbSlots = await p.evaluate(async ()=>{ try{ if(typeof loadSlotsFromDB==='function'){ const s=await loadSlotsFromDB(); return Array.isArray(s)?s.length:'na'; } }catch(e){return 'err';} return 'nofn'; });
// 새로고침 후 유지
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(3500);
R.homeCardsAfterReload = await p.evaluate(()=>document.querySelectorAll('.wsv2-card').length);
R.savedSlotHasTplOutput = await p.evaluate(async ()=>{ try{ const s=await loadSlotsFromDB(); if(!Array.isArray(s)||!s.length) return 'noslots'; const last=s[0]; return !!(last.templateOutputs&&last.templateOutputs.length)||!!last.templateOutput; }catch(e){return 'err';} });
await p.screenshot({path:'output/responsive-qa/v559-template-result-ui/_savehome.png'});
R.errs=errs.slice(0,5);
console.log(JSON.stringify(R,null,1));
await b.close();

import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await p.waitForTimeout(4000);
const R={};
R.homeCardsBefore = await p.evaluate(()=>document.querySelectorAll('.wsv2-card,[data-fl-card],[data-fl-slottile],.ws-home__card,[data-slot-id]').length);
async function mkFiles(n){const urls=await p.evaluate((n)=>{const o=[];for(let i=0;i<n;i++){const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle=`hsl(${i*70},65%,55%)`;g.fillRect(0,0,600,800);g.fillStyle='#fff';g.font='bold 160px sans-serif';g.fillText('P'+(i+1),150,440);o.push(c.toDataURL('image/jpeg',0.9));}return o;},n);return urls.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));}
await p.evaluate(()=>{ WorkspaceFlow.open({ startScreen:'upload', cat:'ba' }); }); await p.waitForTimeout(900);
await p.setInputFiles('[data-fl-file]', await mkFiles(2)); await p.waitForTimeout(1600);
await p.evaluate(()=>{ document.querySelectorAll('[data-fl-tile]').forEach(t=>{ if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true') t.click(); }); }); await p.waitForTimeout(600);
await p.click('[data-fl="cta"]'); await p.waitForTimeout(1800);
await p.click('text=저장하고 게시글 쓰기').catch(()=>{}); await p.waitForTimeout(2200);
// 시나리오 '시술완성' → 캡션 생성
await p.click('text=시술완성').catch(()=>{}); await p.waitForTimeout(1000);
// 생성 버튼이 있으면 클릭
for(const sel of ['text=만들기','text=게시글 만들기','[data-fl="cta"]']){ const el=await p.$(sel); if(el){ await el.click().catch(()=>{}); break; } }
await p.waitForTimeout(8000);
R.afterGen = await p.evaluate(()=>({ step:(document.querySelector('[data-fl-step]')||{}).textContent, hasCaption: ((document.querySelector('[data-fl-capbody]')||{}).value||'').length>0 }));
// 끝까지 진행: 다음/완료/저장 반복 후 홈
for(let i=0;i<4;i++){
  const moved = await p.evaluate(()=>{
    const btns=[...document.querySelectorAll('button,[data-fl]')];
    const m=btns.find(x=>/다음|완료|게시|저장하고|홈으로/.test(x.textContent||'') && x.offsetParent!==null);
    if(m){ m.click(); return (m.textContent||'').trim().slice(0,12); } return null;
  });
  await p.waitForTimeout(2500);
  if(!moved) break;
}
// 홈 복귀 시도
await p.evaluate(()=>{ const h=[...document.querySelectorAll('button,[data-tab],a')].find(x=>/^홈$/.test((x.textContent||'').trim())||x.getAttribute('data-tab')==='home'); if(h) h.click(); }); 
await p.waitForTimeout(2500);
R.homeCardsAfter = await p.evaluate(()=>document.querySelectorAll('.wsv2-card,[data-fl-card],[data-fl-slottile],.ws-home__card,[data-slot-id]').length);
// IndexedDB 슬롯 확인(저장 영속화)
R.dbSlots = await p.evaluate(async ()=>{ try{ if(typeof loadSlotsFromDB==='function'){ const s=await loadSlotsFromDB(); return Array.isArray(s)?s.length:'n/a'; } }catch(e){return 'err:'+e.message;} return 'no-fn'; });
await p.screenshot({path:'output/responsive-qa/final/_save-home.png', fullPage:false});
console.log(JSON.stringify(R,null,1));
console.log('ERRS', JSON.stringify(errs.slice(0,5)));
await b.close();

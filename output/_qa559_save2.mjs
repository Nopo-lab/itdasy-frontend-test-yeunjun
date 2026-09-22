import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b=await chromium.launch();
const p=await(await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3600);
const files=await p.evaluate(()=>{const o=[];for(let i=0;i<2;i++){const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle=`hsl(${i*180},60%,55%)`;g.fillRect(0,0,600,800);o.push(c.toDataURL('image/jpeg',0.9));}return o;});
const fl=files.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));
await p.evaluate(()=>{WorkspaceFlow.open({startScreen:'upload',cat:'ba'});}); await p.waitForTimeout(700);
await p.setInputFiles('[data-fl-file]',fl); await p.waitForTimeout(1500);
await p.evaluate(()=>{document.querySelectorAll('[data-fl-tile]').forEach(t=>{if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true')t.click();});}); await p.waitForTimeout(400);
await p.click('[data-fl="cta"]'); await p.waitForTimeout(1600);
await p.evaluate(()=>{ const c=[...document.querySelectorAll('[data-fl-tplchip]')].find(x=>/전후/.test(x.textContent)); if(c) c.click(); }); await p.waitForTimeout(500);
const it=await p.$('[data-fl-tpl]'); if(it){ await it.scrollIntoViewIfNeeded(); await it.click(); await p.waitForTimeout(4000); }
await p.click('text=저장하고 게시글 쓰기').catch(()=>{}); await p.waitForTimeout(1800);
const si=await p.$('[data-fl-service]'); if(si){ await si.fill('젤네일 핑크'); await si.press('Enter'); await p.waitForTimeout(9000); }
// 활성 화면에서만 진행 버튼 클릭(연결 스킵→미리보기→저장)
async function clickActive(re){ return p.evaluate((src)=>{ const act=document.querySelector('.wsv2flow__s.active')||document; const re=new RegExp(src); const m=[...act.querySelectorAll('button,[data-fl]')].find(x=>re.test((x.textContent||'')+'|'+(x.getAttribute&&x.getAttribute('data-fl')||''))); if(m){m.click(); return (m.textContent||m.getAttribute('data-fl')||'').trim().slice(0,18);} return null; }, re); }
const trail=[];
for(let i=0;i<5;i++){
  const step=await p.evaluate(()=>(document.querySelector('.wsv2flow__s.active [data-fl-step]')||document.querySelector('[data-fl-step]')||{}).textContent);
  const clicked=await clickActive('다음|나중에 할게요|준비만|게시글 저장|저장하고|완료|올리기|saveimg|copycap|작업실에서|홈으로');
  trail.push({step,clicked});
  await p.waitForTimeout(2500);
  if(clicked && /작업실|홈으로|저장|완료/.test(clicked)) break;
  if(!clicked) break;
}
const R={trail};
R.homeCards=await p.evaluate(()=>document.querySelectorAll('.wsv2-card').length);
R.dbSlots=await p.evaluate(async()=>{try{const s=await loadSlotsFromDB();return Array.isArray(s)?s.length:'na';}catch(e){return 'err';}});
await p.reload({waitUntil:'domcontentloaded'}); await p.waitForTimeout(3500);
R.homeCardsReload=await p.evaluate(()=>document.querySelectorAll('.wsv2-card').length);
R.slotHasTpl=await p.evaluate(async()=>{try{const s=await loadSlotsFromDB();if(!s||!s.length)return 'noslots';return !!(s[0].templateOutputs&&s[0].templateOutputs.length)||!!s[0].templateOutput;}catch(e){return 'err';}});
await p.screenshot({path:'output/responsive-qa/v559-template-result-ui/_savehome2.png'});
R.errs=errs.slice(0,5);
console.log(JSON.stringify(R,null,1));
await b.close();

import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
async function newP(){const p=await(await b.newContext({viewport:{width:390,height:844}})).newPage();await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});await p.waitForTimeout(3600);return p;}
async function toCaption(p){const f=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;c.getContext('2d').fillRect(0,0,600,800);return c.toDataURL('image/jpeg',0.9);});await p.evaluate(()=>{WorkspaceFlow.open({startScreen:'upload',cat:'flex'});});await p.waitForTimeout(800);await p.setInputFiles('[data-fl-file]',[{name:'p.jpg',mimeType:'image/jpeg',buffer:Buffer.from(f.split(',')[1],'base64')}]);await p.waitForTimeout(1400);await p.evaluate(()=>{document.querySelectorAll('[data-fl-tile]').forEach(t=>{if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true')t.click();});});await p.waitForTimeout(500);await p.click('[data-fl="cta"]');await p.waitForTimeout(1600);await p.click('text=저장하고 게시글 쓰기').catch(()=>{});await p.waitForTimeout(1800);}
function capOf(p){return p.evaluate(()=>(document.querySelector('[data-fl-igcap]')||document.querySelector('[data-fl-capbody]')||{}).textContent||(document.querySelector('[data-fl-capbody]')||{}).value||'');}
// 말투별 + 다양성 (각 새 세션)
const out={tones:{},diversity:[]};
for(const tone of ['natural','professional','mz']){
  const p=await newP(); await toCaption(p);
  await p.fill('[data-fl-service]','젤네일 핑크핑크 반짝');
  await p.click(`[data-fl-ctone="${tone}"]`); await p.waitForTimeout(200);
  await p.click('[data-fl-cgen]'); await p.waitForTimeout(9000);
  out.tones[tone]=await capOf(p);
  if(tone==='natural'){ // 같은 화면에서 다시 쓰기 2회 → 다양성
    for(let i=0;i<2;i++){ await p.click('[data-fl-var="regen"]').catch(()=>{}); await p.waitForTimeout(9000); out.diversity.push(await capOf(p)); }
  }
  await p.context().close();
}
out.diversity.unshift(out.tones.natural);
// 캡션 탭 6칩
const p=await newP();
const tab=await p.evaluate(()=>{ try{showTab('caption');}catch(e){} return [...document.querySelectorAll('#toneCards .tone-card')].map(c=>c.getAttribute('data-tone')); });
out.captionTabChips=tab;
const LEAK=['붙임머리','긴머리','손상모','머릿결','24인치','레이어드'];
out.leaks=Object.fromEntries(Object.entries(out.tones).map(([k,v])=>[k,LEAK.filter(w=>v.includes(w))]));
console.log(JSON.stringify(out,null,1));
await b.close();

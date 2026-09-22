import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
async function newP(){
  const p = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  p.__errs=[]; p.on('pageerror',e=>p.__errs.push(String(e).slice(0,120)));
  await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
  await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3600);
  return p;
}
async function toCaption(p){
  const f=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;c.getContext('2d').fillRect(0,0,600,800);return c.toDataURL('image/jpeg',0.9);});
  await p.evaluate(()=>{ WorkspaceFlow.open({startScreen:'upload',cat:'flex'}); }); await p.waitForTimeout(800);
  await p.setInputFiles('[data-fl-file]',[{name:'p.jpg',mimeType:'image/jpeg',buffer:Buffer.from(f.split(',')[1],'base64')}]); await p.waitForTimeout(1400);
  await p.evaluate(()=>{document.querySelectorAll('[data-fl-tile]').forEach(t=>{if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true')t.click();});}); await p.waitForTimeout(500);
  await p.click('[data-fl="cta"]'); await p.waitForTimeout(1600);
  await p.click('text=저장하고 게시글 쓰기').catch(()=>{}); await p.waitForTimeout(1800);
}
const sent=[];
let p = await newP();
p.on('request',r=>{if(r.url().includes('/persona/generate')&&r.method()==='POST'){try{sent.push(JSON.parse(r.postData()||'{}'));}catch(e){}}});
await toCaption(p);
// 구조 검증
const ui = await p.evaluate(()=>({
  scenarioGone: !document.querySelector('[data-fl-scenario]'),
  dupHeadGone: !document.querySelector('.cap-scenario-head'),
  toneChips: [...document.querySelectorAll('[data-fl-ctone]')].map(c=>c.getAttribute('data-fl-ctone')),
  lenChips: [...document.querySelectorAll('[data-fl-clen]')].map(c=>c.getAttribute('data-fl-clen')),
  hashToggle: !!document.querySelector('[data-fl-chash]'),
  genBtn: !!document.querySelector('[data-fl-cgen]'),
  svcPlaceholder: (document.querySelector('[data-fl-service]')||{}).placeholder,
}));
await p.screenshot({path:'output/responsive-qa/final/_v558-caption-input.png'});
console.log('UI', JSON.stringify(ui));
// 생성: 젤네일 + premium 말투 + 짧게 + 해시태그 OFF
await p.fill('[data-fl-service]','젤네일 핑크핑크 반짝');
await p.click('[data-fl-ctone="premium"]'); await p.waitForTimeout(300);
await p.click('[data-fl-clen="short"]'); await p.waitForTimeout(300);
await p.click('[data-fl-chash]'); await p.waitForTimeout(300);  // OFF
await p.click('[data-fl-cgen]'); await p.waitForTimeout(10000);
const r1 = await p.evaluate(()=>({
  caption:(document.querySelector('[data-fl-igcap],[data-fl-capbody]')||{}).textContent||(document.querySelector('[data-fl-capbody]')||{}).value||'',
  hashShown:((document.querySelector('[data-fl-caphashedit]')||{}).value||'').trim(),
}));
const last=sent[sent.length-1]||{};
console.log('GEN1', JSON.stringify({caption:r1.caption,tone:last.tone_override,len:last.length_tier,tk:last.treatment_keyword,hashShown:r1.hashShown}));
console.log('ERRS', JSON.stringify(p.__errs.slice(0,5)));
await b.close();

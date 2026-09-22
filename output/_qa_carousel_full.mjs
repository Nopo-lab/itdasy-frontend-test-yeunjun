import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();

async function newPage(){
  const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
  await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
  await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
  await p.waitForTimeout(3600);
  return p;
}
async function mkFiles(p,n){
  const urls = await p.evaluate((n)=>{
    const out=[]; for(let i=0;i<n;i++){const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle=`hsl(${i*60},65%,55%)`;g.fillRect(0,0,600,800);g.fillStyle='#fff';g.font='bold 160px sans-serif';g.fillText('P'+(i+1),150,440);out.push(c.toDataURL('image/jpeg',0.9));} return out;
  },n);
  return urls.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));
}
async function uploadAndEdit(p,n){
  await p.evaluate(()=>{ WorkspaceFlow.open({ startScreen:'upload', cat:'ba' }); });
  await p.waitForTimeout(1000);
  await p.setInputFiles('[data-fl-file]', await mkFiles(p,n));
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{ document.querySelectorAll('[data-fl-tile]').forEach(t=>{ if(!/sel|on/.test(t.className) && t.getAttribute('aria-selected')!=='true') t.click(); }); });
  await p.waitForTimeout(700);
  await p.click('[data-fl="cta"]');
  await p.waitForTimeout(2200);
}
const snap = p=>p.evaluate(()=>({
  dots: document.querySelectorAll('[data-fl-editsel]').length,
  counter: (document.querySelector('.ed-carnav__count')||{}).textContent||null,
  pill: (document.querySelector('.ed-carnav__pill')||{}).textContent.replace(/\s+/g,' ').trim()||null,
  activeDot: [...document.querySelectorAll('[data-fl-editsel]')].findIndex(d=>/on/.test(d.className) || d.getAttribute('aria-selected')==='true'),
  bright: (document.querySelector('[data-fl-range="brightness"]')||{}).value,
  photo: (getComputedStyle(document.querySelector('.ed-photo')||document.body).backgroundImage||'').slice(0,60),
}));

const R={};
// ── 2장: 네비/사진별/pair ──
let p = await newPage();
await uploadAndEdit(p,2);
R.two_enter = await snap(p);
// 화살표 다음
await p.click('[data-fl-edswipe="next"]'); await p.waitForTimeout(900);
R.two_afterNext = await snap(p);
// dot 0 클릭
await p.click('[data-fl-editsel="0"]'); await p.waitForTimeout(900);
R.two_afterDot0 = await snap(p);
// 키보드 →
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
R.two_afterKey = await snap(p);
// 사진별 보정값: photo0 으로, 밝기 60 설정
await p.click('[data-fl-editsel="0"]'); await p.waitForTimeout(700);
await p.evaluate(()=>{ const s=document.querySelector('[data-fl-range="brightness"]'); s.value=60; s.dispatchEvent(new Event('input',{bubbles:true})); });
await p.waitForTimeout(800);
const b0 = await snap(p);
await p.click('[data-fl-editsel="1"]'); await p.waitForTimeout(900);
const b1 = await snap(p);  // 밝기 리셋(독립) 기대
R.perPhoto = { p0_bright:b0.bright, p1_bright_afterSwitch:b1.bright, independent: b0.bright!=b1.bright };
await p.screenshot({path:'output/responsive-qa/final/_car-2photo.png'});
await p.context().close();

// ── 3장 ──
p = await newPage(); await uploadAndEdit(p,3); R.three = await snap(p);
await p.screenshot({path:'output/responsive-qa/final/_car-3photo.png'}); await p.context().close();
// ── 5장 ──
p = await newPage(); await uploadAndEdit(p,5); R.five = await snap(p);
await p.screenshot({path:'output/responsive-qa/final/_car-5photo.png'}); await p.context().close();

console.log(JSON.stringify(R,null,1));
await b.close();

import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b=await chromium.launch();
const p=await(await b.newContext({viewport:{width:390,height:844}})).newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,120)));
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3600);
// 사진 1장(가운데 밝은 원=인물 흉내, 모서리=배경) → 편집
const img=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle='#2244aa';g.fillRect(0,0,600,800);g.fillStyle='#f1c9a5';g.beginPath();g.ellipse(300,400,150,200,0,0,7);g.fill();return c.toDataURL('image/jpeg',0.92);});
await p.evaluate(()=>{WorkspaceFlow.open({startScreen:'upload',cat:'flex'});}); await p.waitForTimeout(700);
await p.setInputFiles('[data-fl-file]',[{name:'p.jpg',mimeType:'image/jpeg',buffer:Buffer.from(img.split(',')[1],'base64')}]); await p.waitForTimeout(1400);
await p.evaluate(()=>{document.querySelectorAll('[data-fl-tile]').forEach(t=>{if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true')t.click();});}); await p.waitForTimeout(400);
await p.click('[data-fl="cta"]'); await p.waitForTimeout(1600);
const R={};
// (A) 일반 사진: 밝기 드래그 → filter 설정되는지(대조군)
await p.evaluate(()=>{const s=document.querySelector('[data-fl-range="brightness"]'); if(s){s.value=60; s.dispatchEvent(new Event('input',{bubbles:true}));}});
await p.waitForTimeout(300);
R.normalDragFilter = await p.evaluate(()=>(document.querySelector('[data-fl-edphoto]')||{}).style?.filter||'');
// 밝기 0 복귀
await p.evaluate(()=>{const s=document.querySelector('[data-fl-range="brightness"]'); if(s){s.value=0; s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true}));}}); await p.waitForTimeout(800);
// 배경 적용: '배경' 도구 → 배경색(어두운색)
await p.evaluate(()=>{const t=[...document.querySelectorAll('[data-fl-basictool]')].find(x=>x.getAttribute('data-fl-basictool')==='background'); if(t)t.click();}); await p.waitForTimeout(600);
await p.evaluate(()=>{const sw=document.querySelector('[data-fl-bgcolor="#1f1b18"]')||document.querySelector('[data-fl-bgcolor]'); if(sw)sw.click();}); await p.waitForTimeout(6000);
// 누끼 적용됐는지(밝기 도구로 복귀)
await p.evaluate(()=>{const t=[...document.querySelectorAll('[data-fl-basictool]')].find(x=>x.getAttribute('data-fl-basictool')==='brightness'); if(t)t.click();}); await p.waitForTimeout(500);
R.bgApplied_status = errs.length===0 ? 'no-error' : errs[0];
const cornerBefore = await p.evaluate(()=>{const p2=document.querySelector('[data-fl-edphoto]'); return (p2&&p2.style.backgroundImage||'').slice(0,30);});
// (B) 누끼 적용 후 밝기 드래그 → filter 'none' 유지(=재합성 경로) 기대
await p.evaluate(()=>{const s=document.querySelector('[data-fl-range="brightness"]'); if(s){s.value=70; s.dispatchEvent(new Event('input',{bubbles:true}));}});
await p.waitForTimeout(600);
R.nukkiDragFilter = await p.evaluate(()=>(document.querySelector('[data-fl-edphoto]')||{}).style?.filter||'');
await p.waitForTimeout(800);
const cornerAfter = await p.evaluate(()=>{const p2=document.querySelector('[data-fl-edphoto]'); return (p2&&p2.style.backgroundImage||'').slice(0,30);});
R.previewRecomposited = cornerBefore !== cornerAfter;
await p.screenshot({path:'output/responsive-qa/v559-template-result-ui/_nukki-drag.png'});
R.errs=errs.slice(0,4);
console.log(JSON.stringify(R,null,1));
await b.close();

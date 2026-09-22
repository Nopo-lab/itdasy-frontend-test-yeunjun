import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b=await chromium.launch();
for(const [name,w,h] of [['fold-closed',280,653],['iphone-se',375,667]]){
  const p=await(await b.newContext({viewport:{width:w,height:h}})).newPage();
  await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
  await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});await p.waitForTimeout(3600);
  const f=await p.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=800;c.getContext('2d').fillRect(0,0,600,800);return c.toDataURL('image/jpeg',0.9);});
  await p.evaluate(()=>{WorkspaceFlow.open({startScreen:'upload',cat:'flex'});});await p.waitForTimeout(800);
  await p.setInputFiles('[data-fl-file]',[{name:'p.jpg',mimeType:'image/jpeg',buffer:Buffer.from(f.split(',')[1],'base64')}]);await p.waitForTimeout(1300);
  await p.evaluate(()=>{document.querySelectorAll('[data-fl-tile]').forEach(t=>{if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true')t.click();});});await p.waitForTimeout(500);
  await p.click('[data-fl="cta"]');await p.waitForTimeout(1500);
  await p.click('text=저장하고 게시글 쓰기').catch(()=>{});await p.waitForTimeout(1500);
  const m=await p.evaluate(()=>({hScroll:document.documentElement.scrollWidth>window.innerWidth+1, chips:document.querySelectorAll('[data-fl-ctone]').length, genBtnW:(document.querySelector('[data-fl-cgen]')||{}).getBoundingClientRect?Math.round(document.querySelector('[data-fl-cgen]').getBoundingClientRect().width):0}));
  await p.screenshot({path:`output/responsive-qa/final/_v558-${name}.png`});
  console.log(name,w,JSON.stringify(m));
  await p.context().close();
}
await b.close();

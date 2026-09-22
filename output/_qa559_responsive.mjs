import fs from 'fs';
import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const DEVS=[['iphone-se',375,667],['iphone-12',390,844],['galaxy-s24',412,915],['fold-closed',280,653],['fold-open',673,841],['ipad',768,1024]];
const b=await chromium.launch();
const OUT='output/responsive-qa/v559-template-result-ui';
const rows=[];
for(const [name,w,h] of DEVS){
  const dir=`${OUT}/${name}`; fs.mkdirSync(dir,{recursive:true});
  const ctx=await b.newContext({viewport:{width:w,height:h}});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,100)));
  await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
  await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3400);
  const hs=()=>p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
  const m={name,w,h,home:await hs()};
  await p.screenshot({path:`${dir}/01-home.png`});
  // 업로드→편집
  const files=await p.evaluate(()=>{const o=[];for(let i=0;i<2;i++){const c=document.createElement('canvas');c.width=600;c.height=800;const g=c.getContext('2d');g.fillStyle=`hsl(${i*180},60%,55%)`;g.fillRect(0,0,600,800);g.fillStyle='#fff';g.font='bold 150px sans-serif';g.fillText(i===0?'전':'후',180,440);o.push(c.toDataURL('image/jpeg',0.9));}return o;});
  const fl=files.map((u,i)=>({name:`p${i}.jpg`,mimeType:'image/jpeg',buffer:Buffer.from(u.split(',')[1],'base64')}));
  await p.evaluate(()=>{WorkspaceFlow.open({startScreen:'upload',cat:'ba'});}); await p.waitForTimeout(700);
  await p.screenshot({path:`${dir}/02-upload.png`}); m.upload=await hs();
  await p.setInputFiles('[data-fl-file]',fl); await p.waitForTimeout(1400);
  await p.evaluate(()=>{document.querySelectorAll('[data-fl-tile]').forEach(t=>{if(!/sel|on/.test(t.className)&&t.getAttribute('aria-selected')!=='true')t.click();});}); await p.waitForTimeout(400);
  await p.click('[data-fl="cta"]'); await p.waitForTimeout(1600);
  await p.screenshot({path:`${dir}/03-edit.png`}); m.edit=await hs();
  // 템플릿 적용(그리드 이미 열림)
  await p.evaluate(()=>{ const c=[...document.querySelectorAll('[data-fl-tplchip]')].find(x=>/전후/.test(x.textContent)); if(c) c.click(); }); await p.waitForTimeout(500);
  const it=await p.$('[data-fl-tpl]'); if(it){ await it.scrollIntoViewIfNeeded(); await it.click(); await p.waitForTimeout(3500); }
  // 결과까지 스크롤
  await p.evaluate(()=>{ const r=document.querySelector('.tplres'); if(r) r.scrollIntoView({block:'center'}); });
  await p.waitForTimeout(500);
  await p.screenshot({path:`${dir}/04-template-result.png`}); m.tplResult=await hs();
  m.tplresPresent=await p.evaluate(()=>!!document.querySelector('.tplres'));
  // 캡션
  await p.click('text=저장하고 게시글 쓰기').catch(()=>{}); await p.waitForTimeout(1600);
  await p.screenshot({path:`${dir}/05-caption.png`}); m.caption=await hs();
  m.errs=errs.length;
  rows.push(m);
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(rows,null,1));

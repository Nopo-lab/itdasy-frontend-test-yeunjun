import fs from 'fs';
import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const DEVS=[
 ['iphone-se',375,667],['iphone-12',390,844],['iphone-14-promax',430,932],
 ['galaxy-s24',412,915],['galaxy-fold-closed',280,653],['galaxy-fold-open',673,841],
 ['ipad',768,1024],['ipad-pro',1024,1366],
];
const b = await chromium.launch();
const out='output/responsive-qa/v555';
const rows=[];
for (const [name,w,h] of DEVS){
  const dir=`${out}/${name}`; fs.mkdirSync(dir,{recursive:true});
  const ctx=await b.newContext({viewport:{width:w,height:h}});
  const page=await ctx.newPage();
  await page.addInitScript(([tok])=>{ try{ localStorage.setItem('itdasy_token::staging',tok); localStorage.setItem('shop_type','붙임머리'); }catch(e){} },[access_token]);
  await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForTimeout(3200);
  // 홈 캡처
  await page.screenshot({path:`${dir}/01-home.png`});
  // 캡션 탭
  await page.evaluate(()=>{ try{ showTab('caption'); }catch(e){} });
  await page.waitForTimeout(900);
  await page.screenshot({path:`${dir}/06-caption.png`});
  // 말투 카드 영역 캡처
  const tc=await page.$('#toneCards');
  if(tc) await tc.screenshot({path:`${dir}/07-tone-cards.png`}).catch(()=>{});
  // 측정
  const m=await page.evaluate(()=>{
    const de=document.documentElement;
    const cards=[...document.querySelectorAll('#toneCards .tone-card')];
    const btn=document.getElementById('captionBtn');
    const br=btn?btn.getBoundingClientRect():null;
    return {
      scrollW:de.scrollWidth, innerW:window.innerWidth,
      hScroll: de.scrollWidth>window.innerWidth+1,
      cardCount:cards.length,
      cardMinW: cards.length?Math.min(...cards.map(c=>Math.round(c.getBoundingClientRect().width))):0,
      cardOverflow: cards.some(c=>c.getBoundingClientRect().right>window.innerWidth+1),
      btnInView: br? (br.left>=0 && br.right<=window.innerWidth+1):null,
    };
  });
  rows.push({name,w,h,...m});
  await ctx.close();
}
await b.close();
console.log(JSON.stringify(rows,null,1));

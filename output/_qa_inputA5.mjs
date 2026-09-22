import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const page = await ctx.newPage();
// shop_type 강제 안 함 — 실계정(beauty) 그대로
await page.addInitScript(([tok])=>{ try{ localStorage.setItem('itdasy_token::staging', tok); }catch(e){} }, [access_token]);
await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(4000);
await page.evaluate(()=>{ try{ showTab('caption'); }catch(e){} });
await page.waitForTimeout(1000);
const shopType = await page.evaluate(()=>localStorage.getItem('shop_type'));
const caps=[];
for(let i=0;i<5;i++){
  await page.evaluate(()=>{ window._selectedTone='natural_owner'; });
  await page.evaluate(async ()=>{ await _doGenerateCaption({axes:{},special_context:'손상모 100모, 레이어드 컷 120인치'}, ()=>{}, document.body); });
  await page.waitForTimeout(700);
  const c = await page.evaluate(()=>(document.getElementById('captionText')||{}).value||'');
  caps.push(c);
  if(i<4) await page.waitForTimeout(9000);
}
const has120 = c => c.includes('120') || /긴|길이|기장|롱/.test(c);
console.log('shop_type:', shopType);
caps.forEach((c,i)=>console.log(`#${i+1}: ${c}`));
const cnt = k => caps.filter(c=>c.includes(k)).length;
console.log(`\n반영: 손상모 ${caps.filter(c=>c.includes('손상')).length}/5, 100모 ${cnt('100모')}/5, 레이어드 ${cnt('레이어드')}/5, 120/긴기장 ${caps.filter(has120).length}/5`);
console.log('24인치 오염:', caps.filter(c=>c.includes('24인치')).length, '/5');
await b.close();

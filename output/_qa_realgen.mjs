import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const page = await ctx.newPage();
await page.addInitScript(([tok])=>{ try{ localStorage.setItem('itdasy_token::staging', tok); localStorage.setItem('shop_type','붙임머리'); }catch(e){} }, [access_token]);
// 실 payload 캡처(통과시킴)
const sent=[];
page.on('request', r=>{ if(r.url().includes('/persona/generate') && r.method()==='POST'){ try{ sent.push(JSON.parse(r.postData()||'{}')); }catch(e){} } });
await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(3500);
await page.evaluate(()=>{ try{ showTab('caption'); }catch(e){} });
await page.waitForTimeout(1200);

const R={};
R.typeTags = await page.evaluate(()=>[...document.querySelectorAll('#typeTags .tag')].map(t=>t.getAttribute('data-v')||t.textContent.trim()).slice(0,8));
// 태그 2개 선택
await page.evaluate(()=>{ [...document.querySelectorAll('#typeTags .tag')].slice(0,2).forEach(t=>t.classList.add('on')); });

async function realGen(special, tone){
  await page.evaluate((t)=>{ if(t) window._selectedTone=t; }, tone);
  await page.evaluate(async (sp)=>{ await _doGenerateCaption({axes:{},special_context:sp}, ()=>{}, document.body); }, special);
  await page.waitForTimeout(800);
  return await page.evaluate(()=>({ caption: (document.getElementById('captionText')||{}).value||'', hash:(document.getElementById('captionHash')||{}).value||'' }));
}
// 입력 A (booking_cta)
R.A = await realGen('손상모 100모, 레이어드 컷 120인치', 'booking_cta');
await page.waitForTimeout(9000);
// 입력 B (의미불명)
R.B = await realGen('개오바 끽끽', 'natural_owner');

R.lastSentPayload = sent[sent.length-2] || sent[sent.length-1] || null; // A 호출 payload
R.sentCount = sent.length;
R.A_payload_tone = (sent[0]||{}).tone_override;
R.A_payload_tk = (sent[0]||{}).treatment_keyword;
console.log(JSON.stringify(R,null,1));
await b.close();

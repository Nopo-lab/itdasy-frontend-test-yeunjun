import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);localStorage.setItem('shop_type','붙임머리');}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(3600);
await p.evaluate(()=>{ try{ showTab('caption'); }catch(e){} }); await p.waitForTimeout(1000);
// _personaFetch 스텁 → payload 캡처. tab-caption _doGenerateCaption 에 시나리오(special_context) 주입
const R = await p.evaluate(async ()=>{
  window.__cap=[]; const real=window._personaFetch;
  window._personaFetch = async (m,path,body)=>{ window.__cap.push(body); return {caption:'더미',hashtags:['네일']}; };
  const out={};
  for(const inp of ['젤네일 핑크핑크 반짝','레이어드컷','속눈썹펌']){
    window.__cap=[];
    await _doGenerateCaption({axes:{}, special_context: inp}, ()=>{}, document.body);
    const b = window.__cap[0]||{};
    out[inp]={ treatment_keyword:b.treatment_keyword, pcLead:(b.photo_context||'').slice(0,40), category:b.category };
  }
  window._personaFetch=real;
  return out;
});
console.log(JSON.stringify(R,null,1));
await b.close();

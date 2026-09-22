import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();

const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const page = await ctx.newPage();
await page.addInitScript(([tok])=>{ try{ localStorage.setItem('itdasy_token::staging', tok); localStorage.setItem('shop_type','붙임머리'); }catch(e){} }, [access_token]);
await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(3500);
await page.evaluate(()=>{ try{ showTab('caption'); }catch(e){} });
await page.waitForTimeout(1000);

const R={};
// 1) 기본값
R.default_tone = await page.evaluate(()=>window._selectedTone);

// 2) 카드 클릭 → 선택상태
R.cardSelect = [];
for (const tone of ['natural_owner','emotional_instagram','treatment_explain','booking_cta','short_clean']){
  await page.click(`#toneCards .tone-card[data-tone="${tone}"]`);
  await page.waitForTimeout(120);
  const st = await page.evaluate((t)=>{
    const card=document.querySelector(`#toneCards .tone-card[data-tone="${t}"]`);
    const onCount=document.querySelectorAll('#toneCards .tone-card.on').length;
    return { sel: window._selectedTone, hasOn: card.classList.contains('on'), aria: card.getAttribute('aria-checked'), onCount };
  }, tone);
  R.cardSelect.push({tone, ...st, pass: st.sel===tone && st.hasOn && st.aria==='true' && st.onCount===1});
}

// 3) payload 와이어링 — _personaFetch 스텁 + typeTags 일부 선택 + 각 tone 으로 _doGenerateCaption
await page.evaluate(()=>{
  window.__cap=[]; window.__realFetch=window._personaFetch;
  window._personaFetch = async (m,p,body)=>{ window.__cap.push({m,p,body}); return { caption:'더미 캡션입니다.', hashtags:['헤어','잇데이'] }; };
  // 시술 특징 태그 2개 선택(있으면)
  const tags=[...document.querySelectorAll('#typeTags .tag')].slice(0,2);
  tags.forEach(t=>t.classList.add('on'));
  window.__tagsSelected = tags.map(t=>t.getAttribute('data-v')||t.textContent.trim());
});
R.tagsSelected = await page.evaluate(()=>window.__tagsSelected);
R.payload=[];
for (const tone of ['natural_owner','emotional_instagram','treatment_explain','booking_cta','short_clean']){
  await page.click(`#toneCards .tone-card[data-tone="${tone}"]`);
  await page.evaluate(async ()=>{ window.__cap=[]; await _doGenerateCaption({axes:{},special_context:'손상모 100모, 레이어드 컷 120인치'}, ()=>{}, document.body); });
  const cap = await page.evaluate(()=>window.__cap[0]?.body || null);
  R.payload.push({ tone, sent_tone: cap?.tone_override, has_tk: !!cap?.treatment_keyword, tk: cap?.treatment_keyword, pc_has_kw: (cap?.photo_context||'').includes('손상모'), pass: cap?.tone_override===tone });
}

// 4) 재생성(rewrite/longer/instagram) 말투 유지
await page.evaluate(()=>{ window._selectedTone='booking_cta'; _lastGeneratePayload={category:'extension',photo_context:'x',tone_override:'natural_owner'}; });
R.regen=[];
for (const intent of ['rewrite','longer','instagram']){
  await page.evaluate(async (it)=>{ window.__cap=[]; await regenerateCaption({caption_intent:it}); }, intent);
  const cap = await page.evaluate(()=>window.__cap[0]?.body||null);
  R.regen.push({ intent, sent_tone: cap?.tone_override, pass: cap?.tone_override==='booking_cta' });
}

// 5) 기본값(미선택) — 새 컨텍스트
await page.evaluate(()=>{ window._personaFetch=window.__realFetch; });
console.log(JSON.stringify(R,null,1));
await b.close();

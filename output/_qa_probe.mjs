import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
// 1) API 로그인 → 토큰
const lr = await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})});
const { access_token } = await lr.json();
console.log('token_len', (access_token||'').length);

const b = await chromium.launch();
const ctx = await b.newContext({ viewport:{width:390,height:844} });
const page = await ctx.newPage();
// 토큰 주입(앱 JS 실행 전)
await page.addInitScript(([tok])=>{
  try{ localStorage.setItem('itdasy_token::staging', tok); localStorage.setItem('shop_type','붙임머리'); }catch(e){}
}, [access_token]);
const errs=[];
page.on('console', m=>{ if(m.type()==='error') errs.push(m.text().slice(0,160)); });
await page.goto(URL, { waitUntil:'domcontentloaded', timeout:60000 });
await page.waitForTimeout(3500);
// 캡션 탭으로
const moved = await page.evaluate(()=>{ try{ if(typeof showTab==='function'){ showTab('caption'); return true; } }catch(e){ return 'err:'+e.message; } return false; });
await page.waitForTimeout(1200);
const info = await page.evaluate(()=>({
  build: window.APP_BUILD,
  hasCaptionTab: !!document.getElementById('tab-caption'),
  captionTabVisible: (()=>{ const t=document.getElementById('tab-caption'); if(!t) return false; const cs=getComputedStyle(t); return cs.display!=='none' && t.offsetParent!==null; })(),
  toneCards: document.querySelectorAll('#toneCards .tone-card').length,
  selectedTone: window._selectedTone,
  scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
}));
console.log('moved', moved);
console.log('INFO', JSON.stringify(info));
console.log('ERRS', JSON.stringify(errs.slice(0,8)));
await page.screenshot({ path:'output/responsive-qa/v555/_probe-caption.png', fullPage:false });
await b.close();

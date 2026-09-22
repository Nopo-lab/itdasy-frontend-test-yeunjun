import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b=await chromium.launch();
const p=await(await b.newContext({viewport:{width:280,height:653}})).newPage();
await p.addInitScript(([t])=>{try{localStorage.setItem('itdasy_token::staging',t);}catch(e){}},[access_token]);
await p.goto(URL,{waitUntil:'domcontentloaded',timeout:60000}); await p.waitForTimeout(4000);
const diag=await p.evaluate(()=>{
  const vw=window.innerWidth;
  function info(sel){const el=document.querySelector(sel); if(!el) return {sel,found:false}; const r=el.getBoundingClientRect(); const cs=getComputedStyle(el); return {sel,found:true,left:Math.round(r.left),right:Math.round(r.right),w:Math.round(r.width),position:cs.position,transform:cs.transform,marginLeft:cs.marginLeft,marginRight:cs.marginRight,width:cs.width,maxWidth:cs.maxWidth,boxSizing:cs.boxSizing,overflowX:cs.overflowX};}
  // 모든 요소 중 viewport 우측 초과 top
  const off=[]; document.querySelectorAll('*').forEach(el=>{const r=el.getBoundingClientRect(); if(r.right>vw+1&&r.width>0&&r.width<vw*4){off.push({tag:el.tagName,cls:(el.className||'').toString().slice(0,40),right:Math.round(r.right),left:Math.round(r.left),w:Math.round(r.width)});}});
  return {
    vw, scrollW: document.documentElement.scrollWidth, hScroll: document.documentElement.scrollWidth>vw+1,
    sections: ['.wsv2flow__s','.wsv2-app','.wsv2flow','.ipc-live-bubble','.ipc-typewriter'].map(info),
    offenders: off.sort((a,b)=>b.right-a.right).slice(0,8),
  };
});
console.log(JSON.stringify(diag,null,1));
await b.close();

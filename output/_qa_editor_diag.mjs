import { chromium } from 'playwright';
const SVC='https://itdasy-backend-staging-644329093453.asia-northeast3.run.app';
const URL='https://nopo-lab.github.io/itdasy-frontend-test-yeunjun/';
const { access_token } = await (await fetch(SVC+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:process.env.ITDASY_QA_EMAIL,password:process.env.ITDASY_QA_PASSWORD})})).json();
const b = await chromium.launch();
const page = await (await b.newContext({ viewport:{width:390,height:844} })).newPage();
await page.addInitScript(([tok])=>{ try{ localStorage.setItem('itdasy_token::staging', tok); }catch(e){} }, [access_token]);
await page.goto(URL,{waitUntil:'domcontentloaded',timeout:60000});
await page.waitForTimeout(3800);
const r = await page.evaluate(async ()=>{
  function mk(hue){ const c=document.createElement('canvas'); c.width=600;c.height=800; const g=c.getContext('2d'); g.fillStyle=`hsl(${hue},40%,70%)`; g.fillRect(0,0,600,800); return c.toDataURL('image/jpeg',0.9); }
  WorkspaceFlow.open({ photoUrls:[mk(210),mk(20)], startScreen:'edit', cat:'ba' });
  await new Promise(r=>setTimeout(r,2500));
  const edPhoto=document.querySelector('.ed-photo');
  const carnav=document.querySelector('.ed-carnav');
  // 업로드 섹션의 사진 썸네일 수
  return {
    edPhotoBg: edPhoto? (getComputedStyle(edPhoto).backgroundImage||'').slice(0,40):null,
    edPhotoHasImg: edPhoto? (getComputedStyle(edPhoto).backgroundImage||'').includes('data:'):false,
    carnavExists: !!carnav,
    carnavHidden: carnav? carnav.hasAttribute('hidden'):null,
    editsel: document.querySelectorAll('[data-fl-editsel]').length,
    edswipe: document.querySelectorAll('[data-fl-edswipe]').length,
    uploadThumbs: document.querySelectorAll('[data-fs="upload"] img, [data-fl-photo], .grid-cell, .up-thumb').length,
    bottomBtns: [...document.querySelectorAll('[data-fl-eb]')].map(x=>x.getAttribute('data-fl-eb')),
    mainTools: [...document.querySelectorAll('[data-fl-basictool]')].map(x=>x.getAttribute('data-fl-basictool')),
  };
});
console.log(JSON.stringify(r,null,1));
await b.close();

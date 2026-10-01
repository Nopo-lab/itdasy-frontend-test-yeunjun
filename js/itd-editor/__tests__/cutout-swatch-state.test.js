/** @jest-environment jsdom */
const fs=require('fs'),path=require('path'),vm=require('vm');
const source=fs.readFileSync(path.join(__dirname,'../itd-editor.js'),'utf8');
const code=source.slice(source.indexOf('  function syncAdjSliders()'),source.indexOf('  function renderAdjust()'));
function harness(){
 document.body.innerHTML=`<section><button data-cutbg="#FFFFFF" class="on"></button><button data-cutbg="#E8C7CD"></button><button data-cutbg="#D58A95"></button><button data-cutbgimg="1" class="on" style='background-image:url("synthetic-background")'></button></section>`;
 const ctx={S:{adjSel:1,photoBg:{1:{color:'#d58a95'}}},root:document.body,refs:{adjCutBg:document.querySelector('section')},window:{},document,ADJ_CTRLS:[],adjOf:()=>({}),_cssUrl:u=>'url("'+u+'")'};
 vm.createContext(ctx);vm.runInContext(code,ctx);return ctx;
}
function selected(){return Array.from(document.querySelectorAll('[data-cutbg].on')).map(b=>b.getAttribute('data-cutbg'));}
test('reopened second-photo background selects its saved swatch and accessible state',()=>{
 const c=harness();c.syncAdjSliders();expect(selected()).toEqual(['#D58A95']);expect(document.querySelector('[data-cutbg="#D58A95"]').getAttribute('aria-pressed')).toBe('true');
});
test('switching to an untouched photo clears the other photo swatch',()=>{
 const c=harness();c.syncAdjSliders();c.S.adjSel=0;c.syncAdjSliders();expect(selected()).toEqual(['#FFFFFF']);expect(document.querySelector('[data-cutbg="#D58A95"]').getAttribute('aria-pressed')).toBe('false');
});
test('background image or custom color never marks an unrelated palette color',()=>{
 const c=harness();for(const bg of [{color:'#FFFFFF',img:'synthetic-background'},{color:'#123456'}]){c.S.photoBg[1]=bg;c.syncAdjSliders();expect(selected()).toEqual([]);}
});

test('legacy empty or null colors agree with the white composition default',()=>{
 const c=harness();for(const bg of [{},{color:null,img:null},null]){c.S.photoBg[1]=bg;c.syncAdjSliders();expect(selected()).toEqual(['#FFFFFF']);}
});
test('recent background selection clears when moving to another photo or image',()=>{
 const c=harness(),recent=document.querySelector('[data-cutbgimg]');c.S.photoBg[1]={img:'synthetic-background'};c.syncAdjSliders();expect(recent.classList.contains('on')).toBe(true);
 c.S.adjSel=0;c.syncAdjSliders();expect(recent.classList.contains('on')).toBe(false);expect(selected()).toEqual(['#FFFFFF']);
 c.S.adjSel=1;c.S.photoBg[1]={img:'different-background'};c.syncAdjSliders();expect(recent.classList.contains('on')).toBe(false);
});

import {chromium} from 'playwright-core';
import fs from 'fs';
const jobs=JSON.parse(process.argv[2]);
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
for(const [n,w,h] of jobs){const p=await b.newPage({viewport:{width:w,height:h}});await p.goto('file://'+process.cwd()+'/html/'+n+'.html');await p.evaluate(()=>document.fonts.ready);
 const r=await p.evaluate(()=>{const o={small:new Set(),clip:new Set(),img:0};
  document.querySelectorAll('img').forEach(im=>{if(!im.complete||im.naturalWidth===0)o.img++});
  document.querySelectorAll('body *').forEach(e=>{const t=[...e.childNodes].filter(n=>n.nodeType===3&&n.textContent.trim()).map(n=>n.textContent.trim()).join(' ');if(!t)return;const cs=getComputedStyle(e);const r=e.getBoundingClientRect();if(r.width===0)return;
   const fs=parseFloat(cs.fontSize);if(fs<12&&!e.closest('.kbd'))o.small.add(fs+':'+t.slice(0,25));
   if(e.scrollWidth>e.clientWidth+1&&cs.overflow!=='visible'&&!e.matches('.sp-b,.main,.modal-b'))o.clip.add(t.slice(0,40));});
  return {small:[...o.small],clip:[...o.clip],img:o.img}});
 console.log(n,'broken',r.img,'small',JSON.stringify(r.small),'clip',JSON.stringify(r.clip));await p.close();}
await b.close();

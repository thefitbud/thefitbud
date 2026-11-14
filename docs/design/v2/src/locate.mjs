import { chromium } from '/workspace/fb-main/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core/index.mjs';
import fs from 'fs';
const L=JSON.parse(fs.readFileSync('../_work/locs_in.json')),R=JSON.parse(fs.readFileSync('../_work/registry.json'));
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const p=await (await b.newContext({viewport:{width:393,height:852}})).newPage();
const out={};
for(const [sid,tap] of L){
  await p.goto('file://'+process.cwd()+'/../html/'+(R[sid].side||'trainee')+'/'+sid+'.html');
  const r=await p.evaluate(([tap])=>{
    const sel='.btn,.navbtn,.link,.chip,.tab,.circbtn,.li,.crow,.tmc,.addset,.wchip,.meal,.due,.rolec,.sumt,.exh,.search,.cell,.minibar,.chev,.pill,.rb';
    const els=[...document.querySelectorAll(sel)];let e=null;
    if(tap.startsWith('icon:')){ if(tap.includes('down')) e=document.querySelector('.circbtn'); else e=[...document.querySelectorAll('.chev')].find(x=>!x.closest('.li,.crow'));}
    else{const re=new RegExp(tap);const vis=x=>{const r=x.getBoundingClientRect();return r.width>0&&r.bottom>0&&r.top<852};
      // prefer topmost layer (sheets/dialogs) then smallest element
      const c=els.filter(x=>vis(x)&&re.test(x.textContent.replace(/\s+/g,' ').trim()));
      c.sort((a,b)=>{const za=a.closest('.sheet,.dialog,.stick,.toast')?1:0,zb=b.closest('.sheet,.dialog,.stick,.toast')?1:0;if(za!==zb)return zb-za;const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();return ra.width*ra.height-rb.width*rb.height});e=c[0];}
    if(!e)return null;const q=e.getBoundingClientRect();return [q.left,q.top,q.width,q.height];},[tap]);
  out[sid+'|'+tap]=r;
}
await b.close();fs.writeFileSync('../_work/locs.json',JSON.stringify(out));console.log(Object.values(out).filter(x=>!x).length,'unlocated of',L.length);

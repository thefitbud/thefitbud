// Text-contrast audit on the live DOM: every text leaf vs the first solid background behind it. THEME=dark adds body.dark.
// Usage: [SIDE=trainer] [THEME=dark] node textcheck.mjs  -> prints leaves under 3:1 (--ink4 disabled text is exempt per spec 2.3; lock-screen wallpapers and the TM-06f photo viewer, whose dark backdrop is a sibling layer, are skipped)
import { chromium } from '/workspace/fb-main/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core/index.mjs';
import fs from 'fs';
const SIDE=process.env.SIDE||'trainee',DARK=process.env.THEME==='dark';const H=`../html/${SIDE}/`;
const files=fs.readdirSync(H).filter(f=>f.endsWith('.html')&&!/^(TR-15c|TM-13a|TM-06f)/.test(f));
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const ctx=await b.newContext({viewport:{width:393,height:852}});
let bad=0;
for(const f of files){const p=await ctx.newPage();await p.goto('file://'+process.cwd()+'/'+H+f);if(DARK)await p.evaluate(()=>document.body.classList.add('dark'));
 const r=await p.evaluate(()=>{const P=s=>{const m=s.match(/[\d.]+/g);return m?m.map(Number):null};
  const L=([r,g,b])=>{const f=u=>(u/=255)<=.03928?u/12.92:((u+.055)/1.055)**2.4;return .2126*f(r)+.7152*f(g)+.0722*f(b)};
  const pr=document.createElement('i');pr.style.color='var(--ink4)';document.body.appendChild(pr);const ink4=getComputedStyle(pr).color;pr.remove();const o=[];
  document.querySelectorAll('body *').forEach(e=>{if(![...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))return;
   const cs=getComputedStyle(e);const rc=e.getBoundingClientRect();if(!rc.width||cs.visibility==='hidden')return;
   if(cs.color===ink4)return;let c=P(cs.color);if(!c)return;let op=1;let bg=null;
   for(let a=e;a;a=a.parentElement){const s=getComputedStyle(a);op*=+s.opacity;if(s.backgroundImage!=='none'){bg='img';break}const v=P(s.backgroundColor);if(v&&(v.length<4||v[3]>.5)){bg=v;break}}
   if(bg==='img'||!bg)return;
   if(c.length>3&&c[3]<1){c=c.slice(0,3).map((x,i)=>x*c[3]+bg[i]*(1-c[3]))}
   const a=L(c),z=L(bg);const cr=(Math.max(a,z)+.05)/(Math.min(a,z)+.05);
   if(cr<3&&op>.7&&!e.closest('.dis,.ph,.navbtn.dis,[data-skipcr]'))o.push(cr.toFixed(2)+' '+e.textContent.trim().slice(0,28)+' '+cs.color+' on '+bg.join(','));});
  return o;});
 if(r.length){bad+=r.length;console.log(f,JSON.stringify(r))}await p.close();}
await b.close();console.log('textcheck',SIDE,DARK?'dark':'light',files.length,'screens,',bad,'leaves under 3:1');

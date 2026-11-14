// Render html/trainee/*.html -> png/trainee/*.png @3x, only when the HTML is newer. Checks: clip, offscreen, text overlap.
import { chromium } from '/workspace/fb-main/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core/index.mjs';
import fs from 'fs';
const only=process.argv[2]||'', force=process.env.FORCE==='1';
const SIDE=process.env.SIDE||'trainee';const H=`../html/${SIDE}/`, P=`../png/${SIDE}/`;
const css=fs.statSync('kit.css').mtimeMs;
const files=fs.readdirSync(H).filter(f=>f.endsWith('.html')&&f.startsWith(only)).filter(f=>{
  const p=P+f.replace('.html','.png'); if(force||!fs.existsSync(p))return true; const pm=fs.statSync(p).mtimeMs; return fs.statSync(H+f).mtimeMs>pm||css>pm;});
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
const ctx=await b.newContext({viewport:{width:393,height:852},deviceScaleFactor:3});
let n=0;
for(const f of files){
  const p=await ctx.newPage(); await p.goto('file://'+process.cwd()+'/'+H+f); await p.evaluate(()=>document.fonts.ready);
  const issues=await p.evaluate(()=>{const o=[];const W=innerWidth,Hh=innerHeight;const leaves=[];
    const covered=e=>e.closest('.scrim~*')===null&&false;
    document.querySelectorAll('body *').forEach(e=>{const cs=getComputedStyle(e);const r=e.getBoundingClientRect();
      const leaf=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
      if(!leaf||r.width===0||cs.visibility==='hidden')return;
      const t=e.textContent.trim().slice(0,30);
      if(e.scrollWidth>e.clientWidth+1&&cs.overflow!=='visible'&&!e.classList.contains('ell'))o.push('CLIP:'+t);
      if((r.right>W+.5||r.left<-.5)&&!e.closest('[data-offok]'))o.push('OFFSCREEN:'+t);
      const lh=parseFloat(cs.lineHeight); if(lh&&r.height>lh*1.6&&!e.closest('[data-wrapok],.kpad,.kb')&&e.closest('.btn,.pill,.tag,.chip,.wchip,.t-bodym,.t-head,.navbtn,.tab,.syncchip,.n-sm,.n-md,.n-lg,.n-hero,.n-xl,.t-label,.link,.t-cap'))o.push('WRAP:'+t);
      if(!e.closest('[data-bg]')&&!e.closest('.kb,.kpad'))leaves.push([e,r,t]);});
    // text overlap among leaves (not ancestor/descendant), ignoring tiny
    for(let i=0;i<leaves.length;i++)for(let j=i+1;j<leaves.length;j++){const [a,ra,ta]=leaves[i],[c,rc,tc]=leaves[j];
      if(a.contains(c)||c.contains(a))continue;
      const ox=Math.min(ra.right,rc.right)-Math.max(ra.left,rc.left),oy=Math.min(ra.bottom,rc.bottom)-Math.max(ra.top,rc.top);
      if(ox>2&&oy>3){const za=+getComputedStyle(a.closest('[style*="z-index"],.sheet,.dialog,.toast,.tabbar,.restbar,.minibar,.stick,.scrim')||document.body).zIndex||0;
        const zc=+getComputedStyle(c.closest('[style*="z-index"],.sheet,.dialog,.toast,.tabbar,.restbar,.minibar,.stick,.scrim')||document.body).zIndex||0;
        if(za===zc)o.push('OVERLAP:'+ta+' ↔ '+tc);}}
    return o;});
  if(issues.length)console.log('WARN',f,JSON.stringify(issues));
  await p.screenshot({path:P+f.replace('.html','.png')});await p.close();n++;
}
await b.close();console.log('rendered',n);

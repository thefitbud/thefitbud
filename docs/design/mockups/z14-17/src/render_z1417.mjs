// Z14-17 (copy of render_w14.mjs): render the W14 screens in three frames: ios (393x852) light + dark, android (412x915) light. @3x, overflow checks as render.mjs.
import { chromium } from '/workspace/tfb/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core/index.mjs';
import fs from 'fs';
const ids=fs.readFileSync(process.env.IDS||'w14_ids.txt','utf8').trim().split('\n');
const out=process.env.OUT||'../png-w14';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});
const modes=[['ios-light',393,852,false,false],['ios-dark',393,852,true,false],['android-light',412,915,false,true]];
let warn=0;
for(const [m,w,h,dark,andr] of modes){
  fs.mkdirSync(`${out}/${m}`,{recursive:true});
  const ctx=await b.newContext({viewport:{width:w,height:h},deviceScaleFactor:3});
  for(const id of ids){
    if(id.startsWith('TR-15e')&&!andr)continue;if(id.startsWith('BK-02')&&andr)continue;
    const p=await ctx.newPage(); const side=/^(TM|RP|BK)-/.test(id)?'trainer':'trainee';await p.goto('file://'+process.cwd()+'/../html/'+side+'/'+id+'.html');
    await p.evaluate(([dark,andr,w,h])=>{
      document.body.style.width=w+'px';document.body.style.height=h+'px';
      if(dark)document.body.classList.add('dark');
      if(andr){
        const sb=document.querySelector('.sb');
        if(sb){const col=sb.style.color;const t=sb.querySelector('.time')?.textContent||'';
          sb.style.height='40px';
          sb.innerHTML=`<div class="tnum" style="position:absolute;left:22px;top:12px;font-size:14px;font-weight:500">${t||(/^(TR-15e|TM-13c)/.test(document.title)?'':'9:41')}</div>
          <div style="position:absolute;left:50%;top:10px;width:20px;height:20px;margin-left:-10px;border-radius:10px;background:#000"></div>
          <div style="position:absolute;right:20px;top:13px;display:flex;gap:6px;align-items:center">
          <svg width="15" height="15" viewBox="0 0 16 16"><path d="M8 13 1 5.5a10 10 0 0 1 14 0Z" fill="currentColor"/></svg>
          <svg width="14" height="14" viewBox="0 0 16 16"><path d="M15 1v14H1Z" fill="currentColor"/></svg>
          <svg width="9" height="15" viewBox="0 0 9 15"><rect x="2.5" y="0" width="4" height="2" fill="currentColor"/><rect x="0" y="1.5" width="9" height="13.5" rx="1.5" fill="currentColor"/></svg></div>`;}
        document.querySelectorAll('.navbtn svg').forEach(sv=>{if(sv.innerHTML.includes('m15 18-6-6 6-6')){sv.innerHTML='<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>';sv.setAttribute('width','22');sv.setAttribute('height','22');
          const nb=sv.parentElement;[...nb.childNodes].forEach(n=>{if(n.nodeType===3)n.remove();});nb.style.minWidth='44px';nb.style.justifyContent='center';}});
        const hi=document.querySelector('.hi');if(hi){hi.style.left='50%';hi.style.marginLeft='-54px';hi.style.width='108px';hi.style.height='4px';hi.style.bottom='9px';}
        document.querySelectorAll('body *').forEach(e=>{const cs=getComputedStyle(e);
          if(cs.position==='absolute'&&cs.top==='54px')e.style.top='40px';
          if(cs.paddingTop==='54px')e.style.paddingTop='40px';
          if(cs.paddingTop==='102px')e.style.paddingTop='88px';});
      }},[dark,andr,w,h]);
    await p.evaluate(()=>document.fonts.ready);
    const issues=await p.evaluate(()=>{const o=[];const W=innerWidth;const leaves=[];
      document.querySelectorAll('body *').forEach(e=>{const cs=getComputedStyle(e);const r=e.getBoundingClientRect();
        const leaf=[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim());
        if(!leaf||r.width===0||cs.visibility==='hidden')return;
        const t=e.textContent.trim().slice(0,30);
        if(e.scrollWidth>e.clientWidth+1&&cs.overflow!=='visible'&&!e.classList.contains('ell'))o.push('CLIP:'+t);
        if(e.classList.contains('ell')&&e.scrollWidth>e.clientWidth+1&&e.closest('.btn,.pill'))o.push('TRUNC:'+t);
        if((r.right>W+.5||r.left<-.5)&&!e.closest('[data-offok]'))o.push('OFFSCREEN:'+t);
        const lh=parseFloat(cs.lineHeight); if(lh&&r.height>lh*1.6&&!e.closest('[data-wrapok],.kpad,.kb')&&e.closest('.btn,.pill,.tag,.chip,.wchip,.t-bodym,.t-head,.navbtn,.tab,.syncchip,.n-sm,.n-md,.n-lg,.n-hero,.n-xl,.t-label,.link,.t-cap'))o.push('WRAP:'+t);
        if(!e.closest('[data-bg]')&&!e.closest('.kb,.kpad'))leaves.push([e,r,t]);});
      for(let i=0;i<leaves.length;i++)for(let j=i+1;j<leaves.length;j++){const [a,ra,ta]=leaves[i],[c,rc,tc]=leaves[j];
        if(a.contains(c)||c.contains(a))continue;
        const ox=Math.min(ra.right,rc.right)-Math.max(ra.left,rc.left),oy=Math.min(ra.bottom,rc.bottom)-Math.max(ra.top,rc.top);
        if(ox>2&&oy>3){const z=x=>+getComputedStyle(x.closest('[style*="z-index"],.sheet,.dialog,.toast,.tabbar,.restbar,.minibar,.stick,.scrim')||document.body).zIndex||0;
          if(z(a)===z(c))o.push('OVERLAP:'+ta+' ↔ '+tc);}}
      // touch targets: buttons/pills/navbtn/li/chips under 44 high
      document.querySelectorAll('.btn,.navbtn,.li,.search,.tap,.tlink,.sb2,.opt').forEach(e=>{const r=e.getBoundingClientRect();if(r.width&&r.height<43.5&&!e.closest('[data-bg]'))o.push('TAP<44:'+e.textContent.trim().slice(0,24)+' '+Math.round(r.height));});
      return o;});
    if(issues.length){warn++;console.log('WARN',m,id,JSON.stringify(issues));}
    await p.screenshot({path:`${out}/${m}/${id}.png`});await p.close();
  }
  await ctx.close();
}
await b.close();console.log('done, screens with warnings:',warn);

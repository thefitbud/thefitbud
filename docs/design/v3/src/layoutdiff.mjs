// Layout sanity: element boxes of v3 (light and dark) vs v2 for every screen. Colour-only change => identical boxes.
// Usage: node layoutdiff.mjs  (expects ../../v2/html next to ../html)
import { chromium } from '/workspace/fb-main/node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core/index.mjs';
import fs from 'fs';
const b=await chromium.launch({executablePath:'/usr/bin/google-chrome'});const ctx=await b.newContext({viewport:{width:393,height:852}});
const boxes=async(path,dark)=>{const p=await ctx.newPage();await p.goto('file://'+path);if(dark)await p.evaluate(()=>document.body.classList.add('dark'));await p.evaluate(()=>document.fonts.ready);
 const r=await p.evaluate(()=>[...document.querySelectorAll('body *')].map(e=>{const q=e.getBoundingClientRect();return [e.tagName,Math.round(q.x),Math.round(q.y),Math.round(q.width),Math.round(q.height)].join(',')}));await p.close();return r;};
let same=0;const diff=[];
for(const side of ['trainee','trainer'])for(const f of fs.readdirSync(`../html/${side}`).filter(f=>f.endsWith('.html'))){
 if(!fs.existsSync(`../../v2/html/${side}/${f}`)){diff.push(`${f}: new in v3 (W12), no v2 counterpart`);continue;}const v2=await boxes(`${process.cwd()}/../../v2/html/${side}/${f}`,false);
 for(const dark of [false,true]){const v3=await boxes(`${process.cwd()}/../html/${side}/${f}`,dark);
  const n=Math.max(v2.length,v3.length);let d=0;for(let i=0;i<n;i++)if(v2[i]!==v3[i])d++;
  if(d)diff.push(`${f}${dark?' (dark)':''}: ${d} of ${n} boxes differ`);else same++;}}
await b.close();console.log(diff.join('\n'));console.log('layoutdiff: identical',same,'| differ',diff.length);

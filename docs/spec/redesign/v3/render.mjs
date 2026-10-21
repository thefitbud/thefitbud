import { chromium } from '/workspace/thefitbud-run/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.mjs';
import fs from 'fs';
const only=process.argv[2]||'';
const b=await chromium.launch();
for(const f of fs.readdirSync('html').filter(f=>f.endsWith('.html')&&f.startsWith(only))){
  const web=f.includes('-web'),ipad=f.includes('-ipad');
  const vp=web?{width:1440,height:900}:ipad?{width:1024,height:768}:{width:393,height:852};
  const p=await b.newPage({viewport:vp,deviceScaleFactor:web?1:2});
  await p.goto('file://'+process.cwd()+'/html/'+f);await p.evaluate(()=>document.fonts.ready);await p.waitForTimeout(150);
  await p.screenshot({path:'png/'+f.replace('.html','.png')});await p.close();
}
await b.close();

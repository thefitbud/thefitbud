import { chromium } from '/workspace/thefitbud-run/node_modules/.pnpm/playwright@1.64.1/node_modules/playwright/index.mjs';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:393,height:852},deviceScaleFactor:2});
for(const f of ['option-a','option-b','option-c-empty','option-c-partial','option-c-done','option-c-rest']){await p.goto('file://'+process.cwd()+'/'+f+'.html');await p.waitForTimeout(300);await p.screenshot({path:f+'.png'});}
await b.close();

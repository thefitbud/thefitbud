import fs from 'fs';
const dir=fs.readdirSync('/workspace/fb-main/node_modules/.pnpm').find(d=>d.startsWith('lucide-react@'));
const base='/workspace/fb-main/node_modules/.pnpm/'+dir+'/node_modules/lucide-react/dist/esm/icons/';
const names=process.argv.slice(2);const out={};
for(const n of names){let m;try{m=await import(base+n+".mjs");}catch(e){console.log("missing",n);continue}if(!m.__iconData){console.log("alias",n);continue}out[n]=m.__iconData.node.map(([t,a])=>'<'+t+' '+Object.entries(a).filter(([k])=>k!=='key').map(([k,v])=>`${k}="${v}"`).join(' ')+'/>').join('');}
fs.writeFileSync('icons.json',JSON.stringify(out,null,1));console.log(Object.keys(out).length);

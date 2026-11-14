import json,subprocess,sys,re,glob
d=json.load(open('icons.json'))
names=set(sys.argv[1:])
for f in glob.glob('a_*.py'):
    names|=set(re.findall(r'''(?:ic|circ|li|banner|empty|dialog|btn)\([^)]*?["']([a-z][a-z0-9-]+)["']''',open(f).read()))
need=[n for n in names if n not in d]
js='''import("fs").then(async fs=>{const dir=fs.readdirSync('/workspace/fb-main/node_modules/.pnpm').find(d=>d.startsWith('lucide-react@'));
const base='/workspace/fb-main/node_modules/.pnpm/'+dir+'/node_modules/lucide-react/dist/esm/icons/';const o={};
for(const n of %s){try{const m=await import(base+n+'.mjs');if(m.__iconData)o[n]=m.__iconData.node.map(([t,a])=>'<'+t+' '+Object.entries(a).filter(([k])=>k!=='key').map(([k,v])=>k+'="'+v+'"').join(' ')+'/>').join('');}catch(e){}}
console.log(JSON.stringify(o))})'''%json.dumps(need)
n=json.loads(subprocess.run(['node','-e',js],capture_output=True,text=True).stdout);d.update(n);json.dump(d,open('icons.json','w'))
print('added',sorted(n))

import json,re,os,subprocess
from flows_def import FLOWS
from PIL import Image,ImageDraw,ImageFont
R=json.load(open('../_work/registry.json'));TM=json.load(open('../_work/tapmap.json'));IDS=sorted(R)
def F(p):
    m=[i for i in IDS if i.startswith(p)];assert m,p;return m[0]
res=[];locs=[]
for fid,role,title,steps in FLOWS:
    rows=[]
    for i,(p,tap,call) in enumerate(steps):
        sid=F(p);nxt=F(steps[i+1][0]) if i+1<len(steps) else None
        st='end' if nxt is None else 'system'
        if tap and nxt:
            c=[(k,t,d) for k,t,d in TM[sid] if re.search(tap,t)]
            if not c: st='MISSING-TAP'
            else:
                ds=[d for _,_,d in c]
                st='ok' if any(d==nxt for d in ds) else ('jump→'+next(d for d in ds if d in R) if any(d in R for d in ds) else ('ok-state' if any(d.split(':')[0] in('STATE','BACK','EXT','INERT') for d in ds) else 'MISMATCH:'+ds[0]))
                locs.append((sid,tap))
        rows.append(dict(sid=sid,tap=tap,call=call,status=st))
    res.append(dict(fid=fid,role=role,title=title,steps=rows))
json.dump(res,open('../_work/flows.json','w'),indent=1);json.dump(locs,open('../_work/locs_in.json','w'))
bad=[(f['fid'],s['sid'],s['tap'],s['status']) for f in res for s in f['steps'] if s['status'] not in('ok','ok-state','system','end') and not s['status'].startswith('jump')]
print(len(res),'flows',sum(len(f['steps']) for f in res),'steps; problems:',bad)

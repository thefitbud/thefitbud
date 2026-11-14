# Extract tappable elements per screen from the HTML (btn, navbtn, link, chip, li/crow with chevron, tab, circbtn, meal cards, sch? no)
import re,json,glob,os,html as H
from html.parser import HTMLParser
IC=json.load(open('icons.json'));REV={}
for k,v in IC.items():
    m=re.search(r'd="([^"]+)"',v)
    if m: REV.setdefault(m.group(1),k)
TAPC={'btn','navbtn','link','chip','tab','circbtn','li','crow','tmc','key','rb','addset','wchip','mcard','meal','due','rolec','sumt','seg-on','ex','exh','toggle','search','cell','ck','minibar','chev','pill','mmore'}
class P(HTMLParser):
    def __init__(s): super().__init__();s.stack=[];s.out=[]
    def handle_starttag(s,t,a):
        c=dict(a).get('class','') or '';cls=set(c.split())
        hit=cls&TAPC
        if t=='path':
            d=dict(a).get('d','');n=REV.get(d)
            for e in reversed(s.stack):
                if e[1]:
                    if n and not e[4]: e[4]=n
                    break
        s.stack.append([t,hit,'' ,cls,''])
    def handle_endtag(s,t):
        if not s.stack: return
        e=s.stack.pop()
        if e[1] and (set(e[1])&{'chev','mmore'}) and any(x[1] for x in s.stack): e[1]=set()
        if e[1]:
            txt=re.sub(r'\s+',' ',e[2]).strip()
            s.out.append((sorted(e[1])[0],txt[:120] or ('icon:'+e[4])))
        if s.stack: s.stack[-1][2]+=' '+e[2]
    def handle_data(s,d):
        if s.stack: s.stack[-1][2]+=d
    def handle_startendtag(s,t,a):
        s.handle_starttag(t,a);s.stack.pop()
res={}
for side in ['trainee','trainer']:
    for f in sorted(glob.glob(f'../html/{side}/*.html')):
        p=P();p.feed(open(f).read());sid=os.path.basename(f)[:-5]
        seen=[];[seen.append(x) for x in p.out if x not in seen]
        res[sid]=seen
json.dump(res,open('../_work/taps.json','w'),indent=0)
print(len(res),sum(len(v) for v in res.values()))
from collections import Counter
print(Counter(k for v in res.values() for k,_ in v))

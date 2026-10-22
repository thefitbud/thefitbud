# 160/161 Progress (web), full iteration 22 Oct: metric picker (body, check-in answers, workouts, photos), range filter, compare, all states.
# Data only from fields that exist: measurements (weight/waist/hip/chest), check-in scale answers (sleep/energy/stress/diet 1–5), set logs, progress photos.
from cw import *
X='''.pg{display:grid;grid-template-columns:290px 1fr;gap:16px;flex:1;min-height:0}
.ml2{background:#fff;border:1px solid var(--border);border-radius:16px;padding:10px;overflow:hidden;display:flex;flex-direction:column;gap:2px}
.ml2 .g{font-size:11px;font-weight:700;color:var(--ink-500);letter-spacing:.4px;padding:8px 10px 2px}
.ml2 a{display:flex;align-items:center;gap:10px;min-height:42px;flex:none;padding:0 10px;border-radius:10px;font-size:14px;color:var(--ink-700)}.ml2 a .v{margin-left:auto;font-size:13px;color:var(--navy);font-weight:600}.ml2 a .v.m{color:var(--ink-500);font-weight:400}
.ml2 a.on{background:var(--lavender);color:var(--indigo);font-weight:700}.ml2 a.on2{background:#E0F2F1;color:#0E7490;font-weight:700}.ml2 a .ck{width:18px;height:18px;border-radius:5px;border:1.5px solid var(--border-strong);flex:none;display:flex;align-items:center;justify-content:center}.ml2 a .ck.on{background:var(--indigo);border-color:var(--indigo);color:#fff}
.mc{background:#fff;border:1px solid var(--border);border-radius:16px;padding:18px 20px;display:flex;flex-direction:column;gap:12px;min-height:0;overflow:hidden}
.st{display:flex;gap:28px}.st div span{display:block;font-size:12px;color:var(--ink-500)}.st div b{font-size:20px;color:var(--navy);font-weight:600}.st div small{font-size:12px;color:var(--ink-500);margin-left:4px}
.lg{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--ink-700)}.lg span{display:inline-flex;align-items:center;gap:6px}.lg i{width:18px;height:3px;border-radius:2px;display:inline-block}
.src2{font-size:12px;color:var(--ink-500);display:flex;gap:6px;align-items:center}
.tbl{width:100%;border-collapse:collapse;font-size:13px}.tbl th{text-align:left;font-size:12px;color:var(--ink-500);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--border)}.tbl td{padding:8px 10px;border-bottom:1px solid var(--border);color:var(--ink-700)}.tbl td b{color:var(--navy)}
.ph3{border-radius:14px;background:linear-gradient(180deg,#EDEBF5,#E1DEEE);position:relative;overflow:hidden;display:flex;align-items:flex-end;justify-content:center}
.ph3 .cap{position:absolute;left:10px;top:10px;background:rgba(255,255,255,.92);border-radius:10px;padding:6px 10px;font-size:12px;color:var(--navy);font-weight:600}
.ph3.sel{box-shadow:0 0 0 3px var(--indigo)}
.sk{background:#ECEBF3;border-radius:8px}
'''
def svgchart(series,xs_max,ymin,ymax,ticks,w=790,h=300,yl=lambda v:f'{v}',right=None,xl=[],bars=False):
    L,R,T,B=52,(52 if right else 18),12,30;pw=w-L-R;ph=h-T-B
    X=lambda d:L+pw*d/xs_max
    Y=lambda v,lo=ymin,hi=ymax:T+ph*(1-(v-lo)/(hi-lo))
    o=f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img" aria-label="Chart">'
    for t in ticks: o+=f'<line x1="{L}" x2="{w-R}" y1="{Y(t):.1f}" y2="{Y(t):.1f}" stroke="#ECEEF4"/><text x="{L-10}" y="{Y(t)+4:.1f}" text-anchor="end" font-size="12" fill="#5B616B">{yl(t)}</text>'
    if right:
        lo,hi,rt,rl=right
        for t in rt: o+=f'<text x="{w-R+10}" y="{Y(t,lo,hi)+4:.1f}" font-size="12" fill="#0E7490">{rl(t)}</text>'
    for d,lab in xl: o+=f'<text x="{X(d):.1f}" y="{h-8}" text-anchor="{'start' if d==0 else ('end' if d>=xs_max-3 else 'middle')}" font-size="12" fill="#5B616B">{lab}</text>'
    for s in series:
        pts,col=s['pts'],s['c'];lo,hi=s.get('rng',(ymin,ymax));dash=s.get('dash','')
        if s.get('bars'):
            bw=s.get('bw',28)
            for d,v,tot in pts:
                o+=f'<rect x="{X(d)-bw/2:.1f}" y="{Y(tot,lo,hi):.1f}" width="{bw}" height="{Y(lo,lo,hi)-Y(tot,lo,hi):.1f}" rx="6" fill="#EDEAFF"/><rect x="{X(d)-bw/2:.1f}" y="{Y(v,lo,hi):.1f}" width="{bw}" height="{Y(lo,lo,hi)-Y(v,lo,hi):.1f}" rx="6" fill="{col}"/><text x="{X(d):.1f}" y="{Y(tot,lo,hi)-6:.1f}" text-anchor="middle" font-size="12" fill="#25262B">{v} of {tot}</text>'
            continue
        seg=[];segs=[]
        for d,v in pts:
            if v is None:
                if seg: segs.append(seg);seg=[]
            else: seg.append((X(d),Y(v,lo,hi)))
        if seg: segs.append(seg)
        for sg in segs:
            if len(sg)>1: o+=f'<polyline points="{" ".join(f"{a:.1f},{b:.1f}" for a,b in sg)}" fill="none" stroke="{col}" stroke-width="2.5" stroke-linejoin="round" stroke-dasharray="{dash}"/>'
            for a,b in sg: o+=f'<circle cx="{a:.1f}" cy="{b:.1f}" r="4" fill="#fff" stroke="{col}" stroke-width="2.5"/>'
        if s.get('gap'):
            gd=s['gap'];o+=f'<text x="{X(gd):.1f}" y="{T+ph-6}" text-anchor="middle" font-size="11" fill="#858B96">no check-in</text>'
    return o+'</svg>'
D=[0,4,11,18,25,32,39,46,53]
XL=[(0,'Mon 24 Aug'),(11,'Fri 4 Sep'),(25,'Fri 18 Sep'),(39,'Fri 2 Oct'),(53,'Fri 16 Oct')]
WT=[89.1,88.9,88.4,88.3,87.9,87.6,None,86.9,86.4]
SLEEP=[None,3,3,2,3,2,None,3,2];EN=[None,4,3,3,3,2,None,3,3];STR=[None,2,3,3,3,4,None,3,3]
def mlist(on='Weight',on2=None,checks=None,ro=False,vals=None):
    V=vals or {'Weight':'86.4 kg','Waist':'94 cm','Hip':'102 cm','Chest':'101 cm','Sleep':'2 of 5','Energy':'3 of 5','Stress':'3 of 5','Diet (as rated)':'3 of 5','Workouts completed':'21 of 26','Exercise progress':'6 lifts','Progress photos':'4 dates'}
    G=[('BODY · FROM CHECK-INS',['Weight','Waist','Hip','Chest']),('CHECK-IN ANSWERS · 1 TO 5',['Sleep','Energy','Stress','Diet (as rated)']),('WORKOUTS · FROM LOGS',['Workouts completed','Exercise progress']),('PHOTOS',['Progress photos'])]
    o='<nav class="ml2" aria-label="What to chart">'
    for g,items in G:
        o+=f'<div class="g">{g}</div>'
        for n in items:
            c='on' if n==on else ('on2' if n==on2 else '')
            ck=''
            if checks is not None and n in checks[1]: ck=f'<span class="ck {"on" if n in checks[0] else ""}">{ic("check",12,w=3) if n in checks[0] else ""}</span>'
            v=V.get(n,'—');o+=f'<a class="{c}">{ck}{n}<span class="v {"m" if v in("—","No entries") else ""}">{v}</span></a>'
    return o+'</nav>'
def tools(rng='12 w',compare=None,ro=False,extra=''):
    seg='<div class="seg2">'+''.join(f'<a class="{"on" if r==rng else ""}">{r}</a>' for r in ['4 w','12 w','All','Custom…'])+'</div>'
    cmp=f'<a class="pill2 {"on" if compare else ""}">{ic("chart",15)}{"Compare: "+compare if compare else "Compare with…"}{ic("down",14)}</a>'
    return f'<div class="row" style="gap:10px">{seg}{cmp}{extra}<span class="sp"></span><span class="sm muted">Check-in dates · values as entered</span></div>'
def P(k,body,**kw): return wpage(k,body,'Progress',extra=X,**kw)
ROWS=''.join(f'<tr><td>{d}</td><td><b>{v}</b></td><td>{"—" if v=="No check-in" else "From check-in"}</td></tr>' for d,v in [('Fri 16 Oct','86.4 kg'),('Fri 9 Oct','86.9 kg'),('Fri 2 Oct','No check-in'),('Fri 25 Sep','87.6 kg')])
# 160 default: Weight, 12 w
ch=svgchart([{'pts':list(zip(D,WT)),'c':'#4527C6','gap':39}],53,86,90,[86,87,88,89,90],yl=lambda v:f'{v} kg',xl=XL)
main=f'''<section class="mc"><div class="row"><div><b class="b" style="font-size:18px">Weight</b><div class="src2">{ic("clip",13)}Body weight answer in weekly check-ins · 8 entries</div></div><span class="sp"></span><a class="btn o sm">{ic("down",15)}Show data table</a></div>
<div class="st"><div><span>Start · Mon 24 Aug</span><b>89.1 kg</b></div><div><span>Latest · Fri 16 Oct</span><b>86.4 kg</b></div><div><span>Change</span><b>−2.7 kg</b><small>since Mon 24 Aug</small></div><div><span>Entries</span><b>8</b><small>1 week without a check-in</small></div></div>{ch}
<div class="lab">LATEST ENTRIES</div><table class="tbl"><tr><th>Date</th><th>Weight</th><th>Source</th></tr>{ROWS}</table></section>'''
save('160-trainer-web-progress-v3-web',P('rohan',tools()+f'<div class="pg">{mlist()}{main}</div>'))
# 160b check-in answers: Sleep + Energy + Stress (1–5), multi-select
ch=svgchart([{'pts':list(zip(D,SLEEP)),'c':'#4527C6'},{'pts':list(zip(D,EN)),'c':'#0E7490','dash':'6 4'},{'pts':list(zip(D,STR)),'c':'#B45309','dash':'2 4'}],53,1,5,[1,2,3,4,5],h=320,xl=XL)
lg='<div class="lg"><span><i style="background:#4527C6"></i>Sleep · solid</span><span><i style="background:#0E7490"></i>Energy · dashed</span><span><i style="background:#B45309"></i>Stress · dotted</span></div>'
main=f'''<section class="mc"><div class="row"><div><b class="b" style="font-size:18px">Check-in answers</b><div class="src2">{ic("clip",13)}Rohan\'s own ratings from the Weekly check-in form · 1 = low, 5 = high</div></div></div>{lg}{svgchart.__doc__ or ""}{ch}
<div class="st"><div><span>Sleep · latest</span><b>2</b><small>of 5 · Fri 16 Oct</small></div><div><span>Energy · latest</span><b>3</b><small>of 5</small></div><div><span>Stress · latest</span><b>3</b><small>of 5</small></div><div><span>Answered</span><b>7</b><small>of 8 weekly check-ins</small></div></div>
<div class="lab">WHAT ROHAN WROTE · FRI 16 OCT</div><p class="sm">"Bit tired, work is hectic. Back to back client calls till 9 pm, skipped Thursday."</p></section>'''
save('160b-trainer-web-progress-checkin-answers-v3-web',P('rohan',tools()+f'<div class="pg">{mlist("Sleep",checks=(["Sleep","Energy","Stress"],["Sleep","Energy","Stress","Diet (as rated)"]))}{main}</div>'))
# 160c measurements multi-line
MD=[0,18,32,46];WA=[98,96.5,95,94];HI=[104,103,102.5,102];CHS=[102,101.5,101,101]
ch=svgchart([{'pts':list(zip(MD,WA)),'c':'#4527C6'},{'pts':list(zip(MD,HI)),'c':'#0E7490','dash':'6 4'},{'pts':list(zip(MD,CHS)),'c':'#B45309','dash':'2 4'}],53,92,106,[92,94,96,98,100,102,104,106],h=330,yl=lambda v:f'{v} cm',xl=XL)
main=f'''<section class="mc"><div class="row"><div><b class="b" style="font-size:18px">Body measurements</b><div class="src2">{ic("clip",13)}Waist, hip and chest from fortnightly check-ins · 4 entries each</div></div></div><div class="lg"><span><i style="background:#4527C6"></i>Waist · solid</span><span><i style="background:#0E7490"></i>Hip · dashed</span><span><i style="background:#B45309"></i>Chest · dotted</span></div>{ch}
<table class="tbl"><tr><th></th><th>Start · Mon 24 Aug</th><th>Latest · Fri 9 Oct</th><th>Change</th></tr><tr><td><b>Waist</b></td><td>98 cm</td><td>94 cm</td><td><b>−4 cm</b></td></tr><tr><td><b>Hip</b></td><td>104 cm</td><td>102 cm</td><td><b>−2 cm</b></td></tr><tr><td><b>Chest</b></td><td>102 cm</td><td>101 cm</td><td><b>−1 cm</b></td></tr></table></section>'''
save('160c-trainer-web-progress-measurements-v3-web',P('rohan',tools('All')+f'<div class="pg">{mlist("Waist",checks=(["Waist","Hip","Chest"],["Weight","Waist","Hip","Chest"]))}{main}</div>'))
# 160d compare two metrics: Weight vs Sleep (right axis)
ch=svgchart([{'pts':list(zip(D,WT)),'c':'#4527C6','gap':39},{'pts':list(zip(D,SLEEP)),'c':'#0E7490','dash':'6 4','rng':(0,5)}],53,86,90,[86,87,88,89,90],yl=lambda v:f'{v} kg',right=(0,5,[1,2,3,4,5],lambda v:f'{v} of 5'),xl=XL,h=340)
main=f'''<section class="mc"><div class="row"><div><b class="b" style="font-size:18px">Weight compared with Sleep</b><div class="src2">{ic("clip",13)}Two scales: kg on the left, sleep rating on the right. Shown side by side only; FitBud doesn't link cause and effect.</div></div><span class="sp"></span><a class="btn o sm">{ic("x",15)}Remove Sleep</a></div><div class="lg"><span><i style="background:#4527C6"></i>Weight (kg) · solid</span><span><i style="background:#0E7490"></i>Sleep (1 to 5) · dashed</span></div>{ch}
<div class="st"><div><span>Weight change</span><b>−2.7 kg</b><small>since Mon 24 Aug</small></div><div><span>Weeks Sleep was 2 or lower</span><b>3</b><small>of 7 answered</small></div></div></section>'''
save('160d-trainer-web-progress-compare-v3-web',P('rohan',tools(compare='Sleep')+f'<div class="pg">{mlist("Weight","Sleep")}{main}</div>'))
# 160e workout progress from logs: exercise top set + workouts completed per week
ED=[2,9,16,23,30,37,44,51];TOP=[60,62.5,62.5,65,65,None,67.5,67.5]
ch=svgchart([{'pts':list(zip(ED,TOP)),'c':'#4527C6'}],53,55,70,[55,60,65,70],yl=lambda v:f'{v} kg',xl=XL,h=230)
WK=[(4,3,4),(11,4,4),(18,3,4),(25,4,4),(32,3,4),(39,1,4),(46,2,4),(53,1,3)]
bars=svgchart([{'pts':WK,'c':'#4527C6','bars':True,'bw':40,'rng':(0,5)}],56,0,5,[0,2,4],h=150,yl=lambda v:f'{v}',xl=[(4,'w/c 24 Aug'),(25,'w/c 14 Sep'),(46,'w/c 5 Oct'),(53,'This week')])
sets=''.join(f'<tr><td>{d}</td><td><b>{t}</b></td><td>{s}</td><td>{n}</td></tr>' for d,t,s,n in [('Wed 14 Oct','67.5 kg × 6','4 of 4 sets','Lower body A'),('Wed 7 Oct','67.5 kg × 5','4 of 4 sets','Lower body A'),('Wed 30 Sep','Skipped','—','Missed workout')])
main=f'''<section class="mc" style="gap:10px"><div class="row"><div><b class="b" style="font-size:18px">Exercise progress</b><div class="src2">{ic("dumbbell",13)}From Rohan\'s logged sets · heaviest set per session</div></div><span class="sp"></span><a class="pill2">Back squat {ic("down",14)}</a><div class="seg2"><a class="on">Top set</a><a>Total reps × kg</a></div></div>
<div class="st"><div><span>First logged · Wed 26 Aug</span><b>60 kg × 8</b></div><div><span>Latest · Wed 14 Oct</span><b>67.5 kg × 6</b></div><div><span>Sessions with this lift</span><b>7</b><small>of 8 planned</small></div></div>{ch}
<div class="row"><b class="b" style="font-size:15px">Workouts completed per week</b><span class="sp"></span><span class="sm muted">21 of 26 since start · 1 of 3 this week</span></div>{bars}</section>'''
save('160e-trainer-web-progress-workouts-v3-web',P('rohan',tools('All')+f'<div class="pg">{mlist("Exercise progress")}{main}</div>'))
# 160f photos compare
def sil(h): return f'<svg width="{int(h*.45)}" height="{h}" viewBox="0 0 45 100" aria-hidden="true"><circle cx="22.5" cy="12" r="9" fill="#C9C4DD"/><path d="M8 30q14.5-8 29 0l3 34h-6l-2 36h-8l-1.5-26-1.5 26h-8l-2-36H5z" fill="#C9C4DD"/></svg>'
def photo(cap,h,sel=False,w='100%'): return f'<div class="ph3 {"sel" if sel else ""}" style="height:{h}px;width:{w}">{sil(int(h*.85))}<span class="cap">{cap}</span></div>'
strip=''.join(f'<div style="flex:1">{photo(c,96,s)}</div>' for c,s in [('Fri 28 Aug',True),('Fri 18 Sep',False),('Fri 2 Oct',False),('Fri 16 Oct',True)])
main=f'''<section class="mc"><div class="row"><div><b class="b" style="font-size:18px">Progress photos</b><div class="src2">{ic("camera",13)}From check-ins · front, side and back · only you and Rohan see these</div></div><span class="sp"></span><div class="seg2"><a class="on">Front</a><a>Side</a><a>Back</a></div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">{photo("Fri 28 Aug · 88.9 kg",370)}{photo("Fri 16 Oct · 86.4 kg",370)}</div>
<div class="row"><span class="lab">PICK TWO DATES TO COMPARE</span><span class="sp"></span><span class="xs muted">4 dates with photos · Fri 2 Oct has front only</span></div><div class="row" style="gap:10px">{strip}</div></section>'''
save('160f-trainer-web-progress-photos-v3-web',P('rohan',tools('All')+f'<div class="pg">{mlist("Progress photos")}{main}</div>'))
# 160g sparse: 2 points (intake + first check-in)
SV={'Weight':'71.8 kg','Waist':'1 entry','Hip':'No entries','Chest':'No entries','Sleep':'4 of 5','Energy':'3 of 5','Stress':'2 of 5','Diet (as rated)':'4 of 5','Workouts completed':'5 of 6','Exercise progress':'3 lifts','Progress photos':'No entries'}
ch=svgchart([{'pts':[(0,72.4),(13,71.8)],'c':'#4527C6'}],53,70,74,[70,71,72,73,74],yl=lambda v:f'{v} kg',xl=[(0,'Mon 5 Oct'),(13,'Sun 18 Oct'),(53,'Sun 29 Nov')],h=300)
main=f'''<section class="mc"><div class="row"><div><b class="b" style="font-size:18px">Weight</b><div class="src2">{ic("clip",13)}1 from intake, 1 from check-in</div></div></div><div class="st"><div><span>Intake · Mon 5 Oct</span><b>72.4 kg</b></div><div><span>Latest · Sun 18 Oct</span><b>71.8 kg</b></div><div><span>Entries</span><b>2</b></div></div>{ch}
<div class="ro">{ic("chart",16)}Two weigh-ins so far. The trend line gets useful after a few more weekly check-ins.</div></section>'''
save('160g-trainer-web-progress-sparse-v3-web',P('ishita',tools('All')+f'<div class="pg">{mlist(vals=SV)}{main}</div>'))
# 161 empty: no data yet
EV={k:'No entries' for k in ['Weight','Waist','Hip','Chest','Sleep','Energy','Stress','Diet (as rated)','Workouts completed','Exercise progress','Progress photos']}
emp=f'''<section class="mc" style="align-items:center;justify-content:center;text-align:center;padding:60px"><span class="av" style="width:64px;height:64px;border-radius:32px;background:var(--lavender);color:var(--indigo)">{ic("chart",28)}</span><h2 style="font-size:20px;color:var(--navy);font-weight:600;margin-top:14px">No progress data yet</h2><p class="sm muted" style="max-width:460px">Weight, measurements, ratings and photos come from Priya\'s check-ins. Her first weekly check-in opens Sun 25 Oct. Workout progress appears after she logs her first workout.</p><div class="row" style="gap:8px;margin-top:6px"><a class="btn o sm">Open check-in settings</a><a class="btn s sm">See her check-in form</a></div></section>'''
save('161-trainer-web-progress-empty-v3-web',P('priya',tools('All')+f'<div class="pg">{mlist(vals=EV)}{emp}</div>',count=0))
# 160h ended client read-only
KD=[0,14,28,42,56,70,84,89];KW=[68.2,67.6,67.1,66.8,66.2,65.8,65.4,65.1]
ch=svgchart([{'pts':list(zip(KD,KW)),'c':'#4527C6'}],89,64,69,[64,65,66,67,68,69],yl=lambda v:f'{v} kg',xl=[(0,'Mon 6 Jul'),(28,'Mon 3 Aug'),(56,'Mon 31 Aug'),(89,'Sat 3 Oct')],h=330)
KV={'Weight':'65.1 kg','Waist':'78 cm','Hip':'96 cm','Chest':'88 cm','Sleep':'4 of 5','Energy':'4 of 5','Stress':'2 of 5','Diet (as rated)':'4 of 5','Workouts completed':'41 of 52','Exercise progress':'5 lifts','Progress photos':'6 dates'}
main=f'''<section class="mc"><div class="row"><div><b class="b" style="font-size:18px">Weight</b><div class="src2">{ic("clip",13)}Coached period Mon 6 Jul – Sat 3 Oct · 8 entries</div></div></div><div class="st"><div><span>Start</span><b>68.2 kg</b></div><div><span>Last · Fri 2 Oct</span><b>65.1 kg</b></div><div><span>Change</span><b>−3.1 kg</b></div></div>{ch}</section>'''
save('160h-trainer-web-progress-ended-v3-web',P('kavya',f'<div class="ro">{ic("lock",16)}Coaching with Kavya ended Sat 3 Oct. Her progress is read-only and stays here for your records.</div>'+tools('All').replace("Rohan","Kavya")+f'<div class="pg">{mlist(vals=KV)}{main}</div>',count=0))
# 160i loading
def sk(w,h,e=''): return f'<div class="sk" style="width:{w};height:{h}px;{e}"></div>'
skl='<nav class="ml2" aria-busy="true">'+''.join(sk('60%',10,'margin:12px 10px 6px')+''.join(f'<div class="row" style="min-height:44px;padding:0 10px">{sk("50%",12)}<span class="sp"></span>{sk("50px",12)}</div>' for _ in range(n)) for n in (4,4,2,1))+'</nav>'
skm=f'<section class="mc" aria-busy="true" aria-label="Loading progress">{sk("180px",18)}{sk("320px",12)}<div class="row" style="gap:28px">'+''.join(f'<div>{sk("90px",10)}{sk("70px",20,"margin-top:6px")}</div>' for _ in range(4))+f'</div><div class="sk" style="height:300px;border-radius:14px;background:linear-gradient(180deg,#F3F2F8,#ECEBF3)"></div>{sk("100%",12)}{sk("100%",12)}{sk("70%",12)}</section>'
save('160i-trainer-web-progress-loading-v3-web',P('rohan',tools()+f'<div class="pg">{skl}{skm}</div>'))

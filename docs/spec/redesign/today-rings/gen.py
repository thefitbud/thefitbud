import math
C='''<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="tokens.css"><style>
*{box-sizing:border-box;margin:0}body{width:393px;height:852px;position:relative;overflow:hidden;font-family:Satoshi,sans-serif;background:var(--page-mobile);font-feature-settings:"tnum"}
.bg{position:absolute;inset:0;width:393px;height:852px}
.slot{position:absolute;left:12px;top:176px;width:369px;height:238px;background:var(--page-mobile);padding:3px 4px}
.card{background:#fff;border:1px solid var(--border);border-radius:20px;height:100%;padding:10px 12px;display:flex;flex-direction:column;gap:8px;color:var(--ink-700)}
.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.tile{display:flex;flex-direction:column;align-items:center;gap:2px;min-height:44px;padding:6px 4px 6px;border-radius:16px;background:var(--lavender-50);text-decoration:none;color:inherit}
.tile svg{width:50px;height:50px}.tile .l{font-weight:700;font-size:14px;color:var(--navy)}.tile .s{font-size:12px;color:var(--ink-500);text-align:center;line-height:1.25}
.tile.done{background:var(--pos-bg)}.tile.rest{background:var(--neu-bg)}
.nut{border-top:1px solid var(--border);padding-top:8px;display:flex;flex-direction:column;gap:6px}
.kr{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;color:var(--ink-500)}.kr b{font-size:16px;color:var(--navy)}
.bar{height:8px;border-radius:99px;background:var(--ring-track);overflow:hidden}.bar i{display:block;height:100%;background:var(--ring-kcal);border-radius:99px}
.mac{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:12px;color:var(--ink-500)}.mac b{display:block;font-size:14px;color:var(--ink-700)}
.lnk{display:flex;justify-content:space-between;font-size:13px;color:var(--ink-500)}.lnk a{color:var(--indigo);font-weight:600;text-decoration:none;min-height:44px}
.row{display:flex;gap:14px;align-items:center}.row svg{width:120px;height:120px;flex:none}.lg{flex:1;display:flex;flex-direction:column;gap:7px;font-size:13px}
.lg .h{display:flex;justify-content:space-between}.lg .h b{color:var(--navy)}
.chips{display:flex;gap:8px}.chip{flex:1 1 0;min-width:0;white-space:nowrap;min-height:44px;border-radius:16px;background:var(--lavender-50);display:flex;align-items:center;gap:8px;padding:0 8px;font-size:12px;color:var(--ink-700)}.chip b{color:var(--navy)}
.big3{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;height:100%}.big3 .tile{justify-content:center}.big3 svg{width:84px;height:84px}
</style></head><body>'''
def ring(done,total,col,seg=True,center=None,check=False,rest=False,sz=60):
    r=24;cx=30;w=7;circ=2*math.pi*r;out=f'<svg viewBox="0 0 60 60" aria-hidden="true">'
    if rest:
        out+=f'<circle cx="30" cy="30" r="{r}" fill="none" stroke="#D9DCE8" stroke-width="{w}" stroke-dasharray="3 5"/>'
    elif seg and total<=8:
        gap=6 if total>1 else 0;L=circ/total-gap
        for i in range(total):
            c=col if i<done else 'var(--ring-track)'
            out+=f'<circle cx="30" cy="30" r="{r}" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="butt" stroke-dasharray="{L:.2f} {circ-L:.2f}" stroke-dashoffset="{-(i*(L+gap)-gap/2):.2f}" transform="rotate(-90 30 30)"/>'
    else:
        f=min(done/total,1)*circ
        out+=f'<circle cx="30" cy="30" r="{r}" fill="none" stroke="var(--ring-track)" stroke-width="{w}"/><circle cx="30" cy="30" r="{r}" fill="none" stroke="{col if f>0 else 'none'}" stroke-width="{w}" stroke-linecap="round" stroke-dasharray="{f:.2f} {circ:.2f}" transform="rotate(-90 30 30)"/>'
    if check: out+='<path d="M21 30.5l6 6 12-12" fill="none" stroke="#047857" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'
    elif center: out+=f'<text x="30" y="35" text-anchor="middle" font-family="Satoshi" font-weight="700" font-size="15" fill="#1A1248">{center}</text>'
    return out+'</svg>'
W,M,S='#4527C6','#1A1248','#0E7490'
def tiles(st):
    d={'empty':[(0,1,'Workout','0 of 1','6:30 pm'),(0,5,'Meals','0 of 5','8:30 am'),(0,8000,'Steps','0','of 8,000')],
       'partial':[(0,1,'Workout','0 of 1','6:30 pm'),(2,5,'Meals','2 of 5','Lunch 1:30'),(6240,8000,'Steps','6,240','of 8,000')],
       'done':[(1,1,'Workout','1 of 1','Done 7:22 pm'),(5,5,'Meals','5 of 5','All logged'),(8420,8000,'Steps','8,420','of 8,000')],
       'rest':[(0,0,'Rest day','No workout','Next: Mon'),(2,5,'Meals','2 of 5','Lunch 1:30'),(6240,8000,'Steps','6,240','of 8,000')]}[st]
    h='<div class="tiles">'
    for i,(a,b,l,s1,s2) in enumerate(d):
        col=[W,M,S][i]
        if l=='Rest day': h+=f'<a class="tile rest" href="#">{ring(0,1,col,rest=True,center="")}<span class="l">Rest day</span><span class="s">Recovery<br>{s2}</span></a>';continue
        dn=a>=b;cen=None if dn else (f'{a}' if l!='Steps' else ('' ))
        stp=(l=='Steps')
        h+=f'<a class="tile{" done" if dn else ""}" href="#" aria-label="{l} {s1} {s2}">{ring(a,b,col,seg=not stp,center=(None if dn else (str(a) if (not stp and b>1) else "")),check=dn)}<span class="l">{l}</span><span class="s"><b style="color:var(--navy)">{s1}</b> {"" if stp else "·"} {s2}</span></a>'
    return h+'</div>'
NUT={'empty':(0,0,0,0),'partial':(460,24,70,14),'done':(1810,108,224,57),'rest':(460,24,70,14)}
def nut(st):
    k,p,c,f=NUT[st]
    return f'''<div class="nut"><div class="kr"><span>Food today</span><span><b>{k:,}</b> of 1,850 kcal</span></div><div class="bar"><i style="width:{min(k/1850,1)*100:.1f}%"></i></div>
<div class="mac"><span>Protein<b>{p} of 110 g</b></span><span>Carbs<b>{c} of 230 g</b></span><span>Fat<b>{f} of 58 g</b></span></div></div>'''
def optC(st): return f'<div class="card">{tiles(st)}{nut(st)}</div>'
def optA(): return '<div class="card"><div class="big3">'+tiles('partial').replace('<div class="tiles">','').replace('</div>','',1).replace('width:60px','')+'</div><div class="lnk"><span>460 of 1,850 kcal · 2 of 5 meals</span><a href="#">Diet ›</a></div></div>'
def optB():
    k=460/1850;circ=2*math.pi*50
    sv=f'<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" fill="none" stroke="var(--ring-track)" stroke-width="11"/><circle cx="60" cy="60" r="50" fill="none" stroke="#4527C6" stroke-width="11" stroke-linecap="round" stroke-dasharray="{k*circ:.1f} {circ:.1f}" transform="rotate(-90 60 60)"/><text x="60" y="60" text-anchor="middle" font-family="Satoshi" font-weight="700" font-size="22" fill="#1A1248">460</text><text x="60" y="78" text-anchor="middle" font-family="Satoshi" font-size="12" fill="#5B616B">of 1,850 kcal</text></svg>'
    def b(n,v,t,c): return f'<div><div class="h"><span>{n}</span><span><b>{v}</b> of {t} g</span></div><div class="bar" style="height:6px"><i style="width:{v/t*100:.0f}%;background:{c}"></i></div></div>'
    return f'<div class="card"><div class="row">{sv}<div class="lg">{b("Protein",24,110,"#1A1248")}{b("Carbs",70,230,"#7C6CF0")}{b("Fat",14,58,"#0E7490")}</div></div><div class="chips"><a class="chip" href="#"><span>Workout <b>0 of 1</b></span></a><a class="chip" href="#"><span>Meals <b>2 of 5</b></span></a><a class="chip" href="#"><span>Steps <b>6,240</b></span></a></div></div>'
def page(card,name,bg=True):
    open(name,'w').write(C+('<img class="bg" src="current-today-ios.png">' if bg else '')+f'<div class="slot">{card}</div></body></html>')
page(optA(),'option-a.html');page(optB(),'option-b.html')
for s in ['empty','partial','done','rest']: page(optC(s),f'option-c-{s}.html')

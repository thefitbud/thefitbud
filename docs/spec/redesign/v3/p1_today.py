from fb import *
import math
X='''.wk{display:flex;gap:2px;align-items:center;margin:0 -6px 12px}.wk>a.ar{width:28px;height:44px;display:flex;align-items:center;justify-content:center;color:var(--ink-400)}
.wk .d{flex:1;height:62px;border-radius:22px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:11px;color:var(--ink-500);font-weight:500}
.wk .d b{font-size:17px;color:var(--navy);font-weight:600}.wk .d i{width:5px;height:5px;border-radius:3px;background:var(--pos)}.wk .d i.o{background:var(--attn)}.wk .d i.n{background:transparent}
.wk .d.on{background:var(--indigo);color:#E6E0FF;box-shadow:0 6px 14px rgba(69,39,198,.3)}.wk .d.on b{color:#fff}.wk .d.on i{background:#fff}
.wk .d.pk{background:#fff;border:1.5px solid var(--indigo)}
.pc{padding:14px 14px 12px}.pr{display:flex;gap:14px;align-items:center}
.ring{width:104px;height:104px;flex:none;position:relative}.ring .c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ring .c b{font-size:22px;color:var(--navy);font-weight:700;line-height:1}.ring .c span{font-size:11px;color:var(--ink-500);margin-top:3px}
.mb{flex:1;display:flex;flex-direction:column;gap:9px}.mb .h{display:flex;justify-content:space-between;font-size:13px;color:var(--ink-500);margin-bottom:4px}.mb .h b{font-size:14px;color:var(--navy)}.mb .h small{font-size:12px;color:var(--ink-500);font-weight:500}
.bar{height:6px;border-radius:3px;background:var(--ring-track);overflow:hidden}.bar i{display:block;height:100%;border-radius:3px}
.pch{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px}
.pch a{min-height:48px;border-radius:14px;background:var(--lavender-50);border:1px solid #ECE8FB;display:flex;align-items:center;gap:8px;padding:0 10px;font-size:12px;color:var(--ink-500);line-height:1.2}
.pch a b{display:block;font-size:14px;color:var(--navy)}.pch a .ic{color:var(--indigo)}
.pch a.dn{background:var(--pos-bg);border-color:var(--pos-line)}.pch a.dn .ic{color:var(--pos)}.pch a.rs{background:var(--neu-bg);border-color:var(--neu-line)}.pch a.rs .ic{color:var(--neu)}
.wo{margin-top:12px;border-radius:22px;background:linear-gradient(135deg,#1A1248,#2E2370);color:#fff;padding:14px 16px 16px}
.wo .tg{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:14px;background:rgba(255,255,255,.12);font-size:13px;font-weight:600}
.wo h2{font-size:21px;font-weight:600;margin:10px 0 4px}.wo .m{font-size:13px;color:#C9C3EE}.wo .btn{width:100%;margin-top:14px;height:50px}
.wo.rest{background:#fff;color:var(--ink-700);border:1px solid var(--border)}.wo.rest .tg{background:var(--neu-bg);color:var(--neu)}.wo.rest h2{color:var(--navy)}.wo.rest .m{color:var(--ink-500)}
.ml{background:#fff;border:1px solid var(--border);border-radius:20px;overflow:hidden}.mr{display:flex;align-items:center;gap:12px;min-height:58px;padding:0 14px;border-top:1px solid var(--border)}.mr:first-child{border-top:0}
.mr .t{width:58px;font-size:13px;color:var(--ink-500)}.mr .n{flex:1;min-width:0}.mr .n b{display:block;font-size:15px;font-weight:600;color:var(--navy)}.mr .n span{font-size:13px;color:var(--ink-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block}
.pb{display:flex;align-items:center;gap:8px;background:var(--info-bg);border:1px solid var(--info-line);color:var(--info);border-radius:14px;padding:0 6px 0 12px;min-height:44px;font-size:13px;margin-bottom:10px}.pb a{margin-left:auto;font-weight:700;padding:0 10px;min-height:44px;display:flex;align-items:center}
'''
def ring(v,t):
    r=46;c=2*math.pi*r;f=min(v/t,1)*c if t else 0
    a=f'<circle cx="52" cy="52" r="{r}" fill="none" stroke="var(--indigo)" stroke-width="10" stroke-linecap="round" stroke-dasharray="{f:.1f} {c:.1f}" transform="rotate(-90 52 52)"/>' if f>0 else ''
    return f'<div class="ring"><svg viewBox="0 0 104 104" width="104" height="104"><circle cx="52" cy="52" r="{r}" fill="none" stroke="var(--ring-track)" stroke-width="10"/>{a}</svg><div class="c"><b>{v:,}</b><span>of {t:,} kcal</span></div></div>'
def bars(p,c,f):
    o=''
    for n,v,t,col in [('Protein',p,110,'var(--ring-protein)'),('Carbs',c,230,'var(--ring-carbs)'),('Fat',f,58,'var(--ring-fat)')]:
        o+=f'<div><div class="h"><span>{n}</span><span><b>{v}</b> <small>of {t} g</small></span></div><div class="bar"><i style="width:{min(v/t,1)*100:.0f}%;background:{col}"></i></div></div>'
    return f'<div class="mb">{o}</div>'
def chips(w,m,s):
    def ch(icn,lab,val,cls=''):
        k=ic('check',18,w=2.4) if cls=='dn' else ic(icn,18)
        return f'<a class="{cls}" href="#" aria-label="{lab} {val}">{k}<span>{lab}<b>{val}</b></span></a>'
    return '<div class="pch">'+ch('dumbbell','Workout',*w)+ch('utensils','Meals',*m)+ch('foot','Steps',*s)+'</div>'
S={
 'empty':dict(k=0,p=0,c=0,f=0,w=('0 of 1',''),m=('0 of 5',''),s=('0',''),t='6:40',day=18),
 'partial':dict(k=460,p=24,c=70,f=14,w=('0 of 1',''),m=('2 of 5',''),s=('6,240',''),t='1:10',day=18),
 'done':dict(k=1810,p=108,c=224,f=57,w=('1 of 1','dn'),m=('5 of 5','dn'),s=('8,420','dn'),t='9:45',day=18),
 'rest':dict(k=460,p=24,c=70,f=14,w=('Rest day','rs'),m=('2 of 5',''),s=('6,240',''),t='1:10',day=18),
 'past':dict(k=1320,p=70,c=190,f=38,w=('Rest day','rs'),m=('4 of 5',''),s=('7,310',''),t='1:10',day=16),
}
MEALS=[('6:30 am','Early morning','Soaked almonds · 50 kcal'),('8:30 am','Breakfast','Vegetable poha, curd · 410 kcal'),('1:30 pm','Lunch','Roti, dal tadka, sabzi · 520 kcal'),('5:00 pm','Evening snack','Roasted chana, chai · 220 kcal'),('8:30 pm','Dinner','Paneer bhurji, 2 roti · 610 kcal')]
def meals(n,past=False):
    o=''
    for i,(t,a,b) in enumerate(MEALS[:3]):
        if i<n: c='<span class="chip pos">'+ic('check',14,w=2.2)+'Logged</span>'
        elif past: c='<span class="chip neu">Not logged</span>'
        elif i==n: c='<span class="chip sel">'+ic('clock',14)+'Up next</span>'
        else: c='<span class="chip neu">Later</span>'
        o+=f'<div class="mr"><span class="t">{t}</span><div class="n"><b>{a}</b><span>{b}</span></div>{c}</div>'
    return o
DAYS=[('Mon',12),('Tue',13),('Wed',14),('Thu',15),('Fri',16),('Sat',17),('Sun',18)]
def screen(st,os):
    d=S[st];past=st=='past'
    wk='<div class="wk"><a class="ar" href="#" aria-label="Previous week">'+ic('left',18)+'</a>'
    for n,x in DAYS:
        cls='on' if x==d['day'] else ('pk' if past and x==18 else '')
        dot='n' if x>18 else ('o' if x in (14,16) else '')
        wk+=f'<a class="d {cls}" href="#" aria-label="{n} {x} Oct"><span>{"Today" if x==18 and not past else n}</span><b>{x}</b><i class="{dot}"></i></a>'
    wk+='<a class="ar" href="#" style="opacity:.35">'+ic('right',18)+'</a></div>'
    top=f'<div class="top"><div><div class="eb">{"Fri 16 Oct" if past else "Sun 18 Oct"}</div><h1>{"Fri, 16 Oct" if past else "Today"}</h1></div><div class="row" style="gap:8px"><a class="icb" aria-label="All saved">{ic("cloud")}</a><a class="icb" aria-label="Notifications, 1 unread">{ic("bell")}<span class="d"></span></a></div></div>'
    pb=f'<div class="pb">{ic("clock",16)}Fri 16 Oct · you can still log it<a href="#">Back to today</a></div>' if past else ''
    pc=f'<section class="card pc" aria-label="Today\'s food and activity"><div class="pr">{ring(d["k"],1850)}{bars(d["p"],d["c"],d["f"])}</div>{chips(d["w"],d["m"],d["s"])}</section>'
    if st in('rest','past'):
        wo=f'<div class="wo rest"><span class="tg">{ic("moon",15)}Rest day</span><h2>Recovery is part of the plan</h2><div class="m">Next: Lower body B · Mon 19 Oct, 6:30 pm</div></div>'
    elif st=='done':
        wo=f'<div class="wo"><span class="tg">{ic("check",15,w=2.4)}Done · 7:22 pm</span><h2>Lower body B</h2><div class="m">6 of 6 exercises · 52 min</div><a class="btn w" href="#">View summary</a></div>'
    else:
        wo=f'<div class="wo"><span class="tg">{ic("clock",15)}Today · 6:30 pm</span><h2>Lower body B</h2><div class="m">6 exercises · about 50 min · 18 sets</div><a class="btn w" href="#">{ic("play",18)}Start workout</a></div>'
    n={'empty':0,'partial':2,'done':5,'rest':2,'past':4}[st]
    ml=f'<div class="sec"><h3>Meals</h3><span>{n} of 5 logged</span></div><div class="ml">{meals(min(n,3),past)}</div>'
    return page(phone(top+wk+pb+pc+wo+ml,os=os,tab='Today',t=d['t']),extra=X)
for os in ['ios','android']:
    for st in S: save(f'04-trainee-today-{os}-v3-{st}',screen(st,os))

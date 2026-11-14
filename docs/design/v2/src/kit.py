"""FitBud mobile kit v2: HTML component helpers. Every screen = screen(id, label, body)."""
import json,os,math
D=os.path.dirname(os.path.abspath(__file__))
IC=json.load(open(os.path.join(D,'icons.json')))
REG_PATH=os.path.join(D,'..','_work','registry.json')
REG=json.load(open(REG_PATH)) if os.path.exists(REG_PATH) else {}
def ic(n,s=20,sw=2,c=None,st=''):
    n={'trash-2':'trash','history':'clock','circle-help':'circle-question-mark'}.get(n,n) if n not in IC else n
    cc=f'color:{c};' if c else ''
    return f'<svg class="ico" width="{s}" height="{s}" viewBox="0 0 24 24" style="stroke-width:{sw};{cc}{st}">{IC[n]}</svg>'
# ---------- chrome ----------
def statusbar(t='9:41',dark=False):
    col='#fff' if dark else '#0B0A12'
    sig=''.join(f'<rect x="{i*4.6}" y="{10-3-i*2.2}" width="3" height="{3+i*2.2}" rx="0.9" fill="{col}"/>' for i in range(4))
    wifi=f'<svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.2 5.6 8.8a3.4 3.4 0 0 1 4.8 0Z" fill="{col}"/><path d="M3.4 6.6a6.5 6.5 0 0 1 9.2 0l-1.4 1.4a4.5 4.5 0 0 0-6.4 0Z" fill="{col}"/><path d="M1.2 4.4a9.6 9.6 0 0 1 13.6 0l-1.4 1.4a7.6 7.6 0 0 0-10.8 0Z" fill="{col}"/></svg>'
    bat=f'<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="{col}" stroke-opacity=".38"/><rect x="2" y="2" width="17" height="9" rx="2.2" fill="{col}"/><path d="M25 4.5v4a2 2 0 0 0 0-4z" fill="{col}" fill-opacity=".4"/></svg>'
    return f'<div class="sb"><div class="time tnum" style="color:{col}">{t}</div><div class="island"></div><div class="right"><svg width="17" height="11" viewBox="0 0 17 11">{sig}</svg>{wifi}{bat}</div></div>'
TT=[('Today','house'),('Workout','dumbbell'),('Diet','utensils'),('Progress','chart-no-axes-column'),('More','layout-grid')]
def tabbar(on,badges=None,dots=(),tabs=None):
    badges=badges or {};h=''
    for l,i in (tabs or TT):
        b=f'<span class="badge tnum">{badges[l]}</span>' if l in badges else ('<span class="dotb"></span>' if l in dots else '')
        h+=f'<div class="tab{" on" if l==on else ""}">{ic(i,22,1.9)}<span class="t-tab">{l}</span>{b}</div>'
    return f'<div class="tabbar">{h}</div>'
def fade(): return '<div class="fade"></div>'
# ---------- headers ----------
def lhdr(title,eyebrow='',right=''):
    e=f'<div class="eyebrow">{eyebrow}</div>' if eyebrow else ''
    return f'<div class="lhdr"><div>{e}<div class="t-large">{title}</div></div><div class="row" style="gap:10px">{right}</div></div>'
def circ(icon,dot=False,sm=False): return f'<div class="circbtn{" sm" if sm else ""}">{ic(icon,19,2)}{"<span class=dot></span>" if dot else ""}</div>'
def nav(title='',left='back',left_label='',right='',sub=''):
    L=''
    if left=='back': L=f'<span class="navbtn">{ic("chevron-left",24,2.2)}{left_label}</span>'
    elif left=='close': L=f'<div class="circbtn sm">{ic("x",18,2.2)}</div>'
    elif left=='down': L=f'<div class="circbtn sm">{ic("chevron-down",20,2.2)}</div>'
    elif left: L=f'<span class="navbtn">{left}</span>'
    s=f'<div class="t-cap" style="margin-top:0">{sub}</div>' if sub else ''
    t=f'<div class="ttl"><div class="t-head">{title}</div>{s}</div>' if title else ''
    return f'<div class="nav">{L}{t}<div style="margin-left:auto" class="row">{right}</div></div>'
def sec(title,right='',style=''):
    return f'<div class="sec" style="{style}"><span class="t-title">{title}</span><span>{right}</span></div>'
# ---------- primitives ----------
def btn(label,kind='primary',icon=None,cls='',style=''):
    i=ic(icon,18,2.4) if icon else ''
    return f'<div class="btn {kind} {cls}" style="{style}">{i}{label}</div>'
def tag(t,kind='neutral'):
    m={'neutral':('var(--fill)','var(--ink2)'),'ok':('var(--done-tint)','var(--done)'),'warn':('var(--warn-tint)','var(--warn)'),'crit':('var(--crit-tint)','var(--crit)'),
       'brand':('var(--brand-tint)','var(--brand-ink)'),'pr':('var(--pr-tint)','var(--pr)'),'info':('var(--info-tint)','var(--info)')}[kind]
    return f'<span class="tag" style="background:{m[0]};color:{m[1]}">{t}</span>'
def li(title,sub='',icon=None,icol=None,ibg=None,trail='',chev=True,cls='',tsub_cls='t-sub'):
    i=f'<div class="lic" style="{f"background:{ibg};" if ibg else ""}{f"color:{icol}" if icol else ""}">{ic(icon,18,2)}</div>' if icon else ''
    s=f'<div class="{tsub_cls}" style="font-size:13.5px;line-height:18px;margin-top:1px">{sub}</div>' if sub else ''
    c=f'<span class="chev">{ic("chevron-right",18,2.2)}</span>' if chev else ''
    st='' if icon else 'style="--inset:14px"'
    return f'<div class="li {cls}" {st}>{i}<div class="f1"><div class="t-body">{title}</div>{s}</div><div class="tr">{trail}{c}</div></div>'
def group(rows,label=''):
    l=f'<div class="t-label glabel">{label}</div>' if label else ''
    return f'{l}<div class="group">{"".join(rows)}</div>'
def field(label,value='',ph='',focus=False,err='',help='',prefix='',suffix='',pw=False,caret=None):
    v=value if value else f'<span class="ph">{ph}</span>'
    if caret if caret is not None else focus: v+='<span class="caret"></span>'
    p=f'<span class="b" style="color:var(--ink2)">{prefix}</span>' if prefix else ''
    s=f'<span style="margin-left:auto;color:var(--ink3)">{suffix}</span>' if suffix else ''
    h=f'<div class="help err">{ic("circle-alert",13,2.4)} {err}</div>' if err else (f'<div class="help">{help}</div>' if help else '')
    cls='err' if err else ('focus' if focus else '')
    return f'<div class="field"><div class="lab">{label}</div><div class="inp {cls}">{p}<span>{v}</span>{s}</div>{h}</div>'
def toggle(on=True,dis=False): return f'<span class="toggle{" on" if on else ""}{" dis" if dis else ""}"></span>'
def seg(opts,sel=0): return '<div class="seg">'+''.join(f'<span class="{"on" if i==sel else ""}">{o}</span>' for i,o in enumerate(opts))+'</div>'
def stepper(v): return f'<div class="stepper"><span>{ic("minus",16,2.4)}</span><b class="tnum">{v}</b><span>{ic("plus",16,2.4)}</span></div>'
def banner(text,kind='info',icon='info',action=''):
    a=f'<span class="ba">{action}</span>' if action else ''
    return f'<div class="banner {kind}">{ic(icon,18,2.2)}<span class="f1">{text}</span>{a}</div>'
def toast(text,action='',bottom=96,icon='circle-check'):
    a=f'<span class="ta">{action}</span>' if action else ''
    return f'<div class="toast" style="bottom:{bottom}px">{ic(icon,18,2.2,"#7FE0B4")}<span class="ell">{text}</span>{a}</div>'
def empty(icon,title,body,action='',top=0):
    a=f'<div style="margin-top:20px;width:100%">{action}</div>' if action else ''
    return f'<div class="empty" style="margin-top:{top}px"><div class="eic">{ic(icon,28,2)}</div><div class="t-title" style="font-size:19px">{title}</div><div class="t-sub" style="margin-top:6px;max-width:290px">{body}</div>{a}</div>'
def scrim(): return '<div class="scrim"></div>'
def sheet(inner,title='',left='',right='',bgc=False,style=''):
    h=f'<div class="shdr"><span style="min-width:60px">{left}</span><span class="t-head">{title}</span><span style="min-width:60px;text-align:right">{right}</span></div>' if (title or left or right) else ''
    return scrim()+f'<div class="sheet{" bgc" if bgc else ""}" style="{style}"><div class="grab"></div>{h}{inner}</div>'
def dialog(title,body,actions,icon=None,icol='var(--crit)',ibg='var(--crit-tint)'):
    i=f'<div style="width:48px;height:48px;border-radius:24px;background:{ibg};color:{icol};display:flex;align-items:center;justify-content:center;margin:0 auto 12px">{ic(icon,24,2.2)}</div>' if icon else ''
    return scrim()+f'<div class="dialog">{i}<div class="t-head">{title}</div><div class="t-sub">{body}</div><div class="btns">{"".join(actions)}</div></div>'
def av(ini,bg='#EEEAFF',fg='#4527C6',sm=False): return f'<div class="av{" sm" if sm else ""}" style="background:{bg};color:{fg}">{ini}</div>'
def coach_av(sm=True): return f'<div class="av coach{" sm" if sm else ""}">RV</div>'
def skel(w,h,r=8,style=''): return f'<div class="skel" style="width:{w};height:{h}px;border-radius:{r}px;{style}"></div>'
def sync(kind='saved'):
    m={'saved':('cloud-off','Saved on phone','var(--warn-tint)','var(--warn)'),'sending':('cloud-upload','Sending…','var(--info-tint)','var(--info)'),
       'sent':('cloud-check','Sent to Rahul','var(--done-tint)','var(--done)'),'offline':('wifi-off','Offline','var(--fill)','var(--ink2)')}[kind]
    return f'<span class="syncchip" style="background:{m[2]};color:{m[3]}">{ic(m[0],14,2.2)}{m[1]}</span>'
# ---------- domain ----------
WEEK=[('S','8','none'),('M','9','ok'),('T','10','rest'),('W','11','ok'),('T','12','ok'),('F','13','rest'),('S','14','today')]
def week(sel=6,dots=None,on=6,days=None):
    dots=dots or {}; W=days or WEEK
    col={'ok':'var(--done)','part':'var(--warn)','miss':'var(--crit)','rest':'transparent','none':'transparent','today':'transparent','plan':'var(--ink4)'}
    h=''
    for i,(a,b,c) in enumerate(W):
        c=dots.get(i,c);cls=' on' if i==on else (' sel' if i==sel else '')
        h+=f'<div class="d{cls}"><span class="t-cap" style="font-weight:600;{"color:var(--brand)" if i in (on,sel) else ""}">{a}</span><span class="dn tnum">{b}</span><span class="dot" style="background:{col.get(c,c)}"></span></div>'
    return f'<div class="week">{h}</div>'
def ring(val,goal,d=120,sw=11,color='var(--brand)',over=False):
    r=(d-sw)/2;c=2*math.pi*r;p=min(val/goal,1)
    extra=''
    if over:
        q=min((val-goal)/goal,1);extra=f'<circle cx="{d/2}" cy="{d/2}" r="{r}" fill="none" stroke="var(--crit)" stroke-width="{sw}" stroke-linecap="round" stroke-dasharray="{c*q:.2f} {c:.2f}" transform="rotate(-90 {d/2} {d/2})"/>'
    return (f'<svg width="{d}" height="{d}" viewBox="0 0 {d} {d}" style="display:block"><circle cx="{d/2}" cy="{d/2}" r="{r}" fill="none" stroke="var(--fill2)" stroke-width="{sw}"/>'
            f'<circle cx="{d/2}" cy="{d/2}" r="{r}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linecap="round" stroke-dasharray="{c*p:.2f} {c:.2f}" transform="rotate(-90 {d/2} {d/2})"/>{extra}</svg>')
def mbar(label,v,g,col):
    over=v>g;w=min(v/g,1)*100
    vc='var(--crit)' if over else 'var(--ink)'
    return (f'<div><div class="row sp" style="align-items:baseline"><span class="mlab">{label}</span><span class="n-sm"><b style="font-weight:600;color:{vc}">{v}</b><span class="unit"> / {g} g</span></span></div>'
            f'<div class="track"><i style="width:{w:.1f}%;background:{col}"></i></div></div>')
def diet_summary(eaten,goal,p,c,f,muted=False):
    left=goal-eaten;over=left<0
    lt=f'<span class="n-lg" style="color:var(--crit)">{abs(left):,}</span><span class="t-sub" style="font-weight:500">kcal over</span>' if over else f'<span class="n-lg">{left:,}</span><span class="t-sub" style="font-weight:500">kcal left</span>'
    return (f'<div class="card sum" style="margin-top:12px{";opacity:.55" if muted else ""}"><div class="rc">{ring(eaten,goal,over=over)}<div class="in"><span class="n-hero">{eaten:,}</span><span class="t-cap">kcal eaten</span></div></div>'
            f'<div class="bars"><div class="leftl">{lt}<span class="t-cap tnum" style="margin-left:auto">Goal {goal:,}</span></div>'
            f'{mbar("Protein",p[0],p[1],"var(--protein)")}{mbar("Carbs",c[0],c[1],"var(--carbs)")}{mbar("Fat",f[0],f[1],"var(--fat)")}</div></div>')
def meal(icon,name,time,sub,kcal,state='done',extra=''):
    tint,icol={'done':('var(--done-tint)','var(--done)'),'up':('var(--fill)','var(--ink2)'),'pend':('var(--warn-tint)','var(--warn)'),'lock':('var(--fill)','var(--ink3)'),'miss':('var(--crit-tint)','var(--crit)')}.get(state,('var(--fill)','var(--ink2)'))
    if state=='done': tr=f'<div class="kc"><span class="n-md">{kcal}</span><span class="t-cap">kcal</span></div><div class="okc">{ic("check",15,3)}</div>'
    elif state=='pend': tr=f'<div class="kc"><span class="n-md">{kcal}</span><span class="t-cap">kcal</span></div><div class="okc pend" style="background:var(--warn-tint);color:var(--warn)">{ic("cloud-off",14,2.4)}</div>'
    elif state=='lock': tr=f'<div class="kc"><span class="n-md" style="color:var(--ink3)">{kcal}</span><span class="t-cap">planned</span></div><div class="mmore">{ic("lock",16,2.2)}</div>'
    elif state=='miss': tr=f'<div class="kc"><span class="n-md" style="color:var(--ink3)">{kcal}</span><span class="t-cap">planned</span></div><div class="mmore">{ic("ellipsis",18,2.2)}</div>'
    else: tr=f'<div class="kc"><span class="n-md" style="color:var(--ink3)">{kcal}</span><span class="t-cap">planned</span></div><div class="mmore">{ic("ellipsis",18,2.2)}</div>'
    return (f'<div class="meal card">{"" if not icon else f"<div class=mt style=background:{tint};color:{icol}>{ic(icon,20,2)}</div>"}<div class="mx"><div class="row" style="gap:6px;align-items:baseline"><span class="t-bodym ell">{name}</span><span class="t-cap tnum" style="flex:none">{time}</span>{extra}</div>'
            f'<div class="t-sub ell msub">{sub}</div></div>{tr}</div>')
def due_meal(name,time,sub,kcal,icon='cookie',label='Due now'):
    return (f'<div class="card due"><div class="row" style="gap:12px"><div class="mt" style="background:var(--brand-tint);color:var(--brand)">{ic(icon,20,2)}</div>'
            f'<div class="mx"><div class="row" style="gap:6px;align-items:baseline"><span class="t-bodym">{name}</span><span class="t-cap" style="color:var(--brand);font-weight:600">{label}</span></div><div class="t-sub ell msub">{sub}</div></div>'
            f'<div class="kc"><span class="n-md">{kcal}</span><span class="t-cap">kcal</span></div><div class="mmore">{ic("ellipsis",18,2.2)}</div></div>'
            f'<div class="acts"><div class="pill brand">{ic("check",16,2.6)}Eaten as planned</div><div class="pill ghost">Something different</div></div></div>')
# workout
def wnav(title='Lower body B',sub='Week 3 · Day 2 · from Rahul',right=None,left='down'):
    r=right if right is not None else '<div class="pill brand" style="height:36px;border-radius:18px;padding:0 16px;font-size:15px">Finish</div>'
    L={'down':f'<div class="circbtn sm">{ic("chevron-down",20,2.2)}</div>','none':''}[left]
    return f'<div class="wnav">{L}<div class="f1"><div class="t-head ell">{title}</div><div class="t-cap">{sub}</div></div>{r}</div>'
def wstats(dur='23:14',vol='2,140',sets='7',tot='18',pct=39,durcol='var(--brand)'):
    return (f'<div class="wstats"><div><div class="t-cap">Duration</div><div class="n-md" style="color:{durcol}">{dur}</div></div>'
            f'<div><div class="t-cap">Volume</div><div class="n-md">{vol} <span class="unit" style="font-size:14px">kg</span></div></div>'
            f'<div><div class="t-cap">Sets</div><div class="n-md">{sets} <span class="unit" style="font-size:14px">/ {tot}</span></div></div></div><div class="wprog"><i style="width:{pct}%"></i></div>')
def exhead(name,icon='dumbbell',chips=(),cue='',done=False):
    ch=''.join(f'<span class="wchip{" plan" if i==0 else ""}">{ic(["target","timer","notebook-pen"][min(i,2)],15,2.2)}<span class="tnum">{c}</span></span>' for i,c in enumerate(chips))
    cu=f'<div class="cue">{coach_av()}<div class="t-sub" data-wrapok="1" style="color:var(--ink);font-size:14px;line-height:19px">{cue}</div></div>' if cue else ''
    return (f'<div class="exh" style="margin-top:6px"><div class="th">{ic(icon,20,2)}</div><div class="exname f1">{name}</div><span style="color:var(--ink2)">{ic("ellipsis-vertical",20,2.2)}</span></div>'
            f'<div class="wchips">{ch}</div>{cu}')
def sethead(bw=False):
    if bw: return f'<div class="sgrid bw shd t-label"><span>Set</span><span>Previous</span><span>Reps</span><span style="display:flex;justify-content:center">{ic("check",15,2.6)}</span></div>'
    return f'<div class="sgrid shd t-label"><span>Set</span><span>Previous</span><span>kg</span><span>Reps</span><span style="display:flex;justify-content:center">{ic("check",15,2.6)}</span></div>'
def setrow(cls,n,prev,kg,reps,pr=False,focus=None,bw=False,note=''):
    p=f'<span class="prtag">{ic("medal",12,2.4)}PR</span>' if pr else ''
    k='' if bw else f'<div class="cell{" focus" if focus=="kg" else ""}">{kg}</div>'
    ckic=ic('check',18,2.8) if cls!='skip' else ic('skip-forward',16,2.4)
    return (f'<div class="sgrid sr {cls}{" bw" if bw else ""}"><div class="sn">{n}</div><div class="prev tnum">{prev}{p}{note}</div>{k}'
            f'<div class="cell{" focus" if focus=="reps" else ""}">{reps}</div><div class="ck">{ckic}</div></div>')
def restbar(t='0:58',label='Rest · next set 3',pct=64,bottom=30):
    return (f'<div class="restbar" style="bottom:{bottom}px"><div class="fill"><i style="width:{pct}%"></i></div><div class="col f1" style="position:relative"><span style="font-size:12px;font-weight:500;color:rgba(255,255,255,.65)">{label}</span>'
            f'<span class="tnum" style="font-size:22px;line-height:26px;font-weight:700;letter-spacing:-.4px">{t}</span></div><div class="rb tnum">−15</div><div class="rb tnum">+15</div><div class="rb" style="background:#fff;color:var(--navy)">Skip</div></div>')
def minibar(bottom=92):
    return (f'<div class="minibar" style="bottom:{bottom}px"><div class="circbtn sm" style="width:32px;height:32px">{ic("chevron-up",18,2.2)}</div><div class="f1"><div class="row" style="gap:6px"><span class="t-bodym" style="font-size:15px">Lower body B</span><span class="n-sm" style="color:var(--brand)">23:14</span></div>'
            f'<div class="t-cap ell">Romanian deadlift · set 3 of 3</div></div><div class="pill tint" style="height:36px">Resume</div></div>')
# keypads
def kpad_set(field='kg'):
    k=lambda t,c='':f'<div class="key {c}">{t}</div>'
    rows=f'''<div class="row sp" style="padding:2px 6px 8px"><span class="t-cap">Set 3 · {"Weight (kg)" if field=="kg" else "Reps"} · Rahul’s target <b style="color:var(--brand)">{"40 kg" if field=="kg" else "10"}</b></span><span class="link">Done</span></div>
<div class="kgrid" style="grid-template-columns:repeat(4,1fr)">{k("1")}{k("2")}{k("3")}{k("−2.5","fn")}{k("4")}{k("5")}{k("6")}{k("+2.5","fn")}{k("7")}{k("8")}{k("9")}{k(ic("delete",22,2),"fn")}{k(".")}{k("0")}{k("Next","fn")}{k(ic("check",18,2.8)+"&nbsp;Log","pri")}</div>'''
    return f'<div class="kpad">{rows}</div>'
def kb_num(done='Done',dec=False):
    k=lambda t,s='':f'<div class="key" style="flex-direction:column;line-height:1">{t}{f"<span style=font-size:9.5px;letter-spacing:1.5px;font-weight:600;margin-top:1px>{s}</span>" if s else ""}</div>'
    L=['','ABC','DEF','GHI','JKL','MNO','PQRS','TUV','WXYZ']
    g=''.join(k(str(i+1),L[i]) for i in range(9))+(f'<div class="key" style="background:transparent;box-shadow:none;font-size:26px">.</div>' if dec else '<div></div>')+k('0')+f'<div class="key fn" style="background:transparent;box-shadow:none">{ic("delete",24,1.8)}</div>'
    return f'<div class="kpad" style="background:#D7D6DE"><div class="kgrid" style="grid-template-columns:repeat(3,1fr)">{g}</div></div>'
def kb_alpha(ret='search'):
    r=lambda ks:''.join(f'<span>{c}</span>' for c in ks)
    return (f'<div class="kb"><div class="kbr">{r("qwertyuiop")}</div><div class="kbr" style="padding:0 18px">{r("asdfghjkl")}</div>'
            f'<div class="kbr"><span class="fn">{ic("arrow-up-right",18,2,st="transform:rotate(-45deg)")}</span>{r("zxcvbnm")}<span class="fn">{ic("delete",20,1.8)}</span></div>'
            f'<div class="kbr"><span class="fn" style="flex:0 0 88px">123</span><span class="sp" style="font-size:15px">space</span><span class="fn" style="flex:0 0 88px;{"background:var(--brand);color:#fff" if ret else ""}">{ret}</span></div></div>')
# ---------- page ----------
SIDE='trainee'
def screen(sid,label,body,area,cls='',time='9:41',dark=False,hi=True,state='mocked'):
    html=(f'<!doctype html><html><head><meta charset="utf-8"><title>{sid}</title><link rel="stylesheet" href="../../src/kit.css"></head>'
          f'<body class="{cls}" style="width:393px;height:852px">{statusbar(time,dark)}{body}{"<div class=\'hi"+(" light" if dark else "")+"\'></div>" if hi else ""}</body></html>')
    open(os.path.join(D,'..','html',SIDE,sid+'.html'),'w').write(html)
    REG[sid]={'label':label,'area':area,'side':SIDE}
def save_reg(): json.dump(REG,open(REG_PATH,'w'),indent=1)
# ---------- Today ----------
def today_summary(eaten=1072,goal=1850,p=(58,110),c=(132,210),f=(31,55),tiles=None,muted=False):
    tiles=tiles or [('dumbbell','Workout','0 of 1',0),('utensils','Meals','3 of 5',60),('footprints','Steps','6,240',78)]
    t=''.join(f'<div class="f1" style="background:var(--bg);border-radius:12px;padding:9px 10px"><div class="row" style="gap:5px;color:var(--ink2)">{ic(i,14,2.2)}<span class="t-cap" style="color:var(--ink2)">{l}</span></div><div class="n-sm" style="font-size:15px;margin-top:2px">{v}</div><div class="track" style="height:4px;margin-top:5px"><i style="width:{pc}%;background:var(--brand)"></i></div></div>' for i,l,v,pc in tiles)
    inner=diet_summary(eaten,goal,p,c,f,muted)
    inner=inner.replace('<div class="card sum" style="margin-top:12px','<div class="sum" style="padding-bottom:12px',1)
    return f'<div class="card" style="margin-top:12px{";opacity:.55" if muted else ""}">{inner}<div class="row" style="gap:8px;padding:0 12px 12px">{t}</div></div>'
def workout_card(title='Lower body B',meta='6 exercises · about 50 min · 18 sets',when='Today · 6:30 pm',cta='Start workout',icon='play',state=''):
    return (f'<div style="margin-top:12px;border-radius:18px;background:linear-gradient(135deg,#2A1C7A,#1B1546);color:#fff;padding:16px">'
            f'<div class="row sp"><span class="syncchip" style="background:rgba(255,255,255,.12);color:#fff">{ic("clock",13,2.2)}{when}</span>{state}</div>'
            f'<div style="font-size:22px;line-height:27px;font-weight:700;letter-spacing:-.4px;margin-top:12px">{title}</div><div style="font-size:14px;color:rgba(255,255,255,.72);margin-top:2px">{meta}</div>'
            f'<div class="btn" style="background:#fff;color:var(--navy);margin-top:14px;height:46px">{ic(icon,17,2.4)}{cta}</div></div>')
def overlay(base,sid,label,area,inj,side=None,repl=()):
    """New screen = existing rendered HTML of `base` + injected overlay (sheet/toast/banner). No re-generation of the base."""
    sd=side or SIDE;h=open(os.path.join(D,'..','html',sd,base+'.html')).read()
    for a,b in repl: h=h.replace(a,b)
    h=h.replace(f'<title>{base}</title>',f'<title>{sid}</title>').replace('</body>',inj+'</body>')
    open(os.path.join(D,'..','html',sd,sid+'.html'),'w').write(h);REG[sid]={'label':label,'area':area,'side':sd}

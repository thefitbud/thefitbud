"""Trainer-mobile components on top of kit.py (Phase B)."""
import kit
from kit import *
kit.SIDE='trainer'
TTR=[('Needs you','inbox'),('Clients','users'),('Check-ins','clipboard-check'),('More','layout-grid')]
def ttab(on,badges=None): return tabbar(on,badges if badges is not None else {'Needs you':7,'Check-ins':3},tabs=TTR)
# roster: name -> (initials, bg, fg, goal)
C={'Rohan':('RM','var(--av1-bg)','var(--av1-fg)','Rohan Mehta','Fat loss · week 6'),'Meera':('MI','var(--av2-bg)','var(--av2-fg)','Meera Iyer','Strength · week 4'),
   'Sneha':('SK','var(--av3-bg)','var(--av3-fg)','Sneha Kapoor','Fat loss · week 2'),'Vikram':('VR','var(--av4-bg)','var(--av4-fg)','Vikram Rao','Not started'),
   'Aarav':('AS','var(--av5-bg)','var(--av5-fg)','Aarav Sharma','Fat loss · week 3'),'Deepak':('DN','var(--av6-bg)','var(--av6-fg)','Deepak Nair','Muscle gain · week 8'),
   'Farhan':('FA','var(--fill)','var(--ink2)','Farhan Ali','General fitness · week 5'),'Ishita':('IS','var(--av1-bg)','var(--av1-fg)','Ishita Sen','Fat loss · week 3'),
   'Priya':('PS','var(--av3-bg)','var(--av3-fg)','Priya Sharma','Fat loss · week 7'),'Neha':('NR','var(--av2-bg)','var(--av2-fg)','Neha Reddy','Strength · week 2'),
   'Kavya':('KM','var(--fill)','var(--ink3)','Kavya Menon','Ended 30 Oct'),'Nikhil':('NJ','var(--fill)','var(--ink3)','Nikhil Joshi','Ended 2 Oct'),'Anita':('AD','var(--fill)','var(--ink3)','Anita Desai','Invite sent 12 Nov')}
def cav(n,sm=False,size=None):
    i,bg,fg,_,_=C[n]
    st=f'width:{size}px;height:{size}px;border-radius:{size//2}px;font-size:{int(size*.36)}px;' if size else ''
    return f'<div class="av{" sm" if sm else ""}" style="background:{bg};color:{fg};{st}">{i}</div>'
SEV={'crit':('Critical','circle-alert','var(--crit-tint)','var(--crit)'),'warn':('Attention','triangle-alert','var(--warn-tint)','var(--warn)'),
     'ask':('Asked you','message-circle-question-mark','var(--brand-tint)','var(--brand-ink)'),'pain':('Mentions pain','heart-pulse','var(--crit-tint)','var(--crit)'),
     'ci':('To review','clipboard-check','var(--info-tint)','var(--info)'),'over':('Overdue','clock','var(--warn-tint)','var(--warn)'),
     'ok':('On track','circle-check','var(--done-tint)','var(--done)'),'rev':('Reviewed, still open','eye','var(--fill)','var(--ink2)'),
     'off':('Off plan','utensils-crossed','var(--warn-tint)','var(--warn)'),'onb':('Onboarding','user-round-plus','var(--info-tint)','var(--info)'),
     'end':('Ended','circle-slash','var(--fill)','var(--ink3)'),'pend':('Invite pending','mail','var(--fill)','var(--ink2)'),
     'pr':('New best','trophy','var(--pr-tint)','var(--pr)'),'paused':('Reminders paused','bell-off','var(--fill)','var(--ink2)'),
     'pushoff':('Push off','bell-off','var(--fill)','var(--ink2)'),'resolved':('Resolved','check','var(--done-tint)','var(--done)'),'answered':('Answered','check','var(--done-tint)','var(--done)')}
def sch(k,label=None):
    l,i,bg,fg=SEV[k];return f'<span class="sch" style="background:{bg};color:{fg}">{ic(i,13,2.4)}{label or l}</span>'
def tmcard(n,chips,issue,age,act='Review',dim=False):
    a=f'<div class="btn secondary sm act">{act}</div>' if act else f'<span class="chev act">{ic("chevron-right",18,2.2)}</span>'
    return f'''<div class="tmc"{' style="opacity:.6"' if dim else ''}>{cav(n)}<div class="f1" style="min-width:0"><div class="row sp"><span class="t-bodym">{C[n][3]}</span><span class="t-cap">{age}</span></div>
<div class="t-sub" style="font-size:14px;line-height:19px;margin-top:1px">{issue}</div><div class="row" style="gap:6px;margin-top:7px">{chips}</div></div>{a}</div>'''
GR={'missed':('Missed','calendar-x','var(--crit-tint)','var(--crit)'),'asked':('Asked you','message-circle-question-mark','var(--brand-tint)','var(--brand)'),
    'checkins':('Check-ins to review','clipboard-check','var(--info-tint)','var(--info)'),'off':('Off plan','utensils-crossed','var(--warn-tint)','var(--warn)'),
    'wins':('Wins','trophy','var(--pr-tint)','var(--pr)'),'reviewed':('Reviewed, still open','eye','var(--fill)','var(--ink2)')}
def ghdr(k,n,right=''):
    l,i,bg,fg=GR[k];return f'<div class="ghdr"><span class="gi" style="background:{bg};color:{fg}">{ic(i,14,2.4)}</span><span class="t-head">{l}</span><span class="t-sub tnum">{n}</span><span style="margin-left:auto">{right}</span></div>'
def sumtile(k,n,sub,zero=False):
    l,i,bg,fg=GR[k];return f'<div class="sumt{" zero" if zero else ""}"><span class="si" style="background:{bg};color:{fg}">{ic(i,17,2.2)}</span><div class="f1" style="min-width:0"><div class="row" style="gap:6px;align-items:baseline"><span class="snum">{n}</span><span class="t-bodym" style="font-size:14.5px">{l if k!="checkins" else "Check-ins"}</span></div><div class="t-cap">{sub}</div></div></div>'
def sumgrid(vals=None):
    v=vals or {'missed':(2,'1 critical'),'asked':(2,'1 with pain'),'checkins':(2,'oldest 1 d'),'off':(1,'3 of 5 days over')}
    return '<div class="sumgrid">'+''.join(sumtile(k,*v[k],zero=v[k][0]==0) for k in ['missed','asked','checkins','off'])+'</div>'
def chdr(n,chips='',sub=None,tz=''):
    return f'''<div class="row" style="gap:14px;margin-top:6px">{cav(n,size=56)}<div class="f1" style="min-width:0"><div class="t-title">{C[n][3]}</div><div class="t-sub">{sub or C[n][4]}</div><div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">{chips}{tz}</div></div></div>'''
def wdots(states):
    m={'ok':('var(--done)','var(--on-brand)','check'),'miss':('var(--crit-tint)','var(--crit)','x'),'rest':('var(--fill)','var(--ink4)','minus'),'plan':('var(--card)','var(--ink4)',None),'part':('var(--warn-tint)','var(--warn)','minus'),'today':('var(--card)','var(--ink)',None)}
    out=''
    for d,s in zip(['M','T','W','T','F','S','S'],states):
        bg,fg,i=m[s];bd='box-shadow:inset 0 0 0 2.5px var(--coral-strong);' if s=='today' else ('box-shadow:0 0 0 1px var(--line2);' if s=='plan' else '')
        out+=f'<div class="col" style="align-items:center;gap:4px"><span class="t-cap">{d}</span><div class="wdot" style="background:{bg};color:{fg};{bd}">{ic(i,15,2.6) if i else ""}</div></div>'
    return f'<div class="row sp" style="margin-top:10px">{out}</div>'
def hstat(items): return '<div class="row" style="gap:0;margin-top:12px">'+''.join(f'<div class="f1"><div class="n-md">{v}</div><div class="t-cap">{l}</div></div>' for v,l in items)+'</div>'
def stick2(a,b): return f'<div class="stick"><div class="row" style="gap:10px">{a.replace("class=\"btn","style=\"flex:1\" class=\"btn",1)}{b.replace("class=\"btn","style=\"flex:1.3\" class=\"btn",1)}</div></div>'
def wa_bubble(txt,link='fitbud.app/go/today'):
    return f'<div style="background:var(--wa-bubble);border-radius:14px 14px 14px 4px;padding:12px 14px;margin-top:8px"><div class="t-body" style="font-size:15px;line-height:21px">{txt}</div><div class="t-cap" style="color:var(--wa-ink);margin-top:4px">{link}</div></div>'
W='background:var(--bg-plain);top:0;padding-top:54px;bottom:0'
def page(navh,inner,white=False,pad_bottom=120):
    return f'<div class="content" style="{W if white else "top:0;padding-top:54px"}">{navh}{inner}<div style="height:{pad_bottom}px"></div></div>'

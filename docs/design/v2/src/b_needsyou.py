from kit_trainer import *
A='needsyou'
EB='Saturday, 14 Nov · 7 clients need you'
def hdr(eb=EB): return lhdr('Needs you',eb,circ('search'))
MISSED=ghdr('missed',2)+tmcard('Rohan',sch('crit'),'Missed 2 workouts · Tue, Thu','since 5 d')+tmcard('Neha',sch('warn'),'Breakfast not logged · Wed, Thu, Fri','since 3 d')
ASKED=ghdr('asked',2)+tmcard('Aarav',sch('pain'),'“Lower back feels tight on the last reps. Drop to 40 kg?”','12 min','Reply')+tmcard('Ishita',sch('ask'),'“Is 1 katori rice too much at dinner?”','2 h','Reply')
CHECK=ghdr('checkins',2)+tmcard('Sneha',sch('ci'),'Weekly check-in · week 2 · 2 photos','1 d')+tmcard('Deepak',sch('ci'),'Weekly check-in · week 8','4 h')
OFF=ghdr('off',1)+tmcard('Priya',sch('off'),'Over calories 3 of the last 5 days · ate out twice','since 2 d')
WINS=ghdr('wins',2)+f'<div class="group">{"".join(f"""<div class="crow">{cav(n)}<div class="f1"><div class="t-bodym">{C[n][3]}</div><div class="t-sub" style="font-size:13.5px">{s}</div></div>{sch("pr",t)}</div>""" for n,s,t in [("Aarav","Romanian deadlift 42.5 kg × 10","PR"),("Deepak","4 of 4 workouts this week","Streak")])}</div>'
REV=ghdr('reviewed',1,'<span class="t-cap">Stays until resolved</span>')+tmcard('Meera',sch('rev'),'Lunch not logged · Thu','2 d',None,True)
def ny(body,extra='',eb=EB,badges=None):
    return f'<div class="content">{hdr(eb)}{body}<div style="height:110px"></div></div>{fade()}{ttab("Needs you",badges)}{extra}'
screen('TM-01a-needs-you','Needs you: four-group summary, then groups by reason',ny(sumgrid()+MISSED+ASKED),A)
screen('TM-01a2-needs-you-scrolled','Needs you scrolled: check-ins, off plan, wins, reviewed',f'<div class="content" style="top:44px">{CHECK}{OFF}{WINS}{REV}<div style="height:110px"></div></div>{fade()}{ttab("Needs you")}',A)
sw=f'''<div style="position:relative;margin-top:8px;border-radius:14px;overflow:hidden;background:var(--brand)" data-offok="1"><div style="position:absolute;right:0;top:0;bottom:0;width:150px;display:flex">
<div class="f1 col" style="align-items:center;justify-content:center;gap:3px;background:var(--brand);color:#fff;font-size:12px;font-weight:600">{ic("bell-ring",20,2.2)}Nudge</div><div class="f1 col" style="align-items:center;justify-content:center;gap:3px;background:var(--ink2);color:#fff;font-size:12px;font-weight:600">{ic("ellipsis",20,2.2)}More</div></div>
<div style="transform:translateX(-150px)">{tmcard('Neha',sch('warn'),'Breakfast not logged · Wed, Thu, Fri','since 3 d').replace('class="tmc"','class="tmc" style="border-radius:0"')}</div></div>'''
screen('TM-01b-needs-you-swipe','Swipe left: Nudge, More (Mark reviewed is swipe right)',ny(sumgrid()+ghdr('missed',2)+tmcard('Rohan',sch('crit'),'Missed 2 workouts · Tue, Thu','since 5 d')+sw+ASKED),A)
screen('TM-01c-needs-you-reviewed-undo','Marked reviewed, with Undo',ny(sumgrid({'missed':(1,'1 critical'),'asked':(2,'1 mentions pain'),'checkins':(2,'oldest 1 d'),'off':(1,'3 of 5 days over')})+ghdr('missed',1)+tmcard('Rohan',sch('crit'),'Missed 2 workouts · Tue, Thu','since 5 d')+ASKED+CHECK,toast("Neha marked reviewed","Undo",96),eb='Saturday, 14 Nov · 6 clients need you',badges={'Needs you':6,'Check-ins':3}),A)
screen('TM-01d-needs-you-all-caught-up','Empty: all caught up',ny(sumgrid({k:(0,'none') for k in ['missed','asked','checkins','off']})+f'<div class="card" style="margin-top:14px;padding:26px 18px">{empty("circle-check","All caught up","Nobody needs you right now. We’ll notify you when a client misses something or asks.")}</div>'+WINS,eb='Saturday, 14 Nov',badges={}),A)
sk=''.join(f'<div class="tmc">{skel("40px",40,20)}<div class="f1 col" style="gap:8px">{skel("55%",14)}{skel("85%",12)}{skel("30%",18,7)}</div></div>' for _ in range(4))
screen('TM-01e-needs-you-loading','Loading skeleton (counts never flash 0)',ny('<div class="sumgrid">'+''.join(f'<div class="sumt">{skel("30px",30,9)}<div class="f1 col" style="gap:6px">{skel("60%",16)}{skel("40%",10)}</div></div>' for _ in range(4))+f'</div><div style="margin-top:22px">{skel("40%",16)}</div><div style="margin-top:10px">{sk}</div>',eb='Saturday, 14 Nov',badges={}),A)
dis=lambda s:s.replace('class="btn tint sm act"','class="btn dis sm act"')
screen('TM-01f-needs-you-offline','Offline: cached at 9:40 am, actions disabled',ny(f'<div style="margin-top:12px">{banner("You’re offline. Showing the last update from 9:40 am. Actions come back when you’re online.","neutral","wifi-off")}</div>'+sumgrid()+dis(MISSED+ASKED),eb='Saturday, 14 Nov · as of 9:40 am'),A)
screen('TM-01g-needs-you-error','Couldn’t load, Retry',ny(f'<div class="card" style="margin-top:14px;padding:26px 18px">{empty("cloud-off","Couldn’t load Needs you","Check your connection and try again. Pull down to refresh.",btn("Try again","tint",icon="refresh-cw"))}</div>',eb='Saturday, 14 Nov',badges={}),A)
save_reg()

from kit_trainer import *
A='clients'
def crow(n,chips,last,dim=False):
    return f'<div class="crow"{" style=\"opacity:.65\"" if dim else ""}>{cav(n)}<div class="f1" style="min-width:0"><div class="row sp"><span class="t-bodym">{C[n][3]}</span><span class="t-cap">{last}</span></div><div class="t-sub" style="font-size:13.5px">{C[n][4]}</div><div class="row" style="gap:6px;margin-top:5px">{chips}</div></div></div>'
ROWS={'Rohan':(sch('crit','Needs attention'),'2 d ago'),'Aarav':(sch('ok')+sch('pr'),'12 min'),'Deepak':(sch('ci','Check-in to review'),'4 h'),'Farhan':(sch('over','Check-in overdue')+sch('paused'),'1 d'),
      'Ishita':(sch('ask')+sch('pushoff'),'2 h'),'Meera':(sch('rev','Reviewed'),'3 h'),'Neha':(sch('warn','Needs attention'),'1 d'),'Priya':(sch('off'),'5 h'),'Sneha':(sch('ci','Check-in to review'),'1 d'),'Vikram':(sch('onb','Intake not sent'),'3 d')}
def chips(sel=0,counts=(("All",10),("Needs attention",3),("Check-in due",3),("Onboarding",1),("Invites",1),("Ended",2))):
    return '<div class="row" style="gap:8px;margin:12px -16px 0;padding:0 16px;overflow:hidden" data-offok="1">'+''.join(f'<span class="chip{" on" if i==sel else ""}">{l} <span class="tnum" style="opacity:.6">{n}</span></span>' for i,(l,n) in enumerate(counts))+'</div>'
def roster():
    return '<div class="sumgrid" style="grid-template-columns:repeat(3,1fr)">'+''.join(f'<div class="sumt" style="flex-direction:column;align-items:flex-start;gap:0;min-height:0;padding:10px 12px"><span class="snum" style="color:{c}">{n}</span><span class="t-cap">{l}</span></div>' for n,l,c in [(10,'Active','var(--ink)'),(3,'Check-ins due','var(--info)'),(1,'Invite pending','var(--ink2)')])+'</div>'
def clients(body,seg=0,extra='',eb='Rahul Verma · 10 active'):
    return f'''<div class="content">{lhdr("Clients",eb,circ("search"))}<div style="margin-top:12px">{seg_(seg)}</div>{body}<div style="height:110px"></div></div>{fade()}{ttab("Clients")}{extra}'''
seg_=lambda s:seg(["Clients","Activity"],s)
order=['Rohan','Neha','Ishita','Sneha','Deepak','Priya','Farhan','Vikram','Meera','Aarav']
screen('TM-02a-clients-list','Clients: roster counts, filters, rows with status chips',clients(chips()+f'<div class="group" style="margin-top:12px">{"".join(crow(n,*ROWS[n]) for n in order[:7])}</div>'),A)
screen('TM-02b-clients-search','Search typing',f'''<div class="content" style="top:0;padding-top:54px"><div class="row" style="gap:10px;margin-top:6px"><div class="search f1" style="color:var(--ink)">{ic("search",18,2,"var(--ink3)")}ro<span class="caret" style="display:inline-block;width:2px;height:20px;background:var(--brand)"></span></div><span class="navbtn">Cancel</span></div>
<div class="t-label glabel">1 client</div><div class="group">{crow("Rohan",*ROWS["Rohan"])}</div><div class="t-cap" style="margin:10px 2px">Searches active, invited and ended clients.</div></div>'''+kb_alpha('search'),A)
screen('TM-02c-clients-filter-ended','Filter: ended clients (read only)',clients(chips(5)+f'<div class="group" style="margin-top:12px">{crow("Kavya",sch("end"),"30 Oct",True)}{crow("Nikhil",sch("end"),"2 Oct",True)}</div><div class="t-cap" style="margin:10px 2px">Ended clients are read only. Reactivate from a client’s page.</div>'),A)
screen('TM-02d-clients-filter-invites','Filter: pending invite',clients(chips(4)+f'<div class="group" style="margin-top:12px">{crow("Anita",sch("pend"),"2 d")}</div><div class="t-cap" style="margin:10px 2px">Invite new clients on FitBud web.</div>'),A)
screen('TM-02e-clients-empty','No clients yet',clients(f'<div class="card" style="margin-top:14px;padding:26px 18px">{empty("users","No clients yet","Invite your first client from FitBud web. They’ll show up here once they accept.",btn("Copy web link","tint",icon="copy"))}</div>',eb='Rahul Verma'),A)
screen('TM-02f-clients-offline','Clients offline (cached)',clients(f'<div style="margin-top:12px">{banner("You’re offline. Showing clients from 9:40 am.","neutral","wifi-off")}</div>'+roster()+f'<div class="group" style="margin-top:12px">{"".join(crow(n,*ROWS[n]) for n in order[:6])}</div>',eb='As of 9:40 am'),A)
screen('TM-02g-clients-loading','Clients loading',clients('<div class="group" style="margin-top:14px">'+''.join(f'<div class="crow">{skel("40px",40,20)}<div class="f1 col" style="gap:7px">{skel("50%",14)}{skel("35%",11)}{skel("40%",16,7)}</div></div>' for _ in range(7))+'</div>',eb='Rahul Verma'),A)
# Activity (TM-09)
def ev(n,txt,i,chip,when,dot=False):
    return f'<div class="crow" style="align-items:flex-start">{cav(n)}<div class="f1" style="min-width:0"><div class="t-body" style="font-size:15px;line-height:20px">{txt}</div><div class="row" style="gap:6px;margin-top:5px">{chip}<span class="t-cap">{when}</span></div></div>{"<span style=\'width:8px;height:8px;border-radius:4px;background:var(--brand);margin-top:6px;flex:none\'></span>" if dot else ""}</div>'
ach=lambda i,l,bg='var(--fill)',fg='var(--ink2)':f'<span class="sch" style="background:{bg};color:{fg}">{ic(i,13,2.4)}{l}</span>'
FEED=f'''<div class="row" style="gap:8px;margin:12px -16px 0;padding:0 16px;overflow:hidden" data-offok="1">{"".join(f'<span class="chip{" on" if i==0 else ""}">{t}</span>' for i,t in enumerate(["All","Workouts","Meals","Check-ins","Changes","Notes seen"]))}</div>
<div class="t-label glabel">Today</div><div class="group">{ev("Aarav","<b class=b>Aarav</b> finished <i>Lower body B</i> · 1 new best · 1 exercise added","dumbbell",ach("trophy","New best","var(--pr-tint)","var(--pr)"),"12 min ago",True)}
{ev("Priya","<b class=b>Priya</b> logged <i>Lunch</i> · ate out · 1,120 kcal (plan 560)","utensils",ach("utensils-crossed","Ate out","var(--warn-tint)","var(--warn)"),"1 h ago",True)}
{ev("Deepak","<b class=b>Deepak</b> submitted check-in · week 8","clipboard-check",ach("clipboard-check","Check-in","var(--info-tint)","var(--info)"),"4 h ago · 7:40 am his time")}
{ev("Sneha","<b class=b>Sneha</b> logged 3 meals","utensils",ach("utensils","As planned","var(--done-tint)","var(--done)"),"5 h ago")}</div>
<div class="t-label glabel">Yesterday</div><div class="group">{ev("Neha","<b class=b>Neha</b> changed Lunch time 1:30 → 2:30 pm","clock",ach("repeat","Change"),"Fri 7:12 pm")}{ev("Meera","<b class=b>Meera</b> saw your note","eye",ach("eye","Note seen"),"Fri 6:05 pm")}</div>'''
screen('TM-09a-activity-feed','Activity: grouped by day, filter chips',clients(FEED,1,eb='Last 7 days'),A)
SET=lambda: f'''<div class="row sp"><div><div class="t-title">Aarav · Lunch</div><div class="t-sub">Today 1:42 pm · changed from the plan</div></div>{ach("repeat","Changed")}</div>
<div class="cmp" data-wrapok="1" style="margin-top:14px"><div class="t-label" style="color:var(--ink3)">Food</div><div class="t-label" style="color:var(--ink3)">Plan</div><div class="t-label" style="color:var(--ink3)">Ate</div>
{"".join(f'<div class="t-body" style="font-size:15px">{a}</div><div class="t-sub tnum">{b}</div><div class="t-bodym tnum" style="font-size:15px;{c}">{d}</div>' for a,b,d,c in [("Roti","3 pc","2 pc","color:var(--warn)"),("Dal tadka","1 katori","1 katori",""),("Jeera rice","—","½ katori","color:var(--warn)"),("Salad","1 bowl","1 bowl",""),("Total","560 kcal","610 kcal","")])}</div>
<div class="row" style="gap:10px;margin-top:16px">{btn("Open Aarav","secondary",style="flex:1")}{btn("Add note","tint",icon="notebook-pen",style="flex:1")}</div>'''
screen('TM-09b-activity-meal-sheet','Activity row → meal planned vs actual sheet',clients(FEED,1,sheet(SET()),eb='Last 7 days'),A)
screen('TM-09c-activity-filtered-empty','Activity filtered empty',clients(f'''<div class="row" style="gap:8px;margin:12px -16px 0;padding:0 16px;overflow:hidden" data-offok="1">{"".join(f'<span class="chip{" on" if i==3 else ""}">{t}</span>' for i,t in enumerate(["All","Workouts","Meals","Check-ins","Changes"]))}</div><span class="chip tint" style="margin-top:8px">Farhan {ic("x",14,2.4)}</span>
<div style="margin-top:80px">{empty("clipboard-check","No check-in activity in the last 7 days","Farhan’s check-in was due Fri 13 Nov.",btn("Clear filters","tint"))}</div>''',1,eb='Last 7 days'),A)
save_reg()

"""W14 trainer additions (24 Nov 2026, D-W14-23): client edited / removed a meal log — push, Activity row + in-app banner,
meal sheet with the edit line, notification setting. Run after b_*.py (imports their helpers)."""
from kit_trainer import *
import b_clients as bc
from b_more import push, rem
W='background:var(--bg-plain);top:0;padding-top:54px;bottom:0'
def page(navh,inner,white=True): return f'<div class="content" style="{W if white else "top:0;padding-top:54px"}">{navh}{inner}</div>'
A='notifications'
ED=bc.ach("pencil","Edited")
RM=bc.ach("trash-2","Removed")
# ---- TM-13c lock screen push
screen('TM-13c-client-log-edited-push','Trainer push: a client edited or removed a meal log (opens their diet day)',f'''<div style="position:absolute;inset:0;background:linear-gradient(170deg,#1d2a4a,#3a5a9a 55%,#9fb8e6)"></div>
<div style="position:absolute;top:70px;left:0;right:0;text-align:center;color:#fff"><div style="font-size:19px;font-weight:600">Saturday 14 November</div><div style="font-size:92px;line-height:100px;font-weight:700;letter-spacing:-3px" class="tnum">2:06</div></div>
{push("Aarav edited lunch","610 → 690 kcal · changed portion. Tap to see what changed.","now",400)}{push("Priya removed their dinner log","Fri 13 Nov · was 1,120 kcal, ate out. It’s back to not logged.","1h",500)}''',A,time='',dark=True)
# ---- TM-09e Activity with the new rows + in-app banner
FEED=f'''<div class="row" style="gap:8px;margin:12px -16px 0;padding:0 16px;overflow:hidden" data-offok="1">{"".join(f'<span class="chip{" on" if i==0 else ""}">{t}</span>' for i,t in enumerate(["All","Workouts","Meals","Check-ins","Changes","Notes seen"]))}</div>
<div class="t-label glabel">Today</div><div class="group">{bc.ev("Aarav","<b class=b>Aarav</b> edited <i>Lunch</i> · 610 → 690 kcal · changed portion","pencil",ED,"just now",True)}
{bc.ev("Priya","<b class=b>Priya</b> removed their <i>Dinner</i> log (Fri 13 Nov) · was 1,120 kcal, ate out","trash-2",RM,"1 h ago",True)}
{bc.ev("Aarav","<b class=b>Aarav</b> finished <i>Lower body B</i> · 1 new best","dumbbell",bc.ach("trophy","New best","var(--pr-tint)","var(--pr)"),"3 h ago")}
{bc.ev("Sneha","<b class=b>Sneha</b> logged 3 meals","utensils",bc.ach("utensils","As planned","var(--done-tint)","var(--done)"),"5 h ago")}</div>'''
BANNER=f'''<div style="position:absolute;left:10px;right:10px;top:56px;z-index:60;border-radius:18px;background:var(--card);box-shadow:0 10px 30px rgba(var(--sh),.18);padding:12px 14px" class="row">{cav("Aarav")}<div class="f1" style="margin-left:10px"><div class="row sp"><span class="t-bodym" style="font-size:15px">Aarav edited lunch</span><span class="t-cap">now</span></div><div class="t-sub" style="font-size:14px">610 → 690 kcal · changed portion</div></div></div>'''
screen('TM-09e-activity-log-edited','Activity: client edit and removal rows (neutral tags, unread dot) with the in-app banner',bc.clients(FEED,1,BANNER,eb='Last 7 days'),A)
# ---- TM-09f meal sheet with the edit line
SET=f'''<div class="row sp"><div><div class="t-title">Aarav · Lunch</div><div class="t-sub">Today 1:42 pm · changed from the plan</div></div>{ED}</div>
<div class="banner neutral" style="margin-top:12px">{ic("pencil",16,2.2)}<span class="f1" data-wrapok="1"><b style="color:var(--ink)">Edited by Aarav · Sat 14 Nov, 2:05 pm</b><br>Was 610 kcal · roti 2 pc (now 3)</span></div>
<div class="cmp" data-wrapok="1" style="margin-top:14px"><div class="t-label" style="color:var(--ink3)">Food</div><div class="t-label" style="color:var(--ink3)">Plan</div><div class="t-label" style="color:var(--ink3)">Ate</div>
{"".join(f'<div class="t-body" style="font-size:15px">{a}</div><div class="t-sub tnum">{b}</div><div class="t-bodym tnum" style="font-size:15px;{c}">{d}</div>' for a,b,d,c in [("Roti","3 pc","3 pc","color:var(--done)"),("Dal tadka","1 katori","1 katori",""),("Jeera rice","—","½ katori","color:var(--warn)"),("Salad","1 bowl","1 bowl",""),("Total","560 kcal","690 kcal","")])}</div>
<div class="row" style="gap:10px;margin-top:16px">{btn("Open Aarav’s diet","secondary",style="flex:1")}{btn("Add note","tint",icon="notebook-pen",style="flex:1")}</div>'''
screen('TM-09f-activity-meal-edited-sheet','Tap the push or row: the meal sheet shows who edited it, when, and what it was',bc.clients(FEED,1,sheet(SET),eb='Last 7 days'),A)
# ---- TM-07b2 settings with the new toggle
screen('TM-07b2-notification-settings-log-edits','Trainer notification settings: new “Client log edits” toggle (on by default)',page(nav("Notifications"),f'''{group([rem("Critical items","Missed workouts, pain mentions"),rem("Client asks","When a client asks you something"),rem("Check-ins sent","When a check-in is ready to review"),rem("Client log edits","When a client edits or removes a meal log"),rem("Daily summary","8:00 am · who needs you today",False)],"Notify me about")}
<div class="group" style="padding:12px 14px"><div class="row sp"><span class="t-body">Quiet hours</span><span class="t-bodym tnum">10 pm – 7 am</span></div><div class="t-cap" style="margin-top:2px" data-wrapok="1">Pain mentions still come through. Times use India Standard Time.</div></div>''',white=False),'more')
save_reg()

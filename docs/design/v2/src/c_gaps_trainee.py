from kit import *
import kit
kit.SIDE='trainee'
NOTE=sheet(f'''<div class="row sp"><span class="navbtn">Cancel</span><span class="t-head">Note · Romanian deadlift</span><span class="navbtn strong">Save</span></div>
<div class="inp focus" style="margin-top:14px;min-height:96px;align-items:flex-start;padding-top:12px"><span>Grip slipping on set 3. Using straps next time.<span class="caret"></span></span></div>
<div class="t-cap" style="margin-top:8px">Rahul sees this note with today’s sets.</div>''',style='bottom:291px;border-radius:14px 14px 0 0;padding-bottom:14px')+kb_alpha('return')
overlay('W-03-active-mid','W-10-exercise-note','Exercise note sheet (Rahul sees it)','workout',NOTE)
alt=lambda n,s,on=False:f'<div class="li" style="--inset:14px"><div class="f1"><div class="t-body">{n}</div><div class="t-sub" style="font-size:13.5px">{s}</div></div><span style="width:22px;height:22px;border-radius:11px;{"background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center" if on else "box-shadow:inset 0 0 0 1.5px var(--ink4)"}">{ic("check",14,3) if on else ""}</span></div>'
REP=sheet(f'''<div class="row sp"><div><div class="t-title">Replace walking lunge</div><div class="t-sub">For today only · Rahul sees the swap</div></div><div class="circbtn sm">{ic("x",18,2.2)}</div></div>
<div class="t-label glabel">Rahul’s alternatives</div><div class="group" style="background:var(--bg);box-shadow:none">{alt("Bulgarian split squat","3 × 10 / leg · dumbbell",True)}{alt("Leg press","3 × 12 · machine")}{alt("Step-up","3 × 10 / leg · box")}</div>
<div class="row" style="gap:6px;margin-top:12px" ><span class="link row" style="gap:6px">{ic("search",15,2.2)}Search all exercises</span></div><div style="margin-top:14px">{btn("Replace for today")}</div>''')
overlay('W-03-active-mid','W-22-replace-exercise','Replace exercise: coach alternatives first','workout',REP)
overlay('W-03-active-mid','W-09b-exercise-skipped','Exercise skipped, with Undo','workout',toast("Walking lunge skipped","Undo",40))
PL=sheet(f'''<div class="row sp"><div><div class="t-title">Dinner</div><div class="t-sub">Planned for 8:30 pm · 560 kcal</div></div><div class="circbtn sm">{ic("x",18,2.2)}</div></div>
<div class="group" style="margin-top:14px;background:var(--bg);box-shadow:none">{''.join(f'<div class="li" style="--inset:14px"><div class="f1"><div class="t-body">{a}</div><div class="t-sub" style="font-size:13.5px">{b}</div></div><span class="n-sm">{c}</span><span class="t-cap">kcal</span></div>' for a,b,c in [("Paneer bhurji","1 katori (150 g)",310),("Chapati / roti","2 pieces",160),("Cucumber raita","1 katori",90)])}</div>
<div class="t-cap" style="margin:10px 2px">P 28 g · C 44 g · F 22 g · from Rahul’s plan</div>
<div class="col" style="gap:8px;margin-top:6px">{btn("Eaten as planned",icon="check")}{btn("Something different","secondary")}</div>''')
overlay('TR-07a-diet-day','TR-07j-planned-meal-detail','Planned meal detail (tap a meal not yet logged)','diet',PL)
row=lambda t,s,chip:f'<div class="li" style="--inset:14px"><div class="f1"><div class="t-body">{t}</div><div class="t-sub" style="font-size:13.5px">{s}</div></div>{chip}<span class="chev">{ic("chevron-right",18,2.2)}</span></div>'
W='background:#fff;top:0;padding-top:54px;bottom:0'
screen('TR-13d-checkin-history','Check-in history (from Progress)',f'''<div class="content" style="top:0;padding-top:54px">{nav("Check-ins")}
{group([row("Week 3","Due Sun 15 Nov",tag("Due","warn"))],"Upcoming")}{group([row("Week 2","Sent Sun 8 Nov · Rahul replied",tag("Reviewed","ok")),row("Week 1","Sent Sun 1 Nov",tag("Reviewed","ok")),row("Starting point","Intake · 2 Oct",tag("Intake"))],"Sent")}</div>''','progress')
ph=lambda h=110,t=('#cfc8e8','#9d93c4'):f'<div style="position:relative;height:{h}px;border-radius:10px;overflow:hidden"><div style="position:absolute;inset:0;background:linear-gradient(160deg,{t[0]},{t[1]})"></div><svg viewBox="0 0 60 100" style="position:absolute;left:50%;top:10px;width:44px;transform:translateX(-50%)" fill="#ffffff66"><circle cx="30" cy="16" r="11"/><path d="M12 36q18-10 36 0l4 64H8z"/></svg></div>'
wk=lambda w,d:f'<div class="row sp" style="margin:18px 2px 8px"><span class="t-head">{w}</span><span class="t-cap">{d}</span></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">{ph()}{ph()}{ph()}</div><div class="row sp t-cap" style="margin-top:4px;padding:0 4px"><span>Front</span><span>Side</span><span>Back</span></div>'
screen('TR-13e-progress-photos','Progress photos by week (read only; added in check-ins)',f'''<div class="content" style="top:0;padding-top:54px">{nav("Progress photos")}<div class="t-sub" style="margin:4px 2px 0">Only you and Rahul can see these. Add new ones in your weekly check-in.</div>{wk("Week 2","8 Nov")}{wk("Week 1","1 Nov")}{wk("Starting point","2 Oct")}</div>''','progress')
BAN=f'<div style="position:absolute;left:10px;right:10px;top:56px;z-index:60;border-radius:18px;background:#fff;box-shadow:0 10px 30px rgba(22,18,58,.18);padding:12px 14px" class="row">{coach_av()}<div class="f1" style="margin-left:10px"><div class="row sp"><span class="t-bodym" style="font-size:15px">Rahul updated your plan</span><span class="t-cap">now</span></div><div class="t-sub" style="font-size:14px">Split squats replace walking lunges from Mon 16 Nov.</div></div></div>'
overlay('W-01a-workout-tab-not-started','W-01d-plan-changed-banner','Plan changed by Rahul (deep link lands on Workout)','workout',BAN)
pw='<span style="letter-spacing:3px;font-size:18px">••••••••</span>'
screen('TR-20g-change-password','Change password (shared: trainee and coach)',f'''<div class="content" style="{W}">{nav("Change password",left="Cancel",right='<span class="navbtn dis">Save</span>')}
{field("Current password",pw)}{field("New password",pw+'••',focus=True,help="At least 10 characters. Avoid your name or phone number.")}{field("Confirm new password","",ph="Type it again")}
<div class="t-cap" data-wrapok="1" style="margin-top:14px">You’ll stay signed in on this phone. Other devices are signed out.</div></div>''','more')
save_reg()

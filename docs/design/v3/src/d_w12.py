"""W12 additions (14 Nov 2026): custom food + saved confirmation (MFP-informed), future days view-only (Diet, Workout),
complete lock-screen Live Activity. Run after a_*.py (imports their helpers)."""
from kit import *
import a_diet as ad, a_workout as aw
FUT=[('S','15','plan'),('M','16','plan'),('T','17','rest'),('W','18','plan'),('T','19','plan'),('F','20','rest'),('S','21','plan')]
ELL=f'<div class="mmore">{ic("ellipsis",18,2.2)}</div>'
W='background:var(--bg-plain);top:0;padding-top:54px;bottom:0'
# ---- TR-26e custom food (MFP "Create food" / "Quick add", kept to name, amount, kcal; macros optional)
num=lambda lab,v,u,focus=False,ph=False:f'<div class="f1"><div class="t-cap" style="margin-bottom:4px">{lab}</div><div class="inp{" focus" if focus else ""}" style="height:46px;justify-content:space-between"><span class="tnum{" ph" if ph else ""}" style="font-weight:600">{v}{"<span class=caret></span>" if focus else ""}</span><span style="color:var(--ink3)">{u}</span></div></div>'
screen('TR-26e-custom-food','Create a food that isn’t in the list (name, amount, kcal)',f'''<div class="content" style="{W}">{nav("Create a food",left="Cancel",right='<span class="navbtn strong">Add</span>',sub="Evening snack")}
{field("Food name","Ragi dosa")}
<div class="row" style="gap:10px;margin-top:14px">{num("Amount","1","piece")}{num("Calories","120","kcal",focus=True)}</div>
<div class="t-label glabel" style="margin-top:18px">Macros · optional</div>
<div class="row" style="gap:8px">{num("Protein","3","g")}{num("Carbs","22","g")}{num("Fat","2","g",ph=True)}</div>
<div class="group" style="margin-top:16px;box-shadow:0 0 0 .5px var(--line2)"><div class="li" style="--inset:14px"><div class="f1"><div class="t-body">Save to my foods</div><div class="t-sub" style="font-size:13px">Find it in search next time</div></div>{toggle(True)}</div></div>
<div class="t-cap" style="margin:10px 2px 0">Rahul sees this as a food you added.</div></div>
<div class="stick" style="bottom:291px;background:var(--bg-plain)">{btn("Add to evening snack · 120 kcal")}</div>{kb_num(dec=True)}''','diet')
# ---- TR-26f saved confirmation on Diet
S=diet_summary(1272,1850,(66,110),(159,210),(33,55))
M4=meal("cookie","Evening snack","5:20 pm",'<span style="color:var(--warn);font-weight:600">Logged myself</span> · Roti × 2, ragi dosa',"320")
screen('TR-26f-manual-log-saved','Manual log saved: Diet shows the meal logged, with a confirmation',ad.day(S,ad.M1+ad.M2+ad.M3+M4+ad.M5,'4 of 5 logged')+toast("Evening snack saved · 320 kcal","View",96),'diet')
# ---- TR-07k Diet future day: view only
def fmeal(i,n,t,s,k): return meal(i,n,t,s,k,'up').replace(ELL,'')
FM=fmeal("sunrise","Early morning","6:30 am","Soaked almonds · 6 pcs",50)+fmeal("coffee","Breakfast","8:30 am","Besan chilla, mint chutney, chai",390)+fmeal("soup","Lunch","1:30 pm","2 roti, palak dal, salad",590)+fmeal("cookie","Evening snack","5:00 pm","Roasted chana 1 katori · masala chai",220)+fmeal("moon","Dinner","8:30 pm","Grilled fish, 1 roti, sautéed veg",600)
SF=diet_summary(0,1850,(0,110),(0,210),(0,55),muted=True)
screen('TR-07k-diet-future-day','Diet, future day: Rahul’s plan, view only',f'''<div class="content">{ad.H('Monday, 16 Nov · planned')}{week(sel=1,on=-1,days=FUT)}
<div style="margin-top:12px">{banner("Opens on Mon 16 Nov. You can see Rahul’s plan now and log it on the day.","neutral","calendar-days")}</div>{SF}
{sec("Meals",'<span class="t-sub tnum">1,850 kcal planned</span>',"margin:20px 2px 10px")}<div class="meals">{FM}</div></div>{fade()}{tabbar("Diet")}''','diet')
# ---- W-01e Workout future day: view only, no Start
top_f=f'''<div class="row sp"><span class="t-cap" style="font-weight:600">MON 16 NOV · 6:30 PM</span><span class="t-cap">about 45 min</span></div><div class="t-title" style="margin-top:4px">Upper body A</div>'''
EXF=[("Bench press","3 × 8 · 30 kg"),("Seated row","3 × 10 · 35 kg"),("Shoulder press","3 × 10 · 10 kg"),("Lat pulldown","3 × 12 · 30 kg"),("Plank","3 × 40 s")]
note=f'<div class="row" style="gap:8px;justify-content:center;color:var(--ink2)">{ic("calendar-days",16,2.2)}<span class="t-sub">Opens on Mon 16 Nov</span></div>'
screen('W-01e-workout-tab-future-day','Workout tab, future day: plan preview, no Start',f'''<div class="content">{lhdr("Workout","Week 3 of 12 · Rahul’s plan")}{week(sel=1,on=-1,days=FUT)}{aw.daycard(top_f,''.join(aw.prev(n,t) for n,t in EXF),note)}</div>{fade()}{tabbar("Workout")}''','workout')
# ---- TR-15d complete Live Activity on the lock screen (no clipping: 2 lines max per text, fixed 160 pt tile)
LA=f'''<div style="position:absolute;left:10px;right:10px;top:388px;height:160px;border-radius:22px;background:var(--lock-glass);backdrop-filter:blur(20px);padding:12px 14px;display:flex;flex-direction:column">
<div class="row" style="gap:8px"><div style="width:22px;height:22px;border-radius:6px;background:var(--icon-tile);color:var(--white);display:flex;align-items:center;justify-content:center">{ic("dumbbell",13,2.4)}</div><span class="t-cap" style="color:var(--ink2);font-weight:600">FitBud · Lower body B</span><span class="t-cap tnum" style="margin-left:auto;color:var(--ink2)">23:14</span></div>
<div class="row sp" style="margin-top:8px"><span class="t-bodym ell" style="font-size:16px">Romanian deadlift</span><span class="t-sub tnum" style="color:var(--ink)">Set 3 of 3</span></div>
<div class="row" style="gap:12px;margin-top:2px"><span class="t-sub tnum" style="color:var(--ink2);font-size:13.5px">Last 42.5 kg × 10</span><span class="t-sub tnum" style="color:var(--coach-ink);font-size:13.5px;font-weight:600">Target 40 kg × 10</span></div>
<div class="row" style="gap:8px;margin-top:auto"><div class="pill" style="flex:1;height:40px;justify-content:center;background:var(--fixed-navy);color:var(--white);border-radius:12px">{ic("check",16,2.8)}Log 40 kg × 10</div><div class="pill" style="height:40px;padding:0 16px;background:rgba(127,127,140,.18);color:var(--ink);border-radius:12px">Open</div></div>
<div style="position:absolute;left:14px;right:14px;bottom:5px;height:3px;border-radius:2px;background:rgba(127,127,140,.25)"><i style="display:block;height:100%;width:39%;border-radius:2px;background:var(--coral-strong)"></i></div></div>'''
PUSH=f'''<div style="position:absolute;left:10px;right:10px;top:558px;border-radius:22px;background:var(--lock-glass2);padding:12px 14px" class="row"><div style="width:38px;height:38px;border-radius:9px;background:var(--icon-tile);color:var(--white);display:flex;align-items:center;justify-content:center;flex:none">{ic("dumbbell",20,2.2)}</div>
<div class="f1" style="margin-left:10px"><div class="row sp"><span class="t-bodym" style="font-size:15px">Rahul nudged you</span><span class="t-cap" style="color:var(--ink2)">2h ago</span></div><div class="t-sub" style="font-size:14px;color:var(--ink)">Lower body B is waiting. Can you fit it in today?</div></div></div>'''
screen('TR-15d-lockscreen-live-activity','Lock screen: workout Live Activity, complete, with Log and Open',f'''<div style="position:absolute;inset:0;background:linear-gradient(170deg,#2a2160,#6b4fd6 55%,#c9b8ff)"></div>
<div style="position:absolute;top:70px;left:0;right:0;text-align:center;color:#fff"><div style="font-size:19px;font-weight:600">Saturday 14 November</div><div style="font-size:92px;line-height:100px;font-weight:700;letter-spacing:-3px" class="tnum">6:54</div></div>{LA}{PUSH}''','notifications',time='',dark=True)
save_reg()

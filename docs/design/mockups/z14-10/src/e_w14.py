"""W14 additions (24 Nov 2026, Z14-10): summary with RPE + read-only summary, time-zone list, assigned diet plan (v3),
meal card actions + photo choice, something-different loading / portion / ate-out as full screens, Android live workout.
Run after a_*.py and d_w12.py (imports their helpers)."""
from kit import *
import a_diet as ad
A_W,A_D,A_S,A_N='workout','diet','settings','notifications'
WP='background:var(--bg-plain);top:0;padding-top:54px;bottom:0'
BACK=lambda lbl='':f'<span class="navbtn" style="min-width:44px">{ic("chevron-left",24,2.2)}{lbl}</span>'
SAVE=lambda on=True:f'<span class="navbtn strong{"" if on else " dis"}" style="min-width:44px;justify-content:flex-end">Save</span>'
# ================= Workout summary =================
st=lambda l,v,u='':f'<div class="f1" style="background:var(--bg);border-radius:14px;padding:12px"><div class="t-cap">{l}</div><div class="n-lg" style="margin-top:2px">{v}<span class="unit" style="font-size:14px"> {u}</span></div></div>'
chg=lambda i,c,t,s,r:f'<div class="li" style="--inset:58px"><div class="lic" style="background:{c[0]};color:{c[1]}">{ic(i,16,2.2)}</div><div class="f1"><div class="t-body" style="font-size:15px">{t}</div><div class="t-sub" style="font-size:13px">{s}</div></div><span class="t-sub tnum">{r}</span></div>'
STATS=f'<div class="row" style="gap:8px;margin-top:14px">{st("Duration","52","min")}{st("Volume","4,120","kg")}{st("Sets","17","/ 18")}</div>'
PR=f'<div class="card row" style="gap:12px;margin-top:12px;padding:12px 14px;background:var(--pr-tint);box-shadow:none"><span style="color:var(--pr)">{ic("trophy",22,2.2)}</span><div class="f1"><div class="t-bodym" style="color:var(--pr-ink)">1 new record</div><div class="t-sub tnum" style="color:var(--pr-ink2)">Romanian deadlift · 42.5 kg × 10</div></div></div>'
CHG=f'<div class="t-label glabel">Changed from the plan · Rahul sees this</div><div class="group">{chg("plus",("var(--brand-tint)","var(--brand)"),"Goblet squat","1 set added by you","+1")}{chg("arrow-up-right",("var(--done-tint)","var(--done)"),"Romanian deadlift","Sets 2–3 heavier","40 → 42.5")}{chg("skip-forward",("var(--fill)","var(--ink2)"),"Calf raise","Set 3 skipped","−1")}</div>'
ANCH={1:'Very easy',5:'Hard',10:'Max effort'}
def rpe(sel=None,req=False,err=False):
    c=lambda i:f'<div class="tnum" style="height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:600;{"background:var(--brand);color:var(--on-brand)" if i==sel else "background:var(--fill);color:var(--ink2)"}">{i}</div>'
    g=f'<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px">{"".join(c(i) for i in range(1,11))}</div>'
    right=('<span class="t-cap" style="color:var(--coral-ink);font-weight:600">Rahul asks for this</span>' if req else '<span class="t-cap">Optional</span>')
    picked=f'<b style="color:var(--ink)">{sel}</b>{" · "+ANCH[sel] if sel in ANCH else " of 10"}' if sel else 'Tap a number'
    return (f'<div class="row sp glabel"><span class="t-label">How hard was it?</span>{right}</div>{g}'
            f'<div class="row sp t-cap" style="margin-top:6px"><span>1 Very easy · 5 Hard · 10 Max effort</span><span class="tnum">{picked}</span></div>')
NOTE=field("Note for Rahul","",ph="Anything he should know?")
HEAD=lambda eb='LOWER BODY B · TUE 24 NOV',t='Workout done':f'<div class="t-cap" style="color:var(--brand);font-weight:600;margin-top:14px">{eb}</div><div class="t-large">{t}</div>'
def summ(body,stick,top=''):
    return f'<div class="content" style="{WP}">{top}{body}<div style="height:120px"></div></div><div class="stick">{stick}</div>'
screen('W-17a2-summary-rpe','After finish: summary with How hard was it? (optional), Save and share',
  summ(HEAD()+STATS+PR+CHG+rpe(7)+NOTE,btn("Save and share with Rahul",icon="send"),'<div style="height:8px"></div>'),A_W)
screen('W-17a3-summary-rpe-required','After finish: Rahul’s plan asks for RPE, Save waits for a number',
  summ(HEAD()+STATS+PR+CHG+rpe(None,req=True)+NOTE,btn("Save and share with Rahul",icon="send",kind="dis")+'<div class="t-cap" style="text-align:center;margin-top:8px">Pick how hard it was to save.</div>','<div style="height:8px"></div>'),A_W)
screen('W-17a4-summary-offline','After finish, offline: neutral banner, saves on the phone',
  summ(f'<div style="margin-top:4px">{banner("You’re offline. Your workout is saved on your phone and sends to Rahul when you’re back.","neutral","wifi-off")}</div>'+HEAD()+STATS+PR+CHG+rpe(8)+NOTE,btn("Save and share with Rahul",icon="send"),'<div style="height:8px"></div>'),A_W)
# read-only
def RN(v,anch,note,change=True,until='You can change these until Thu 26 Nov, 7:10 pm'):
    ch='<span class="navbtn" style="height:44px;margin:-12px 0;font-size:15px;font-weight:600">Change</span>' if change else ''
    nr=(f'<div class="li" style="--inset:14px"><div class="f1"><div class="t-cap">Note for Rahul</div><div class="t-body" data-wrapok="1" style="margin-top:2px">{note}</div></div></div>' if note else
        f'<div class="li" style="--inset:14px"><div class="f1"><div class="t-cap">Note for Rahul</div><div class="t-body" style="margin-top:2px;color:var(--ink3)">No note</div></div></div>')
    return (f'<div class="row sp glabel" style="align-items:center"><span class="t-label">Your rating and note</span>{ch}</div><div class="group">'
            f'<div class="li" style="--inset:58px"><div class="lic" style="background:var(--brand-tint);color:var(--brand)"><span class="tnum" style="font-weight:700;font-size:15px">{v}</span></div><div class="f1"><div class="t-cap">How hard was it</div><div class="t-body" style="margin-top:2px">{anch}</div></div></div>{nr}</div>'
            f'<div class="t-cap" data-wrapok="1" style="margin:8px 4px 0">{until}</div>')
NOTE_TXT='Left knee felt tight on lunges, went lighter.'
SENT=f'<div class="row" style="gap:6px;margin-top:6px">{sync("sent")}<span class="t-cap">Shared Tue 24 Nov, 7:10 pm</span></div>'
screen('W-17c-summary-readonly','View summary on a finished workout: read-only, rating and note with one Change (48 h), single Done',
  summ(HEAD(t='Lower body B')+SENT+STATS+PR+CHG+RN(7,'7 of 10',NOTE_TXT),btn("Done"),nav("",left="back")),A_W)
SH=sheet(f'''<div class="t-title">Your rating and note</div><div class="t-sub" style="margin-top:2px">Lower body B · Tue 24 Nov · Rahul sees the change</div>
<div>{rpe(8).replace('glabel','" style="margin:14px 4px 8px')}</div>{field("Note for Rahul","Left knee felt tight on lunges.",focus=True)}<div class="col" style="gap:8px;margin-top:16px">{btn("Save")}{btn("Cancel","secondary")}</div>''')
screen('W-17c2-summary-edit-rating-note','Read-only summary: Change sheet edits the rating and the note (within 48 h)',
  summ(HEAD(t='Lower body B')+SENT+STATS+PR+CHG+RN(7,'7 of 10',NOTE_TXT),btn("Done"),nav("",left="back"))+SH,A_W)
OLD=f'<div class="row" style="gap:8px;margin-top:14px">{st("Duration","47","min")}{st("Volume","3,860","kg")}{st("Sets","18","/ 18")}</div>'
screen('W-17c3-summary-readonly-old','View summary after 48 h: rating and note read-only, no Change, single Done',
  summ(HEAD('UPPER BODY A · THU 19 NOV','Upper body A')+f'<div class="row" style="gap:6px;margin-top:6px">{sync("sent")}<span class="t-cap">Shared Thu 19 Nov, 7:42 am</span></div>'+OLD+
  f'<div class="t-label glabel">Done as planned</div><div class="group">{chg("check",("var(--done-tint)","var(--done)"),"All 6 exercises","No changes from Rahul’s plan","")}</div>'
  +RN('–','Not rated','',change=False,until='Ratings and notes can be changed for 48 hours after a workout.'),btn("Done"),nav("",left="back")),A_W)
# ================= Time zone =================
def zrow(city,name,off,on=False,sub=''):
    t=f'<span style="color:var(--brand)">{ic("check",20,2.6)}</span>' if on else ''
    return f'<div class="li" style="--inset:14px;min-height:56px"><div class="f1"><div class="t-body">{city}</div><div class="t-sub tnum" style="font-size:13.5px">{name} · {off}</div></div>{t}</div>'
def tzpage(q='',body='',kb=False):
    s=f'<div class="search" style="height:44px;color:{"var(--ink)" if q else "var(--ink3)"}">{ic("search",18,2,"var(--ink3)")}{q or "Search city or time zone"}{"<span class=caret style=display:inline-block;width:2px;height:20px;background:var(--brand)></span>" if kb else ""}{f"<span style=margin-left:auto;color:var(--ink4)>{ic(chr(120),16,2.4)}</span>" if q else ""}</div>'
    return f'<div class="content" style="{WP};background:var(--bg)">{nav("Time zone",left="back")}<div style="margin-top:4px">{s.replace(chr(34)+"search"+chr(34)+">",chr(34)+"search"+chr(34)+" style=height:44px>",1) if False else s}</div>{body}</div>'+(kb_alpha() if kb else '')
PHONE=f'<div class="group" style="margin-top:14px"><div class="li" style="--inset:14px;min-height:56px"><div class="lic" style="background:var(--brand-tint);color:var(--brand)">{ic("smartphone",18,2)}</div><div class="f1"><div class="t-body">Use phone’s time zone</div><div class="t-sub" style="font-size:13.5px">Kolkata · India Standard Time</div></div><span style="color:var(--brand)">{ic("check",20,2.6)}</span></div></div>'
ASIA=[('Kolkata','India Standard Time','UTC+5:30'),('Dubai','Gulf Standard Time','UTC+4:00'),('Dhaka','Bangladesh Time','UTC+6:00'),('Karachi','Pakistan Time','UTC+5:00'),('Kathmandu','Nepal Time','UTC+5:45'),('Singapore','Singapore Time','UTC+8:00')]
EUR=[('London','Greenwich Mean Time','UTC+0:00'),('Berlin','Central European Time','UTC+1:00')]
grp=lambda lab,zs:group([zrow(*z) for z in zs],lab)
screen('TR-20h-timezone-list','Time zone: searchable list, phone’s zone first, grouped by region, current ticked',
  tzpage(body=PHONE+'<div class="t-cap" style="margin:8px 4px 0">Reminders and your day use this time zone. Rahul sees it too.</div>'+grp("Asia",ASIA)+grp("Europe",EUR)),A_S)
screen('TR-20h2-timezone-search','Time zone: search active (“new”), keyboard up',
  tzpage('new',group([zrow('New York','Eastern Time','UTC−5:00'),zrow('New Delhi','India Standard Time · same as Kolkata','UTC+5:30'),zrow('Auckland','New Zealand Time','UTC+13:00')],'3 results'),kb=True),A_S)
screen('TR-20h3-timezone-no-match','Time zone: search with no match',
  tzpage('Lakeview',f'<div style="margin-top:70px">{empty("search","No time zone matches “Lakeview”","Try the nearest big city or the country, like “India” or “Dubai”.")}</div>'),A_S)
screen('TR-20h4-timezone-saved','Time zone changed: Dubai ticked, confirmation toast',
  tzpage(body=f'<div class="group" style="margin-top:14px"><div class="li" style="--inset:14px;min-height:56px"><div class="lic" style="background:var(--brand-tint);color:var(--brand)">{ic("smartphone",18,2)}</div><div class="f1"><div class="t-body">Use phone’s time zone</div><div class="t-sub" style="font-size:13.5px">Kolkata · India Standard Time</div></div></div></div>'
  +grp("Asia",[('Kolkata','India Standard Time','UTC+5:30'),('Dubai','Gulf Standard Time','UTC+4:00',True)]+ASIA[2:5]))+toast("Time zone set to Dubai · UTC+4:00","",40),A_S)
from a_rest import page
screen('TR-20c2-account-timezone','Account: Preferences with the Time zone row (opens TR-20h)',page(nav("Account"),f'''{group([li("Email","aarav@example.com"),li("Password","Change your password")],"Sign-in")}
{group([li("Time zone","",trail="India Standard Time"),li("Language","",trail="English")],"Preferences")}
{group([li("Privacy","What Rahul can see"),li("Past coaching","1 coach before Rahul")],"Your data")}
{group([f'<div class="li" style="--inset:14px"><div class="f1 t-body" style="color:var(--crit)">Delete account</div></div>'])}''',white=False),A_S)
# ================= Assigned diet plan =================
def fixhdr(title,sub,right=''):
    return (f'<div style="position:absolute;top:0;left:0;right:0;padding-top:54px;background:var(--glass);backdrop-filter:blur(16px);border-bottom:.5px solid var(--line);z-index:45">'
            f'<div class="nav" style="margin:0;padding:0 12px 0 8px">{BACK("Diet")}<div class="ttl" style="position:absolute;left:134px;right:134px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;text-align:center;pointer-events:none"><div class="t-head ell">{title}</div>{f"<div class=t-cap>{sub}</div>" if sub else ""}</div><div style="margin-left:auto">{right}</div></div></div>')
ASK=f'<span class="pill tint" style="height:36px;padding:0 12px;gap:6px">{ic("message-circle",16,2.2)}Ask Rahul</span>'
food=lambda n,q,k:f'<div class="row sp" style="padding:8px 0;border-top:.5px solid var(--line)"><div class="f1"><div class="t-body" style="font-size:15px">{n}</div><div class="t-sub" style="font-size:13px">{q}</div></div><span class="n-sm">{k}<span class="unit" style="font-size:12px"> kcal</span></span></div>'
def slot(icon,name,time,kcal,items,note='',mac=''):
    n=f'<div class="cue" style="margin-top:8px">{coach_av()}<div class="t-sub" data-wrapok="1" style="color:var(--ink);font-size:14px">{note}</div></div>' if note else ''
    return (f'<div class="card" style="padding:12px 14px;margin-top:10px"><div class="row" style="gap:10px;margin-bottom:6px"><div class="mt" style="background:var(--fill);color:var(--ink2);width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center">{ic(icon,18,2)}</div>'
            f'<div class="f1"><div class="t-bodym">{name}</div><div class="t-cap tnum">{time}{" · "+mac if mac else ""}</div></div><span class="n-md">{kcal}<span class="unit" style="font-size:12px"> kcal</span></span></div>{"".join(food(*i) for i in items)}{n}</div>')
SL=[slot("sunrise","Early morning","6:30 am",50,[("Soaked almonds","6 pieces",50)]),
    slot("coffee","Breakfast","8:30 am",412,[("Vegetable poha","1 katori",280),("Masala chai","1 cup, less sugar",62),("Banana","1 medium",70)],mac="P 9 · C 72 · F 10 g"),
    slot("soup","Lunch","1:30 pm",560,[("Chapati / roti","3 pieces",240),("Dal tadka","1 katori",210),("Cucumber salad","1 bowl",40),("Curd","½ katori",70)],"Have the dal even on busy days, it’s most of your lunch protein.","P 24 · C 78 · F 14 g"),
    slot("cookie","Evening snack","5:00 pm",220,[("Roasted chana","1 katori",160),("Masala chai","1 cup",60)],mac="P 11 · C 28 · F 5 g"),
    slot("moon","Dinner","8:30 pm",560,[("Paneer bhurji","1 katori (150 g)",310),("Chapati / roti","2 pieces",160),("Cucumber raita","1 katori",90)],mac="P 30 · C 44 · F 22 g")]
PLANTOP=(f'<div class="t-cap" style="color:var(--brand);font-weight:600;margin-top:14px">FROM RAHUL · WEEK 3 OF 12</div><div class="t-large">Fat loss · veg</div>'
         f'<div class="t-sub" style="margin-top:2px">Since Mon 16 Nov · no end date</div>'
         f'<div class="card row" style="gap:0;margin-top:14px;padding:12px 4px">'+''.join(f'<div class="f1" style="text-align:center;{"border-left:.5px solid var(--line)" if i else ""}"><div class="n-md">{v}</div><div class="t-cap">{l}</div></div>' for i,(v,l) in enumerate([("1,802","kcal a day"),("110 g","protein"),("5","meals")]))+'</div>'
         f'<div style="margin-top:10px">{banner("<b>What changed</b> · From Mon 23 Nov: dinner is paneer bhurji instead of rajma.","brand","sparkles")}</div>')
def planpage(body,scrolled=False,title='Meal plan',sub=''):
    return f'<div class="content" style="top:{"" if scrolled else ""}0;padding-top:{102 if not scrolled else 102}px;bottom:0">{body}<div style="height:40px"></div></div>{fixhdr(title,sub,ASK)}'
screen('TR-07l-assigned-plan','Assigned diet plan (v3): fixed header, back top left, compact Ask Rahul, meals by time',planpage(PLANTOP+''.join(SL[:3])),A_D)
screen('TR-07l2-assigned-plan-scrolled','Assigned diet plan scrolled: header stays, title moves into it',
  f'<div class="content" style="top:0;padding-top:102px;bottom:0"><div style="height:4px"></div>{"".join(SL[2:])}<div class="t-cap" style="text-align:center;margin:18px 0 30px">Day total 1,802 kcal · P 110 · C 238 · F 61 g</div></div>{fixhdr("Fat loss · veg","From Rahul",ASK)}',A_D)
SK=lambda:f'<div class="card" style="padding:14px;margin-top:10px">{skel("45%",14)}{skel("100%",12,6,"margin-top:14px")}{skel("85%",12,6,"margin-top:10px")}{skel("70%",12,6,"margin-top:10px")}</div>'
screen('TR-07l3-assigned-plan-loading','Assigned diet plan loading: skeleton under the real header',
  planpage(f'{skel("40%",12)}{skel("65%",28,8,"margin-top:8px")}{skel("50%",12,6,"margin-top:8px")}{skel("100%",64,16,"margin-top:14px")}'+SK()+SK()+SK()),A_D)
screen('TR-07l4-assigned-plan-error','Assigned diet plan couldn’t load: friendly copy, Try again, back still there',
  planpage(f'<div style="margin-top:90px">{empty("cloud-off","Couldn’t load your meal plan","Something went wrong on our side. Your Diet tab still works.",btn("Try again","tint",icon="refresh-cw"))}</div>'),A_D)
# ================= Meal card actions + photo =================
def due2(stacked=False,big=False):
    f=1.25 if big else 1
    b1=f'<div class="btn primary" style="height:{48 if big else 44}px;border-radius:12px;font-size:{15*f:.1f}px;{"" if stacked else "flex:1.15"}">{ic("check",18,2.6)}Eaten as planned</div>'
    b2=f'<div class="btn outline" style="height:{48 if big else 44}px;border-radius:12px;font-size:{15*f:.1f}px;{"" if stacked else "flex:1"}">Something different</div>'
    acts=f'<div class="{"col" if stacked else "row"}" style="gap:8px;margin-top:10px">{b1}{b2}</div>'
    return (f'<div class="card due"><div class="row" style="gap:12px"><div class="mt" style="background:var(--brand-tint);color:var(--brand)">{ic("cookie",20,2)}</div>'
            f'<div class="mx"><div class="row" style="gap:6px;align-items:baseline"><span class="t-bodym" style="font-size:{16*f:.0f}px">Evening snack</span><span class="t-cap" style="color:var(--coral-ink);font-weight:600;font-size:{12*f:.0f}px">Due now</span></div><div class="t-sub ell msub" style="font-size:{14*f:.0f}px">Roasted chana 1 katori · masala chai</div></div>'
            f'<div class="kc"><span class="n-md">220</span><span class="t-cap">kcal</span></div></div>{acts}</div>')
screen('TR-07a2-meal-card-actions','Due meal card: two full-width 44 pt buttons, stacked, full labels at any text size',ad.day(ad.S0,ad.M3+due2(True)+ad.M5),A_D)
screen('TR-07a3-meal-card-actions-large-text','Diet at large text (≈120%): buttons stay full width, labels never cut, meal text wraps',
  ad.day(ad.S0,ad.M3+due2(True).replace('t-sub ell msub','t-sub msub" data-wrapok="1')+ad.M5).replace('<div class="content">','<div class="content" style="zoom:1.2;top:45px">',1).replace(ad.S0,''),A_D)
S1=diet_summary(1292,1850,(69,110),(158,210),(36,55))
M4d=meal("cookie","Evening snack","5:00 pm","Roasted chana 1 katori · masala chai",220)
base1=ad.day(S1,ad.M1+ad.M2+ad.M3+M4d+ad.M5,'4 of 5 logged')
opt=lambda i,t,s='':f'<div class="li" style="--inset:58px;min-height:56px"><div class="lic" style="background:var(--brand-tint);color:var(--brand)">{ic(i,18,2)}</div><div class="f1"><div class="t-body">{t}</div>{f"<div class=t-sub style=font-size:13px>{s}</div>" if s else ""}</div></div>'
screen('TR-07m-photo-choice','After Eaten as planned, only when Rahul’s plan asks for a photo: Take photo / Choose from gallery / Not now',base1+sheet(f'''<div class="row" style="gap:10px"><span style="color:var(--done)">{ic("circle-check",22,2.2)}</span><div><div class="t-title">Evening snack logged</div><div class="t-sub">Rahul asks for a photo of this meal.</div></div></div>
<div class="group" style="margin-top:14px;box-shadow:0 0 0 .5px var(--line2)">{opt("camera","Take photo")}{opt("image","Choose from gallery")}</div>
<div style="margin-top:10px">{btn("Not now","secondary")}</div><div class="t-cap" style="text-align:center;margin-top:8px">You can add it from the meal for 24 hours.</div>'''),A_D)
thumb=lambda:f'<div style="width:44px;height:44px;border-radius:10px;flex:none;background:linear-gradient(150deg,#d9a55b,#8a5a2b);position:relative;overflow:hidden"><div style="position:absolute;left:8px;top:10px;width:28px;height:22px;border-radius:50%;background:rgba(255,240,210,.55)"></div></div>'
def pmeal(state):
    if state=='up': s=f'<div class="t-sub" style="font-size:13px">Uploading photo…</div><div class="track" style="height:4px;margin-top:6px"><i style="width:55%;background:var(--brand)"></i></div>'; tr=''
    else: s=f'<div class="t-sub" style="font-size:13px;color:var(--crit-ink)" data-wrapok="1">Photo didn’t upload. Your meal is still logged.</div>'; tr=''
    a='' if state=='up' else f'<div class="row" style="gap:8px;margin-top:10px">{btn("Try again","tint",icon="refresh-cw",style="flex:1;height:44px;border-radius:12px;font-size:15px")}{btn("Remove photo","secondary",style="flex:1;height:44px;border-radius:12px;font-size:15px")}</div>'
    return (f'<div class="card" style="padding:11px 14px 12px 12px"><div class="row" style="gap:12px"><div class="mt" style="background:var(--done-tint);color:var(--done)">{ic("cookie",20,2)}</div><div class="mx"><div class="row" style="gap:6px;align-items:baseline"><span class="t-bodym">Evening snack</span><span class="t-cap">5:00 pm</span></div><div class="t-sub ell msub">Eaten as planned</div></div>'
            f'<div class="kc"><span class="n-md">220</span><span class="t-cap">kcal</span></div><div class="okc">{ic("check",15,3)}</div></div>'
            f'<div class="row" style="gap:10px;margin-top:10px;padding:8px;border-radius:12px;background:var(--bg)">{thumb()}<div class="f1">{s}</div>{tr}</div>{a}</div>')
screen('TR-07m2-photo-uploading','Meal photo uploading on the logged card',ad.day(S1,ad.M3+pmeal('up')+ad.M5,'4 of 5 logged'),A_D)
screen('TR-07m3-photo-failed','Meal photo failed: says what went wrong, Try again or Remove, meal stays logged',ad.day(S1,ad.M3+pmeal('fail')+ad.M5,'4 of 5 logged'),A_D)
# ================= Something different =================
D0=ad.day(ad.S0,ad.M1+ad.M2+ad.M3+due2(True)+ad.M5)
oskel=lambda:f'<div class="card row" style="gap:12px;padding:14px;margin-top:8px;box-shadow:0 0 0 .5px var(--line2)">{skel("40px",40,12)}<div class="f1">{skel("55%",14)}{skel("80%",11,6,"margin-top:8px")}</div></div>'
screen('TR-08a2-something-different-loading','Something different loading: skeleton inside the sheet, title known at once (never “isn’t available”)',
  D0+sheet(f'<div class="t-title">What did you have instead?</div><div class="t-sub" style="margin-top:2px">Evening snack · plan 220 kcal</div>{oskel()}{oskel()}{oskel()}<div style="height:44px"></div>'),A_D)
prow=lambda n,unit,v,plan,k:f'''<div class="li" style="--inset:14px;min-height:64px"><div class="f1"><div class="t-body">{n}</div><div class="t-sub tnum" style="font-size:13px">Plan {plan} · <span class="b" style="font-weight:600">{k} kcal</span></div></div><div class="col" style="align-items:center;gap:3px">{stepper(v)}<span class="t-cap">{unit}</span></div></div>'''
def fnav(title,sub,save=True): return f'<div class="nav" style="margin:0 -16px;padding:0 16px 0 8px">{BACK()}<div class="ttl" style="position:absolute;left:64px;right:64px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;text-align:center;pointer-events:none"><div class="t-head">{title}</div><div class="t-cap">{sub}</div></div><div style="margin-left:auto">{SAVE(save)}</div></div>'
PORT=f'''<div class="t-sub" style="margin:8px 2px 4px">Change how much you had. Steps are ½.</div>
<div class="group" style="box-shadow:0 0 0 .5px var(--line2)">{prow("Roasted chana","katori","½","1 katori",80)}{prow("Masala chai","cup","2","1 cup",120)}</div>
<div class="row sp" style="margin-top:16px"><span class="link row" style="gap:5px;min-height:44px">{ic("rotate-ccw",15,2.2)}Reset to plan</span><span class="t-sub">Rahul sees the difference</span></div>'''
TOT=f'<div class="row sp" style="margin-bottom:10px"><span class="t-sub">Total</span><span><span class="n-md">200 kcal</span> <span class="tag" style="background:var(--done-tint);color:var(--done)">−20 vs plan</span></span></div>'
screen('TR-08b2-changed-portion-screen','Changed the portion as a full screen: back top left, Save top right',
  f'<div class="content" style="{WP}">{fnav("Changed the portion","Evening snack · 5:00 pm")}{PORT}</div><div class="stick">{TOT}{btn("Save portion")}</div>',A_D)
screen('TR-08b3-changed-portion-offline','Changed the portion, offline: neutral note, saves on the phone',
  f'<div class="content" style="{WP}">{fnav("Changed the portion","Evening snack · 5:00 pm")}<div style="margin-top:6px">{banner("You’re offline. Your change saves on your phone and sends when you’re back.","neutral","wifi-off")}</div>{PORT}</div><div class="stick">{TOT}{btn("Save portion")}</div>',A_D)
kcal=lambda v,focus:f'<div class="row" style="justify-content:center;align-items:baseline;gap:8px;margin-top:22px"><span class="tnum" style="font-size:52px;line-height:60px;font-weight:700;letter-spacing:-2px;{"" if v else "color:var(--ink4)"}">{v or "0"}</span>{"<span class=caret style=display:inline-block;width:3px;height:48px;background:var(--brand);align-self:center></span>" if focus else ""}<span style="font-size:20px;font-weight:600;color:var(--ink3)">kcal</span></div>'
AO=lambda v,focus,note: (f'{fnav("Ate out","Evening snack · 5:00 pm",bool(v))}<div class="t-sub" style="margin:10px 2px 0">How many kcal? Check the menu, the bill or the label.</div>{kcal(v,focus)}'
   f'<div class="t-cap" style="text-align:center;margin-top:4px">Rahul’s plan for this meal: 220 kcal</div>{field("What did you have? (optional)",note,ph="e.g. Vada pav and cutting chai",focus=not focus and bool(note))}')
screen('TR-08c2-ate-out-screen','Ate out as a full screen: back top left, Save top right, note visible',
  f'<div class="content" style="{WP}">{AO("380",False,"Vada pav and cutting chai")}<div class="row" style="gap:10px;margin-top:16px">{photo_add()}</div></div><div class="stick">{btn("Save · 380 kcal")}</div>' if False else
  f'<div class="content" style="{WP}">{AO("380",False,"Vada pav and cutting chai")}<div class="group" style="margin-top:16px;box-shadow:0 0 0 .5px var(--line2)">{opt("camera","Add a photo","Optional · the menu or your plate")}</div></div><div class="stick">{btn("Save · 380 kcal")}</div>',A_D)
screen('TR-08c3-ate-out-keyboard','Ate out with the number keyboard up: Save stays reachable top right and above the keys',
  f'<div class="content" style="{WP}">{AO("38",True,"")}</div><div class="stick" style="bottom:244px;padding-bottom:12px;background:var(--bg-plain);border:0">{btn("Save · 38 kcal")}</div>{kb_num()}',A_D)
# ================= Diet: edit a logged entry for 24 h (Firoz, 24 Nov 2026) =================
HINT=lambda t:f'<span class="row t-cap" style="gap:5px">{ic("clock",13,2.2)}{t}</span>'
def jl_card(photo=True):
    a=(f'<div class="row" style="gap:8px;margin-top:10px">'
       +(btn("Add photo","secondary",icon="camera",style="flex:1;height:44px;border-radius:12px;font-size:15px") if photo else '')
       +btn("Edit","secondary",icon="pencil",style="flex:1;height:44px;border-radius:12px;font-size:15px")+'</div>')
    return (f'<div class="card" style="padding:11px 14px 12px 12px"><div class="row" style="gap:12px"><div class="mt" style="background:var(--done-tint);color:var(--done)">{ic("cookie",20,2)}</div><div class="mx"><div class="row" style="gap:6px;align-items:baseline"><span class="t-bodym">Evening snack</span><span class="t-cap">5:20 pm</span></div><div class="t-sub ell msub">Eaten as planned</div></div>'
            f'<div class="kc"><span class="n-md">220</span><span class="t-cap">kcal</span></div><div class="okc">{ic("check",15,3)}</div></div>{a}<div style="margin-top:8px">{HINT("Editable until tomorrow, 5:20 pm")}</div></div>')
screen('TR-07m4-logged-add-photo','Just-logged meal (plan doesn’t ask for a photo): small Add photo and Edit, with the 24 h hint',ad.day(S1,ad.M3+jl_card()+ad.M5,'4 of 5 logged'),A_D)
# logged meal sheet (changed portion) with Edit
LUNCH_ITEMS=f'''<div class="group" style="margin-top:14px;box-shadow:none;background:var(--bg)">{ad.item("Chapati / roti","2 pieces · plan 3",160,tag("−1","warn"))}{ad.item("Dal tadka","1 katori (150 g)",210)}{ad.item("Jeera rice","½ katori · not in plan",120,tag("Added","brand"))}{ad.item("Cucumber salad","1 bowl",40)}</div>'''
def lsheet(title,sub,kc,body,actions,hint):
    return sheet(f'''<div class="row sp"><div><div class="t-title">{title}</div><div class="t-sub">{sub}</div></div><div class="kc"><span class="n-lg">{kc}</span><span class="t-cap">kcal</span></div></div>{body}
<div style="margin-top:12px">{hint}</div><div class="col" style="gap:8px;margin-top:14px">{actions}</div>''')
screen('TR-07n-logged-meal-edit','Logged meal sheet within 24 h: Edit, Add photo, Remove this log, “Editable until” hint',
  ad.day(ad.S0,ad.M1+ad.M2+ad.M3+due2(True)+ad.M5)+lsheet("Lunch","Changed from the plan · logged 1:42 pm","610",LUNCH_ITEMS,
  btn("Edit","tint",icon="pencil")+'<div class="row" style="gap:8px">'+btn("Add photo","secondary",icon="camera",style="flex:1")+btn("Remove this log","dangerq",style="flex:1")+'</div>',
  HINT("Editable until tomorrow, 1:42 pm · Rahul sees any change")),A_D)
# edit an eaten-as-planned meal
screen('TR-07n2-edit-eaten-as-planned','Edit an “Eaten as planned” log: change to portion, log it myself or ate out, or remove it (back to not logged)',
  ad.day(S1,ad.M1+ad.M2+ad.M3+M4d+ad.M5,'4 of 5 logged')+sheet(f'''<div class="t-title">Change this log</div><div class="t-sub" style="margin-top:2px">Evening snack · eaten as planned · 220 kcal</div>
<div class="group" style="margin-top:14px;box-shadow:0 0 0 .5px var(--line2)">{opt("scale","Changed the portion","Same foods, more or less of each")}{opt("search","Log it myself","Search foods and set amounts")}{opt("store","Ate out","Enter the kcal from the menu or label")}</div>
<div style="margin-top:10px">{btn("Remove this log","dangerq")}</div><div style="margin-top:10px;text-align:center">{HINT("Editable until tomorrow, 5:20 pm")}</div>'''),A_D)
screen('TR-07n3-remove-log-confirm','Remove a log: confirm, goes back to not logged, Rahul is told',
  ad.day(S1,ad.M1+ad.M2+ad.M3+M4d+ad.M5,'4 of 5 logged')+dialog("Remove the evening snack log?","It goes back to not logged, so you can log it again. Rahul sees that you removed it.",[btn("Remove log","danger"),btn("Cancel","secondary")],"trash-2"),A_D)
# edit a changed portion
EPORT=lambda offline=False:(f'<div class="content" style="{WP}">{fnav("Edit portion","Lunch · logged 1:42 pm")}'
  +(f'<div style="margin-top:6px">{banner("You’re offline. Your change saves on your phone and sends when you’re back.","neutral","wifi-off")}</div>' if offline else '')
  +f'''<div style="margin:8px 2px 4px">{HINT("Editable until tomorrow, 1:42 pm · Rahul sees changes")}</div>
<div class="group" style="box-shadow:0 0 0 .5px var(--line2)">{prow("Chapati / roti","pieces","2","3 pieces",160)}{prow("Dal tadka","katori","1","1 katori",210)}{prow("Jeera rice","katori","½","1 katori",120).replace("Plan 1 katori","Added by you")}{prow("Cucumber salad","bowl","1","1 bowl",40)}</div>
<div class="row sp" style="margin-top:12px"><span class="link row" style="gap:5px;min-height:44px">{ic("rotate-ccw",15,2.2)}Reset to plan</span><span class="link" style="color:var(--crit);min-height:44px;display:flex;align-items:center">Remove this log</span></div></div>
<div class="stick"><div class="row sp" style="margin-bottom:10px"><span class="t-sub">Total</span><span><span class="n-md">530 kcal</span> <span class="tag" style="background:var(--warn-tint);color:var(--warn)">+30 vs plan</span></span></div>{btn("Save changes")}</div>''')
screen('TR-07n4-edit-portion','Edit a changed-portion log: values filled in, hint, Reset, Remove, Save changes',EPORT(),A_D)
screen('TR-07n5-edit-ate-out','Edit an ate-out log from yesterday: kcal and note filled in, Save changes, Remove',
  f'''<div class="content" style="{WP}">{fnav("Edit ate out","Dinner · yesterday 8:30 pm")}<div style="margin:8px 2px 0">{HINT("Editable until today, 8:52 pm")}</div>{kcal("950",False)}
<div class="t-cap" style="text-align:center;margin-top:4px">Was 1,120 kcal · Rahul’s plan for dinner: 560 kcal</div>{field("What did you have? (optional)","Office party · biryani, half the gulab jamun")}
<div style="margin-top:14px;text-align:center"><span class="link" style="color:var(--crit);min-height:44px;display:inline-flex;align-items:center">Remove this log</span></div></div><div class="stick">{btn("Save changes · 950 kcal")}</div>''',A_D)
M3e=meal("soup","Lunch","1:30 pm",'<span class="tag" style="background:var(--fill);color:var(--ink2);height:18px;margin-right:4px">Edited</span><span style="color:var(--warn);font-weight:600">Changed</span> · 2 roti, dal, rice',"530")
screen('TR-07n6-edit-saved','Edit saved: toast, the meal shows a subtle Edited tag, totals updated',
  ad.day(diet_summary(992,1850,(54,110),(124,210),(29,55)),ad.M1+ad.M2+M3e+due2(True)+ad.M5)+toast("Lunch updated · Rahul sees the change","",96),A_D)
THU=[('S','8','none'),('M','9','ok'),('T','10','rest'),('W','11','ok'),('T','12','ok'),('F','13','rest'),('S','14','today')]
M_thu=meal("coffee","Breakfast","8:30 am","Besan chilla, mint chutney, chai",390)+meal("soup","Lunch","1:30 pm",'<span style="color:var(--warn);font-weight:600">Changed</span> · 3 roti, dal, salad',"640")+meal("moon","Dinner","8:30 pm","Grilled fish, 1 roti, sautéed veg",600)
thu_day=f'''<div class="content">{ad.H('Thursday, 12 Nov · Rahul’s plan')}{week(sel=4,on=6,days=THU)}{diet_summary(1630,1850,(98,110),(180,210),(50,55))}{sec("Meals",'<span class="t-sub tnum">5 of 5 logged</span>',"margin:20px 2px 10px")}<div class="meals">{M_thu}</div></div>{fade()}{tabbar("Diet")}'''
LOCK=f'''<div class="banner neutral" style="margin-top:0">{ic("lock",18,2.2)}<span class="f1">Logged entries can be changed for 24 hours.</span></div>'''
screen('TR-07n7-locked-after-24h','After 24 h: logged meal is read-only, no Edit, short note, Ask Rahul if it’s wrong',
  thu_day+lsheet("Lunch","Thu 12 Nov · logged 1:51 pm","640",
  f'''<div class="group" style="margin-top:14px;box-shadow:none;background:var(--bg)">{ad.item("Chapati / roti","3 pieces",240)}{ad.item("Dal tadka","1 katori (150 g)",210)}{ad.item("Cucumber salad","1 bowl",40)}{ad.item("Curd","1 katori",150,tag("+½","warn"))}</div>''',
  btn("Ask Rahul to fix it","textb",icon="message-circle",style="height:44px"),LOCK),A_D)
screen('TR-07n8-edit-offline','Edit offline: neutral banner, Save changes queues on the phone',EPORT(True),A_D)
# ================= Android live workout (D-W14-12) — Android frame only =================
NT=f'''<div style="position:absolute;inset:0;background:linear-gradient(170deg,#2a2160,#6b4fd6 55%,#c9b8ff)"></div>
<div style="position:absolute;top:86px;left:0;right:0;text-align:center;color:#fff"><div style="font-size:88px;line-height:94px;font-weight:500;letter-spacing:-2px" class="tnum">6:54</div><div style="font-size:16px;font-weight:500;margin-top:2px">Tue, 24 Nov</div></div>
<div style="position:absolute;left:12px;right:12px;top:330px;border-radius:24px;background:var(--lock-glass);padding:14px 16px 16px">
<div class="row" style="gap:8px"><div style="width:20px;height:20px;border-radius:10px;background:var(--icon-tile);color:var(--white);display:flex;align-items:center;justify-content:center">{ic("dumbbell",11,2.4)}</div><span class="t-cap" style="color:var(--ink2);font-weight:600">FitBud · Live workout · 23:14</span><span style="margin-left:auto;color:var(--ink3)">{ic("chevron-up",16,2.2)}</span></div>
<div class="row sp" style="margin-top:10px"><span class="t-bodym ell" style="font-size:16px">Romanian deadlift</span><span class="t-sub tnum" style="color:var(--ink)">Set 3 of 3</span></div>
<div class="row" style="gap:12px;margin-top:2px"><span class="t-sub tnum" style="color:var(--ink2);font-size:13.5px">Last 42.5 kg × 10</span><span class="t-sub tnum" style="color:var(--coach-ink);font-size:13.5px;font-weight:600">Target 40 kg × 10</span></div>
<div style="margin-top:10px;height:4px;border-radius:2px;background:rgba(127,127,140,.25)"><i style="display:block;height:100%;width:39%;border-radius:2px;background:var(--coral-strong)"></i></div>
<div class="row" style="gap:8px;margin-top:12px"><div class="pill" style="flex:1;height:44px;justify-content:center;background:var(--fixed-navy);color:var(--white);border-radius:22px">{ic("check",16,2.8)}Log 40 kg × 10</div><div class="pill" style="height:44px;padding:0 20px;background:rgba(127,127,140,.18);color:var(--ink);border-radius:22px">Open</div></div></div>
<div style="position:absolute;left:12px;right:12px;top:556px;border-radius:24px;background:var(--lock-glass2);padding:14px 16px" class="row"><div style="width:20px;height:20px;border-radius:10px;background:var(--icon-tile);color:var(--white);display:flex;align-items:center;justify-content:center;flex:none;align-self:flex-start;margin-top:2px">{ic("bell",11,2.4)}</div>
<div class="f1" style="margin-left:10px"><div class="row sp"><span class="t-bodym" style="font-size:15px">Rahul sent you a reminder</span><span class="t-cap" style="color:var(--ink2)">2h</span></div><div class="t-sub" style="font-size:14px;color:var(--ink)">Lower body B is waiting. Can you fit it in today?</div></div></div>'''
screen('TR-15e-android-live-workout','Android lock screen: Live workout notification in the TR-15d layout (Log and Open, no steppers)',NT,A_N,time='',dark=True)
save_reg()

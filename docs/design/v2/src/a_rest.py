from kit import *
W='background:#fff;top:0;padding-top:54px;bottom:0'
def page(navh,inner,stick='',white=True,extra=''):
    return f'<div class="content" style="{W if white else "top:0;padding-top:54px"}">{navh}{inner}</div>{extra}'+(f'<div class="stick">{stick}</div>' if stick else '')
def steps(n,of=3):
    return '<div class="row" style="gap:6px;margin:6px 0 4px">'+''.join(f'<div class="f1" style="height:4px;border-radius:2px;background:{"var(--brand)" if i<n else "var(--line2)"}"></div>' for i in range(of))+'</div>'
def scale(sel,lo,hi):
    return '<div class="row" style="gap:6px;margin-top:8px">'+''.join(f'<div class="f1" style="height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:600;{"background:var(--brand);color:#fff" if i==sel else "background:var(--fill);color:var(--ink2)"}" class="tnum">{i}</div>' for i in range(1,6))+f'</div><div class="row sp t-cap" style="margin-top:4px"><span>{lo}</span><span>{hi}</span></div>'
def q(t,body): return f'<div style="margin-top:20px"><div class="t-bodym">{t}</div>{body}</div>'
def photo(lbl,filled=True,h=150):
    inner=(f'<div style="position:absolute;inset:0;background:linear-gradient(160deg,#cfc8e8,#9d93c4)"></div><svg viewBox="0 0 60 100" style="position:absolute;left:50%;top:14px;width:58px;transform:translateX(-50%)" fill="#ffffff66"><circle cx="30" cy="16" r="11"/><path d="M12 36q18-10 36 0l4 64H8z"/></svg>' if filled else f'<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;color:var(--brand)">{ic("camera",24,2)}<span class="t-cap" style="color:var(--brand)">Add</span></div>')
    return f'<div class="f1"><div style="position:relative;height:{h}px;border-radius:14px;overflow:hidden;{"" if filled else "border:1.5px dashed var(--ink4);background:var(--brand-tint)"}">{inner}</div><div class="t-cap" style="text-align:center;margin-top:6px">{lbl}</div></div>'
CH='TR-14'
A='checkin'
hdr=lambda s,right='':nav("Weekly check-in",left="close",sub=f"For Rahul · step {s} of 3",right=right)
screen('TR-14a-checkin-questions','Check-in step 1: questions',page(hdr(1),steps(1)+f'''<div class="t-sub" style="margin-top:8px">Week 3 · due Sun 15 Nov. Takes about 2 minutes.</div>
{q("How was your energy this week?",scale(4,"Very low","Great"))}{q("How well did you sleep?",scale(3,"Badly","Very well"))}{q("How closely did you follow the diet?",scale(4,"Not at all","Fully"))}
{field("Anything Rahul should know?","Knee felt a little sore after lunges on Wed.")}''',btn("Next: photos")),A)
screen('TR-14b-checkin-photos','Check-in step 2: photos (optional)',page(hdr(2),steps(2)+f'''<div class="t-sub" style="margin-top:8px">Same spot and light each week. Only Rahul can see these.</div>
<div class="row" style="gap:10px;margin-top:18px">{photo("Front")}{photo("Side")}{photo("Back",False)}</div>
<div class="card row" style="gap:10px;margin-top:18px;padding:12px 14px;box-shadow:0 0 0 .5px var(--line2)">{ic("lock",18,2,"var(--ink3)")}<span class="t-sub">Photos are stored privately and are never shared outside your coaching.</span></div>''',btn("Next: review")+'<div style="margin-top:8px">'+btn("Skip photos this week","textb")+'</div>'),A)
rv=lambda k,v:f'<div class="li" style="--inset:14px"><div class="f1 t-sub">{k}</div><div class="t-bodym tnum">{v}</div></div>'
screen('TR-14c-checkin-review','Check-in step 3: review and send',page(hdr(3),steps(3)+f'''{group([rv("Energy","4 of 5"),rv("Sleep","3 of 5"),rv("Diet followed","4 of 5"),rv("Photos","2 added")],"Your answers")}
<div class="group" style="padding:12px 14px"><div class="t-cap">Note</div><div class="t-body" style="margin-top:2px">Knee felt a little sore after lunges on Wed.</div></div>
{group([rv("Average weight","78.4 kg · −0.6"),rv("Workouts","4 of 4 done"),rv("Meals logged","31 of 35")],"Added automatically")}
<div class="t-cap" data-wrapok="1" style="margin:8px 2px">Weight comes from Progress. You can change answers until Rahul opens it.</div>''',btn("Send to Rahul",icon="send")),A)
done=lambda t,s,i='check',c='var(--done)',bg='var(--done-tint)',extra='':f'''<div class="content" style="{W}"><div style="margin-top:120px;text-align:center"><div style="width:72px;height:72px;border-radius:36px;background:{bg};color:{c};display:flex;align-items:center;justify-content:center;margin:0 auto">{ic(i,34,2.4)}</div>
<div class="t-large" style="margin-top:20px;font-size:26px">{t}</div><div class="t-sub" style="margin:8px 24px 0">{s}</div>{extra}</div></div>'''
screen('TR-14d-checkin-sent','Check-in sent',done("Sent to Rahul","He usually replies within a day. We’ll let you know.")+f'<div class="stick">{btn("Done")}</div>',A)
screen('TR-14e-checkin-offline-queued','Check-in saved offline, sends later',done("Saved on your phone","You’re offline. It will send to Rahul as soon as you’re back.","cloud-off","var(--warn)","var(--warn-tint)",f'<div style="margin-top:18px;display:inline-block">{sync("saved")}</div>')+f'<div class="stick">{btn("Done")}</div>',A)
screen('TR-14f-checkin-overdue','Check-in overdue on Today',f'''<div class="content">{lhdr("Today","Monday, 16 Nov",circ("bell",True))}{week(sel=1,on=1,days=[("S","15","ok"),("M","16","today"),("T","17","plan"),("W","18","plan"),("T","19","plan"),("F","20","rest"),("S","21","plan")])}
<div class="card" style="margin-top:12px;padding:16px"><div class="row sp"><div><div class="t-head">Weekly check-in</div><div class="t-sub">Week 3 · was due yesterday</div></div>{tag("Overdue","warn")}</div><div style="margin-top:12px">{btn("Start check-in","primary",icon="clipboard-check")}</div></div>
{today_summary()}</div>{fade()}{tabbar("Today")}''',A)
screen('TR-14g-checkin-reviewed','Past check-in, reviewed by Rahul (read only)',page(nav("Check-in · week 2",sub="Sent Sun 8 Nov"),f'''<div class="card" style="padding:14px;margin-top:6px;background:var(--brand-tint);box-shadow:none"><div class="row" style="gap:10px">{coach_av()}<div><div class="t-bodym">Rahul replied</div><div class="t-cap">Mon 9 Nov · 9:12 am</div></div></div><div class="t-body" style="margin-top:8px">Great week. Keep protein near 110 g. I’ve swapped lunges for split squats until the knee settles.</div></div>
{group([rv("Energy","4 of 5"),rv("Sleep","3 of 5"),rv("Diet followed","4 of 5"),rv("Average weight","79.0 kg")],"Your answers")}
<div class="t-label glabel">Photos</div><div class="row" style="gap:10px">{photo("Front",h=120)}{photo("Side",h=120)}{photo("Back",h=120)}</div>''',white=False),A)
# ---------- progress
A='progress'
def chart():
    pts=[79.6,79.4,79.5,79.1,79.0,78.9,78.6,78.7,78.4,78.3]
    xs=[12+i*35 for i in range(len(pts))];ys=[16+(79.8-p)/1.6*100 for p in pts]
    path='M'+' L'.join(f'{x:.0f},{y:.0f}' for x,y in zip(xs,ys))
    dots=''.join(f'<circle cx="{x}" cy="{y:.0f}" r="3.5" fill="#fff" stroke="var(--brand)" stroke-width="2"/>' for x,y in zip(xs,ys))
    return f'''<svg viewBox="0 0 340 140" width="100%" height="140"><g stroke="var(--line)" stroke-width="1">{''.join(f'<line x1="0" x2="340" y1="{y}" y2="{y}"/>' for y in (16,66,116))}</g><path d="{path} L327,130 L12,130Z" fill="var(--brand-tint)" opacity=".7"/><path d="{path}" fill="none" stroke="var(--brand)" stroke-width="2.4" stroke-linejoin="round"/>{dots}</svg>
<div class="row sp t-cap tnum"><span>19 Oct</span><span>26 Oct</span><span>2 Nov</span><span>9 Nov</span><span>14 Nov</span></div>'''
def prog(extra=''):
    return f'''<div class="content">{lhdr("Progress","Since 19 Oct · week 3 of 12")}
<div class="card" style="padding:16px;margin-top:14px"><div class="row sp"><div><div class="t-cap">Weight · last 4 weeks</div><div class="row" style="align-items:baseline;gap:6px;margin-top:2px"><span class="n-hero">78.3</span><span class="t-sub">kg</span>{tag("−1.3 kg","ok")}</div></div>{btn("Log weight","tint",icon="plus",cls="sm")}</div>
<div style="margin:12px 0 4px">{seg(["4 weeks","12 weeks","All"],0)}</div>{chart()}<div class="t-cap" style="margin-top:6px">Last logged today, 7:05 am · Goal 74 kg</div></div>
<div class="row" style="gap:10px;margin-top:12px"><div class="card f1" style="padding:14px"><div class="t-cap">Workouts</div><div class="n-lg" style="margin-top:4px">11 <span class="t-sub">of 12</span></div><div class="t-cap">this plan so far</div></div><div class="card f1" style="padding:14px"><div class="t-cap">Meals logged</div><div class="n-lg" style="margin-top:4px">89%</div><div class="t-cap">last 7 days</div></div></div>
{group([li("Check-ins","Week 2 reviewed by Rahul","clipboard-check",trail='<span class="t-cap">3</span>'),li("Progress photos","6 photos from check-ins","image")],"History")}</div>{fade()}{tabbar("Progress")}{extra}'''
screen('TR-13a-progress-default','Progress: weight trend, totals, history',prog(),A)
screen('TR-13b-progress-empty','Progress before any data',f'''<div class="content">{lhdr("Progress","Starts with your first weigh-in")}
<div class="card" style="padding:26px 18px;margin-top:14px">{empty("scale","Log your first weight","Weigh in the morning, before breakfast. Rahul uses the weekly average, not one day.",btn("Log weight","tint",icon="plus"))}</div>
{group([li("Check-ins","Your first is due Sun 25 Oct","clipboard-check",chev=False),li("Progress photos","Added with check-ins","image",chev=False)],"History")}</div>{fade()}{tabbar("Progress")}''',A)
screen('TR-13c-log-weight-sheet','Log weight sheet (Progress only)',prog(sheet(f'''<div class="row" style="justify-content:center;align-items:baseline;gap:8px;margin-top:6px"><span class="tnum" style="font-size:48px;line-height:56px;font-weight:700;letter-spacing:-1.6px">78.3</span><span class="caret" style="display:inline-block;width:3px;height:42px;background:var(--brand);align-self:center"></span><span style="font-size:20px;font-weight:600;color:var(--ink3)">kg</span></div>
<div class="t-cap" style="text-align:center">Last: 78.4 kg on Thu 12 Nov</div><div class="group" style="margin-top:14px;background:var(--bg);box-shadow:none">{li("Date","",trail="Today, 7:05 am")}</div>
<div style="margin-top:12px">{btn("Save weight")}</div>''',"Log weight","Cancel","",style="bottom:291px;border-radius:14px 14px 0 0;padding-bottom:14px"))+kb_num(dec=True),A)
# ---------- notifications
A='notifications'
def nrow(i,t,s,when,unread=False,c='var(--brand)',bg='var(--brand-tint)'):
    return f'<div class="li" style="align-items:flex-start;padding-top:12px;padding-bottom:12px"><div class="lic" style="background:{bg};color:{c}">{ic(i,18,2)}</div><div class="f1"><div class="row sp" style="align-items:flex-start;gap:8px"><span class="t-bodym f1" data-wrapok="1">{t}</span><span class="t-cap" style="white-space:nowrap" data-wrapok="1">{when}</span></div><div class="t-sub" style="font-size:13.5px;line-height:18px">{s}</div></div>{"<span style=\'width:8px;height:8px;border-radius:4px;background:var(--brand);margin-top:6px;flex:none\'></span>" if unread else ""}</div>'
screen('TR-15a-notifications-inbox','Notifications inbox',page(nav("Notifications",right='<span class="navbtn">Read all</span>'),f'''
{group([nrow("bell-ring","Rahul nudged you","Evening snack is waiting. Log it when you can.","10:12 am",True),nrow("message-circle","Rahul replied to your check-in","Great week. Keep protein near 110 g…","9:12 am",True),nrow("dumbbell","Workout today: Lower body B","6 exercises · about 50 min at 6:30 pm","7:00 am",True),nrow("cookie","Evening snack is due","Roasted chana and masala chai","Yesterday",False,"var(--warn)","var(--warn-tint)")],"Today")}
{group([nrow("pencil","Rahul changed your plan","Split squats replace walking lunges this week","Mon",False),nrow("clipboard-check","Check-in reviewed","Week 2 · read Rahul’s note","Mon"),nrow("trophy","New personal record","Romanian deadlift · 42.5 kg × 10","Sat 7 Nov",False,"var(--pr)","var(--pr-tint)")],"Earlier")}
<div class="t-cap" style="margin:10px 2px">Notifications are kept for 30 days.</div>''',white=False),A)
screen('TR-15b-notifications-empty','Notifications empty',page(nav("Notifications"),f'<div style="margin-top:140px">{empty("bell","You’re all caught up","Messages from Rahul, plan changes and reminders show up here.")}</div>',white=False),A)
screen('TR-15c-lockscreen-push','Lock-screen push',f'''<div style="position:absolute;inset:0;background:linear-gradient(170deg,#2a2160,#6b4fd6 55%,#c9b8ff)"></div>
<div style="position:absolute;top:70px;left:0;right:0;text-align:center;color:#fff"><div style="font-size:19px;font-weight:600">Saturday 14 November</div><div style="font-size:92px;line-height:100px;font-weight:700;letter-spacing:-3px" class="tnum">5:02</div></div>
<div style="position:absolute;left:10px;right:10px;top:420px;border-radius:22px;background:rgba(255,255,255,.72);backdrop-filter:blur(20px);padding:12px 14px" class="row"><div style="width:38px;height:38px;border-radius:9px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;flex:none">{ic("dumbbell",20,2.2)}</div>
<div class="f1" style="margin-left:10px"><div class="row sp"><span class="t-bodym" style="font-size:15px">Evening snack is due</span><span class="t-cap" style="color:var(--ink2)">now</span></div><div class="t-sub" style="font-size:14px;color:var(--ink)">Roasted chana and masala chai · 220 kcal. Tap to log.</div></div></div>
<div style="position:absolute;left:10px;right:10px;top:504px;border-radius:22px;background:rgba(255,255,255,.55);padding:12px 14px" class="row"><div style="width:38px;height:38px;border-radius:9px;background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;flex:none">{ic("dumbbell",20,2.2)}</div>
<div class="f1" style="margin-left:10px"><div class="row sp"><span class="t-bodym" style="font-size:15px">Rahul nudged you</span><span class="t-cap" style="color:var(--ink2)">2h ago</span></div><div class="t-sub" style="font-size:14px;color:var(--ink)">Lower body B is waiting. Can you fit it in today?</div></div></div>''','notifications',time='',dark=True)
# ---------- more
A='more'
def more(extra=''):
    return f'''<div class="content">{lhdr("More")}
<div class="card row" style="gap:14px;padding:16px;margin-top:14px">{av("AS","#EEEAFF","#4527C6")}<div class="f1"><div class="t-head">Aarav Sharma</div><div class="t-sub">+91 98201 45678</div></div><span class="chev">{ic("chevron-right",18,2.2)}</span></div>
<div class="card row" style="gap:12px;padding:14px;margin-top:10px">{coach_av(False)}<div class="f1"><div class="t-bodym">Coached by Rahul Verma</div><div class="t-sub" style="font-size:13.5px">Fat loss · week 3 of 12</div></div><div class="circbtn" style="background:var(--brand-tint);color:var(--brand)">{ic("message-circle",19,2)}</div></div>
{group([li("Reminders","Workout, meals, check-in","bell","var(--brand)"),li("Steps","Apple Health · on","footprints","var(--done)","var(--done-tint)")],"Settings")}
{group([li("Account","Sign-in, password, delete","user-round"),li("Help","Email the FitBud team","circle-question-mark")])}
{group([f'<div class="li" style="--inset:14px"><div class="f1 t-body" style="color:var(--crit)">Sign out</div></div>'])}
<div class="t-cap" style="text-align:center;margin:14px 0 120px">FitBud 1.0 (214) · Terms · Privacy</div></div>{fade()}{tabbar("More")}{extra}'''
screen('TR-20a-more-root','More',more(),A)
screen('TR-20b-profile-edit','Profile edit',page(nav("Profile",left="Cancel",right='<span class="navbtn strong">Save</span>'),f'''<div style="text-align:center;margin-top:10px"><div style="display:inline-block">{av("AS","#EEEAFF","#4527C6")}</div></div>
{field("Name","Aarav Sharma",focus=True)}{field("Mobile number","98201 45678",prefix="+91",help="Used to sign in. Change it in Account.")}{field("Height","175",suffix="cm")}{field("Date of birth","12 Mar 1994")}
<div class="t-cap" style="margin-top:12px">Goals and targets are set by Rahul.</div>'''),A)
screen('TR-20c-account','Account',page(nav("Account"),f'''{group([li("Mobile number","+91 98201 45678"),li("Email","aarav@example.com"),li("Password","Changed 2 Nov")],"Sign-in")}
{group([li("Download my data","Sent to your email within a day","download")],"Your data")}
{group([f'<div class="li" style="--inset:14px"><div class="f1 t-body" style="color:var(--crit)">Delete account</div></div>'])}
<div class="t-cap" data-wrapok="1" style="margin:8px 2px">Deleting removes your logs, check-ins and photos. Rahul is told you left.</div>''',white=False),A)
screen('TR-20d-delete-account-confirm','Delete account confirm',page(nav("Account"),'',white=False)+dialog("Delete your account?","This removes your logs, check-ins and photos after 30 days. Coaching with Rahul ends now. Sign in within 30 days to undo.",[btn("Delete account","danger"),btn("Cancel","secondary")],"trash-2"),A)
rem=lambda t,s,on=True:f'<div class="li" style="--inset:14px"><div class="f1"><div class="t-body">{t}</div><div class="t-sub" style="font-size:13.5px">{s}</div></div>{toggle(on)}</div>'
screen('TR-16a-reminders','Reminder settings',page(nav("Reminders"),f'''{group([rem("Workout","At 6:00 pm on workout days"),rem("Meals","When each meal is due"),rem("Check-in","Sunday at 9:00 am"),rem("Messages from Rahul","Replies and plan changes")],"Remind me about")}
<div class="group" style="padding:12px 14px"><div class="row sp"><span class="t-body">Quiet hours</span><span class="t-bodym tnum">10 pm – 7 am</span></div><div class="t-cap" style="margin-top:2px">No reminders at night. Times use India Standard Time.</div></div>''',white=False),A)
screen('TR-16b-reminders-permission-off','Reminders: phone notifications off',page(nav("Reminders"),f'''<div style="margin-top:4px">{banner("Notifications are off for FitBud, so reminders can’t reach you.","warn","bell-off",'<span class="link">Open Settings</span>')}</div>
{group([rem("Workout","At 6:00 pm on workout days",False),rem("Meals","When each meal is due",False),rem("Check-in","Sunday at 9:00 am",False),rem("Messages from Rahul","Replies and plan changes",False)],"Remind me about")}''',white=False),A)
screen('TR-25-steps-settings','Steps source',page(nav("Steps"),f'''<div class="card" style="padding:16px;margin-top:6px"><div class="row sp"><div><div class="t-cap">Today</div><div class="n-hero">6,240 <span class="t-sub">of 8,000</span></div></div>{tag("Synced 9:30 am","ok")}</div></div>
{group([f'<div class="li" style="--inset:14px"><div class="f1"><div class="t-body">Read steps from Apple Health</div><div class="t-sub" style="font-size:13.5px">FitBud only reads steps. Nothing else.</div></div>{toggle(True)}</div>'],"Source")}
<div class="t-cap" data-wrapok="1" style="margin:8px 2px">Rahul sets your daily step goal. To stop sharing, turn this off or change it in the Health app.</div>''',white=False),A)
screen('TR-20e-help','Help',page(nav("Help"),f'''{group([li("Email the FitBud team","support@fitbud.app · replies in 1 day","mail"),li("Message Rahul","For your plan, food or workouts","message-circle")])}
<div class="t-cap" data-wrapok="1" style="margin:8px 2px">Questions about your plan go to Rahul. Questions about the app go to the FitBud team.</div>''',white=False),A)
screen('TR-20f-signout-unsent','Sign out with unsent items',more(dialog("2 items aren’t sent yet","Your evening snack and 3 sets are still on this phone. If you sign out now, they’ll be lost.",[btn("Send first","primary",icon="refresh-cw"),btn("Sign out anyway","dangerq"),btn("Cancel","secondary")],"cloud-off","var(--warn)","var(--warn-tint)")),A)
# ---------- system
A='system'
screen('TR-19a-sync-status','Sync status sheet',more(sheet(f'''<div class="row" style="gap:10px">{ic("cloud-off",22,2,"var(--warn)")}<div class="t-title">3 items waiting to send</div></div><div class="t-sub" style="margin-top:4px">They’re saved on this phone and send on their own when you’re online.</div>
<div class="group" style="margin-top:14px;background:var(--bg);box-shadow:none">{li("Evening snack","Diet · eaten as planned · 5:04 pm",chev=False,trail=sync("saved"))}{li("Lower body B · 3 sets","Workout · 6:52 pm",chev=False,trail=sync("sending"))}{li("Weight 78.3 kg","Progress · 7:05 am",chev=False,trail=sync("saved"))}</div>
<div style="margin-top:14px">{btn("Try sending now","tint",icon="refresh-cw")}</div><div class="t-cap" style="text-align:center;margin-top:8px">Last sent 4:41 pm</div>''')),A)
screen('TR-19b-sync-conflict','Sync conflict: Rahul changed the plan meanwhile',more(dialog("Rahul changed this meal","While you were offline, Rahul updated your evening snack. Your log is kept and he’ll see both.",[btn("Keep my log","primary"),btn("See Rahul’s change","secondary")],"git-compare" if "git-compare" in IC else "info","var(--info)","var(--info-tint)")),A)
screen('TR-23-item-unavailable','Item no longer available',page(nav("Workout"),f'<div style="margin-top:140px">{empty("calendar-x","This workout was removed","Rahul changed your plan, so “Upper body A (old)” isn’t available any more. Your logged sets are kept.",btn("Go to today’s workout","tint"))}</div>',white=False),A)
screen('TR-18-ask-coach-sheet','Ask Rahul sheet (from meal or exercise ⋯)',more(sheet(f'''<div class="row" style="gap:10px">{coach_av()}<div><div class="t-head">Ask Rahul</div><div class="t-cap">About: Romanian deadlift · set 3</div></div></div>
<div class="inp focus" style="margin-top:14px;min-height:96px;align-items:flex-start;padding-top:12px"><span>Lower back feels tight on the last reps. Should I drop to 40 kg?<span class="caret"></span></span></div>
<div class="t-cap" style="margin-top:8px">Opens WhatsApp with this message and the exercise details.</div>
<div style="margin-top:14px">{btn("Open in WhatsApp",icon="message-circle")}</div>''')),A)
screen('TR-24-session-expired','Session expired',page('',f'''<div style="margin-top:150px">{empty("lock-keyhole","Please sign in again","For your security you were signed out. Anything you logged is still on this phone and sends after you sign in.",btn("Sign in"))}</div>'''),A)
screen('TR-21-generic-error','Something went wrong / link not found',page(nav(""),f'''<div style="margin-top:140px">{empty("circle-alert","Something went wrong","We couldn’t open that. Your logs are safe. Try again, or go back to Today.",btn("Try again","tint",icon="refresh-cw")+'<div style="margin-top:8px">'+btn("Go to Today","textb")+'</div>')}</div>'''),A)
save_reg()

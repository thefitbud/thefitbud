from kit_trainer import *
A='more'
def more(extra='',top='',dual=True):
    return f'''<div class="content">{lhdr("More")}{top}
<div class="card row" style="gap:14px;padding:16px;margin-top:14px">{coach_av(False)}<div class="f1"><div class="t-head">Rahul Verma</div><div class="t-sub">Coach · 10 active clients</div></div><span class="chev">{ic("chevron-right",18,2.2)}</span></div>
{group([li("Notifications","Needs you, check-ins, asks","bell","var(--brand)"),li("Open FitBud on web","Plans, templates, invites","external-link")],"Settings")}
{group([li("Switch to client view","Follow your own plan","arrow-left-right","var(--info)","var(--info-tint)")]) if dual else ''}
{group([li("Help","Email the FitBud team","circle-question-mark")])}
{group(['<div class="li" style="--inset:14px"><div class="f1 t-body" style="color:var(--crit)">Sign out</div></div>'])}
<div class="t-cap" style="text-align:center;margin:14px 0 120px">FitBud 1.0 (214) · Terms · Privacy</div></div>{fade()}{ttab("More")}{extra}'''
screen('TM-07a-more-root','More (dual-role account shows Switch)',more(),A)
rem=lambda t,s,on=True:f'<div class="li" style="--inset:14px"><div class="f1"><div class="t-body">{t}</div><div class="t-sub" style="font-size:13.5px">{s}</div></div>{toggle(on)}</div>'
NOTIF=lambda off=False:page(nav("Notifications"),(f'<div style="margin-top:4px">{banner("Notifications are off for FitBud. You won’t hear about missed workouts or asks.","warn","bell-off","<span class=link>Open Settings</span>")}</div>' if off else '')+f'''{group([rem("Critical items","Missed workouts, pain mentions",not off),rem("Client asks","When a client asks you something",not off),rem("Check-ins sent","When a check-in is ready to review",not off),rem("Daily summary","8:00 am · who needs you today",False)],"Notify me about")}
<div class="group" style="padding:12px 14px"><div class="row sp"><span class="t-body">Quiet hours</span><span class="t-bodym tnum">10 pm – 7 am</span></div><div class="t-cap" style="margin-top:2px" data-wrapok="1">Pain mentions still come through. Times use India Standard Time.</div></div>''')
screen('TM-07b-notification-settings','Trainer notification settings',NOTIF(),A)
screen('TM-07c-notifications-permission-off','Notifications off at OS level',NOTIF(True),A)
screen('TM-07d-profile','Trainer profile',page(nav("Profile",left="Cancel",right='<span class="navbtn strong">Save</span>'),f'''<div style="text-align:center;margin-top:10px"><div style="display:inline-block">{coach_av(False)}</div></div>
{field("Name","Rahul Verma",focus=True)}{field("WhatsApp number","98765 43210",prefix="+91",help="Clients message you here from Ask Rahul.")}{field("Email","rahul@fitbud.example")}{field("Time zone","India (IST)",suffix=ic("chevron-right",16,2.2))}
<div style="margin-top:18px">{btn("Change password","secondary")}</div>''',white=True),A)
screen('TM-07e-help-sheet','Help sheet',more(sheet(f'''<div class="t-title">Help</div><div class="t-sub" style="margin-top:4px">We reply within a working day.</div>
<div class="group" style="margin-top:14px;background:var(--bg);box-shadow:none">{li("Email the FitBud team","support@fitbud.app","mail")}{li("Report a problem","Adds app version and device","bug" if "bug" in IC else "triangle-alert")}</div><div style="margin-top:12px">{btn("Close","secondary")}</div>''')),A)
screen('TM-07f-signout-confirm','Sign out confirm',more(dialog("Sign out of FitBud?","You’ll stop getting notifications about your clients on this phone.",[btn("Sign out","danger"),btn("Cancel","secondary")],"log-out","var(--ink2)","var(--fill)")),A)
screen('TM-07g-more-offline','More offline',more(top=f'<div style="margin-top:12px">{banner("You’re offline. Settings changes need a connection.","neutral","wifi-off")}</div>'),A)
# role switch TM-08
def rolec(i,t,s,on=False,c='var(--brand)',bg='var(--brand-tint)'):
    return f'<div class="rolec{" on" if on else ""}" style="margin-top:12px"><div style="width:52px;height:52px;border-radius:16px;background:{bg};color:{c};display:flex;align-items:center;justify-content:center;flex:none">{ic(i,26,2)}</div><div class="f1"><div class="t-head">{t}</div><div class="t-sub">{s}</div></div><span style="width:22px;height:22px;border-radius:11px;flex:none;{"background:var(--brand);color:var(--on-brand);display:flex;align-items:center;justify-content:center" if on else "box-shadow:inset 0 0 0 1.5px var(--ink4)"}">{ic("check",14,3) if on else ""}</span></div>'
ROLE=f'''<div class="content" style="top:70px"><div class="t-large">How do you want to use FitBud?</div><div class="t-sub" style="margin-top:6px">Karan, your account is a coach and a client. You can switch any time in More.</div>
{rolec("users","Coach","Manage your clients",True)}{rolec("dumbbell","Client","Follow your plan from Priya",False,"var(--done)","var(--done-tint)")}
<div class="row" style="gap:10px;margin-top:18px"><span style="width:22px;height:22px;border-radius:6px;background:var(--brand);color:var(--on-brand);display:flex;align-items:center;justify-content:center">{ic("check",14,3)}</span><span class="t-body">Remember my choice</span></div></div><div class="stick" style="background:none;border:none">{btn("Continue as coach")}</div>'''
screen('TM-08a-role-select','Role select after sign-in (karan.dual)',ROLE,A)
screen('TM-08b-unsupported-role','Account can’t use the app yet',page('',f'<div style="margin-top:150px">{empty("shield-alert","This account can’t use the app yet","Your account doesn’t have a coach or client role. Contact support and we’ll sort it out.",btn("Email support","tint",icon="mail")+"<div style=\'margin-top:8px\'>"+btn("Sign out","textb")+"</div>")}</div>',white=True),A)
screen('TM-08c-switch-role-sheet','Switch to client view (from coach More)',more(sheet(f'''<div class="t-title">Switch to client view?</div><div class="t-sub" style="margin-top:4px">You’ll see your own plan from Priya. Coach notifications keep coming.</div>{rolec("dumbbell","Client","Karan Malhotra · plan by Priya",True,"var(--done)","var(--done-tint)")}
<div style="margin-top:16px">{btn("Switch to client")}</div><div style="margin-top:8px">{btn("Cancel","secondary")}</div>''')).replace("Rahul Verma","Karan Malhotra").replace("10 active clients","4 active clients"),A)
TR=[('Today','house'),('Workout','dumbbell'),('Diet','utensils'),('Progress','chart-no-axes-column'),('More','layout-grid')]
screen('TM-08d-trainee-more-switch','Client view More: Switch to coach view',f'''<div class="content">{lhdr("More")}<div class="card row" style="gap:14px;padding:16px;margin-top:14px">{av("KM","var(--av4-bg)","var(--av4-fg)")}<div class="f1"><div class="t-head">Karan Malhotra</div><div class="t-sub">Client of Priya · also a coach</div></div></div>
{group([li("Switch to coach view","4 clients · 2 need you","arrow-left-right","var(--info)","var(--info-tint)",trail=tag("2","crit"))])}
{group([li("Reminders","Workout, meals, check-in","bell","var(--brand)"),li("Steps","Apple Health · on","footprints","var(--done)","var(--done-tint)")],"Settings")}
{group([li("Account","Sign-in, password, delete","user-round"),li("Help","Email the FitBud team","circle-question-mark")])}</div>{fade()}{tabbar("More",tabs=TR)}''',A)
# notifications
import b_clients as _bc
CL=_bc.chips()+'<div class="group" style="margin-top:12px">'+''.join(_bc.crow(n,*_bc.ROWS[n]) for n in _bc.order[:7])+'</div>'
def push(t,s,when,top):
    return f'<div style="position:absolute;left:10px;right:10px;top:{top}px;border-radius:22px;background:var(--lock-glass);backdrop-filter:blur(20px);padding:12px 14px" class="row"><div style="width:38px;height:38px;border-radius:9px;background:var(--icon-tile);color:var(--white);display:flex;align-items:center;justify-content:center;flex:none">{ic("dumbbell",20,2.2)}</div><div class="f1" style="margin-left:10px"><div class="row sp"><span class="t-bodym" style="font-size:15px">{t}</span><span class="t-cap" style="color:var(--ink2)">{when}</span></div><div class="t-sub" style="font-size:14px;color:var(--ink)">{s}</div></div></div>'
screen('TM-13a-trainer-lockscreen','Trainer pushes on the lock screen',f'''<div style="position:absolute;inset:0;background:linear-gradient(170deg,#1d2a4a,#3a5a9a 55%,#9fb8e6)"></div>
<div style="position:absolute;top:70px;left:0;right:0;text-align:center;color:#fff"><div style="font-size:19px;font-weight:600">Saturday 14 November</div><div style="font-size:92px;line-height:100px;font-weight:700;letter-spacing:-3px" class="tnum">7:36</div></div>
{push("Aarav mentions pain","“Lower back feels tight… drop to 40 kg?”","now",400)}{push("Sneha sent her check-in","Week 2 · 2 photos. Tap to review.","1h",490)}{push("Rohan missed another workout","2 this week. Tap to review or nudge.","3h",580)}''','notifications',time='',dark=True)
screen('TM-13b-inapp-banner','In-app banner while on Clients',f'''<div class="content">{lhdr("Clients","Rahul Verma · 10 active",circ("search"))}<div style="margin-top:12px">{seg(["Clients","Activity"],0)}</div>{CL}</div>{fade()}{ttab("Clients")}
<div style="position:absolute;left:10px;right:10px;top:56px;z-index:60;border-radius:18px;background:var(--card);box-shadow:0 10px 30px rgba(var(--sh),.18);padding:12px 14px" class="row">{cav("Aarav")}<div class="f1" style="margin-left:10px"><div class="row sp"><span class="t-bodym" style="font-size:15px">Aarav asked you</span><span class="t-cap">now</span></div><div class="t-sub" style="font-size:14px">Mentions pain · Romanian deadlift</div></div></div>''','notifications')
save_reg()

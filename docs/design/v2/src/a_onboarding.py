from kit import *
A='onboarding'
def logo(): return f'<div class="row" style="gap:8px"><div style="width:34px;height:34px;border-radius:10px;background:var(--brand);display:flex;align-items:center;justify-content:center;color:#fff">{ic("dumbbell",19,2.2)}</div><span style="font-size:20px;font-weight:700;letter-spacing:-.5px">FitBud</span></div>'
pw='<span style="letter-spacing:3px;font-size:18px">••••••••••</span>'
eye=ic('eye-off',18,2)
def signin(err=False,banner_=''):
    f1=field('Mobile number or email','98201 45678',prefix='+91',err='' )
    f2=field('Password',pw,suffix=eye,err=("That number and password don’t match." if err else ''),focus=not err)
    b=f'<div style="margin-top:14px">{banner_}</div>' if banner_ else ''
    return f'''<div class="content" style="top:70px">{logo()}
<div class="t-large" style="margin-top:28px">Sign in</div><div class="t-sub" style="margin-top:6px">Use the mobile number or email your coach invited.</div>{b}
{f1}{f2}<div class="row" style="justify-content:flex-end;margin-top:10px"><span class="link">Forgot password?</span></div>
<div style="margin-top:22px">{btn("Sign in","dis" if banner_ else "primary")}</div>
<div class="row" style="gap:12px;margin:20px 0"><div class="f1" style="height:.5px;background:var(--line2)"></div><span class="t-cap">or</span><div class="f1" style="height:.5px;background:var(--line2)"></div></div>
{btn("Sign in with a code instead","outline",icon="mail")}</div>
<div style="position:absolute;bottom:44px;left:24px;right:24px;text-align:center" class="t-cap" data-wrapok="1">New to FitBud? Open the invite link your coach sent you.<br>Terms · Privacy</div>'''
screen('TR-01a-signin-password','Sign in with password (default)',signin(),A)
screen('TR-01e-signin-wrong-password','Auth error: wrong credentials, inline',signin(err=True),A)
screen('TR-01f-signin-rate-limited','Auth error: too many attempts',signin(err=False,banner_=banner('Too many tries. Wait 4:59 or sign in with a code.','crit','clock')),A)
screen('TR-01b-signin-code-request','Sign in with a code: choose where to send',f'''<div class="content">{nav()}
<div class="t-large" style="margin-top:8px">Sign in with a code</div><div class="t-sub" style="margin-top:6px">We’ll send a 6-digit code. It works for 10 minutes.</div>
<div class="field"><div class="lab">Send code to</div>{seg(["Email","WhatsApp"],0)}</div>
<div class="row" style="gap:6px;margin-top:8px">{tag("Coming soon","neutral")}<span class="t-cap">Codes on WhatsApp are coming soon.</span></div>
{field("Email","aarav@example.com",focus=True)}
<div style="margin-top:22px">{btn("Send code")}</div></div>'''+kb_alpha('go'),A)
screen('TR-01c-signin-code-entry','Code entry, typing',f'''<div class="content">{nav()}
<div class="t-large" style="margin-top:8px">Enter your code</div><div class="t-sub" style="margin-top:6px">Sent to <b class="b">aarav@example.com</b>. Check spam if it isn’t there.</div>
<div class="otp" style="margin-top:24px"><span class="tnum">4</span><span class="tnum">8</span><span class="tnum">2</span><span class="tnum">0</span><span class="f"><i class="caret" style="display:inline-block;width:2px;height:26px;background:var(--brand)"></i></span><span></span></div>
<div class="row sp" style="margin-top:16px"><span class="t-sub tnum">Resend in 0:42</span><span class="link" style="color:var(--ink4)">Resend code</span></div></div>'''+kb_num(),A)
screen('TR-01g-signin-code-expired','Auth error: code expired',f'''<div class="content">{nav()}
<div class="t-large" style="margin-top:8px">Enter your code</div><div class="t-sub" style="margin-top:6px">Sent to <b class="b">aarav@example.com</b>.</div>
<div class="otp" style="margin-top:24px">{"".join(f'<span class="tnum" style="box-shadow:0 0 0 1.5px var(--crit)">{c}</span>' for c in "482019")}</div>
<div class="help err" style="margin-top:10px">{ic("circle-alert",13,2.4)} This code has expired. Send a new one.</div>
<div style="margin-top:24px">{btn("Send a new code","primary",icon="refresh-cw")}</div><div style="margin-top:8px">{btn("Use password instead","textb")}</div></div>''',A)
screen('TR-01d-set-new-password','Forgot password → set a new password',f'''<div class="content">{nav()}
<div class="t-large" style="margin-top:8px">Set a new password</div><div class="t-sub" style="margin-top:6px">For aarav@example.com</div>
{field("New password","<span style='letter-spacing:3px;font-size:18px'>•••••••••</span>",suffix=ic("eye",18,2),focus=True)}
<div class="col" style="gap:6px;margin:10px 2px 0">
<span class="t-sub row" style="gap:6px;color:var(--done)">{ic("circle-check",15,2.4)}At least 8 characters</span>
<span class="t-sub row" style="gap:6px;color:var(--done)">{ic("circle-check",15,2.4)}Not your number or email</span></div>
<div style="margin-top:24px">{btn("Save and sign in")}</div></div>'''+kb_alpha('done'),A)
coachcard=f'''<div class="card pad row" style="gap:12px;margin-top:20px">{av("RV","#2B1F70","#fff")}<div class="f1"><div class="t-bodym">Rahul Verma</div><div class="t-sub">Strength and fat-loss coach · Pune</div></div>{ic("shield-check",20,2,"var(--done)")}</div>'''
screen('TR-02a-invite-accept','Invite acceptance, new account',f'''<div class="content" style="top:62px">{logo()}
<div class="t-large" style="margin-top:22px;font-size:27px;line-height:33px">Rahul invited you to train on FitBud</div>{coachcard}
{field("Your name","Aarav Sharma")}{field("Mobile number","98201 45678",prefix="+91",help="Rahul will see this. We never show it to anyone else.")}
{field("Create a password","<span style='letter-spacing:3px;font-size:18px'>••••••</span>",suffix=ic("eye-off",18,2),focus=True,help="At least 8 characters. You’ll sign in with your number or email.")}
</div><div class="stick bg">{btn("Join Rahul")}<div class="t-cap" style="text-align:center;margin-top:10px">Already have an account? <span class="link" style="font-size:12px">Sign in</span></div></div>''',A)
screen('TR-02b-invite-expired','Invite expired or already used',f'''<div class="content" style="top:70px">{logo()}</div>
<div style="position:absolute;top:220px;left:16px;right:16px">{empty("link-2-off","This invite has expired","Invite links work for 7 days. Ask Rahul to send you a new one.",btn("Message Rahul on WhatsApp","primary",icon="message-circle")+'<div style="margin-top:8px">'+btn("I have a code","textb")+'</div>')}</div>''',A)
radio=lambda t,s,on:f'<div class="card row" style="padding:13px 14px;gap:12px;margin-top:8px;{"box-shadow:0 0 0 2px var(--brand)" if on else ""}"><span style="width:22px;height:22px;border-radius:11px;flex:none;{"background:var(--brand);box-shadow:inset 0 0 0 6px var(--brand),inset 0 0 0 9px #fff" if on else "box-shadow:inset 0 0 0 1.5px var(--ink4)"}"></span><div class="f1"><div class="t-bodym" style="font-weight:{600 if on else 500}">{t}</div><div class="t-cap">{s}</div></div></div>'
screen('TR-03-intake-form','Intake form, step 2 of 5',f'''<div class="content">{nav("Getting to know you",left="close",sub="Step 2 of 5")}
<div class="track" style="margin:4px 0 0;height:4px"><i style="width:40%;background:var(--brand)"></i></div>
<div class="t-title" style="margin-top:20px">How often do you train now?</div>
{radio("Not yet","Starting fresh",False)}{radio("1–2 days a week","Mostly walks or home workouts",True)}{radio("3+ days a week","Gym or sport",False)}
<div class="t-title" style="margin-top:26px">Current weight</div>
<div class="inp tnum" style="font-size:20px;font-weight:600;margin-top:10px">78.4<span style="margin-left:auto;font-size:16px;font-weight:500;color:var(--ink3)">kg</span></div>
<div class="t-title" style="margin-top:26px">Any injuries Rahul should know about?</div>
<div class="row" style="gap:8px;margin-top:10px">{btn("Yes","outline",style="flex:1")}{btn("No","tint",style="flex:1;box-shadow:0 0 0 2px var(--brand)")}</div></div>
<div class="stick bg"><div class="row" style="gap:10px">{btn("Back","secondary",style="width:110px")}{btn("Continue",style="flex:1")}</div><div class="t-cap row" style="justify-content:center;gap:5px;margin-top:10px">{ic("cloud-check",14,2)}Answers saved on your phone</div></div>''',A)
screen('TR-04-waiting-for-coach','Waiting for coach to set up the plan',f'''<div class="content">{lhdr("Hi Aarav","Saturday, 14 Nov",circ("circle-user-round"))}
<div class="card pad" style="margin-top:20px;text-align:center"><div class="eic" style="width:64px;height:64px;border-radius:20px;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center;margin:6px auto 14px">{ic("hourglass",28,2)}</div>
<div class="t-title">Rahul is building your plan</div><div class="t-sub" style="margin-top:6px">You’ll get a notification when your first workout and meals are ready.</div></div>
{group([li("Intake form","Sent Fri 13 Nov, 8:12 pm","clipboard-check","var(--done)","var(--done-tint)",tag("Sent","ok"),False),
li("Reminders","Meals, workouts and check-ins","bell","var(--brand)","var(--brand-tint)","On",True),
li("Steps","Connect Apple Health","footprints",None,None,"",True)],"While you wait")}
<div style="margin-top:20px">{btn("Message Rahul on WhatsApp","outline",icon="message-circle")}</div></div>''',A)
trow=lambda t,s,on:f'<div class="li" style="--inset:14px"><div class="f1"><div class="t-body">{t}</div><div class="t-sub" style="font-size:13.5px">{s}</div></div>{toggle(on)}</div>'
screen('TR-05-reminder-setup','Reminder setup, onboarding step',f'''<div class="content">{nav("Reminders",left="back",sub="Step 4 of 5",right='<span class="navbtn">Skip</span>')}
<div class="t-large" style="margin-top:10px;font-size:27px;line-height:33px">When should we nudge you?</div><div class="t-sub" style="margin-top:6px">Rahul sets the plan. You choose the reminders.</div>
<div style="margin-top:18px">{group([trow("Meals","At each meal time in your plan",True),trow("Workouts","1 hour before · 5:30 pm",True),trow("Weekly check-in","Fridays, 7:00 pm",True),trow("Evening summary","What’s left today, at 9:00 pm",False)])}</div>
<div class="group" style="margin-top:14px">{li("Quiet hours","No reminders 10:00 pm – 7:00 am","moon",None,None,"",False)}{li("Time zone","India Standard Time, from your phone","clock",None,None,"",False)}</div></div>
<div class="stick bg">{btn("Allow notifications",icon="bell")}<div style="margin-top:6px">{btn("Not now","textb")}</div></div>''',A)
screen('TR-22a-ended-coaching','Ended coaching: Today, history kept',f'''<div class="content">{lhdr("Today","Saturday, 14 Nov",circ("bell"))}
<div style="margin-top:16px">{banner("Coaching with Rahul ended on Sat 31 Oct.","neutral","info")}</div>
<div class="card pad" style="margin-top:14px;text-align:center;padding:24px 18px">{empty("history" if "history" in IC else "clock","Your history is safe","Workouts, meals and check-ins from your time with Rahul stay here.",btn("View past coaching","secondary"))}</div>
<div class="card pad row" style="gap:12px;margin-top:14px"><div class="lic" style="width:40px;height:40px;border-radius:12px;background:var(--brand-tint);color:var(--brand);display:flex;align-items:center;justify-content:center">{ic("mail",20,2)}</div><div class="f1"><div class="t-bodym">New coach?</div><div class="t-sub">Open their invite link, or enter a code.</div></div><span class="link">Enter code</span></div></div>
{fade()}{tabbar("Today")}''',A)
screen('TR-22b-reactivation-confirm','Reactivation request while coached by someone else',f'''<div class="content" data-bg>{lhdr("Today","Saturday, 14 Nov",circ("bell"))}{diet_summary(820,1900,(52,120),(98,220),(24,60))}</div>{tabbar("Today")}'''+sheet(f'''
<div class="row" style="justify-content:center;padding:6px 6px 0">{av("RV","#2B1F70","#fff")}</div>
<div class="t-title" style="text-align:center;margin-top:12px">Rahul wants to coach you again</div>
<div class="t-sub" style="text-align:center;margin-top:6px">You’re coaching with <b class="b">Asha Nair</b> right now. Restarting with Rahul ends coaching with Asha. Your history with both stays.</div>
<div class="col" style="gap:8px;margin-top:20px">{btn("Restart with Rahul")}{btn("Keep coaching with Asha","secondary")}</div>'''),A)
save_reg()

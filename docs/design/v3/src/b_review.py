from kit_trainer import *
A='review'
kv=lambda k,v,vc='':f'<div class="row sp" style="padding:9px 0;border-top:.5px solid var(--line)"><span class="t-sub">{k}</span><span class="t-bodym tnum" style="font-size:15px;{vc}">{v}</span></div>'
def exc(chips=None,extra_top='',stick=None,menu=True,ended=False):
    chips=chips or sch('crit')+sch('ci','Open').replace('var(--info-tint)','var(--fill)').replace('var(--info)','var(--ink2)')
    body=f'''{extra_top}{chdr("Rohan",chips,"Fat loss · week 6 · since 5 d")}
<div class="card" style="padding:14px 16px;margin-top:16px"><div class="t-label" style="color:var(--ink3)">What happened</div><div class="t-head" style="margin-top:6px">Missed 2 workouts</div>
<div class="t-sub" style="margin-top:2px">Lower body A on Tue 10 Nov and Upper body B on Thu 12 Nov were planned for 7:00 pm and not logged.</div>
<div style="margin-top:10px">{kv("Planned","5 exercises · 16 sets · 50 min")}{kv("Reminder","Delivered 6:00 pm · not opened")}{kv("Last logged","Sat 7 Nov · Lower body A")}</div></div>
<div class="card" style="padding:14px 16px;margin-top:12px"><div class="row sp"><span class="t-head">This week</span><span class="t-cap">Mon 9 – Sun 15 Nov</span></div>{wdots(["rest","miss","rest","miss","rest","today","plan"])}
<div class="row" style="gap:16px;margin-top:12px"><span class="t-sub"><b class="b">0 of 3</b> workouts</span><span class="t-sub"><b class="b">14 of 25</b> meals</span></div></div>'''
    r='<div class="circbtn sm">'+ic("ellipsis",18,2.2)+'</div>' if menu else ''
    st=stick if stick is not None else stick2(btn("Mark reviewed","secondary"),btn("Nudge",icon="bell-ring"))
    return page(nav("Missed workouts",left="back",right=r),body)+st
screen('TM-04a-exception-review','Exception review: Rohan missed 2 workouts',exc(),A)
def pushprev(n,txt):
    return f'''<div style="margin-top:8px;border-radius:18px;background:var(--bg);padding:12px 14px" class="row"><div style="width:34px;height:34px;border-radius:8px;background:var(--icon-tile);color:var(--white);display:flex;align-items:center;justify-content:center;flex:none;align-self:flex-start">{ic("dumbbell",18,2.2)}</div><div class="f1" style="margin-left:10px"><div class="row sp"><span class="t-bodym" style="font-size:15px">Rahul nudged you</span><span class="t-cap">now</span></div><div class="t-body" data-wrapok="1" style="font-size:15px;line-height:21px">{txt}<span class="caret"></span></div></div></div>'''
def nudge(n='Rohan',what='Missed workouts · Tue, Thu',txt='Lower body A and Upper body B are waiting. Can you fit one in tomorrow?',warn='',dis=False):
    w=f'<div style="margin-top:12px">{warn}</div>' if warn else ''
    return f'''<div class="row sp"><div class="t-title">Nudge {n}</div><div class="circbtn sm">{ic("x",18,2.2)}</div></div><div class="t-sub">{what}</div>
<div class="row" style="gap:8px;margin-top:14px">{''.join(f'<span class="chip{" on" if i==0 else ""}">{t}</span>' for i,t in enumerate(["Gentle","Check in","Reschedule"]))}</div>
<div class="t-label glabel" style="margin-top:16px">Preview · tap to edit</div>{pushprev(n,txt)}{w}
<div style="margin-top:14px">{btn("Send nudge","dis" if dis else "primary",icon="bell-ring")}</div><div class="t-cap" style="text-align:center;margin-top:8px">Sends {n} a push notification. It opens this item in FitBud.</div>'''
NUDGE=nudge()
screen('TM-04b-nudge-sheet','Nudge sheet: push notification preview',exc()+sheet(NUDGE),A)
screen('TM-04c-nudge-quiet-hours','Nudge during Rohan’s quiet hours',exc()+sheet(nudge(warn=banner("It’s 10:40 pm for Rohan, inside his quiet hours. The push arrives at 7:00 am.","warn","moon"))),A,time='22:40')
RES=f'''<div class="row sp"><div class="t-title">Resolve</div><div class="circbtn sm">{ic("x",18,2.2)}</div></div><div class="t-sub">Missed workouts · Rohan</div>
<div class="t-label glabel" style="margin-top:14px">Outcome</div><div class="row" style="gap:8px;flex-wrap:wrap">{''.join(f'<span class="chip{" on" if i==0 else ""}">{t}</span>' for i,t in enumerate(["Talked to Rohan","Plan adjusted","No action needed"]))}</div>
{field("Note (only you)","Travelling for work till Fri. Moving leg day to Sat.")}
<div style="margin-top:14px">{banner("Resolving locks these workouts, so Rohan can’t log them late any more.","neutral","lock")}</div>
<div style="margin-top:14px">{btn("Resolve")}</div>'''
screen('TM-04d-resolve-sheet','Resolve sheet: outcome, private note, lock helper',exc(sch('crit')+sch('rev','Reviewed'),stick=stick2(btn("Nudge","secondary",icon="bell-ring"),btn("Resolve")))+sheet(RES),A)
screen('TM-04e-reviewed-still-open','Reviewed, still open: Resolve becomes primary',exc(sch('crit')+sch('rev','Reviewed'),extra_top=f'<div style="margin:2px 0 10px">{banner("Reviewed by you at 9:52 am. It stays in Needs you until it’s resolved.","neutral","eye")}</div>',stick=stick2(btn("Nudge","secondary",icon="bell-ring"),btn("Resolve"))),A)
screen('TM-04f-resolved-readonly','Resolved: read only',exc(sch('resolved'),extra_top=f'<div style="margin:2px 0 10px">{banner("Resolved by you today, 10:05 am · Talked to Rohan.","ok","circle-check")}</div>',stick='',menu=False),A)
screen('TM-04g-exception-not-found','Already resolved elsewhere / not found',page(nav("",left="back"),f'<div style="margin-top:150px">{empty("circle-check","This item is already resolved","It was resolved on FitBud web at 10:05 am. Nothing else to do here.",btn("Back to Needs you","tint"))}</div>'),A)
screen('TM-04h-exception-offline','Exception review offline: actions disabled',exc(extra_top=f'<div style="margin:2px 0 10px">{banner("You’re offline. Reviewing and nudging need a connection.","neutral","wifi-off")}</div>',stick=stick2(btn("Mark reviewed","dis"),btn("Nudge","dis",icon="bell-ring"))),A)
screen('TM-04i-exception-ended','Client ended: read only',page(nav("Missed lunch",left="back"),f'''<div style="margin-bottom:10px">{banner("Coaching with Kavya ended on 30 Oct. This is read only.","neutral","circle-slash")}</div>{chdr("Kavya",sch("end"),"Fat loss · ended 30 Oct")}
<div class="card" style="padding:14px 16px;margin-top:16px;opacity:.75"><div class="t-label" style="color:var(--ink3)">What happened</div><div class="t-head" style="margin-top:6px">Lunch not logged</div><div class="t-sub">Wed 28 Oct · never resolved</div></div>'''),A)
MENU=f'''<div class="group" style="background:var(--bg);box-shadow:none">{li("Add note","Private, or shared on Rohan’s Today","notebook-pen")}{li("Message on WhatsApp","Opens a chat without a template","message-circle")}{li("Open Rohan’s profile","","user-round")}</div><div style="margin-top:10px">{btn("Cancel","secondary")}</div>'''
screen('TM-04j-exception-menu','⋯ menu: Add note, WhatsApp, profile',exc()+sheet(MENU),A)
NOTE=f'''<div class="row sp"><span class="navbtn">Cancel</span><span class="t-head">Note for Rohan</span><span class="navbtn strong">Save</span></div>
<div class="inp focus" style="margin-top:14px;min-height:110px;align-items:flex-start;padding-top:12px"><span>Let’s do 2 shorter sessions this week while you travel. 30 min is enough.<span class="caret"></span></span></div>
<div class="li" style="--inset:0;padding:12px 0;margin-top:6px"><div class="f1"><div class="t-body">Show on Rohan’s Today</div><div class="t-sub" style="font-size:13.5px">Off: only you can see it</div></div>{toggle(True)}</div>'''
screen('TM-04k-note-composer','Note composer: shared or private',exc()+sheet(NOTE,style='bottom:291px;border-radius:14px 14px 0 0;padding-bottom:14px')+kb_alpha('return'),A)
# Ask reply
def ask(state='open'):
    top=f'<div style="margin:2px 0 10px">{banner("Answered on WhatsApp at 11:02 am.","ok","circle-check")}</div>' if state=='done' else ''
    chips=sch('pain')+(sch('answered') if state=='done' else sch('ask'))
    body=f'''{top}{chdr("Aarav",chips,"Fat loss · week 3 · 12 min ago")}
<div class="card" style="padding:14px 16px;margin-top:16px"><div class="t-label" style="color:var(--ink3)">Aarav asked</div><div class="t-body" style="margin-top:6px;font-size:17px;line-height:24px">“Lower back feels tight on the last reps. Should I drop to 40 kg?”</div>
<div style="margin-top:10px">{kv("About","Romanian deadlift · set 3")}{kv("Logged so far","40 × 10 · 42.5 × 10 PR")}{kv("Plan","3 × 8–10 · 40 kg")}</div></div>
<div class="card row" style="gap:10px;padding:12px 14px;margin-top:12px;background:var(--crit-tint);box-shadow:none;align-items:flex-start">{ic("heart-pulse",18,2.2,"var(--crit)")}<div class="t-sub" style="color:var(--ink)">Mentions pain. Reply soon, and suggest stopping the exercise if it’s sharp pain.</div></div>'''
    st='' if state=='done' else stick2(btn("Mark answered","secondary"),btn("Reply on WhatsApp",icon="message-circle"))
    return page(nav("Asked you",left="back"),body)+st
screen('TM-10a-ask-detail','Asked you: question with context and pain caution',ask(),A)
screen('TM-10b-ask-answered','Asked you: answered (read only)',ask('done'),A)
screen('TM-04m-nudge-sent','Nudge sent: state on the item, with toast',exc(sch('crit')+sch('rev','Nudged 10:12 am'),extra_top=f'<div style="margin:2px 0 10px">{banner("Nudged at 10:12 am · delivered. Rohan hasn’t opened it yet.","neutral","bell-ring")}</div>',stick=stick2(btn("Mark reviewed","secondary"),btn("Resolve")))+toast("Nudge sent to Rohan","Undo",110),A)
screen('TM-04n-nudge-limit','Nudge limit: already nudged today',exc(sch('crit')+sch('rev','Nudged 10:12 am'))+sheet(nudge(warn=banner("You nudged Rohan about this at 10:12 am. You can nudge again tomorrow.","neutral","clock"),dis=True)),A)
screen('TM-04o-nudge-push-off','Nudge when the client has push turned off',page(nav("",left="back"),chdr("Ishita",sch("warn","Needs attention")+sch("pushoff"),"Fat loss · week 3"))+sheet(nudge("Ishita","Dinner not logged · Fri","Dinner wasn’t logged on Friday. Can you add it, even roughly?",banner("Ishita has turned off FitBud notifications. She’ll see this the next time she opens the app.","warn","bell-off"))),A)
save_reg()

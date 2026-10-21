from fb import *
X='''.cal{display:grid;grid-template-columns:56px repeat(7,1fr);flex:1;min-height:0;position:relative}
.ch{height:52px;border-bottom:1px solid var(--border);padding:8px 10px;font-size:12px;color:var(--ink-500)}.ch b{display:block;font-size:17px;color:var(--navy)}.ch.td{background:var(--lavender-50)}.ch.td b{color:var(--indigo)}
.hr{font-size:11px;color:var(--ink-500);text-align:right;padding-right:8px}
.colm{border-left:1px solid var(--border);position:relative}
.ev{position:absolute;left:4px;right:4px;border-radius:10px;padding:5px 8px;font-size:12px;line-height:1.3;overflow:hidden}
.ev b{display:block;font-size:12px}.ev.s{background:var(--lavender);color:var(--navy);border-left:3px solid var(--indigo)}.ev.g{background:var(--navy);color:#fff;border-left:3px solid var(--indigo-300)}.ev.c{background:#fff;color:var(--ink-700);border:1.5px dashed #0E7490;border-left:3px solid #0E7490}
.lgd{display:flex;gap:16px;font-size:12px;color:var(--ink-500);align-items:center}.lgd i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:6px;vertical-align:-2px}
.ag{background:#fff;border:1px solid var(--border);border-radius:20px;overflow:hidden;margin-bottom:10px}.ai{display:flex;gap:12px;align-items:center;min-height:64px;padding:8px 14px;border-top:1px solid var(--border)}.ai:first-child{border-top:0}
.ai .t{width:62px;font-size:14px;font-weight:700;color:var(--navy)}.ai .t span{display:block;font-size:11px;color:var(--ink-500);font-weight:500}
.bar3{width:4px;align-self:stretch;border-radius:2px;background:var(--indigo)}.bar3.c{background:#0E7490}
.prm{border:1.5px solid #CFE7EC;background:#F1FAFB;border-radius:16px;padding:14px}
.modal{position:absolute;left:50%;top:70px;transform:translateX(-50%);width:560px;background:#fff;border-radius:20px;box-shadow:0 20px 60px rgba(15,17,21,.25);padding:22px 24px}
.lock{width:393px;height:852px;background:linear-gradient(180deg,#2E2370,#1A1248 60%,#120c33);color:#fff;position:relative}
.nt{background:rgba(255,255,255,.88);color:var(--ink-900);border-radius:20px;padding:12px 14px;margin:0 12px 8px;font-size:14px}.nt .h{display:flex;gap:8px;font-size:12px;color:var(--ink-500);margin-bottom:4px}
.nt .acts2{display:flex;gap:8px;margin-top:10px}.nt .acts2 a{flex:1;height:44px;border-radius:12px;background:rgba(0,0,0,.07);display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px}
'''
H=list(range(6,22))
def hh(h): return f'{(h-1)%12+1} {"am" if h<12 else "pm"}'
E=[(0,6.5,.75,'s','Arjun Kapoor','6:30 am · Andheri'),(0,7.5,1,'g','Morning strength','7:30 am · 4 booked'),(0,11,.5,'c','Call · Meera Iyer','11:00 am · check-in call'),(0,18,1,'s','Rohan Mehta','6:00 pm · 3 left'),(0,19.5,.75,'s','Deepak Nair','7:30 pm · Bandra'),
   (1,6.5,.75,'s','Neha Reddy','6:30 am · 1 left'),(1,18,1,'s','Meera Iyer','6:00 pm · Andheri'),(1,20,.5,'c','Call · Arjun Kapoor','8:00 pm · 30 min'),
   (2,7.5,1,'g','Morning strength','7:30 am · 4 booked'),(2,19,1,'s','Rohan Mehta','7:00 pm · 2 left after'),(3,6.5,.75,'s','Arjun Kapoor','6:30 am'),(3,12,.5,'c','Call · Priya Sharma','12:00 pm · video'),(3,18,1,'s','Neha Reddy','6:00 pm · pack ends'),
   (4,7.5,1,'g','Morning strength','7:30 am'),(4,19,.75,'s','Deepak Nair','7:00 pm · Bandra'),(5,8,1,'s','Meera Iyer','8:00 am'),(5,9,1.5,'g','Weekend group','9:00 am · 6 booked'),(6,9,.5,'c','Call · Rohan Mehta','9:00 am · monthly review')]
D=[('Mon',19),('Tue',20),('Wed',21),('Thu',22),('Fri',23),('Sat',24),('Sun',25)]
PX=37
def cal():
    head='<div></div>'+''.join(f'<div class="ch {"td" if d==19 else ""}">{n}<b>{d}</b></div>' for n,d in D)
    hrs='<div style="position:relative">'+''.join(f'<div class="hr" style="position:absolute;top:{(h-6)*PX-6}px;right:0">{hh(h)}</div>' for h in H)+'</div>'
    cols=''
    for i in range(7):
        ev=''.join(f'<div class="ev {k}" style="top:{(s-6)*PX+1}px;height:{max(d*PX-3,24)}px"><b>{t}</b>{sub}</div>' for c,s,d,k,t,sub in E if c==i)
        lines=''.join(f'<div style="position:absolute;left:0;right:0;top:{(h-6)*PX}px;border-top:1px solid #EEF0F5"></div>' for h in H)
        bg='background:var(--lavender-50);' if i==0 else ''
        cols+=f'<div class="colm" style="{bg}">{lines}{ev}</div>'
    now=f'<div style="position:absolute;left:56px;width:calc((100% - 56px)/7);top:{52+(7.2-6)*PX}px;border-top:2px solid var(--coral)"></div>'
    return f'<div class="cal" style="grid-template-rows:52px {16*PX}px">{head}{hrs}{cols}{now}</div>'
body=f'''<div style="padding:20px 28px 0;display:flex;align-items:flex-end;gap:12px"><div><div class="eb">Mon 19 – Sun 25 Oct</div><h1 style="font-size:28px">Calendar</h1></div><span class="sp"></span>
<div class="lgd"><span><i style="background:var(--lavender);border-left:3px solid var(--indigo)"></i>In-person 1:1</span><span><i style="background:var(--navy)"></i>Group</span><span><i style="border:1.5px dashed #0E7490"></i>Check-in call</span></div>
<a class="btn o sm">{ic("left",16)}</a><a class="btn o sm">This week</a><a class="btn o sm">{ic("right",16)}</a><a class="btn p sm">{ic("plus",16)}Add</a></div>
<div class="wc" style="margin:14px 28px 20px;overflow:hidden;display:flex;flex-direction:column;flex:1">{cal()}</div>'''
save('200-trainer-web-calendar-v3-web',page(web('Calendar',body,'Sessions'),1440,900,X))
# mobile agenda
def ai(t,dur,n,s,c='',chip=''):
    return f'<div class="ai"><div class="t">{t}<span>{dur}</span></div><span class="bar3 {c}"></span><div class="sp"><b class="b" style="font-size:15px">{n}</b><div class="xs muted">{s}</div></div>{chip}</div>'
ag=f'''<div class="top"><div><div class="eb">Only sessions and check-in calls</div><h1>Sessions</h1></div><a class="icb">{ic("plus")}</a></div>
<div class="seg"><a>Today</a><a>Week</a><a class="on">Agenda</a></div>
<div class="sec"><h3>Today · Mon 19 Oct</h3><span>5</span></div><div class="ag">{ai("7:30 am","60 min","Morning strength","Group · 4 booked · Andheri")}{ai("11:00 am","30 min","Check-in call · Meera Iyer","Video · link added","c",'<span class="chip sel">'+ic("link",13)+'Join</span>')}{ai("6:00 pm","60 min","Rohan Mehta","1:1 · Lower body B · 3 left")}</div>
<div class="sec"><h3>Tue 20 Oct</h3><span>3</span></div><div class="ag">{ai("6:30 am","45 min","Neha Reddy","1:1 · 1 session left",chip='<span class="chip attn">1 left</span>')}{ai("8:00 pm","30 min","Check-in call · Arjun Kapoor","Phone call · after his check-in","c")}</div>
<div class="sec"><h3>Wed 21 Oct</h3><span>2</span></div><div class="ag">{ai("7:30 am","60 min","Morning strength","Group · 4 booked")}</div>'''
save('201-trainer-mobile-agenda-v3-ios',page(phone(ag,tab='Sessions',tabs=TC,t='7:12'),extra=X))
def addsheet(kind):
    if kind=='call':
        f=f'''<div class="field"><label>Client</label><div class="in"><span class="av a4" style="width:28px;height:28px;font-size:11px">MI</span>Meera Iyer</div></div>
<div class="row" style="gap:10px"><div class="field sp"><label>Date</label><div class="in">Thu 22 Oct</div></div><div class="field sp"><label>Time</label><div class="in">12:00 pm</div></div></div>
<div class="field"><label>Duration</label><div class="seg"><a>15 min</a><a class="on">30 min</a><a>45 min</a></div></div>
<div class="field"><label>Meeting link · optional</label><div class="in ph2">{ic("link",16)}Paste a Meet, Zoom or WhatsApp link</div></div>
<div class="field"><label>Note · optional</label><div class="in ph2">Talk about her sleep and lunch timing</div></div>
<div class="row" style="justify-content:space-between;margin-bottom:12px"><span class="sm">Remind me 15 min before</span><span class="tog"></span></div>
<a class="btn p" style="width:100%">Add call · Thu 22 Oct, 12:00 pm</a><p class="xs muted" style="text-align:center;margin-top:8px">The call happens outside FitBud. Share the time with Meera on WhatsApp (you press Send).</p>'''
    else:
        f=f'''<div class="field"><label>Client or group</label><div class="in">{ic("users",16)}Morning strength · 4 clients</div></div>
<div class="row" style="gap:10px"><div class="field sp"><label>Date</label><div class="in">Wed 21 Oct</div></div><div class="field sp"><label>Time</label><div class="in">7:30 am</div></div></div>
<div class="field"><label>Duration</label><div class="seg"><a>45 min</a><a class="on">60 min</a><a>90 min</a></div></div>
<div class="field"><label>Place</label><div class="in">{ic("pin",16)}Gold's Gym Andheri</div></div>
<div class="field"><label>Repeats</label><div class="seg"><a>Once</a><a class="on">Mon Wed Fri</a><a>Custom</a></div></div>
<div class="field"><label>Workout</label><div class="in">From each client's plan</div></div>
<a class="btn p" style="width:100%">Add session · uses 1 per client when attended</a>'''
    sh=f'<div class="scrim"></div><div class="sheet" style="top:70px"><div class="gr"></div><div class="row" style="margin-bottom:12px"><b class="b sp" style="font-size:20px">Add to calendar</b><a class="icb" style="border:0">{ic("x")}</a></div><div class="seg" style="margin-bottom:14px"><a class="{"on" if kind=="session" else ""}">{ic("pin",15)}In-person session</a><a class="{"on" if kind=="call" else ""}">{ic("phone",15)}Check-in call</a></div>{f}</div>'
    return page(phone(ag,tab='Sessions',tabs=TC,t='7:14',overlay=sh),extra=X)
save('202-trainer-mobile-add-session-v3-ios',addsheet('session'))
save('202b-trainer-mobile-add-call-v3-ios',addsheet('call'))
# web check-in review with prompt
prompt=f'''<div class="prm"><div class="row"><span style="color:#0E7490">{ic("phone",20)}</span><b class="b sp">Schedule a call with Meera? <span class="xs muted" style="font-weight:500">Optional</span></b><a class="xs muted" href="#">Not now</a></div>
<div class="row" style="gap:10px;margin-top:12px"><div class="field sp"><label>Date</label><div class="in">Thu 22 Oct</div></div><div class="field sp"><label>Time</label><div class="in">12:00 pm</div></div><div class="field sp"><label>Duration</label><div class="in">30 min</div></div></div>
<div class="row" style="gap:10px"><div class="field sp"><label>Meeting link · optional</label><div class="in ph2">Paste link</div></div><div class="field sp"><label>Note · optional</label><div class="in ph2">Sleep and lunch timing</div></div></div><a class="btn s sm">{ic("cal",16)}Add to calendar</a></div>'''
rv=f'''<div class="wbody"><div class="col sp" style="gap:16px"><div><div class="eb">Weekly check-in · submitted Fri 16 Oct, 9:30 pm</div><h1 style="font-size:28px">Meera Iyer</h1></div>
<div class="wc" style="padding:18px 20px"><div class="row" style="gap:28px"><div><div class="xs muted">Energy</div><b class="b" style="font-size:20px">3 of 5</b></div><div><div class="xs muted">Hunger</div><b class="b" style="font-size:20px">4 of 5</b></div><div><div class="xs muted">Weight</div><b class="b" style="font-size:20px">68.2 kg</b></div><div><div class="xs muted">Waist</div><b class="b" style="font-size:20px">81 cm</b></div></div>
<div style="margin-top:16px" class="sm"><b class="b">What was hard?</b><p>Sleeping late after work, so skipping breakfast twice.</p></div></div>
<div class="wc" style="padding:18px 20px"><b class="b" style="font-size:17px">Your review</b><div class="seg" style="margin:12px 0;width:420px"><a>Acknowledged</a><a class="on">Needs follow-up</a><a>Adjust coaching</a></div><div class="field"><div class="in" style="height:70px;align-items:flex-start;padding-top:12px">Let's talk about moving lunch earlier. Breakfast can be simpler.</div></div>{prompt}
<div class="row" style="margin-top:16px;justify-content:flex-end;gap:8px"><a class="btn o sm">Cancel</a><a class="btn p sm">Save review</a></div></div></div></div>'''
save('203-trainer-web-checkin-review-schedule-call-v3-web',page(web('Check-ins / Meera Iyer',rv,'Check-ins'),1440,900,X))
modal=f'''<div class="scrim"></div><div class="modal"><div class="row"><b class="b sp" style="font-size:20px">Assign check-in to Arjun</b><a class="icb" style="border:0">{ic("x")}</a></div>
<div class="field" style="margin-top:14px"><label>Form</label><div class="in">Weekly check-in · 3 steps</div></div>
<div class="row" style="gap:10px"><div class="field sp"><label>Due</label><div class="in">Fri 23 Oct</div></div><div class="field sp"><label>Repeats</label><div class="in">Every Friday</div></div></div>
<div class="prm" style="margin-top:4px"><div class="row"><span style="color:#0E7490">{ic("phone",20)}</span><b class="b sp">Also schedule a call after it? <span class="xs muted" style="font-weight:500">Optional</span></b><span class="tog"></span></div>
<div class="row" style="gap:10px;margin-top:12px"><div class="field sp"><label>Date</label><div class="in">Sat 24 Oct</div></div><div class="field sp"><label>Time</label><div class="in">8:00 pm</div></div><div class="field sp"><label>Duration</label><div class="in">30 min</div></div></div>
<div class="field"><label>Meeting link · optional</label><div class="in ph2">Paste a Meet, Zoom or WhatsApp link</div></div><div class="field" style="margin:0"><label>Note · optional</label><div class="in ph2">Review his travel week</div></div></div>
<div class="row" style="margin-top:16px;justify-content:flex-end;gap:8px"><a class="btn o sm">Cancel</a><a class="btn p sm">Assign check-in and add call</a></div></div>'''
save('204-trainer-web-assign-checkin-schedule-call-v3-web',page(web('Clients / Arjun Kapoor','<div class="wbody"></div>'+modal,'Clients'),1440,900,X))
lock=f'''<div class="lock"><div class="sb" style="color:#fff"><span>10:45</span><span class="isl"></span><span></span></div><div style="text-align:center;margin-top:20px"><div style="font-size:18px;font-weight:600">Monday 19 October</div><div style="font-size:84px;font-weight:600;line-height:1.05">10:45</div></div>
<div style="position:absolute;left:0;right:0;bottom:120px"><div class="nt"><div class="h"><b style="color:var(--navy)">FitBud</b><span>Calendar</span><span class="sp"></span><span>now</span></div><b>Check-in call with Meera in 15 min</b><div class="sm">11:00 am · 30 min · Talk about sleep and lunch timing</div><div class="acts2"><a>Open link</a><a>Snooze 5 min</a></div></div>
<div class="nt"><div class="h"><b style="color:var(--navy)">FitBud</b><span>Sessions</span><span class="sp"></span><span>6:45 am</span></div><b>Morning strength at 7:30 am</b><div class="sm">Gold's Gym Andheri · 4 booked · Neha has 1 session left</div></div></div></div>'''
save('205-trainer-mobile-calendar-reminder-v3-ios',page(lock,extra=X))

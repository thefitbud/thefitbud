from fb import *
X='''.ss{background:#fff;border:1px solid var(--border);border-radius:20px;padding:14px;margin-bottom:10px}
.ss .tm{width:64px;flex:none}.ss .tm b{display:block;font-size:16px;color:var(--navy)}.ss .tm span{font-size:12px;color:var(--ink-500)}
.ss h4{font-size:16px;color:var(--navy);font-weight:600}.lb{font-size:12px;font-weight:700;color:var(--ink-500);letter-spacing:.2px;margin:14px 4px 8px}
.avs{display:flex}.avs .av{width:28px;height:28px;font-size:11px;margin-left:-6px;border:2px solid #fff}.avs .av:first-child{margin-left:0}
.warn{background:var(--attn-bg);border:1px solid var(--attn-line);color:var(--attn);border-radius:12px;padding:8px 10px;font-size:13px;display:flex;gap:8px;align-items:center;margin-top:10px}
.rc{display:flex;align-items:center;gap:10px;min-height:64px;padding:8px 12px;border-top:1px solid var(--border)}.rc:first-child{border-top:0}
.tri{display:flex;gap:4px}.tri a{min-width:44px;height:44px;border-radius:12px;border:1px solid var(--border-strong);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--ink-500);padding:0 8px}
.tri a.p{background:var(--pos-bg);border-color:var(--pos-line);color:var(--pos)}.tri a.l{background:var(--attn-bg);border-color:var(--attn-line);color:var(--attn)}.tri a.a{background:var(--crit-bg);border-color:var(--crit-line);color:var(--crit)}
.pol{font-size:12px;color:var(--ink-500);margin-top:2px}.pol a{color:var(--indigo);font-weight:700}
.gl{display:grid;grid-template-columns:1fr 72px 64px 48px;gap:6px;align-items:center;padding:8px 12px;border-top:1px solid var(--border);min-height:62px}
.gl .v{height:44px;border:1px solid var(--border-strong);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--navy)}.gl .v small{font-size:11px;color:var(--ink-500);margin-left:2px;font-weight:500}
.ck{width:48px;height:48px;border-radius:14px;border:1.5px solid var(--border-strong);display:flex;align-items:center;justify-content:center;color:var(--ink-400)}.ck.on{background:var(--navy);border-color:var(--navy);color:#fff}
.exh{display:flex;align-items:center;gap:10px;padding:12px;background:var(--lavender-50);border-bottom:1px solid var(--border)}
.pill2{display:inline-flex;height:26px;align-items:center;padding:0 10px;border-radius:13px;background:var(--lavender);color:var(--indigo);font-size:12px;font-weight:700}
.bb{position:absolute;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--border);padding:12px 16px 30px}
.kv2{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kv2 div{background:var(--lavender-50);border-radius:14px;padding:10px 12px}.kv2 span{font-size:12px;color:var(--ink-500)}.kv2 b{display:block;font-size:15px;color:var(--navy)}
.meter{display:flex;gap:4px;margin:10px 0 4px}.meter i{flex:1;height:8px;border-radius:4px;background:var(--indigo)}.meter i.u{background:var(--ink-200)}
'''
def ph(body,ov='',tab='Sessions',t='7:12'): return page(phone(body,tab=tab,tabs=TC,t=t,overlay=ov,badges={'Check-ins':2}),extra=X)
# 1 Sessions tab
s1=f'''<div class="top"><div><div class="eb">Mon 19 Oct · Gold's Gym Andheri</div><h1>Sessions</h1></div><a class="icb">{ic("plus")}</a></div>
<div class="seg"><a class="on">Today 5</a><a>Week</a><a>Agenda</a></div>
<div class="lb">NEEDS MARKING</div>
<div class="ss" style="border-color:var(--attn-line)"><div class="row"><div class="tm"><b>6:30 am</b><span>45 min</span></div><div class="sp"><h4>Arjun Kapoor</h4><div class="sm muted">Upper body A · 1:1 · In person</div></div></div><div class="row" style="margin-top:10px;gap:6px"><a class="btn sm" style="flex:1;background:var(--pos-bg);color:var(--pos);border-color:var(--pos-line)">{ic("check",16,w=2.2)}Attended</a><a class="btn o sm">No-show</a><a class="btn o sm">Late cancel</a></div><div class="pol" style="margin-top:6px">No-show or late cancel uses 1 of his 6 left. You can waive it.</div></div>
<div class="lb">NEXT · IN 18 MIN</div>
<div class="ss"><div class="row"><div class="tm"><b>7:30 am</b><span>60 min</span></div><div class="sp"><h4>Morning strength</h4><div class="sm muted">Group · Lower body B · 4 booked</div></div><div class="avs"><span class="av a1">RM</span><span class="av a2">NR</span><span class="av a3">DN</span><span class="av a4">MI</span></div></div><a class="btn p" style="width:100%;margin-top:12px">{ic("users",18)}Roll-call and start</a></div>
<div class="lb">LATER</div>
<div class="ss"><div class="row"><div class="tm"><b>11:00 am</b><span>30 min</span></div><div class="sp"><h4>Meera Iyer · check-in call</h4><div class="sm muted">Video call · link added</div></div><span class="chip sel">{ic("video",13)}Call</span></div></div>
<div class="ss"><div class="row"><div class="tm"><b>6:00 pm</b><span>60 min</span></div><div class="sp"><h4>Rohan Mehta</h4><div class="sm muted">Lower body B · 1:1 · 3 sessions left</div></div><span class="chip neu">{ic("pin",13)}Andheri</span></div></div>'''
save('IP-09-trainer-mobile-sessions-v3-ios',ph(s1))
# 2 roll-call
R=[('RM','a1','Rohan Mehta','p','Present','3 left · expires Sun 15 Nov'),('NR','a2','Neha Reddy','l','Late','Joined 7:38 am · 1 left'),('DN','a3','Deepak Nair','p','Present','8 left'),('MI','a4','Meera Iyer','a','Absent','No-show · uses 1 of 6 left · <a>Waive</a>')]
def tri(s): return '<div class="tri">'+''.join(f'<a class="{k if k==s else ""}">{n}</a>' for k,n in [('p','In'),('l','Late'),('a','Out')])+'</div>'
rows=''.join(f'<div class="rc"><span class="av {k}">{a}</span><div class="sp"><b class="b" style="font-size:15px">{n}</b><div class="pol">{pol}</div></div>{tri(s)}</div>' for a,k,n,s,_,pol in R)
s2=f'''<div class="row" style="padding:6px 0"><a class="icb" style="border:0">{ic("left")}</a><div class="sp"><div class="eb">Mon 19 Oct · 7:30 am – 8:30 am · Gold's Gym Andheri</div><b class="b" style="font-size:20px">Morning strength</b></div></div>
<div class="row" style="gap:6px;margin:6px 0 10px"><span class="chip navy">{ic("users",13)}Group</span><span class="chip neu">Lower body B · 5 exercises</span></div>
<div class="sec" style="margin-top:6px"><h3>Roll-call</h3><span>3 of 4 here</span></div><div class="card">{rows}</div>
<p class="xs muted" style="margin:10px 4px">Everyone starts as booked. Tap In, Late or Out. Absent uses a session (your rule: no-show counts). Late cancel within 12 h counts too. Change per client in Configure.</p>
<a class="btn o" style="width:100%">{ic("msg",18)}Message the batch on WhatsApp</a>'''
bb=f'<div class="bb"><a class="btn p" style="width:100%">{ic("play",18)}Start session with 3</a></div>'
save('IP-11-trainer-mobile-rollcall-v3-ios',page(phone(s2,t='7:31',overlay=bb),extra=X))
# 3 group log by exercise
G=[('RM','a1','Rohan','22.5','10','Back: keep it light',True),('NR','a2','Neha','17.5','12','',False),('DN','a3','Deepak','20','10','',False)]
gl=''.join(f'<div class="gl"><div class="row" style="gap:8px"><span class="av {k}" style="width:32px;height:32px;font-size:11px">{a}</span><div><b class="b" style="font-size:14px">{n}</b>{f"<div class=pol style=color:var(--attn)>{w}</div>" if w else "<div class=pol>Set 2 of 3</div>"}</div></div><span class="v">{kg}<small>kg</small></span><span class="v">{r}<small>reps</small></span><span class="ck {"on" if d else ""}">{ic("check",20,w=2.4)}</span></div>' for a,k,n,kg,r,w,d in G)
s3=f'''<div class="row" style="padding:6px 0"><a class="icb" style="border:0">{ic("left")}</a><div class="sp"><div class="eb">Morning strength · 3 present · 14 min</div><b class="b" style="font-size:20px">Group logging</b></div><a class="btn o sm">Finish</a></div>
<div class="seg" style="margin:6px 0 10px"><a class="on">By exercise</a><a>By client</a></div>
<div class="card" style="overflow:hidden"><div class="exh"><span class="pill2">2 of 5</span><div class="sp"><b class="b">Romanian deadlift</b><div class="xs muted">3 × 10 · rest 90 s · planned weights filled in</div></div></div>
<div class="gl" style="min-height:34px;font-size:11px;color:var(--ink-500);font-weight:700"><span>Client · set 2</span><span style="text-align:center">Kg</span><span style="text-align:center">Reps</span><span></span></div>{gl}</div>
<div class="lb">DOING SOMETHING ELSE</div><div class="card"><div class="rc"><span class="av a4" style="width:32px;height:32px;font-size:11px">MI</span><div class="sp"><b class="b" style="font-size:14px">Absent · Meera</b><div class="pol">Not part of group logging today</div></div></div></div>'''
bb3=f'<div class="toast" style="bottom:160px">{ic("check",18,w=2.4)}Set 1 logged for 3<a>Undo</a></div><div class="bb"><div class="xs muted" style="margin-bottom:8px">Neha and Deepak at the values shown. Rohan&#39;s set 2 is already logged.</div><a class="btn p" style="width:100%">{ic("check",18,w=2.4)}Log set 2 for 2 present</a></div>'
save('IP-12-trainer-mobile-group-log-v3-ios',page(phone(s3,t='7:46',overlay=bb3),extra=X))
# 4 single client in-session
st=[('1','20 × 10','22.5','10',True),('2','20 × 10','22.5','8',True),('3','20 × 10','22.5','10',False)]
gl4=''.join(f'<div class="gl" style="grid-template-columns:28px 1fr 72px 64px 48px"><span class="b">{n}</span><span class="xs muted">Last {p}</span><span class="v">{kg}<small>kg</small></span><span class="v">{r}<small>reps</small></span><span class="ck {"on" if d else ""}">{ic("check",20,w=2.4)}</span></div>' for n,p,kg,r,d in st)
s4=f'''<div class="row" style="padding:6px 0"><a class="icb" style="border:0">{ic("left")}</a><div class="sp"><div class="eb">Rohan Mehta · 6:00 pm · Andheri</div><b class="b" style="font-size:20px">Lower body B</b></div><a class="btn o sm">Finish</a></div>
<div class="row" style="gap:6px;margin:6px 0 10px"><span class="chip navy">Logged by you in person</span><span class="chip pos">Attended</span></div>
<div class="card" style="padding:12px 14px;margin-bottom:8px" ><div class="row"><span class="ck on" style="width:32px;height:32px">{ic("check",16,w=2.4)}</span><div class="sp"><b class="b">Goblet squat</b><div class="xs muted">3 × 10 · 16 kg · done</div></div></div></div>
<div class="card" style="overflow:hidden"><div class="exh"><span class="pill2">2 of 6</span><div class="sp"><b class="b">Romanian deadlift</b><div class="xs muted">3 × 10 · 22.5 kg · rest 90 s</div></div><span class="chip attn">Keep the back flat</span></div>{gl4}</div>
<div class="card" style="padding:12px 14px;margin-top:8px"><div class="row"><span class="pill2">3</span><div class="sp"><b class="b">Step-ups</b><div class="xs muted">3 × 10 each leg · bodyweight</div></div>{ic("down",18)}</div></div>
<p class="xs muted" style="margin:10px 4px">Rohan sees "Logged by Rahul in person" and can suggest a change, not edit.</p>'''
bb4=f'<div class="bb"><a class="btn p" style="width:100%">{ic("check",18,w=2.4)}Log set 3 · 22.5 kg × 10</a></div>'
save('IP-13-trainer-mobile-single-log-v3-ios',page(phone(s4,t='6:21',overlay=bb4),extra=X))
# 5 after-session quick log
qa=[('Goblet squat','3 × 10 · 16 kg',True),('Romanian deadlift','3 × 10 · 22.5 kg',True),('Step-ups','3 × 10 each leg',True),('Leg press','3 × 12 · 60 kg',False),('Seated calf raise','3 × 15 · 20 kg',True)]
qr=''.join(f'<div class="rc" style="min-height:56px"><span class="ck {"on" if d else ""}" style="width:40px;height:40px">{ic("check",18,w=2.4)}</span><div class="sp"><b class="b" style="font-size:15px">{n}</b><div class="pol">{p}{"" if d else " · <a>Adjust</a> · skipped?"}</div></div>{ic("edit",18,"var(--ink-400)")}</div>' for n,p,d in qa)
sh5=f'''<div class="scrim"></div><div class="sheet" style="top:110px"><div class="gr"></div><div class="eb">Ended 7:04 pm · 64 min</div><b class="b" style="font-size:20px">Log Rohan's session</b><p class="sm muted" style="margin:4px 0 10px">Everything starts as done as planned. Untick or adjust what changed.</p>
<div class="seg" style="margin-bottom:10px"><a class="on">Attended</a><a>No-show</a><a>Late cancel</a></div><div class="card">{qr}</div>
<div class="field" style="margin-top:12px"><label>Note for Rohan · optional</label><div class="in ph2">Strong session. Back flat on RDLs.</div></div>
<a class="btn p" style="width:100%">Save · 4 of 5 done · uses 1 session</a></div>'''
save('IP-14-trainer-mobile-after-quick-log-v3-ios',ph(s1,sh5,t='7:05'))
# 6 package card + renewal
s6=f'''<div class="row" style="padding:6px 0"><a class="icb" style="border:0">{ic("left")}</a><span class="av a2">NR</span><div class="sp"><b class="b" style="font-size:18px">Neha Reddy</b><div class="xs muted">Hybrid · Gold's Gym Andheri</div></div></div>
<div class="seg" style="margin:8px 0 12px"><a>Overview</a><a>Sessions</a><a class="on">Package</a></div>
<div class="card" style="padding:14px"><div class="row"><div class="sp"><b class="b" style="font-size:16px">12 sessions · in person</b><div class="xs muted">Started Mon 7 Sep · renews Mon 30 Nov</div></div><span class="chip attn">1 left</span></div>
<div class="meter">{'<i></i>'*11}<i class="u"></i></div><div class="xs muted">11 of 12 used · includes 1 no-show (Tue 13 Oct)</div>
<div class="kv2" style="margin-top:12px"><div><span>Amount</span><b>₹18,000</b></div><div><span>Payment</span><b style="color:var(--pos)">Paid · UPI</b></div><div><span>Paid on</span><b>Mon 7 Sep</b></div><div><span>Next due</span><b>Mon 30 Nov</b></div></div>
<p class="xs muted" style="margin-top:10px">For your records only. FitBud doesn't take payments.</p></div>
<div class="warn">{ic("alert",16)}2 sessions booked this week, 1 left in the pack.</div>
<div class="row" style="gap:8px;margin-top:12px"><a class="btn o" style="flex:1">{ic("msg",18)}WhatsApp Neha</a><a class="btn p" style="flex:1">Renew package</a></div>
<div class="sec"><h3>Recent</h3><a>All sessions</a></div><div class="card"><div class="rc"><div class="sp"><b class="b" style="font-size:14px">Sat 17 Oct · 6:30 pm</b><div class="pol">Lower body A</div></div><span class="chip pos">Attended</span></div><div class="rc"><div class="sp"><b class="b" style="font-size:14px">Tue 13 Oct · 6:30 am</b><div class="pol">Late cancel · counted · <a>Waive</a></div></div><span class="chip neu">Late cancel</span></div></div>'''
save('IP-15-trainer-mobile-package-v3-ios',ph(s6,tab='Clients',t='10:02'))
sh7=f'''<div class="scrim"></div><div class="sheet" style="top:96px"><div class="gr"></div><b class="b" style="font-size:20px">Renew Neha's package</b><p class="sm muted" style="margin:4px 0 12px">Plain fields, for your records. Nothing is charged.</p>
<div class="field"><label>Plan</label><div class="seg"><a class="on">Session pack</a><a>Monthly</a></div></div>
<div class="row" style="gap:10px"><div class="field sp"><label>Sessions</label><div class="in">12</div></div><div class="field sp"><label>Valid for</label><div class="in">60 days</div></div></div>
<div class="row" style="gap:10px"><div class="field sp"><label>Amount</label><div class="in">₹ 18,000</div></div><div class="field sp"><label>Starts</label><div class="in">Tue 1 Dec</div></div></div>
<div class="field"><label>Payment</label><div class="seg"><a>Paid</a><a class="on">Due</a></div></div>
<div class="field"><label>Mode · optional</label><div class="seg"><a>Cash</a><a class="on">UPI</a><a>Bank</a><a>Other</a></div></div>
<div class="row" style="justify-content:space-between;margin:2px 0 12px"><span class="sm">Carry over 1 unused session</span><span class="tog"></span></div>
<a class="btn p" style="width:100%">Save package · renews Tue 1 Dec</a><p class="xs muted" style="text-align:center;margin-top:8px">You'll get a reminder 3 days before it runs out.</p></div>'''
save('IP-15b-trainer-mobile-renew-package-v3-ios',ph(s6,sh7,tab='Clients',t='10:03'))
# 7 trainee suggest change
s8=f'''<div class="top"><div><div class="eb">Mon 19 Oct</div><h1>Workout</h1></div></div><div class="card" style="padding:14px"><b class="b" style="font-size:17px">Lower body B</b><div class="xs muted">Today · 6:04 pm · 52 min · Gold's Gym Andheri</div><span class="chip navy" style="margin-top:8px">Logged by Rahul in person</span></div>'''
sh8=f'''<div class="scrim"></div><div class="sheet" style="top:300px"><div class="gr"></div><b class="b" style="font-size:19px">Suggest a change to Rahul</b><p class="sm muted" style="margin:4px 0 12px">Rahul logged this, so he confirms changes. Romanian deadlift · set 2</p>
<div class="row" style="gap:10px"><div class="field sp"><label>Kg</label><div class="in">22.5</div></div><div class="field sp"><label>Reps</label><div class="in" style="border-color:var(--indigo)">12</div></div></div>
<div class="field"><label>Note · optional</label><div class="in ph2">I did 12, not 8</div></div><a class="btn p" style="width:100%">Send suggestion</a><p class="xs muted" style="text-align:center;margin-top:8px">Shows in Rahul's Needs you. He accepts with one tap.</p></div>'''
save('IP-16-trainee-suggest-change-v3-ios',page(phone(s8,tab='Workout',t='8:10',overlay=sh8),extra=X))
# 8 iPad group by exercise
IX=X+'.ip{width:1024px;height:768px;background:var(--page-web);display:flex;flex-direction:column}.ih{height:76px;background:#fff;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:14px;padding:0 20px}.ib{flex:1;display:flex;gap:16px;padding:16px 20px;min-height:0}.gl{grid-template-columns:1fr 110px 96px 56px 56px}.gl .v{height:48px}.ck{width:56px;height:56px}'
rows=''.join(f'<div class="gl"><div class="row"><span class="av {k}">{a}</span><div><b class="b">{n}</b><div class="pol">{w or "Set 2 of 3 · last time "+kg+" × "+r}</div></div></div><span class="v">{kg}<small>kg</small></span><span class="v">{r}<small>reps</small></span><span class="ck {"on" if d else ""}">{ic("check",22,w=2.4)}</span><span class="ck" style="border:0">{ic("more",20)}</span></div>' for a,k,n,kg,r,w,d in G)
ip=f'''<div class="ip"><div class="ih"><a class="icb">{ic("left")}</a><div class="sp"><b class="b" style="font-size:20px">Morning strength · Lower body B</b><div class="xs muted">Gold's Gym Andheri · started 7:32 am · 3 of 4 here</div></div><a class="btn o sm">Roll-call</a><a class="btn p sm">Finish session</a></div>
<div class="ib"><div class="col" style="width:240px;gap:8px">{''.join(f'<div class="card row" style="padding:12px;{"border-color:var(--indigo);background:var(--lavender-50)" if i==1 else ""}"><span class="pill2">{i+1}</span><div class="sp"><b class="b" style="font-size:14px">{n}</b><div class="xs muted">{s}</div></div></div>' for i,(n,s) in enumerate([("Goblet squat","3 of 3 logged for all"),("Romanian deadlift","Set 2 · 1 of 3 done"),("Step-ups","Next"),("Leg press","Later"),("Seated calf raise","Later")]))}</div>
<div class="card sp" style="overflow:hidden;position:relative"><div class="exh"><span class="pill2">2 of 5</span><div class="sp"><b class="b" style="font-size:18px">Romanian deadlift</b><div class="xs muted">3 × 10 · rest 90 s · planned weights filled in, tap a value to change</div></div><div class="seg"><a>Set 1</a><a class="on">Set 2</a><a>Set 3</a></div></div>{rows}
<div class="lb" style="margin:14px 12px 6px">NOT IN THIS EXERCISE</div><div class="rc"><span class="av a4">MI</span><div class="sp"><b class="b">Meera Iyer</b><div class="pol">Absent · no-show uses 1 of 6 left · <a>Waive</a></div></div></div>
<div style="position:absolute;left:0;right:0;bottom:0;border-top:1px solid var(--border);padding:12px 16px;display:flex;align-items:center;gap:12px;background:#fff"><span class="sm muted sp">Neha and Deepak at the values shown</span><a class="btn p">{ic("check",18,w=2.4)}Log set 2 for 2 present</a></div></div></div></div>'''
save('IP-05-ipad-group-session-v3-ipad',page(ip,1024,768,IX))

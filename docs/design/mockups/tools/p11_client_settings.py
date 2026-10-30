# Client Overview (v3) + Reminders drawer 181 + header ⋯ menu (208/208b) + Client settings (209–212) + IP-08 (package records in Client settings)
from cw import *
X='''.ov{display:grid;grid-template-columns:1fr 340px;gap:16px;flex:1;min-height:0}.ov>div{display:flex;flex-direction:column;gap:14px;min-width:0}
.sc{background:#fff;border:1px solid var(--border);border-radius:16px;padding:14px 16px}.sc .hd{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-500);font-weight:600}.sc .hd a{margin-left:auto;color:var(--indigo);font-weight:700;min-height:32px;display:flex;align-items:center}
.sc h4{font-size:16px;color:var(--navy);font-weight:600;margin-top:6px}.sc p{font-size:13px;color:var(--ink-500);margin-top:2px}
.sc.focus{box-shadow:0 0 0 3px var(--indigo);border-color:var(--indigo)}
.wk7{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-top:10px}.wk7 div{border:1px solid var(--border);border-radius:12px;padding:8px;text-align:center;font-size:12px;color:var(--ink-500)}.wk7 div b{display:block;font-size:15px;color:var(--navy)}.wk7 div.td{border-color:var(--indigo);box-shadow:inset 0 0 0 1px var(--indigo)}
.cs{display:grid;grid-template-columns:230px 1fr;gap:20px;flex:1;min-height:0}
.snav{display:flex;flex-direction:column;gap:2px}.snav a{min-height:44px;display:flex;align-items:center;gap:10px;padding:0 12px;border-radius:10px;font-size:14px;color:var(--ink-700)}.snav a.on{background:var(--lavender);color:var(--indigo);font-weight:700}
.scol{display:flex;flex-direction:column;gap:14px;min-width:0;overflow:hidden}
.card2{background:#fff;border:1px solid var(--border);border-radius:16px;padding:18px 20px}.card2 .ch{display:flex;align-items:center;gap:10px;margin-bottom:14px}.card2 .ch b{font-size:17px;color:var(--navy);font-weight:600}.card2 .ch .sp{min-width:0}
table.t2{width:100%;border-collapse:collapse;font-size:14px}.t2 th{text-align:left;font-size:12px;color:var(--ink-500);font-weight:600;padding:8px 10px;border-bottom:1px solid var(--border)}.t2 td{padding:10px;border-bottom:1px solid var(--border);color:var(--ink-700)}.t2 td b{color:var(--navy);font-weight:600}
.dots2{display:flex;gap:4px;margin-top:8px}.dots2 i{flex:1;height:6px;border-radius:3px;background:var(--indigo)}.dots2 i.o{background:var(--ink-200)}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.g3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px}
.ch2{display:flex;gap:8px;flex-wrap:wrap}.ch2 a{height:44px;padding:0 14px;border-radius:22px;border:1px solid var(--border-strong);display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:var(--ink-700)}.ch2 a.on{background:var(--sel-bg);border-color:#D6CFFF;color:var(--sel)}
.errsum{display:flex;gap:8px;align-items:center;background:var(--crit-bg);border:1px solid var(--crit-line);color:var(--crit);border-radius:12px;padding:10px 12px;font-size:13px;font-weight:600}
.cm a{height:auto!important;width:auto!important;padding:8px 12px!important}.note{position:absolute;z-index:6;background:#FFF5F8;border:1.5px dashed var(--soft-coral);color:#9B1C46;border-radius:12px;padding:8px 12px;font-size:12px;font-weight:600;width:230px}
.attnb{display:flex;gap:10px;align-items:center;background:var(--attn-bg);border:1px solid var(--attn-line);color:var(--attn);border-radius:12px;padding:8px 8px 8px 12px;font-size:13px}
'''
def overview(k='rohan',focus=False):
    left=f'''<div class="sc"><div class="hd">{ic("alert",15)}Needs attention<a>Review</a></div><h4>Missed workout · Tue 13 Oct</h4><p>Lower body A was planned for 7:00 pm and wasn\'t logged. Open 5 d · 3 open items.</p></div>
<div class="sc"><div class="hd">{ic("cal",15)}This week · Mon 12 – Sun 18 Oct · week 6</div><div class="wk7">'''+''.join(f'<div class="{"td" if d=="Sun" else ""}">{d}<b>{n}</b>{s}</div>' for d,n,s in [('Mon',12,'Upper A · done'),('Tue',13,'Lower A · missed'),('Wed',14,'Rest'),('Thu',15,'Upper B · missed'),('Fri',16,'Rest'),('Sat',17,'Lower B · done'),('Sun',18,'Rest')])+f'''</div><div class="row" style="gap:28px;margin-top:12px;font-size:13px"><span><b class="b">2</b> of 4 workouts done</span><span><b class="b">18</b> of 25 meals logged so far</span><span>Check-in submitted Fri</span></div></div>
<div class="sc"><div class="hd">{ic("clock",15)}Recent activity<a>View all activity</a></div>'''+''.join(f'<div class="row" style="min-height:40px;font-size:13px;border-top:1px solid var(--border);margin-top:6px"><span class="sp">{a}</span><span class="muted">{b}</span></div>' for a,b in [('Logged lunch as planned · rajma, jeera rice','Sun 1:42 pm'),('Logged breakfast · vegetable poha, curd','Sun 9:05 am'),('Finished Lower body B · 46 min','Sat 7:52 pm')])+'</div>'
    right=f'''<div class="sc"><div class="hd">{ic("clip",15)}Check-in<a>Open</a></div><h4>Weekly check-in</h4><p>Submitted Fri 16 Oct, 9:30 pm · waiting for your review</p></div>
<div class="sc"><div class="hd">{ic("dumbbell",15)}Plan<a>Open plan</a></div><h4>Fat loss · phase 2</h4><p>4 workouts a week · 1,950 kcal, 4 meals a day</p></div>
<div class="sc {"focus" if focus else ""}"><div class="hd">{ic("bell",15)}Reminders<a>Details</a></div><h4>Responds to reminders</h4><p>Last 14 days · logged 19 of 56 reminded items within 2 h · quiet hours 10:00 pm – 7:00 am</p></div>
<div class="sc"><div class="hd">{ic("chart",15)}Progress<a>View</a></div><h4>86.4 kg</h4><p>−2.7 kg since Mon 24 Aug · last weigh-in Fri 16 Oct</p></div>'''
    return f'<div class="ov"><div>{left}</div><div>{right}</div></div>'
# 181 Reminders drawer, opened from the Overview Reminders card → Details
def cat(t,rows): return f'<div><div class="lab">{t}</div><div class="kv2" style="margin-top:8px;grid-template-columns:200px 1fr">'+''.join(f'<span>{a}</span><span>{b}</span>' for a,b in rows)+'</div></div>'
drw=f'''<div class="scrimw"></div><aside class="drw" aria-label="Reminders for Rohan"><div class="dh"><span class="av a1">RM</span><div class="sp"><b class="b" style="font-size:18px">Reminders · Rohan Mehta</b><div class="xs muted">Last 14 days · Mon 5 Oct – Sun 18 Oct</div></div><a class="icb" style="border:0" aria-label="Close">{ic("x")}</a></div>
<div class="db"><div class="card2" style="padding:14px 16px;background:var(--lavender-50);border-color:#E3DEFB"><div class="lab">SUMMARY</div><b class="b" style="font-size:17px;display:block;margin-top:4px">Responds to reminders</b><p class="sm muted">Most reminded items were logged within 2 h of the reminder.</p></div>
{cat('WORKOUTS',[('Sent','6'),('Opened','2'),('Logged after reminder','1'),('Logged on own','4'),('Not logged','1')])}
{cat('MEALS',[('Sent','48'),('Opened','21'),('Logged after reminder','18'),('Logged on own','30'),('Suppressed','6 · quiet hours or already logged')])}
{cat('CHECK-INS',[('Sent','2'),('Opened','2'),('Logged after reminder','1'),('Logged on own','1')])}
{cat("ROHAN'S SETTINGS",[('Workout time','7:00 pm · set by Rohan'),('Quiet hours','10:00 pm – 7:00 am'),('WhatsApp reminders','Coming soon')])}
<p class="xs muted">Reminders are timed by FitBud and respect Rohan\'s settings and meal times. Switch categories on or off in Plan › Coaching setup.</p></div><div class="df"><span class="xs muted">Opened from Overview › Reminders › Details</span><span class="sp"></span><a class="btn o sm">Open coaching setup</a><a class="btn p sm">Close</a></div></aside>'''
save('181-trainer-web-reminders-panel-v3-web',wpage('rohan',overview(focus=True),overlay=drw,extra=X))
# 208 header ⋯ menu open (web) over Overview
save('208-trainer-web-client-menu-v3-web',wpage('rohan',overview(),overlay=menu('rohan',top=170,right=28),menu_open=True,extra=X))
# 208b iPad ⋯ menu
save('208b-ipad-client-menu-v3-ipad',ipage('rohan',overview().replace('grid-template-columns:1fr 340px','grid-template-columns:1fr 300px'),overlay=menu('rohan',top=76,right=20),menu_open=True,extra=X+'.ov{grid-template-columns:1fr 300px}'))
# Client settings page
NAV=lambda on,ended=False:'<nav class="snav" aria-label="Client settings sections"><div class="lab" style="padding:4px 12px 8px">CLIENT SETTINGS</div>'+''.join(f'<a class="{"on" if n==on else ""}">{ic(i,16)}{n}</a>' for i,n in [('user','Basic details'),('card','Subscription & package'),('users','Coaching relationship')])+f'<div style="margin-top:14px;padding:12px;border-radius:12px;background:#fff;border:1px solid var(--border);font-size:13px;color:var(--ink-500)">Goal, expectations, check-ins and reminders are coaching, so they live in <span style="color:var(--indigo);font-weight:600">Plan › Coaching setup</span>.</div></nav>'
def basic(name,rows,ro=False,src='From intake · Mon 24 Aug'):
    ed='' if ro else f'<a class="btn o sm">{ic("edit",15)}Edit</a>'
    return f'<section class="card2"><div class="ch"><b>Basic details</b><span class="xs muted">{src}</span><span class="sp" style="flex:1"></span>{ed}</div><div class="kv2" style="grid-template-columns:150px 1fr 150px 1fr">'+''.join(f'<span>{a}</span><span>{b}</span>' for a,b in rows)+'</div></section>'
RB=[('Name','Rohan Mehta'),('Phone · WhatsApp','+91 90000 00008'),('Email','mehta.r29@gmail.com'),('Date of birth','Fri 14 Mar 1997 · 29'),('Sex','Male'),('Height','176 cm'),('City','Pune'),('Time zone','India (IST)')]
def payrows(rows,ro=False): return '<table class="t2"><tr><th>Date</th><th>For</th><th>Amount</th><th>Status</th><th>Method</th></tr>'+''.join(f'<tr><td>{d}</td><td>{f}</td><td><b>{a}</b></td><td>{s}</td><td>{m}</td></tr>' for d,f,a,s,m in rows)+'</table>'
PAID='<span class="chip pos">Paid</span>';DUE='<span class="chip neu">Unpaid</span>'
def subs(plan,freq,start,renew,renchip,pays,pkg,ro=False):
    ed='' if ro else f'<a class="btn o sm">{ic("edit",15)}Edit</a>'
    add='' if ro else '<a style="color:var(--indigo);font-weight:600;font-size:14px;min-height:44px;display:flex;align-items:center">+ Add payment record</a>'
    return f'''<section class="card2"><div class="ch"><b>Subscription & package</b>{renchip}<span class="sp" style="flex:1"></span>{ed}</div><div class="kv2" style="grid-template-columns:150px 1fr 150px 1fr"><span>Plan</span><span>{plan}</span><span>Payment frequency</span><span>{freq}</span><span>Started</span><span>{start}</span><span>Renews</span><span>{renew}</span></div>
{pkg}<div class="row" style="margin-top:16px"><div class="lab">PAYMENT RECORDS · TRACKING ONLY</div><span class="sp"></span>{add}</div>{payrows(pays)}<p class="xs muted" style="margin-top:8px">Payment records are for your own tracking. FitBud doesn\'t collect payments, send invoices or remind clients to pay.</p></section>'''
NOPKG='<div class="ro" style="margin-top:14px">'+ic("cal",16)+'No session package. Rohan is coached online; packages are for in-person or hybrid clients.<a style="margin-left:auto;color:var(--indigo);font-weight:600">Add package</a></div>'
def rel(since,ended=False):
    if ended: return f'<section class="card2"><div class="ch"><b>Coaching relationship</b></div><div class="kv2"><span>Coached</span><span>Mon 6 Jul – Sat 3 Oct</span><span>Reason</span><span>Completed program</span></div><p class="xs muted" style="margin-top:10px">To coach Kavya again, use Reactivate coaching in the header.</p></section>'
    return f'<section class="card2"><div class="ch"><b>Coaching relationship</b></div><div class="row"><div class="kv2" style="flex:1"><span>Coaching since</span><span>{since}</span><span>Mode</span><span>Online</span></div><a class="btn dg sm">{ic("stop",15)}End coaching…</a></div></section>'
def settings_page(k,on,cols,ro=False,overlay='',crumb_extra=' / Client settings'):
    title=f'<div class="row"><a class="btn o sm">{ic("left",15)}Overview</a><b class="b" style="font-size:20px;font-weight:600;margin-left:6px">Client settings</b><span class="sp"></span><span class="xs muted">Only you see these. They don\'t change {C[k]["first"]}\'s plan.</span></div>'
    return wpage(k,title+f'<div class="cs">{NAV(on,ro)}<div class="scol">{cols}</div></div>',tab=None,crumb=C[k]['n']+crumb_extra,overlay=overlay,extra=X,count=0 if ro else 1)
RP=[('Mon 24 Aug','Month 1','₹6,000',PAID,'UPI'),('Thu 24 Sep','Month 2','₹6,000',PAID,'UPI'),('Sat 24 Oct','Month 3','₹6,000',DUE,'—')]
ren='<span class="chip attn">Renews in 6 d</span>'
rohan_cols=basic('Rohan Mehta',RB)+subs('Fat Loss 12-week','Monthly','Mon 24 Aug','Sat 24 Oct',ren,RP,NOPKG)+rel('Mon 24 Aug · 8 weeks')
save('209-trainer-web-client-settings-v3-web',settings_page('rohan','Basic details',rohan_cols))
# 210 edit basic details drawer
def wf(l,v,hp='',err='',dis=False): return f'<div class="wf"><label>{l}</label><div class="in {"err" if err else ""} {"dis" if dis else ""}">{v}</div>{f"<span class=er>{ic(chr(97)+chr(108)+chr(101)+chr(114)+chr(116),13)}{err}</span>" if err else ""}{f"<span class=hp>{hp}</span>" if hp else ""}</div>'
ed=f'''<div class="scrimw"></div><aside class="drw" aria-label="Edit basic details"><div class="dh"><b class="b" style="font-size:18px">Edit basic details</b><span class="sp"></span><a class="icb" style="border:0" aria-label="Close">{ic("x")}</a></div><div class="db">
{wf('Name','Rohan Mehta','Shown on Home, Clients and in WhatsApp drafts.')}<div class="g2">{wf('Phone · WhatsApp','<span class=muted>+91</span>90000 00008','Message on WhatsApp opens this number.')}{wf('Email','mehta.r29@gmail.com')}</div>
<div class="g3">{wf('Date of birth','Fri 14 Mar 1997'+ic("cal",15).replace('class="ic"','class="ic" style="margin-left:auto"'))}{wf('Sex','Male'+ic("down",15).replace('class="ic"','class="ic" style="margin-left:auto"'))}{wf('Height','176 <span class=muted>cm</span>')}</div>
<div class="g2">{wf('City','Pune')}{wf('Time zone','India (IST)'+ic("down",15).replace('class="ic"','class="ic" style="margin-left:auto"'),'Reminders and day boundaries follow this.')}</div>
<p class="xs muted">Start weight and diet preference are coaching details; edit them in Plan › Coaching setup.</p></div><div class="df"><span class="sp"></span><a class="btn o sm">Cancel</a><a class="btn p sm">Save changes</a></div></aside>'''
save('210-trainer-web-client-basic-edit-v3-web',settings_page('rohan','Basic details',rohan_cols,overlay=ed))
# Neha (hybrid): package records
PKG=f'''<div style="margin-top:16px;border:1px solid var(--border);border-radius:14px;padding:14px 16px"><div class="row"><div class="sp"><b class="b" style="font-size:16px">12 sessions · in person</b><div class="xs muted">Started Mon 7 Sep · ends Mon 30 Nov · carry-over on</div></div><span class="chip attn">1 left</span><a class="btn s sm">Renew package</a></div><div class="dots2">{"<i></i>"*11}<i class="o"></i></div><div class="row" style="margin-top:8px;font-size:13px"><span>11 of 12 used · includes 1 late cancel (Tue 13 Oct)</span><span class="sp"></span><span class="muted">Counts as used: attended, late cancel under 12 h, no-show</span></div></div>
<div class="attnb" style="margin-top:10px">{ic("alert",15)}1 session left after Tue 20 Oct. Neha has 2 sessions booked this week.<a class="btn o sm" style="margin-left:auto;height:40px">{ic("msg",15)}Message Neha on WhatsApp</a></div>'''
NP=[('Mon 7 Sep','12 sessions','₹18,000',PAID,'UPI'),('Mon 13 Jul','8 sessions','₹12,000',PAID,'Cash')]
neha_basic=basic('Neha Reddy',[('Name','Neha Reddy'),('Phone · WhatsApp','+91 90000 00016'),('Email','neha.r.fit@gmail.com'),('Date of birth','Tue 9 Feb 1995 · 31'),('Sex','Female'),('Height','162 cm'),('City','Mumbai'),('Time zone','India (IST)')],src='From intake · Mon 13 Jul')
past='<section class="card2"><div class="ch"><b>Past packages</b></div><table class="t2"><tr><th>Package</th><th>Sessions</th><th>Dates</th><th>Status</th></tr><tr><td><b>8 sessions · in person</b></td><td>8 used · 0 left</td><td>Mon 13 Jul – Fri 4 Sep</td><td><span class="chip neu">Used up</span></td></tr><tr><td><b>4 group sessions</b></td><td>3 used · 1 unused</td><td>Mon 3 Aug – Mon 31 Aug</td><td><span class="chip neu">Expired</span></td></tr></table></section>'
recent=f'<section class="card2"><div class="ch"><b>Sessions in this package</b><span class="sp" style="flex:1"></span><a style="color:var(--indigo);font-weight:600;font-size:14px">Open in Sessions {ic("right",14)}</a></div><table class="t2"><tr><th>When</th><th>Session</th><th>Attendance</th></tr><tr><td>Sat 17 Oct · 6:30 pm</td><td>Lower body A · Gold\'s Gym Andheri</td><td><span class="chip attn">Mark attendance</span></td></tr><tr><td>Thu 15 Oct · 6:00 pm</td><td>Upper body B · Gold\'s Gym Andheri</td><td><span class="chip pos">Attended</span></td></tr><tr><td>Tue 13 Oct · 6:30 am</td><td>Lower body A · Gold\'s Gym Andheri</td><td><span class="chip neu">Late cancel · counted</span></td></tr></table></section>'
neha_subs=subs('Hybrid coaching','Monthly','Mon 7 Sep','Sat 7 Nov','',NP,PKG)
save('IP-08-trainer-web-client-settings-package-v3-web',settings_page('neha','Subscription & package',neha_subs+recent+past))
# 211 edit subscription & package (Neha) and 211b validation
def subedit(err=False):
    rd=wf('Renewal date','Mon 31 Aug'+ic("cal",15).replace('class="ic"','class="ic" style="margin-left:auto"'),err='Renewal date must be after the start date, Mon 7 Sep.') if err else wf('Renewal date','Sat 7 Nov'+ic("cal",15).replace('class="ic"','class="ic" style="margin-left:auto"'),'Home shows a renewal reminder 7 days before.')
    es=f'<div class="errsum" role="alert">{ic("alert",16)}Fix 1 field to save: Renewal date</div>' if err else ''
    save_btn='<a class="btn dis sm" aria-disabled="true">Save changes</a>' if err else '<a class="btn p sm">Save changes</a>'
    return f'''<div class="scrimw"></div><aside class="drw" aria-label="Edit subscription and package"><div class="dh"><b class="b" style="font-size:18px">Edit subscription & package</b><span class="sp"></span><a class="icb" style="border:0" aria-label="Close">{ic("x")}</a></div><div class="db" style="gap:14px">{es}
{wf('Plan name','Hybrid coaching')}<div class="wf"><label>Payment frequency</label><div class="seg2"><a>Weekly</a><a class="on">Monthly</a><a>Quarterly</a><a>Yearly</a></div></div>
<div class="g2">{wf('Start date','Mon 7 Sep'+ic("cal",15).replace('class="ic"','class="ic" style="margin-left:auto"'))}{rd}</div>
<div class="lab" style="margin-top:4px">PACKAGE · IN-PERSON SESSIONS · MON 7 SEP – MON 30 NOV</div><div class="g3">{wf('Sessions included','12')}{wf('Used so far','11',hp='Counted from Sessions',dis=True)}{wf('Carried over','0')}</div>
<div class="wf"><label>Counts as used</label><div class="ch2"><a class="on">{ic("check",14,w=2.4)}Attended</a><a class="on">{ic("check",14,w=2.4)}Late cancel under 12 h</a><a class="on">{ic("check",14,w=2.4)}No-show</a></div></div>
<div class="row"><span class="sm">Carry unused sessions into the next package</span><span class="sp"></span><span class="tog"></span></div>
<div class="lab" style="margin-top:4px">PAYMENT RECORD · TRACKING ONLY</div><div class="g3">{wf('Amount','₹ 18,000')}<div class="wf"><label>Status</label><div class="seg2"><a class="on">Paid</a><a>Unpaid</a></div></div>{wf('Paid on','Mon 7 Sep')}</div><div class="wf"><label>Method</label><div class="ch2"><a>Cash</a><a class="on">UPI</a><a>Bank</a><a>Other</a></div></div>
</div><div class="df"><span class="xs muted">Tracking only. FitBud doesn\'t collect payments.</span><span class="sp"></span><a class="btn o sm">Cancel</a>{save_btn}</div></aside>'''
save('211-trainer-web-client-subscription-edit-v3-web',settings_page('neha','Subscription & package',neha_subs+recent,overlay=subedit()))
save('211b-trainer-web-client-subscription-error-v3-web',settings_page('neha','Subscription & package',neha_subs+recent,overlay=subedit(True)))
# 212 ended client read-only (Kavya)
KP=[('Mon 6 Jul','Quarter','₹15,000',PAID,'Bank')]
kav=f'<div class="ro">{ic("lock",16)}Coaching with Kavya ended Sat 3 Oct. Client settings are read-only.</div>'+basic('Kavya Nair',[('Name','Kavya Nair'),('Phone · WhatsApp','+91 90000 00012'),('Email','kavya.nair.k@gmail.com'),('Date of birth','Sat 21 Jun 1999 · 27'),('Sex','Female'),('Height','158 cm'),('City','Kochi'),('Time zone','India (IST)')],ro=True,src='From intake · Mon 6 Jul')+subs('Fat Loss 12-week','Quarterly','Mon 6 Jul','Ended Sat 3 Oct','<span class="chip neu">Ended</span>',KP,'',ro=True)+rel('',ended=True)
save('212-trainer-web-client-settings-ended-v3-web',settings_page('kavya','Basic details',kav,ro=True))
# 209b iPad client settings
ipcols=basic('Rohan Mehta',RB).replace('grid-template-columns:150px 1fr 150px 1fr','grid-template-columns:130px 1fr 110px 1fr')+subs('Fat Loss 12-week','Monthly','Mon 24 Aug','Sat 24 Oct',ren,RP,NOPKG).replace('grid-template-columns:150px 1fr 150px 1fr','grid-template-columns:130px 1fr 110px 1fr')
ititle=f'<div class="row"><a class="btn o sm">{ic("left",15)}Overview</a><b class="b" style="font-size:20px;font-weight:600;margin-left:6px">Client settings</b></div><div class="seg2" style="align-self:flex-start"><a class="on">Basic details</a><a>Subscription & package</a><a>Coaching relationship</a></div>'
save('209b-ipad-client-settings-v3-ipad',ipage('rohan',ititle+f'<div class="scol">{ipcols}</div>',tab=None,extra=X))

# 03c Overview: Reminders card is the entry to 181 (TW-31: side card on Overview → Details)
nt='<div class="note" style="top:740px;right:380px;box-shadow:0 0 0 6px var(--page-web)">Design note · Details opens the Reminders panel (frame 181). Also reachable from the review panel and check-in review.</div>'
save('03c-trainer-web-client-overview-reminders-v3-web',wpage('rohan',overview(focus=True),overlay=nt,extra=X))

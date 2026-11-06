"""DS8 trainer mobile in-person workout logging (drawn 4 Nov 2026 by FitBud UI for Firoz's review; PLAN-v2 D-P2-15).
Specs: Z10-16 (start + single live), Z10-17 (parallel live), Z10-18 (log form), Z9-11 (trainee read-only).
Phone 390x844 @3x. Reuses the trainee set-entry row and kg keypad from p15_workout_entry.py (frames 11/11b/11c).
Run from docs/design/mockups/: python3 tools/ds8_frames.py   (writes html/<name>.html)
Render: PW_DIR=<folder with playwright-core> node tools/ds5_render.mjs $(python3 tools/ds8_frames.py --list)"""
import sys
sys.path.insert(0, 'tools')
from fb import *
_src = open('tools/p15_workout_entry.py').read().split('def hdr')[0].replace('from fb import *', '')
exec(_src)  # X, sr, cell, pad from the approved trainee set entry (no frames written)
P15 = X
D = P15 + '''
.ph{width:390px;height:844px}
.nv{display:flex;align-items:center;gap:8px;height:52px}.nv b{flex:1;font-size:17px;color:var(--navy);text-align:center}
.lab{font-size:12px;font-weight:700;color:var(--ink-500);letter-spacing:.3px;margin:14px 2px 8px}
.cl{display:flex;align-items:center;gap:12px;min-height:60px;padding:8px 14px;border-top:1px solid var(--border)}.cl:first-child{border-top:0}
.cl .t{flex:1;min-width:0}.cl .t b{display:block;font-size:15px;color:var(--navy);font-weight:600}.cl .t span{font-size:12px;color:var(--ink-500)}
.cl.dis{opacity:.55}
.cb{width:24px;height:24px;border-radius:7px;border:1.5px solid var(--border-strong);display:flex;align-items:center;justify-content:center;flex:none;background:#fff}.cb.on{background:var(--indigo);border-color:var(--indigo)}
.mode{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--border-strong);border-radius:16px;padding:14px;min-height:64px;background:#fff}.mode.on{border-color:var(--indigo);background:var(--lavender-50);box-shadow:0 0 0 3px var(--lavender)}
.mode i{width:22px;height:22px;border-radius:11px;border:2px solid var(--border-strong);flex:none;margin-top:1px}.mode.on i{border:7px solid var(--indigo)}
.mode b{display:block;color:var(--navy);font-size:15px}.mode span{font-size:13px;color:var(--ink-500);line-height:18px}
.bb{position:absolute;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--border);padding:12px 16px 30px;z-index:3}
.info{display:flex;gap:10px;align-items:flex-start;background:var(--neu-bg);border:1px solid var(--neu-line);border-radius:14px;padding:10px 12px;font-size:13px;color:var(--neu);line-height:18px}
.info.warn{background:var(--attn-bg);border-color:var(--attn-line);color:var(--attn)}.info.ok{background:var(--pos-bg);border-color:var(--pos-line);color:var(--pos)}.info.crit{background:var(--crit-bg);border-color:var(--crit-line);color:var(--crit)}
.chs{display:flex;gap:8px;overflow:hidden;padding:2px 0 8px}
.cc{display:flex;align-items:center;gap:8px;height:52px;padding:0 12px 0 6px;border-radius:26px;border:1px solid var(--border-strong);background:#fff;flex:none}
.cc.on{border-color:var(--indigo);background:var(--lavender-50);box-shadow:0 0 0 2px var(--indigo)}.cc .av{width:38px;height:38px;font-size:12px}
.cc .t b{display:block;font-size:13px;color:var(--navy);line-height:16px}.cc .t span{font-size:11px;color:var(--ink-500);line-height:14px}
.pr{width:38px;height:4px;border-radius:2px;background:var(--ink-200);overflow:hidden;margin-top:3px}.pr i{display:block;height:4px;background:var(--indigo)}.pr.dn i{background:var(--pos)}
.timer{display:flex;align-items:center;gap:10px;background:var(--navy);color:#fff;border-radius:14px;padding:6px 6px 6px 14px;font-size:14px;font-weight:600;margin-top:10px}
.timer a{height:44px;padding:0 12px;border-radius:12px;background:rgba(255,255,255,.12);display:flex;align-items:center;font-size:13px}
.dts{display:flex;gap:6px}.dts a{flex:1;height:64px;border-radius:14px;border:1px solid var(--border-strong);display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:12px;color:var(--ink-500);background:#fff}
.dts a b{font-size:17px;color:var(--navy)}.dts a.on{border-color:var(--indigo);background:var(--lavender-50);box-shadow:0 0 0 2px var(--indigo)}.dts a.dis{background:var(--hover);color:var(--ink-400);border-style:dashed}.dts a.dis b{color:var(--ink-400)}
.fx{padding:12px 14px;margin-top:10px}.fx .h{display:flex;align-items:center;gap:10px;margin-bottom:8px}.fx .h b{flex:1;font-size:15px;color:var(--navy)}
.sk{height:14px;border-radius:7px;background:var(--hover)}
.tag{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:14px;background:var(--lavender);color:var(--indigo);font-size:12px;font-weight:700}
'''
OUT = []
def S(n, inner, overlay='', t='7:32'): save(n, page(f'<div class="ph">{sbar("ios",t)}<div class="aw">{inner}</div>{overlay}</div>', 390, 844, D)); OUT.append(n)
def nav(title, sub='', right=''): return f'<div class="nv"><a class="icb" style="border:0;background:transparent" aria-label="Back">{ic("left",22)}</a><b>{title}{f"<div class=\'xs muted\' style=\'font-weight:500\'>{sub}</div>" if sub else ""}</b>{right or "<span style=width:44px></span>"}</div>'
def cb(on): return f'<span class="cb {"on" if on else ""}">{ic("check",14,"#fff",3) if on else ""}</span>'
H = '<div class="sh"><span>SET</span><span>PLANNED</span><span>LOAD</span><span>REPS</span><span></span></div>'
CL = [('NR','a2','Neha Reddy','Lower body B · today',True,''),('RM','a1','Rohan Mehta','Upper body A · today',True,''),('DN','a3','Deepak Nair','Full body · today',True,''),('MI','a4','Meera Iyer','Rest day today',False,''),('VS','a5','Vikram Singh','Coaching ended · read-only',False,'dis')]
def clrow(a,k,n,s,on,cls): return f'<div class="cl {cls}">{cb(on)}<span class="av {k}">{a}</span><div class="t"><b>{n}</b><span>{s}</span></div></div>'

# (a1) start: pick clients + mode
a1 = nav('Start workout') + f'''<div class="lab">WHO’S TRAINING · 3 SELECTED</div><div class="card" style="overflow:hidden">{''.join(clrow(*c) for c in CL)}</div>
<div class="lab">HOW DO YOU WANT TO LOG?</div><div class="col" style="gap:10px">
<div class="mode on"><i></i><div><b>Live session</b><span>Log sets as they happen. With 2 or more clients you switch between them.</span></div></div>
<div class="mode"><i></i><div><b>Log a past workout</b><span>Fill in what they did, up to 7 days back. One client at a time.</span></div></div></div>'''
S('DS8-a1-start-pick-mode-ios', a1, f'<div class="bb"><a class="btn p" style="width:100%">{ic("play",18)}Start live session · 3 clients</a></div>')
# (a2) empty: no client has a workout today
a2 = nav('Start workout') + f'''<div class="col" style="align-items:center;text-align:center;gap:12px;padding:110px 16px 0"><span style="width:72px;height:72px;border-radius:36px;background:var(--lavender);color:var(--indigo);display:flex;align-items:center;justify-content:center">{ic("dumbbell",32)}</span>
<h2 style="font-size:20px;color:var(--navy)">No workouts planned today</h2><p class="sm muted" style="line-height:20px;max-width:300px">None of your active clients has a workout assigned for Wed 4 Nov. Assign one from the client’s Plan, or log a past workout.</p>
<a class="btn o" style="margin-top:6px">Log a past workout</a></div>'''
S('DS8-a2-start-empty-ios', a2)
# (b1) single-client live log with keypad
done = f'<div class="card ex"><span class="n d">{ic("check",18,w=2.6)}</span><div class="t"><b>Goblet squat</b><span>Done · 3 of 3 sets · 20 kg</span></div>{ic("down",18)}</div>'
def rdl(cur=2, load='22.5'):
    rows = sr(1,"20 × 10",cell("20","kg"),cell("10"),"dn") + (sr(2,"20 × 10",cell(load,"kg","on"),cell("10"),"cur") if cur==2 else sr(2,"20 × 10",cell("22.5","kg"),cell("10"),"dn")) + sr(3,"20 × 10",cell("20","kg","pl"),cell("10","","pl"), "cur" if cur==3 else "")
    return f'<div class="card act"><div class="row"><span class="n a" style="width:40px;height:40px;border-radius:12px;background:var(--indigo);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">2</span><div class="sp"><b class="b" style="font-size:16px;font-weight:600">Romanian deadlift</b><div class="sm muted">3 × 10 · 20 kg · rest 90 s</div></div></div>{H}{rows}</div>'
def lhdr(name='Neha Reddy', sub='Lower body B · 18 min · 2 of 5', btn='Finish'):
    return f'<div class="awh"><a class="icb" aria-label="Back to clients">{ic("left",18)}</a><div class="sp"><b class="b" style="font-size:17px;font-weight:600">{name}</b><div class="sm muted"><span style="color:var(--coral)">●</span> {sub}</div></div><a class="btn s sm">{btn}</a></div>'
upnext = '<div class="card ex"><span class="n u">3</span><div class="t"><b>Step-ups</b><span>3 × 12 · bodyweight</span></div></div>'
S('DS8-b1-live-single-keypad-ios', lhdr() + '<span class="tag" style="margin:2px 0 4px">Logged by you · Rahul</span>' + done + rdl(), pad(label='Set 2 · load · Neha'))
# (b2) rest timer
S('DS8-b2-live-single-rest-ios', lhdr() + done + rdl(cur=3) + f'<div class="timer">{ic("clock",18)}<span class="sp">Rest 0:52 of 1:30</span><a>+30 s</a><a>Skip</a></div>' + upnext)
# (b3) finish confirmation
fin = f'''<div class="scrim" style="z-index:4"></div><div class="sheet" style="z-index:5"><div class="gr"></div><h2 style="font-size:20px;color:var(--navy)">Finish Neha’s workout?</h2>
<p class="sm muted" style="margin:6px 0 12px;line-height:20px">4 of 5 exercises done · 12 sets · 42 min. Leg press has no sets logged and will be saved as skipped.</p>
<div class="info" style="margin-bottom:12px">{ic("user",16)}<span>Neha will see this as <b>Logged by your coach</b>. She can’t edit it.</span></div>
<a class="btn p" style="width:100%">Finish and save</a><a class="btn w" style="width:100%;margin-top:6px;color:var(--ink-700)">Keep logging</a></div>'''
S('DS8-b3-live-finish-confirm-ios', lhdr() + done + rdl(cur=3) + upnext, fin)
# (c1) multi-client parallel
def chips(on=0, states=(('NR','a2','Neha','Ex 2 of 5',40,''),('RM','a1','Rohan','Ex 4 of 6',66,''),('DN','a3','Deepak','Set 1 now',10,''))):
    return '<div class="chs">' + ''.join(f'<a class="cc {"on" if j==on else ""}"><span class="av {k}">{a}</span><div class="t"><b>{n}</b><span>{s}</span><div class="pr {d}"><i style="width:{p}%"></i></div></div></a>' for j,(a,k,n,s,p,d) in enumerate(states)) + '</div>'
mh = f'<div class="awh"><a class="icb" aria-label="Back">{ic("left",18)}</a><div class="sp"><b class="b" style="font-size:17px;font-weight:600">Live session · 3 clients</b><div class="sm muted"><span style="color:var(--coral)">●</span> started 7:12 am · 20 min</div></div><a class="btn s sm">Finish all</a></div>'
c1 = mh + chips() + f'<div class="row" style="margin:2px 0 0"><b class="b sp" style="font-size:15px">Neha · Lower body B</b><a class="btn o sm" style="height:40px">Finish Neha</a></div>' + rdl() 
S('DS8-c1-live-multi-ios', c1, pad(label='Set 2 · load · Neha', nxt='Log · next: Rohan'))
# (c2) switched to Rohan, Neha resting in background
rest_states = (('NR','a2','Neha','Rest 0:41',40,''),('RM','a1','Rohan','Ex 4 of 6',66,''),('DN','a3','Deepak','Set 1 now',10,''))
bp = f'''<div class="card act"><div class="row"><span class="n a" style="width:40px;height:40px;border-radius:12px;background:var(--indigo);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">4</span><div class="sp"><b class="b" style="font-size:16px;font-weight:600">Seated cable row</b><div class="sm muted">3 × 12 · 35 kg · rest 60 s</div></div></div>{H}
{sr(1,"35 × 12",cell("35","kg"),cell("12"),"dn")}{sr(2,"35 × 12",cell("35","kg"),cell("11"),"dn")}{sr(3,"35 × 12",cell("35","kg","pl"),cell("12","","pl"),"cur")}</div>'''
c2 = mh + chips(1, rest_states) + f'<div class="row" style="margin:2px 0 0"><b class="b sp" style="font-size:15px">Rohan · Upper body A</b><a class="btn o sm" style="height:40px">Finish Rohan</a></div>' + bp + f'<div class="info" style="margin-top:10px">{ic("clock",16)}<span>Neha is resting · 0:41 left. Tap her chip when she’s ready.</span></div>'
S('DS8-c2-live-multi-switched-ios', c2)
# (c3) finish all confirm
fa = f'''<div class="scrim" style="z-index:4"></div><div class="sheet" style="z-index:5"><div class="gr"></div><h2 style="font-size:20px;color:var(--navy)">Finish all 3 workouts?</h2>
<div class="card" style="overflow:hidden;margin:12px 0">{''.join(f'<div class="cl"><span class="av {k}">{a}</span><div class="t"><b>{n}</b><span>{s}</span></div></div>' for a,k,n,s in [('NR','a2','Neha Reddy','4 of 5 exercises · 12 sets'),('RM','a1','Rohan Mehta','6 of 6 exercises · 18 sets'),('DN','a3','Deepak Nair','1 of 4 exercises · 3 sets · rest skipped')])}</div>
<p class="sm muted" style="margin-bottom:12px">Exercises with no sets are saved as skipped. Each client sees their own workout as Logged by your coach.</p>
<a class="btn p" style="width:100%">Finish and save all</a><a class="btn w" style="width:100%;margin-top:6px;color:var(--ink-700)">Keep logging</a></div>'''
S('DS8-c3-live-multi-finish-all-ios', mh + chips(1, rest_states) + bp, fa)
# (c4) offline
off_states = (('NR','a2','Neha','2 waiting',40,''),('RM','a1','Rohan','Ex 4 of 6',66,''),('DN','a3','Deepak','Set 1 now',10,''))
c4 = mh + f'<div class="info warn" style="margin-bottom:8px">{ic("wifioff",16)}<span><b>You’re offline.</b> 2 sets for Neha are saved on this phone and will send when you’re back online. Finishing waits until they’re sent.</span></div>' + chips(1, off_states) + bp
S('DS8-c4-live-offline-ios', c4)
# (d1) log form
dts = lambda on: '<div class="dts">' + ''.join(f'<a class="{"on" if d==on else ""}{" dis" if dis else ""}">{w}<b>{d}</b></a>' for w,d,dis in [('Wed','28',True),('Thu','29',False),('Fri','30',False),('Sat','31',False),('Sun','1',False),('Mon','2',False),('Tue','3',False),('Wed','4',False)][1:]) + '</div>'
def frow(n,p,l,r,ed=False): return f'<div class="sr"><span style="text-align:center;font-weight:600">{n}</span><span class="sm muted">{p}</span>{cell(l,"kg","on" if ed else "")}{cell(r)}<span></span></div>'
form = f'''<div class="lab" style="margin-top:4px">DATE · UP TO 7 DAYS BACK</div>{dts("2")}
<div class="lab">WORKOUT</div><div class="card row" style="padding:12px 14px"><div class="sp"><b class="b">Upper body A</b><div class="xs muted">Planned for Mon 2 Nov · 5 exercises</div></div>{ic("down",18)}</div>
<div class="card fx"><div class="h"><b>Bench press</b><span class="xs muted">4 × 8</span></div><div class="sh"><span>SET</span><span>PLANNED</span><span>LOAD</span><span>REPS</span><span></span></div>{frow(1,"40 × 8","40","8")}{frow(2,"40 × 8","42.5","8",True)}{frow(3,"40 × 8","40","7")}</div>
<div class="card ex"><span class="n u">2</span><div class="t"><b>Seated cable row</b><span>3 × 12 · prefilled from plan</span></div>{ic("down",18)}</div>'''
S('DS8-d1-log-form-ios', nav('Log workout', 'Rohan Mehta') + form, f'<div class="bb"><a class="btn p" style="width:100%">Save workout</a></div>')
# (d2) date over the limit
d2 = nav('Log workout', 'Rohan Mehta') + f'''<div class="lab" style="margin-top:4px">DATE · UP TO 7 DAYS BACK</div>{dts("29")}
<div class="info" style="margin-top:10px">{ic("cal",16)}<span>You can log up to 7 days back, so Thu 29 Oct is the earliest. Older workouts can’t be added.</span></div>
<div class="lab">WORKOUT</div><div class="card" style="padding:14px"><b class="b">Nothing planned on Thu 29 Oct</b><p class="xs muted" style="margin-top:4px">Pick another day, or choose a workout from Rohan’s current plan.</p><a class="btn o sm" style="margin-top:10px">Choose a workout</a></div>'''
S('DS8-d2-log-form-date-limit-ios', d2)
# (d3) saving
S('DS8-d3-log-form-saving-ios', nav('Log workout', 'Rohan Mehta') + form, f'<div class="bb"><a class="btn p" style="width:100%;opacity:.7" aria-busy="true">{ic("clock",18)}Saving…</a></div>')
# (d4) save failed / unavailable
d4 = nav('Log workout', 'Rohan Mehta') + f'<div class="info crit" style="margin-top:4px">{ic("alert",16)}<span><b>Not saved.</b> We couldn’t reach FitBud, so nothing was saved. Your entries are still here. Check your connection and try again.</span></div>' + form
S('DS8-d4-log-form-not-saved-ios', d4, f'<div class="bb"><a class="btn p" style="width:100%">Try again</a></div>')
# (d5) ended client / no longer available
d5 = nav('Log workout', 'Vikram Singh') + f'''<div class="col" style="align-items:center;text-align:center;gap:12px;padding:120px 16px 0"><span style="width:72px;height:72px;border-radius:36px;background:var(--neu-bg);color:var(--neu);display:flex;align-items:center;justify-content:center">{ic("lock",30)}</span>
<h2 style="font-size:20px;color:var(--navy)">Coaching with Vikram has ended</h2><p class="sm muted" style="line-height:20px;max-width:300px">Ended clients are read-only, so you can’t log workouts for them. Reactivate coaching from his client page to log again.</p><a class="btn o" style="margin-top:6px">Open Vikram’s page</a></div>'''
S('DS8-d5-log-form-ended-ios', d5)
# (W9) trainee read-only coach-logged
TT9 = phone  # trainee tab bar via fb.phone
tr = f'''<div class="nv"><a class="icb" style="border:0;background:transparent">{ic("left",22)}</a><b>Upper body A</b><span style="width:44px"></span></div>
<div class="card" style="padding:14px 16px"><div class="row" style="gap:10px"><span class="av a4">RV</span><div class="sp"><b class="b">Logged by your coach</b><div class="xs muted">Rahul Verma · Mon 2 Nov · 7:12–8:04 am</div></div><span class="chip pos">Done</span></div>
<p class="xs muted" style="margin-top:10px;line-height:18px">Your coach logged this in your session. It counts toward your week. If something looks wrong, tell Rahul.</p></div>
<div class="card fx"><div class="h"><b>Bench press</b><span class="xs muted">4 sets</span></div>{''.join(f'<div class="sr dn"><span style="text-align:center;font-weight:600">{n}</span><span></span>{cell(l,"kg")}{cell(r)}<span class="tick on">{ic("check",20,w=2.4)}</span></div>' for n,l,r in [(1,"40","8"),(2,"42.5","8"),(3,"40","7"),(4,"40","7")])}</div>
<div class="card ex"><span class="n d">{ic("check",18,w=2.6)}</span><div class="t"><b>Seated cable row</b><span>3 sets · 35 kg</span></div>{ic("down",18)}</div>
<div class="card ex"><span class="n d">{ic("check",18,w=2.6)}</span><div class="t"><b>Lat pulldown</b><span>3 sets · 40 kg</span></div>{ic("down",18)}</div>
<p class="xs muted" style="text-align:center;margin-top:12px">{ic("lock",12)} Read-only · only your coach can change it</p>'''
save('DS8-w9-trainee-coach-logged-ios', page(phone(f'<div style="padding-top:0">{tr}</div>', tab='Workout', t='9:41'), 390, 844, D)); OUT.append('DS8-w9-trainee-coach-logged-ios')

if '--list' in sys.argv:
    print(' '.join(f'{n}:390:844:3' for n in OUT))

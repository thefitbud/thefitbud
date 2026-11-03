"""W5-W12 planned frames (drawn 3 Nov 2026 by FitBud UI for Firoz's review): DS1, DS2, DS3, DS4, DS6, DS7, BP1.
Run from docs/design/mockups/: python3 tools/w5w12_frames.py   (writes html/<name>.html)
Render: PW_DIR=<folder with playwright-core> node tools/ds5_render.mjs $(python3 tools/w5w12_frames.py --list)"""
import sys
sys.path.insert(0, 'tools')
from fb import *

X = '''
.big svg.ic,.empty .bub svg.ic{width:32px;height:32px}.irail a svg.ic{width:22px;height:22px}.ccard .ib svg.ic{width:20px;height:20px}.nd{white-space:nowrap}
.cnt{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:11px;background:var(--lavender);color:var(--indigo);font-size:12px;font-weight:700}
.hl{flex:1;min-width:0;padding:24px 28px;display:flex;flex-direction:column;gap:16px;overflow:hidden}
.wr2{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 16px;border-top:1px solid var(--border);font-size:14px;position:relative}
.wr2.sel{background:var(--lavender-50);box-shadow:inset 3px 0 0 var(--indigo)}.wr2.hov{background:var(--hover,#F6F5FB)}
.wr2.foc{outline:2px solid var(--indigo);outline-offset:-3px;border-radius:10px}
.wr2 b{width:150px;color:var(--navy);font-weight:600;flex:none}.wr2 .is{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink-700)}
.wr2 .s{width:84px;color:var(--ink-500);font-size:13px;text-align:right;flex:none}.wr2 .go{color:var(--ink-400)}
.dense .wr2{min-height:48px;padding:4px 16px}.dense .ghd{padding:7px 16px}
.ghd{display:flex;align-items:center;gap:8px;padding:10px 16px;background:var(--page-web);border-top:1px solid var(--border);font-size:12px;font-weight:700;color:var(--ink-500);letter-spacing:.3px}
.crumb{display:flex;align-items:center;gap:6px;font-size:14px;color:var(--ink-500)}.crumb a{color:var(--indigo);font-weight:600;display:inline-flex;align-items:center;gap:4px;min-height:32px}
.fch{display:flex;gap:8px}.fch a{height:36px;padding:0 14px;border-radius:18px;border:1px solid var(--border-strong);display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:var(--ink-700);background:#fff}.fch a.on{background:var(--sel-bg);border-color:#D6CFFF;color:var(--sel)}
.empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;padding:40px}
.empty .bub{width:72px;height:72px;border-radius:36px;background:var(--pos-bg);color:var(--pos);display:flex;align-items:center;justify-content:center}
.empty h3{font-size:20px;color:var(--navy);font-weight:600}.empty p{font-size:14px;color:var(--ink-500);max-width:420px;line-height:20px}
.panel{width:540px;background:#fff;border-left:1px solid var(--border);display:flex;flex-direction:column;flex:none;box-shadow:-12px 0 32px rgba(26,18,72,.08);min-height:0;position:relative}
.pnh{padding:14px 20px 12px;border-bottom:1px solid var(--border)}.pnb{flex:1;overflow:hidden;padding:16px 20px;display:flex;flex-direction:column;gap:12px}
.pnf{border-top:1px solid var(--border);padding:14px 20px 16px;background:#fff;position:relative}
.lab{font-size:12px;font-weight:700;color:var(--ink-500);letter-spacing:.3px}
.it{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 14px;border-top:1px solid var(--border);font-size:14px}.it:first-child{border-top:0}
.it .t{flex:1;min-width:0}.it .t b{display:block;color:var(--navy);font-weight:600}.it .t span{font-size:12px;color:var(--ink-500)}
.it.on{background:var(--lavender-50)}
.cb{width:22px;height:22px;border-radius:6px;border:1.5px solid var(--border-strong);display:flex;align-items:center;justify-content:center;flex:none;background:#fff;color:#fff}
.cb.on{background:var(--indigo);border-color:var(--indigo)}.cb.mix{background:var(--indigo);border-color:var(--indigo)}.cb.na{border-style:dashed;background:var(--page-web)}
.hit{width:44px;height:44px;display:flex;align-items:center;justify-content:center;flex:none;margin:-11px -6px -11px -11px}
.bar{display:flex;align-items:center;gap:10px;background:var(--navy);color:#fff;border-radius:14px;padding:8px 8px 8px 14px;font-size:14px;font-weight:600}
.info{display:flex;gap:10px;align-items:flex-start;background:var(--neu-bg);border:1px solid var(--neu-line);border-radius:14px;padding:10px 12px;font-size:13px;color:var(--neu);line-height:18px}
.info.warn{background:var(--attn-bg);border-color:var(--attn-line);color:var(--attn)}.info.ok{background:var(--pos-bg);border-color:var(--pos-line);color:var(--pos)}.info.crit{background:var(--crit-bg);border-color:var(--crit-line);color:var(--crit)}
.ochips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.ochips a{height:44px;padding:0 14px;border-radius:22px;border:1px solid var(--border-strong);display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:var(--ink-700)}.ochips a.on{background:var(--sel-bg);border-color:#D6CFFF;color:var(--sel)}
.ta{border:1px solid var(--border-strong);border-radius:14px;padding:10px 12px;font-size:14px;min-height:64px;margin-top:8px;color:var(--ink-700);line-height:20px}
.btn.dis{background:var(--neu-bg);color:var(--ink-500);border-color:var(--neu-line)}.btn.dng{background:var(--crit);color:#fff}.btn.dngo{background:#fff;color:var(--crit);border-color:var(--crit-line)}
.scrimw{position:absolute;inset:0;background:rgba(15,17,21,.38);z-index:5}
.dlg{position:absolute;z-index:6;background:#fff;border-radius:20px;box-shadow:0 24px 64px rgba(26,18,72,.28);display:flex;flex-direction:column;overflow:hidden}
.dlg .dh{padding:22px 24px 8px}.dlg .dh h2{font-size:22px;color:var(--navy);font-weight:600;letter-spacing:-.2px}.dlg .dh p{font-size:14px;color:var(--ink-500);margin-top:4px;line-height:20px}
.dlg .db{padding:8px 24px 16px;display:flex;flex-direction:column;gap:12px}.dlg .df{padding:14px 24px 18px;border-top:1px solid var(--border);display:flex;gap:10px;align-items:center}
.kvt{display:grid;grid-template-columns:150px 1fr;row-gap:10px;column-gap:16px;font-size:14px;border:1px solid var(--border);border-radius:14px;padding:14px 16px}.kvt span{color:var(--ink-500)}.kvt b{color:var(--navy);font-weight:600}
.diff{border:1px solid var(--border);border-radius:14px;overflow:hidden}.diff div{display:flex;gap:10px;align-items:center;padding:10px 14px;border-top:1px solid var(--border);font-size:14px}.diff div:first-child{border-top:0}
.diff s{color:var(--ink-400)}.diff em{font-style:normal;color:var(--navy);font-weight:600}
.radio{display:flex;align-items:flex-start;gap:12px;border:1px solid var(--border-strong);border-radius:14px;padding:12px 14px;min-height:56px}.radio.on{border-color:var(--indigo);background:var(--lavender-50)}
.radio i{width:20px;height:20px;border-radius:10px;border:2px solid var(--border-strong);flex:none;margin-top:1px}.radio.on i{border:6px solid var(--indigo)}
.radio b{display:block;color:var(--navy);font-size:14px}.radio span{font-size:13px;color:var(--ink-500)}
.toastw{position:absolute;left:50%;transform:translateX(-50%);bottom:28px;background:var(--navy);color:#fff;border-radius:16px;min-height:52px;display:flex;align-items:center;gap:12px;padding:0 8px 0 18px;font-size:14px;font-weight:500;box-shadow:0 12px 32px rgba(26,18,72,.3);z-index:7;white-space:nowrap}
.toastw a{color:var(--indigo-300,#B7AEFF);font-weight:700;min-height:44px;display:flex;align-items:center;padding:0 12px}
.ring{position:relative;width:28px;height:28px;flex:none}.ring svg{position:absolute;inset:0}
/* client header + tabs (web workspace) */
.chd{background:#fff;border-bottom:1px solid var(--border);padding:16px 28px 0}.chd .tabs{display:flex;gap:24px;margin-top:14px}.chd .tabs a{font-size:14px;font-weight:600;color:var(--ink-500);padding:0 0 10px;border-bottom:2px solid transparent}.chd .tabs a.on{color:var(--indigo);border-color:var(--indigo)}
.sect{background:#fff;border:1px solid var(--border);border-radius:16px;overflow:hidden}.sect .sh{display:flex;align-items:center;gap:12px;padding:12px 18px;background:var(--lavender-50);border-bottom:1px solid var(--border)}.sect .sh b{color:var(--navy);font-size:15px;width:160px}.sect .sh span{font-size:13px;color:var(--ink-500)}
.sect .sb2{padding:14px 18px 16px;display:grid;grid-template-columns:1fr 1fr;gap:14px 24px}
.fld label{display:block;font-size:13px;font-weight:600;color:var(--ink-700);margin-bottom:6px}.fld .in{height:44px;border:1px solid var(--border-strong);border-radius:12px;display:flex;align-items:center;padding:0 12px;font-size:14px;background:#fff;color:var(--ink-700)}
.ro label{display:block;font-size:12px;font-weight:600;color:var(--ink-500);margin-bottom:4px}.ro .v{font-size:15px;color:var(--navy);line-height:21px}.ro .v small{font-size:13px;color:var(--ink-500)}
.endb{display:flex;align-items:center;gap:10px;background:var(--neu-bg);border:1px solid var(--neu-line);border-radius:14px;padding:12px 16px;font-size:14px;color:var(--ink-700)}
/* annotation pins (spec frames only) */
.pin{position:absolute;width:24px;height:24px;border-radius:12px;background:var(--coral);color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.2);z-index:4}
.legend{background:#fff;border:1px dashed var(--coral);border-radius:14px;padding:12px 14px;font-size:13px;color:var(--ink-700);line-height:19px}.legend b{color:var(--navy)}
.legend ol{padding-left:0;list-style:none;display:flex;flex-direction:column;gap:6px}.legend li{display:flex;gap:8px}.legend li i{font-style:normal;width:20px;height:20px;border-radius:10px;background:var(--coral);color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:none}
.ccard{flex:1;background:#fff;border:1px solid var(--border);border-radius:16px;padding:14px 16px;display:flex;align-items:center;gap:12px;position:relative;min-height:76px}
.ccard .ib{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex:none}
.ccard .k{font-size:13px;font-weight:600;color:var(--ink-700)}.ccard .n{font-size:24px;font-weight:700;color:var(--navy);line-height:28px}.ccard .ar{margin-left:auto;color:var(--ink-400)}
.ccard.hov{border-color:#D6CFFF;box-shadow:0 6px 18px rgba(26,18,72,.10)}.ccard.foc{outline:2px solid var(--indigo);outline-offset:2px}
.ccard.zero{background:var(--page-web)}.ccard.zero .n{color:var(--ink-400)}
'''
DS6X = '''
.gl{display:grid;grid-template-columns:60px 1fr 1fr 64px;gap:8px;align-items:center;padding:6px 14px;border-top:1px solid var(--border);min-height:58px}
.gl .v{height:44px;border:1px solid var(--border-strong);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:700;color:var(--navy);background:#fff}.gl .v small{font-size:11px;color:var(--ink-500);margin-left:3px;font-weight:500}
.gl .v.ed{border:1.5px solid var(--indigo);box-shadow:0 0 0 3px var(--lavender)}.gl .v.pl{color:var(--ink-400);font-weight:500}
.ck{width:44px;height:44px;border-radius:12px;border:1.5px solid var(--border-strong);display:flex;align-items:center;justify-content:center;color:var(--ink-400)}.ck.on{background:var(--navy);border-color:var(--navy);color:#fff}
.pill2{display:inline-flex;height:24px;align-items:center;padding:0 9px;border-radius:12px;background:var(--lavender);color:var(--indigo);font-size:12px;font-weight:700;flex:none}
.exh{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--lavender-50);border-bottom:1px solid var(--border)}
.clr{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;border:1px solid var(--border);background:#fff;min-height:60px}.clr.on{border-color:var(--indigo);background:var(--lavender-50)}
.clr .t{flex:1;min-width:0}.clr .t b{display:block;font-size:14px;color:var(--navy)}.clr .t span{font-size:12px;color:var(--ink-500)}
.ctabs{display:flex;gap:8px}.ctabs a{display:flex;align-items:center;gap:8px;height:48px;padding:0 14px 0 6px;border-radius:24px;border:1px solid var(--border-strong);font-size:14px;font-weight:600;color:var(--ink-700);background:#fff}.ctabs a.on{border-color:var(--indigo);background:var(--lavender-50);color:var(--navy)}
.ctabs .av{width:36px;height:36px;font-size:12px}
.timer{display:flex;align-items:center;gap:10px;background:var(--navy);color:#fff;border-radius:14px;padding:8px 8px 8px 14px;font-size:14px;font-weight:600}
'''
OUT = []
def S(name, html): save(name, html); OUT.append(name)
def chk(on=False, na=False): return f'<span class="cb {"on" if on else ""}{" na" if na else ""}">{ic("check",14,"#fff",3) if on else ""}</span>'
crit = f'<span class="chip crit">{ic("alert",12)}Critical</span>'
attn = f'<span class="chip attn">{ic("alert",12)}Attention</span>'
def W(title, body, w=1440, h=900, on='Home', extra=''): return page(web(title, body, on), w, h, X + extra)

# ---------------- DS1 Home full views ----------------
ATT = [('RM','a1','Rohan Mehta','Missed 2 workouts · Tue 27 Oct, Thu 29 Oct','c','5 d',3),
       ('AK','a5','Arjun Kapoor','Check-in 2 days overdue','c','2 d',1),
       ('NR','a2','Neha Reddy','Breakfast not logged · Fri 30 Oct, Sat 31 Oct','a','3 d',2),
       ('PS','a4','Priya Sharma','Lunch not logged · Sun 1 Nov','a','2 d',1),
       ('IB','a4','Ishita Banerjee','Lunch not logged · Mon 2 Nov','a','1 d',1),
       ('KM','a3','Karthik Menon','Skipped Upper body A · Mon 2 Nov','a','1 d',1),
       ('TJ','a2','Tanvi Joshi','Changed dinner · paneer tikka swapped for butter chicken','a','1 d',1),
       ('VS','a5','Varun Sethi','Breakfast not logged · Tue 3 Nov','a','1 h',1),
       ('AS','a1','Aarav Shah','Weight not logged for 8 days','a','8 d',1),
       ('KV','a3','Kavya Iyer','Steps below target 4 days running','a','4 d',1),
       ('SM','a2','Sneha Malhotra','Dinner not logged · Mon 2 Nov','a','1 d',1)]
def arow(r, cls=''):
    a,k,n,i,s,since,cnt = r
    c = f' <span class="cnt" style="margin-left:6px">+{cnt-1} more</span>' if cnt>1 else ''
    return f'<div class="wr2 {cls}"><span class="av {k}" style="width:32px;height:32px">{a}</span><b>{n}</b><span class="is">{i}{c}</span>{crit if s=="c" else attn}<span class="s">since {since}</span><span class="go">{ic("right",18)}</span></div>'
def fullview(title, cnt, sub, chips, body, right=''):
    fc = ''.join(f'<a class="{"on" if j==0 else ""}">{t}</a>' for j,t in enumerate(chips))
    return f'''<div class="hl"><div class="crumb"><a>{ic("left",16)}Home</a></div>
<div class="row" style="align-items:flex-end"><div><h1 style="font-size:28px">{title} <span class="cnt" style="vertical-align:middle;font-size:13px;height:24px">{cnt}</span></h1><p class="sm muted" style="margin-top:4px">{sub}</p></div><span class="sp"></span>{right}</div>
{f'<div class="fch">{fc}</div>' if chips else ''}{body}</div>'''
def empty(icn, h, p, btn='Back to Home'):
    return f'<div class="wc empty"><span class="bub">{ic(icn,32,w=2)}</span><h3>{h}</h3><p>{p}</p><a class="btn o sm" style="margin-top:6px">{ic("left",16)}{btn}</a></div>'
rows = '<div class="ghd">CRITICAL · 2</div>' + ''.join(arow(r) for r in ATT[:2]) + '<div class="ghd">ATTENTION · 9</div>' + ''.join(arow(r) for r in ATT[2:])
S('DS1-home-attention-web', W('Home', fullview('Needs attention', 11, 'Every client with an open item, most urgent first. Click a row to review it.', ['All 11','Critical 2','Attention 9'], f'<div class="wc dense" style="overflow:hidden;flex:none">{rows}</div>', '<span class="xs muted">Sorted by severity, then age</span>')))
S('DS1-home-attention-empty-web', W('Home', fullview('Needs attention', 0, 'Every client with an open item, most urgent first.', [], empty('check', 'No one needs you right now', 'All 24 active clients are on track. New missed workouts, meals and overdue check-ins show up here.'))))
REN = [('Expired', [('RM','a1','Rohan Mehta','Monthly · ₹6,000','Ended Sat 31 Oct','crit','Expired'), ('AK','a5','Arjun Kapoor','3 months · ₹15,000','Ended Mon 2 Nov','crit','Expired')]),
       ('DUE IN THE NEXT 7 DAYS', [('MI','a3','Meera Iyer','Monthly · ₹6,000','Due Thu 5 Nov','attn','Due in 2 d'), ('AS','a1','Aarav Shah','Monthly · ₹5,000','Due Sun 8 Nov','attn','Due in 5 d'), ('NR','a2','Neha Reddy','3 months · ₹15,000','Due Tue 10 Nov','attn','Due in 7 d')]),
       ('LATER THIS MONTH', [('KV','a3','Kavya Iyer','Monthly · ₹6,000','Due Sat 21 Nov','neu','Due in 18 d'), ('TJ','a2','Tanvi Joshi','6 months · ₹27,000','Due Mon 30 Nov','neu','Due in 27 d')])]
def rrow(a,k,n,p,d,c,l): return f'<div class="wr2"><span class="av {k}" style="width:32px;height:32px">{a}</span><b>{n}</b><span class="is">{p}</span><span style="width:150px;font-size:13px;color:var(--ink-700)">{d}</span><span class="chip {c}" style="width:104px;justify-content:center">{l}</span><a class="btn o sm" style="height:44px;font-size:13px">Open subscription</a></div>'
rb = ''.join(f'<div class="ghd">{g.upper()} · {len(rs)}</div>' + ''.join(rrow(*r) for r in rs) for g,rs in REN)
S('DS1-home-renewals-web', W('Home', fullview('Renewals due', 7, 'Subscriptions that ended or end in the next 30 days. Payments are tracked only; FitBud does not charge clients.', ['All 7','Expired 2','Next 7 days 3','Later 2'], f'<div class="wc" style="overflow:hidden;flex:none">{rb}</div>')))
S('DS1-home-renewals-empty-web', W('Home', fullview('Renewals due', 0, 'Subscriptions that ended or end in the next 30 days.', [], empty('wallet', 'No renewals in the next 30 days', 'When a client\'s subscription ends within 30 days, it shows here with a link to their subscription.'))))
ASK = [('DN','a3','Deepak Nair','Can I swap leg day to Saturday this week? Travelling Thu–Fri.','Workout','Today, 8:12 am',False),
       ('PS','a4','Priya Sharma','Is it okay to have poha instead of upma for breakfast?','Diet','Today, 7:40 am',False),
       ('RM','a1','Rohan Mehta','Lower back feels tight after deadlifts. Should I skip RDLs?','Pain','Yesterday, 9:05 pm',True),
       ('SM','a2','Sneha Malhotra','Going to a wedding Saturday, how do I log the food?','Diet','Yesterday, 6:30 pm',False),
       ('KM','a3','Karthik Menon','Gym is closed for Diwali, any home workout?','Workout','Sun 1 Nov',False)]
def qrow(a,k,n,q,t,w,p): return f'<div class="wr2"><span class="av {k}" style="width:32px;height:32px">{a}</span><b>{n}</b><span class="is">“{q}”</span><span class="chip {"crit" if p else "neu"}" style="min-width:72px;justify-content:center">{t}</span><span class="s" style="width:120px">{w}</span><span class="go">{ic("right",18)}</span></div>'
S('DS1-home-asks-web', W('Home', fullview('Asked you on WhatsApp', 5, 'Questions clients sent from the app. Click one to reply on WhatsApp or mark it answered.', ['Open 5','Answered this week 12'], f'<div class="wc" style="overflow:hidden;flex:none">{"".join(qrow(*r) for r in ASK)}</div><div class="info">{ic("alert",16)}<span>Pain questions are marked red and stay at the top until you answer them.</span></div>')))
S('DS1-home-asks-empty-web', W('Home', fullview('Asked you on WhatsApp', 0, 'Questions clients sent from the app.', [], empty('msg', 'No open questions', 'When a client taps “Ask coach on WhatsApp”, the question shows here until you mark it answered.'))))

# ---------------- DS2 bulk side panel ----------------
ITEMS = [('dumbbell','Missed workout · Tue 27 Oct','Lower body A · open 7 d',crit,True),
         ('dumbbell','Missed workout · Thu 29 Oct','Upper body B · open 5 d',crit,True),
         ('dumbbell','Missed workout · Sat 31 Oct','Lower body B · open 3 d',attn,True),
         ('utensils','Breakfast not logged · Sun 1 Nov','Open 2 d',attn,True),
         ('utensils','Dinner not logged · Mon 2 Nov','Open 1 d',attn,True),
         ('alert','Pain reported · lower back','Mon 2 Nov · resolve on its own',crit,False)]
HOMEL = [('RM','a1','Rohan Mehta','6 open · missed workouts, meals, pain','c','7 d'),('AK','a5','Arjun Kapoor','Check-in 2 days overdue','c','2 d'),('NR','a2','Neha Reddy','Breakfast not logged · Fri 30 Oct','a','3 d'),('PS','a4','Priya Sharma','Lunch not logged · Sun 1 Nov','a','2 d'),('KM','a3','Karthik Menon','Skipped Upper body A · Mon 2 Nov','a','1 d')]
def homelist():
    r = ''.join(f'<div class="wr2 {"sel" if n=="Rohan Mehta" else ""}"><span class="av {k}" style="width:32px;height:32px">{a}</span><b style="width:120px">{n}</b><span class="is">{i}</span>{crit if s=="c" else attn}</div>' for a,k,n,i,s,_ in HOMEL)
    return f'<div class="hl" style="padding-right:20px"><div><div class="eb">Tue 3 Nov</div><h1 style="font-size:28px">Today</h1></div><div class="wc" style="overflow:hidden"><div class="row" style="padding:14px 16px"><h3 class="b" style="font-size:17px">Needs you</h3><span class="cnt">11</span><span class="sp"></span><span class="xs muted">Most urgent first</span></div>{r}</div></div>'
def phead(sub):
    return f'<div class="pnh"><div class="row"><span class="av a1">RM</span><div class="sp"><b class="b" style="font-size:17px">Rohan Mehta</b><div class="xs muted">Lose 6 kg · week 8 · {sub}</div></div><a class="icb" style="border-radius:12px">{ic("x",18)}</a></div></div>'
def itemlist(sel, state=None):
    o = ''
    for j,(icn,t,s,ch,ok) in enumerate(ITEMS):
        st = state[j] if state else None
        if st == 'done': ch = f'<span class="chip pos">{ic("check",12,w=2.4)}Resolved</span>'
        if st == 'else': ch = f'<span class="chip neu">Already resolved</span>'
        box = f'<span class="hit">{chk(j in sel)}</span>' if ok and not st else (f'<span class="hit">{ic("check",18,"var(--pos)",2.4)}</span>' if st=='done' else (f'<span class="hit">{ic("x",18,"var(--ink-400)")}</span>' if st=='else' else f'<span class="hit" title="Resolve on its own"><span class="cb na"></span></span>'))
        o += f'<div class="it {"on" if j in sel and not st else ""}">{box}<span style="color:var(--ink-500)">{ic(icn,16)}</span><div class="t"><b>{t}</b><span>{s}</span></div>{ch}</div>'
    return f'<div class="wc" style="overflow:hidden">{o}</div>'
def selhead(n, tot=5):
    st = 'on' if n==tot else ('' if n==0 else 'on')
    return f'<div class="row" style="gap:10px;padding:0 2px"><span class="hit" style="margin:0 -6px 0 -11px">{chk(n>0)}</span><span class="sm b">{"Select all 5 that can be resolved together" if n==0 else f"{n} of {tot} selected"}</span><span class="sp"></span><span class="xs muted">Pain is resolved on its own</span></div>'
def bpanel(body, foot, sub='6 open items', over=''):
    return page(web('Home', f'<div style="display:flex;flex:1;min-height:0;position:relative">{homelist()}<aside class="panel">{phead(sub)}<div class="pnb">{body}</div>{foot}</aside>{over}</div>'), 1440, 900, X)
f1 = f'<div class="pnf"><div class="bar"><span>2 selected</span><span class="sp"></span><a class="btn o sm" style="height:44px;background:transparent;color:#fff;border-color:rgba(255,255,255,.3)">Clear</a><a class="btn p sm" style="height:44px">Resolve 2 items…</a></div><p class="xs muted" style="margin-top:8px">Only missed workouts and meals can be resolved together. Mark reviewed still applies to Rohan as a whole.</p></div>'
S('DS2-bulk-select-web', bpanel('<div class="lab">OPEN ITEMS</div>' + selhead(2) + itemlist({0,1}), f1))
dlg = f'''<div class="scrimw"></div><div class="dlg" style="left:430px;top:150px;width:580px"><div class="dh"><h2>Resolve 5 items for Rohan?</h2><p>The same outcome and note go on every item. Rohan can't log these days late once they're resolved.</p></div>
<div class="db"><div class="diff">{''.join(f'<div>{ic(i,16)}<span class="sp">{t}</span></div>' for i,t,_,_,ok in ITEMS if ok)}</div>
<div><div class="lab">OUTCOME</div><div class="ochips"><a class="on">{ic("check",14,w=2.4)}Talked to client</a><a>Plan adjusted</a><a>No action needed</a></div></div>
<div><div class="lab">NOTE · OPTIONAL · ONLY YOU SEE THIS</div><div class="ta" style="border-color:var(--indigo)">Called him Tue. Office deadline week, back to normal from Mon 9 Nov.</div></div></div>
<div class="df"><span class="xs muted">You can undo for 5 seconds after.</span><span class="sp"></span><a class="btn o sm">Cancel</a><a class="btn p sm" style="min-width:150px">Resolve 5 items</a></div></div>'''
f2 = f'<div class="pnf"><div class="bar"><span>5 selected</span><span class="sp"></span><a class="btn p sm" style="height:44px">Resolve 5 items…</a></div></div>'
S('DS2-bulk-confirm-web', bpanel('<div class="lab">OPEN ITEMS</div>' + selhead(5) + itemlist({0,1,2,3,4}), f2, over=dlg))
res = f'<div class="info warn">{ic("alert",16)}<span><b>4 resolved, 1 already resolved elsewhere.</b> Dinner on Mon 2 Nov was resolved on your phone at 9:40 am, so it was left as it was.</span></div>'
f3 = f'<div class="pnf"><div class="row" style="gap:8px"><span class="sm muted">1 item still open · Pain reported</span><span class="sp"></span><a class="btn p sm" style="min-width:160px">Review pain item {ic("right",16)}</a></div></div>'
S('DS2-bulk-partial-web', bpanel(res + '<div class="lab">RESULT</div>' + itemlist(set(), ['done','done','done','done','else',None]), f3, '1 open item'))
toast = f'<div class="toastw" style="left:auto;right:290px;transform:translateX(50%)"><span class="ring"><svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="3"/><circle cx="14" cy="14" r="11" fill="none" stroke="#fff" stroke-width="3" stroke-dasharray="69" stroke-dashoffset="28" transform="rotate(-90 14 14)"/></svg></span>5 items resolved · Talked to client<a>Undo</a></div>'
S('DS2-bulk-undo-web', bpanel('<div class="lab">RESULT</div>' + itemlist(set(), ['done']*5+[None]), f'<div class="pnf" style="height:96px"></div>', '1 open item', over=toast))

# ---------------- DS3 Activate / Save as vN+1 ----------------
def chead(av, k, name, pill, meta, btns, tab='Plan'):
    tabs = ''.join(f'<a class="{"on" if t==tab else ""}">{t}</a>' for t in ['Overview','Plan','Activity','Progress','Check-ins','History'])
    return f'<div class="chd"><div class="row"><span class="av {k}" style="width:52px;height:52px;font-size:16px">{av}</span><div class="sp"><div class="row" style="gap:10px"><b class="b" style="font-size:24px;font-weight:600">{name}</b>{pill}</div><div class="sm muted">{meta}</div></div>{btns}</div><div class="tabs">{tabs}</div></div>'
SECS = [('Goal','Run a sub-4-hour marathon in Mumbai, Jan 2027'),('Starting point','74.2 kg · vegetarian + eggs'),('Expectations','4 workouts · 4 meals · weight 3× a week'),('Check-ins','Weekly · Sunday · Marathon check-in v2'),('Reminders','Meals and workouts · quiet 10:00 pm – 6:00 am'),('Steps','8,000 a day')]
AAR=[('Goal','Lose 8 kg by March, fit into wedding sherwani'),('Starting point','92.4 kg · non-vegetarian'),('Expectations','4 workouts · 4 meals · weight daily'),('Check-ins','Weekly · Saturday · Standard check-in'),('Reminders','Meals and workouts · quiet 11:00 pm – 7:00 am'),('Steps','9,000 a day')]
def setup_bg(name='Vikram Singh', av='VS', k='a2', pill='<span class="chip sel" style="height:24px">Ready to coach</span>', meta='Marathon prep · Joined Mon 12 Oct · 34 · Male', foot='', secs=SECS):
    s = ''.join(f'<div class="sect" style="border-radius:0;border-width:1px 0 0 0"><div class="sh" style="background:#fff">{ic("right",16)}<b>{a}</b><span class="sp">{b}</span><span class="chip pos" style="height:24px">{ic("check",12,w=2.4)}Done</span></div></div>' for a,b in secs)
    return chead(av,k,name,pill,meta,f'<a class="btn o sm">{ic("msg",16)}Message on WhatsApp</a><a class="icb" style="border-radius:12px;margin-left:8px">{ic("more")}</a>') + f'<div style="padding:20px 28px;display:flex;flex-direction:column;gap:14px;flex:1;min-height:0"><div class="seg" style="width:240px"><a>Plans</a><a class="on">Coaching setup</a></div><div class="wc" style="overflow:hidden">{s}{foot}</div></div>'
dA = f'''<div class="scrimw"></div><div class="dlg" style="left:420px;top:90px;width:600px"><div class="dh"><h2>Start coaching Vikram?</h2><p>Vikram gets everything below from the start date. You can change any of it later with Save as v2.</p></div>
<div class="db"><div class="kvt"><span>Start date</span><b>Mon 9 Nov</b><span>Workouts</span><b>4 a week · Marathon base, phase 1</b><span>Meals</span><b>4 a day · Veg + eggs, 2,300 kcal</b><span>Check-ins</span><b>Weekly on Sunday · first Sun 15 Nov</b><span>Tracking</span><b>Weight 3× a week · waist every 2 weeks</b><span>Reminders</span><b>Meals and workouts · quiet 10:00 pm – 6:00 am</b><span>Steps target</span><b>8,000 a day</b><span>Plan</span><b>Published · Marathon base, phase 1</b></div>
<div class="field" style="margin:0"><label>Start date</label><div class="in" style="justify-content:space-between">Mon 9 Nov{ic("cal",18)}</div></div>
<div class="info">{ic("bell",16)}<span>Vikram gets a notification now and his first reminders on Mon 9 Nov.</span></div></div>
<div class="df"><a class="btn o sm">Back to setup</a><span class="sp"></span><a class="btn p sm" style="min-width:170px">Activate coaching</a></div></div>'''
S('DS3-activate-dialog-web', page(web('Clients / Vikram Singh', f'<div style="flex:1;display:flex;flex-direction:column;min-height:0;position:relative">{setup_bg()}{dA}</div>', 'Clients'), 1440, 900, X))
dV = f'''<div class="scrimw"></div><div class="dlg" style="left:420px;top:110px;width:600px"><div class="dh"><h2>Save as version 3?</h2><p>Version 2 stays in History. Aarav sees the changes from the date you pick.</p></div>
<div class="db"><div class="lab">WHAT CHANGES · 3</div><div class="diff"><div>{ic("dumbbell",16)}<span style="width:120px">Workouts</span><s>3 a week</s>{ic("right",14)}<em>4 a week</em></div><div>{ic("utensils",16)}<span style="width:120px">Calories</span><s>2,100 kcal</s>{ic("right",14)}<em>1,950 kcal</em></div><div>{ic("foot",16)}<span style="width:120px">Steps</span><s>7,000 a day</s>{ic("right",14)}<em>9,000 a day</em></div></div>
<div class="lab" style="margin-top:4px">STARTS</div><div class="radio on"><i></i><div><b>Tomorrow · Wed 4 Nov</b><span>Today's plan stays as it is.</span></div></div><div class="radio"><i></i><div><b>Next Monday · Mon 9 Nov</b><span>Finishes this week on version 2.</span></div></div></div>
<div class="df"><a class="btn o sm">Keep editing</a><span class="sp"></span><a class="btn p sm" style="min-width:170px">Save as version 3</a></div></div>'''
footV = '<div style="display:flex;align-items:center;gap:10px;padding:12px 18px;border-top:1px solid var(--border)"><span class="chip attn" style="height:26px">3 unsaved changes</span><span class="sp"></span><a class="btn o sm">Discard</a><a class="btn p sm">Save as v3…</a></div>'
S('DS3-save-version-dialog-web', page(web('Clients / Aarav Shah', f'<div style="flex:1;display:flex;flex-direction:column;min-height:0;position:relative">{setup_bg("Aarav Shah","AS","a1","<span class=\"chip pos\" style=\"height:24px\">Active · v2</span>","Fat loss · Coached since Mon 7 Sep · 29 · Male",footV,AAR)}{dV}</div>', 'Clients'), 1440, 900, X))

# ---------------- DS4 Home row + count card spec ----------------
def cards(ipad=False):
    C = [('Needs attention','11','alert','var(--crit-bg)','var(--crit)','hov'),('Check-ins to review','2','clip','var(--lavender)','var(--indigo)',''),('Renewals due','2','wallet','var(--attn-bg)','var(--attn)','foc'),('Asked you','0','msg','var(--neu-bg)','var(--ink-400)','zero')]
    return '<div class="row" style="gap:12px">' + ''.join(f'<div class="ccard {c}"><span class="ib" style="background:{bg};color:{fg}">{ic(i,20)}</span><div style="min-width:0"><div class="k" style="white-space:nowrap">{k}</div><div class="n">{n}</div></div>{"" if c=="zero" else f"<span class=ar>{ic(chr(114)+chr(105)+chr(103)+chr(104)+chr(116),18)}</span>"}{"<span class=xs style=position:absolute;right:14px;bottom:10px;color:var(--ink-400)>Nothing new</span>" if c=="zero" else ""}</div>' for k,n,i,bg,fg,c in C) + '</div>'
def ds4_rows(narrow=False):
    R = [('RM','a1','Rohan Mehta','Missed 2 workouts · Tue 27 Oct, Thu 29 Oct','c','5 d','hov'),('AK','a5','Arjun Kapoor','Check-in 2 days overdue','c','2 d','foc'),('NR','a2','Neha Reddy','Breakfast not logged · Fri 30 Oct','a','3 d',''),('PS','a4','Priya Sharma','Lunch not logged · Sun 1 Nov','a','2 d','')]
    return ''.join(f'<div class="wr2 {c}"><span class="av {k}" style="width:32px;height:32px">{a}</span><b style="width:{110 if narrow else 150}px">{n}</b><span class="is">{i}</span>{crit if s=="c" else attn}<span class="s" style="width:{60 if narrow else 84}px">{"" if narrow else "since "}{d}</span><a class="btn s sm" style="height:44px;font-size:13px">Review</a></div>' for a,k,n,i,s,d,c in R)
LEG = '''<div class="legend"><b>DS4 · Home row and count card</b><ol style="margin-top:8px">
<li><i>1</i><span><b>Card hover:</b> lavender border + soft shadow, arrow shows it's a link. Whole card is one target.</span></li>
<li><i>2</i><span><b>Card focus:</b> 2 px indigo ring, 2 px outside the card. Enter opens the full view.</span></li>
<li><i>3</i><span><b>Zero count:</b> grey fill, grey number, no arrow, "Nothing new". Not clickable, not in tab order.</span></li>
<li><i>4</i><span><b>Row hover:</b> whole row tints; click anywhere outside the buttons opens the panel.</span></li>
<li><i>5</i><span><b>Row focus:</b> inset 2 px indigo ring with 10 px radius. Review keeps its own 44 px target.</span></li></ol></div>'''
dsweb = f'''<div class="hl"><div class="row" style="align-items:flex-end"><div><div class="eb">Tue 3 Nov</div><h1 style="font-size:28px">Today</h1></div></div><div style="position:relative">{cards()}<span class="pin" style="left:-8px;top:-10px">1</span><span class="pin" style="left:calc(50% + 4px);top:-10px">2</span><span class="pin" style="right:-8px;top:-10px">3</span></div>
<div class="row" style="gap:20px;align-items:flex-start"><div class="wc" style="overflow:visible;flex:1;position:relative"><div class="row" style="padding:14px 16px"><h3 class="b" style="font-size:17px">Needs attention</h3><span class="cnt">11</span><span class="sp"></span><a class="sm" style="color:var(--indigo);font-weight:600">View all (11)</a></div>{ds4_rows()}<span class="pin" style="left:-10px;top:62px">4</span><span class="pin" style="left:-10px;top:118px">5</span></div><div style="width:380px">{LEG}</div></div></div>'''
S('DS4-home-row-card-web', W('Home', dsweb))
IPX = '.ip{width:1024px;height:768px;background:var(--page-web);display:flex}.irail{width:72px;background:var(--navy);display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 0;flex:none;color:#C9C3EE}.irail a{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center}.irail a.on{background:var(--navy-700);color:#fff}.imain{flex:1;display:flex;flex-direction:column;min-width:0}.itop{height:60px;background:#fff;border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 20px;gap:12px;font-weight:600;color:var(--navy)}'
def ipad(title, body, on=0):
    r = ''.join(f'<a class="{"on" if j==on else ""}">{ic(i,22)}</a>' for j,i in enumerate(['home','users','clip','cal','more']))
    return f'<div class="ip"><nav class="irail"><span style="color:var(--coral);font-size:22px;margin-bottom:8px">●</span>{r}</nav><div class="imain"><div class="itop">{title}<span class="sp"></span><span class="icb" style="border:0">{ic("bell")}</span></div>{body}</div></div>'
dsip = f'''<div style="padding:16px 20px;display:flex;flex-direction:column;gap:14px;overflow:hidden;flex:1"><div style="position:relative">{cards(True).replace('class="k" style="white-space:nowrap"','class="k" style="white-space:nowrap;font-size:12px"')}<span class="pin" style="left:-8px;top:-10px">1</span><span class="pin" style="left:calc(50% + 4px);top:-10px">2</span><span class="pin" style="right:-8px;top:-10px">3</span></div>
<div class="wc" style="overflow:visible;position:relative"><div class="row" style="padding:12px 16px"><h3 class="b" style="font-size:17px">Needs attention</h3><span class="cnt">11</span><span class="sp"></span><a class="sm" style="color:var(--indigo);font-weight:600">View all (11)</a></div>{ds4_rows(True)}<span class="pin" style="left:-10px;top:58px">4</span><span class="pin" style="left:-10px;top:114px">5</span></div>
<div class="legend" style="font-size:12px;line-height:17px"><b>iPad (frame 191 layout):</b> same states as web. No hover on touch, so 1 and 4 show as the pressed state for 150 ms; 2 and 5 appear with a keyboard. Cards stay 4 across at 1024 px; numbers never wrap.</div></div>'''
S('DS4-home-row-card-ipad', page(ipad('Home', dsip), 1024, 768, X + IPX))

# ---------------- DS7 read-only fields ----------------
RO = [('Goal · shown to Kavya','Lose 4 kg before Diwali'),('Detailed goal · private','Hit her goal before Diwali. Wants to come back in January for a strength phase.'),
      ('Start weight','68.2 kg'),('Diet preference','Vegetarian'),('Workouts','4 a week · Fat loss v4'),('Meals','4 a day · 1,700 kcal'),
      ('Check-ins','Weekly · Saturday · Standard check-in'),('Reminders','Meals and workouts · quiet 10:00 pm – 7:00 am'),('Steps target','8,000 a day'),('Subscription','Monthly · ₹6,000 · ended Sat 3 Oct')]
def rofields(cols=2):
    return f'<div style="display:grid;grid-template-columns:repeat({cols},1fr);gap:16px 28px">' + ''.join(f'<div class="ro" {"style=grid-column:1/-1" if "Detailed" in l else ""}><label>{l}</label><div class="v">{v}</div></div>' for l,v in RO) + '</div>'
endban = f'<div class="endb">{ic("stop",18)}<div class="sp"><b class="b">Coaching setup (ended)</b><div class="sm muted">Coaching with Kavya ended on Sat 3 Oct. This is the setup you last used.</div></div><span class="chip neu">Ended</span></div>'
cmp_ = f'''<div class="legend" style="width:300px;flex:none"><b>DS7 · read-only field</b><div style="margin-top:10px" class="fld"><label>Editable (active client)</label><div class="in">Lose 4 kg before Diwali</div></div><div style="margin-top:12px" class="ro"><label>Read-only (ended or not editable)</label><div class="v">Lose 4 kg before Diwali</div></div>
<ol style="margin-top:12px"><li><i>1</i><span>Label 12 px semibold grey; value 15 px navy. No box, no counter, no chevron.</span></li><li><i>2</i><span>Accessible name is just the label ("Goal, shown to Kavya"), never "Goal 26/120".</span></li><li><i>3</i><span>Dates read "Sat 3 Oct", never "Oct Oct" or ISO.</span></li><li><i>4</i><span>Greyed disabled inputs only for a control that is briefly unavailable (saving, offline).</span></li></ol></div>'''
pill = '<span class="chip neu" style="height:24px">Ended · Sat 3 Oct</span>'
d7w = chead('KN','a2','Kavya Nair',pill,'Lose 4 kg · Coached Mon 6 Jul – Sat 3 Oct · 27 · Female',f'<a class="btn p sm">Reactivate</a>') + f'<div style="padding:20px 28px;display:flex;gap:20px;flex:1;min-height:0;overflow:hidden"><div class="col" style="flex:1;gap:14px;min-width:0"><div class="seg" style="width:240px"><a>Plans</a><a class="on">Coaching setup</a></div>{endban}<div class="wc" style="padding:20px 22px;position:relative">{rofields(2)}<span class="pin" style="left:-10px;top:16px">1</span></div></div>{cmp_}</div>'
S('DS7-readonly-fields-web', page(web('Clients / Kavya Nair', f'<div style="flex:1;display:flex;flex-direction:column;min-height:0">{d7w}</div>', 'Clients'), 1440, 900, X))
d7i = f'<div style="background:#fff;border-bottom:1px solid var(--border);padding:12px 20px" class="row"><span class="av a2" style="width:44px;height:44px">KN</span><div class="sp"><div class="row" style="gap:8px"><b class="b" style="font-size:20px;font-weight:600">Kavya Nair</b>{pill}</div><div class="xs muted">Coached Mon 6 Jul – Sat 3 Oct</div></div><a class="btn p sm">Reactivate</a></div><div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;overflow:hidden">{endban}<div class="wc" style="padding:16px 18px">{rofields(2)}</div><p class="xs muted">iPad uses the same component. Rows stay 2 columns at 1024 px; long values wrap, never truncate.</p></div>'
S('DS7-readonly-fields-ipad', page(ipad('Clients / Kavya Nair', d7i, 1), 1024, 768, X + IPX))

# ---------------- BP1 delete / reactivate ----------------
EXPL1 = "We'll archive your account for 6 months. Sign in again any time in those 6 months to bring it back, with everything as you left it. After 6 months your account and its data are deleted for good."
EXPL2 = 'Want it deleted permanently right away? Email <a style="color:var(--indigo);font-weight:600">tech@thefitbud.com</a> from the email or phone number on this account and we\'ll delete it.'
BPX = '.bnav{display:flex;align-items:center;gap:8px;height:52px;margin:0 -4px}.bnav b{flex:1;text-align:center;font-size:17px;color:var(--navy);margin-right:44px}.bp p{font-size:15px;line-height:22px;color:var(--ink-700)}.typed{border:1.5px solid var(--indigo)!important;box-shadow:0 0 0 3px var(--lavender);letter-spacing:2px;font-weight:700;color:var(--navy)}.big{width:72px;height:72px;border-radius:36px;display:flex;align-items:center;justify-content:center}'
ios_del = f'''<div class="bnav"><a class="icb" style="border:0;background:transparent">{ic("left",22)}</a><b>Delete account</b></div><div class="bp col" style="gap:14px;padding:4px 4px 0">
<div class="card" style="padding:16px"><div class="row" style="gap:10px;margin-bottom:10px"><span class="big" style="width:40px;height:40px;background:var(--crit-bg);color:var(--crit)">{ic("alert",20)}</span><b class="b" style="font-size:17px">Delete account</b></div><p>{EXPL1}</p></div>
<div class="card" style="padding:14px 16px"><p style="font-size:14px;line-height:20px">{EXPL2}</p></div>
<div class="field" style="margin:4px 0 0"><label>Type DELETE to confirm</label><div class="in typed">DELETE</div></div>
<p class="xs muted" style="margin-top:-4px">Next, we'll send a code to +91 98201 44312 to check it's you.</p></div>'''
ios_del_btn = '<div class="bb" style="position:absolute;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--border);padding:12px 16px 34px"><a class="btn dng" style="width:100%">Delete account</a><a class="btn w" style="width:100%;margin-top:6px;color:var(--ink-700)">Cancel</a></div>'
S('BP1-delete-account-ios', page(phone(ios_del, t='9:41', overlay=ios_del_btn), extra=X + BPX))
ios_re = f'''<div class="col" style="align-items:center;text-align:center;gap:12px;padding:56px 8px 0" class="bp"><span class="big" style="background:var(--lavender);color:var(--indigo)">{ic("user",32)}</span><h1 style="font-size:28px">Welcome back</h1>
<p style="font-size:15px;line-height:22px;color:var(--ink-700)">Your account is archived and will be deleted for good on <b class="b nd">Mon 3 May 2027</b>.</p>
<div class="info" style="text-align:left;margin-top:6px">{ic("alert",16)}<span>Coaching that ended when you deleted your account stays ended. Ask your coach to restart it.</span></div>
<div class="card row" style="padding:12px 14px;width:100%;text-align:left;margin-top:4px"><span class="av a1">RM</span><div class="sp"><b class="b">Rohan Mehta</b><div class="xs muted">+91 98201 44312 · archived Tue 3 Nov</div></div></div></div>'''
ios_re_btn = '<div style="position:absolute;left:0;right:0;bottom:0;padding:12px 16px 34px"><a class="btn p" style="width:100%">Reactivate my account</a><a class="btn o" style="width:100%;margin-top:8px">Sign out</a><p class="xs muted" style="text-align:center;margin-top:10px">Signing out keeps it archived.</p></div>'
S('BP1-reactivate-account-ios', page(phone(ios_re, t='9:41', overlay=ios_re_btn), extra=X + BPX))
SET = [('Profile','user'),('Notifications','bell'),('Privacy and data','lock'),('Help','msg')]
def settings(body):
    nav = ''.join(f'<a class="{"on" if n=="Privacy and data" else ""}" style="display:flex;align-items:center;gap:10px;height:44px;padding:0 12px;border-radius:10px;font-size:14px;font-weight:600;color:{"var(--sel)" if n=="Privacy and data" else "var(--ink-700)"};background:{"var(--sel-bg)" if n=="Privacy and data" else "transparent"}">{ic(i,18)}{n}</a>' for n,i in SET)
    return f'<div style="flex:1;display:flex;gap:28px;padding:24px 28px;min-height:0;position:relative"><div class="col" style="width:220px;gap:4px"><div class="lab" style="margin:0 12px 8px">SETTINGS</div>{nav}</div><div class="col" style="flex:1;gap:14px;max-width:760px">{body}</div></div>'
priv = f'''<h1 style="font-size:28px">Privacy and data</h1><div class="wc" style="padding:18px 20px"><b class="b">Your data</b><p class="sm muted" style="margin-top:4px">Download a copy of your clients' plans and logs as a spreadsheet.</p><a class="btn o sm" style="margin-top:12px">Download my data</a></div>
<div class="wc" style="padding:18px 20px;border-color:var(--crit-line)"><b class="b" style="color:var(--crit)">Delete account</b><p class="sm muted" style="margin-top:4px">Archives your account for 6 months, then deletes it for good.</p><a class="btn dngo sm" style="margin-top:12px">Delete account…</a></div>'''
wdlg = f'''<div class="scrimw"></div><div class="dlg" style="left:440px;top:110px;width:560px"><div class="dh"><h2>Delete account</h2><p style="color:var(--ink-700);font-size:15px;line-height:22px">{EXPL1}</p><p style="color:var(--ink-700);font-size:14px;line-height:20px;margin-top:10px">{EXPL2}</p></div>
<div class="db"><div class="info crit">{ic("users",16)}<span><b>End coaching with your active clients first.</b> You have 12 active clients. <a style="font-weight:700;text-decoration:underline">Go to Clients</a></span></div>
<div class="field" style="margin:0;opacity:.6"><label>Type DELETE to confirm</label><div class="in" style="color:var(--ink-400)">DELETE</div></div></div>
<div class="df"><span class="xs muted">Nothing is archived until your clients are ended.</span><span class="sp"></span><a class="btn o sm">Cancel</a><a class="btn dis sm" aria-disabled="true">Delete account</a></div></div>'''
S('BP1-delete-account-web', page(web('Settings', settings(priv) + wdlg, 'More'), 1440, 900, X))
wre = f'''<div style="width:1440px;height:900px;background:var(--page-web);display:flex;flex-direction:column;align-items:center;justify-content:center">
<div class="row" style="gap:8px;font-size:22px;font-weight:700;color:var(--navy);margin-bottom:24px"><span style="color:var(--coral)">●</span>FitBud</div>
<div class="wc" style="width:520px;padding:32px 36px;display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px"><span class="big" style="background:var(--lavender);color:var(--indigo)">{ic("user",32)}</span><h1 style="font-size:28px">Welcome back</h1>
<p style="font-size:15px;line-height:22px">Your account is archived and will be deleted for good on <b class="b nd">Mon 3 May 2027</b>.</p>
<div class="info" style="text-align:left;width:100%">{ic("users",16)}<span>Your clients' coaching stays ended. You can restart it from Clients.</span></div>
<div class="row" style="gap:10px;width:100%;margin-top:8px"><a class="btn o" style="flex:1">Sign out</a><a class="btn p" style="flex:1.6">Reactivate my account</a></div>
<p class="xs muted">Signed in as rahul.verma@example.in · archived Tue 3 Nov</p></div></div>'''
S('BP1-reactivate-account-web', page(wre, 1440, 900, X + BPX))

# ---------------- DS6 session logging ----------------
EX = [('Goblet squat',[('20','10'),('20','10'),('22.5','8')]),('Romanian deadlift',[('22.5','10'),('22.5','10'),('25','8')]),('Step-ups',[('10','12'),('10','12'),('','')]),('Leg press',[('80','12'),('',''),('','')])]
def setrows(sets, edit=None, done=99):
    o=''
    for j,(kg,r) in enumerate(sets):
        plan = not kg
        o += f'<div class="gl"><span class="pill2" style="justify-content:center">Set {j+1}</span><span class="v {"ed" if edit==j else ""}{" pl" if plan else ""}">{kg or "20"}<small>kg</small></span><span class="v {"pl" if plan else ""}">{r or "10"}<small>reps</small></span><span class="ck {"on" if j<done and not plan else ""}">{ic("check",20,w=2.4)}</span></div>'
    return o
CLS = [('RM','a1','Rohan Mehta','Logged · 11 sets','pos'),('NR','a2','Neha Reddy','Logging now','sel'),('DN','a3','Deepak Nair','Not logged yet','neu'),('MI','a4','Meera Iyer','Absent','crit')]
def clist(on='Neha Reddy'):
    return ''.join(f'<div class="clr {"on" if n==on else ""}"><span class="av {k}" style="width:36px;height:36px;font-size:12px">{a}</span><div class="t"><b>{n}</b><span>{s}</span></div>{ic("check",16,"var(--pos)",2.4) if c=="pos" else ""}</div>' for a,k,n,s,c in CLS)
def exblock(i, name, sets, edit=None, done=99):
    return f'<div class="wc" style="overflow:hidden;flex:none"><div class="exh"><span class="pill2">{i}</span><b class="b sp" style="font-size:15px">{name}</b><span class="xs muted">planned 3 × 10</span></div>{setrows(sets,edit,done)}</div>'
after_hdr = lambda big: f'<div class="row" style="gap:12px"><div class="sp"><div class="crumb"><a>{ic("left",16)}Sessions</a></div><b class="b" style="font-size:{24 if big else 20}px;font-weight:600">Morning strength · Lower body B</b><div class="sm muted">Mon 2 Nov · 7:30 – 8:30 am · Gold\'s Gym Andheri · 3 of 4 came</div></div><span class="chip neu">Finished</span></div>'
wbody = f'''<div style="flex:1;display:flex;flex-direction:column;gap:14px;padding:20px 28px;min-height:0;position:relative">{after_hdr(True)}
<div style="display:flex;gap:20px;flex:1;min-height:0"><div class="col" style="width:280px;gap:8px"><div class="lab">LOG FOR ONE CLIENT AT A TIME</div>{clist()}<p class="xs muted" style="margin-top:4px">Absent clients can't be logged. Change attendance in Roll-call.</p></div>
<div class="col" style="flex:1;gap:12px;min-width:0;overflow:hidden"><div class="row"><span class="av a2" style="width:36px;height:36px;font-size:12px">NR</span><b class="b" style="font-size:17px">Neha Reddy</b><span class="xs muted">· planned values filled in, change what she actually did</span></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">{exblock(1,*EX[0])}{exblock(2,EX[1][0],EX[1][1],edit=2)}{exblock(3,EX[2][0],EX[2][1],done=2)}{exblock(4,EX[3][0],EX[3][1],done=1)}</div></div></div>
<div style="display:flex;align-items:center;gap:12px;border-top:1px solid var(--border);padding-top:12px;margin:0 -28px -20px;padding:12px 28px;background:#fff"><span class="sm muted sp">9 of 12 sets done · saves to Neha's workout history as "Logged by Rahul in person"</span><a class="btn o sm">Skip Neha</a><a class="btn p sm" style="min-width:200px">{ic("check",16,w=2.4)}Save Neha's log · next: Deepak</a></div></div>'''
S('DS6-session-log-after-web', page(web('Sessions', wbody, 'Sessions'), 1440, 900, X + DS6X))
ib = f'''<div style="flex:1;display:flex;flex-direction:column;gap:12px;padding:14px 20px 0;min-height:0;position:relative">{after_hdr(False)}
<div style="display:flex;gap:14px;flex:1;min-height:0"><div class="col" style="width:220px;gap:8px">{clist()}</div>
<div class="col" style="flex:1;gap:10px;min-width:0;overflow:hidden">{exblock(2,EX[1][0],EX[1][1],edit=2)}{exblock(3,EX[2][0],EX[2][1],done=2)}<p class="xs muted">Goblet squat · 3 of 3 done above · Leg press below</p></div></div>
<div style="display:flex;align-items:center;gap:12px;border-top:1px solid var(--border);margin:0 -20px;padding:12px 20px;background:#fff"><span class="sm muted sp">9 of 12 sets · Neha Reddy</span><a class="btn p sm" style="min-width:220px">{ic("check",16,w=2.4)}Save Neha's log · next: Deepak</a></div></div>'''
S('DS6-session-log-after-ipad', page(ipad('Sessions', ib, 3), 1024, 768, X + IPX + DS6X))
tabs = ''.join(f'<a class="{"on" if n=="Neha" else ""}"><span class="av {k}">{a}</span>{n}{ic("check",14,"var(--pos)",2.4) if d else ""}</a>' for a,k,n,d in [('RM','a1','Rohan',True),('NR','a2','Neha',False),('DN','a3','Deepak',False)])
live = f'''<div style="flex:1;display:flex;flex-direction:column;gap:12px;padding:14px 20px 0;min-height:0">
<div class="row" style="gap:12px"><div class="sp"><b class="b" style="font-size:20px;font-weight:600">Morning strength · Lower body B</b><div class="xs muted">Live · started 7:32 am · Gold's Gym Andheri · 3 of 4 here</div></div><a class="btn o sm">Roll-call</a><a class="btn p sm">Finish session</a></div>
<div class="row"><div class="ctabs">{tabs}</div><span class="sp"></span><span class="xs muted">Logging for one client · switch any time</span></div>
<div style="display:flex;gap:14px;flex:1;min-height:0"><div class="col" style="width:220px;gap:8px">{''.join(f'<div class="clr {"on" if j==1 else ""}"><span class="pill2">{j+1}</span><div class="t"><b>{n}</b><span>{s}</span></div></div>' for j,(n,s) in enumerate([("Goblet squat","3 of 3 done"),("Romanian deadlift","Set 3 now"),("Step-ups","Next"),("Leg press","Later")]))}</div>
<div class="col" style="flex:1;gap:10px;min-width:0">{exblock(2,EX[1][0],EX[1][1],edit=2,done=2)}
<div class="timer">{ic("clock",18)}<span>Rest 0:52 of 1:30 · Neha</span><span class="sp"></span><a class="btn sm" style="height:44px;background:rgba(255,255,255,.12);color:#fff">+30 s</a><a class="btn sm" style="height:44px;background:rgba(255,255,255,.12);color:#fff">Skip</a></div>
<div class="info">{ic("undo",16)}<span>Set 2 saved for Neha · 22.5 kg × 10. <a style="font-weight:700;color:var(--indigo)">Undo</a> for 10 minutes.</span></div></div></div>
<div style="display:flex;align-items:center;gap:12px;border-top:1px solid var(--border);margin:0 -20px;padding:12px 20px;background:#fff"><span class="sm muted sp">Neha · Romanian deadlift · set 3 of 3 · 25 kg × 8 planned</span><a class="btn p sm" style="min-width:200px">{ic("check",16,w=2.4)}Log set 3 for Neha</a></div></div>'''
S('DS6-session-log-live-ipad', page(ipad('Sessions', live, 3), 1024, 768, X + IPX + DS6X))

if '--list' in sys.argv:
    print(' '.join(f'{n}:{393 if n.endswith("-ios") else (1024 if n.endswith("-ipad") else 1440)}:{852 if n.endswith("-ios") else (768 if n.endswith("-ipad") else 900)}:{3 if n.endswith("-ios") else 2}' for n in OUT))

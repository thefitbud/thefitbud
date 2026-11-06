# Web Home + review side panel (v3, redrawn 22 Oct: panel fully open, sticky footer)
# States: 02 default, 02 resolve form, 02 resolved (Undo + Next), 131 nudge limited/quiet hours/more menu, 132 resolved read-only, 133 no longer exists
from p2_review import *
WX=X+"""
.hl{flex:1;min-width:0;padding:24px 24px 24px 28px;display:flex;flex-direction:column;gap:16px;overflow:hidden}
.wr2{display:flex;align-items:center;gap:12px;min-height:56px;padding:8px 16px;border-top:1px solid var(--border);font-size:14px}.wr2.sel{background:var(--lavender-50);box-shadow:inset 3px 0 0 var(--indigo)}
.wr2 b{width:120px;color:var(--navy);font-weight:600;flex:none}.wr2 .is{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--ink-700)}.wr2 .s{width:62px;color:var(--ink-500);font-size:13px;text-align:right;flex:none}
.panel{width:540px;background:#fff;border-left:1px solid var(--border);display:flex;flex-direction:column;flex:none;box-shadow:-12px 0 32px rgba(26,18,72,.08);min-height:0}
.pnh{padding:14px 20px 12px;border-bottom:1px solid var(--border)}.pnb{flex:1;overflow:hidden;padding:18px 20px;display:flex;flex-direction:column;gap:14px}
.pnf{border-top:1px solid var(--border);padding:14px 20px 16px;background:#fff;position:relative}
.src{border:1px solid var(--border);border-radius:16px;overflow:hidden}.src .t{display:flex;align-items:center;gap:8px;padding:10px 14px;background:var(--lavender-50);font-size:13px;font-weight:600;color:var(--indigo);border-bottom:1px solid var(--border)}
.src .kv{padding:6px 14px 12px;grid-template-columns:110px 1fr;margin-top:4px}
.lab{font-size:12px;font-weight:700;color:var(--ink-500);letter-spacing:.3px}
.sig{display:flex;gap:8px;align-items:flex-start;font-size:13px;color:var(--ink-700);margin-top:6px}.sig .ic{color:var(--ink-500);margin-top:1px}
.tl{display:flex;flex-direction:column;gap:8px;margin-top:6px}.tl div{display:flex;gap:10px;align-items:center;font-size:13px}.tl i{width:8px;height:8px;border-radius:4px;background:var(--ink-200);flex:none}.tl i.on{background:var(--indigo)}.tl i.ok{background:var(--pos)}.tl span{color:var(--ink-500)}
.also a{display:flex;align-items:center;gap:10px;min-height:48px;padding:0 14px;border-top:1px solid var(--border);font-size:14px;color:var(--ink-700)}.also a:first-child{border-top:0}.also a .sp{min-width:0}
.info{display:flex;gap:10px;align-items:flex-start;background:var(--neu-bg);border:1px solid var(--neu-line);border-radius:14px;padding:10px 12px;font-size:13px;color:var(--neu)}
.ochips{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}.ochips a{height:44px;padding:0 14px;border-radius:22px;border:1px solid var(--border-strong);display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:var(--ink-700)}.ochips a.on{background:var(--sel-bg);border-color:#D6CFFF;color:var(--sel)}
.ta{border:1.5px solid var(--indigo);border-radius:14px;padding:10px 12px;font-size:14px;min-height:78px;margin-top:8px;color:var(--ink-700)}
.menu{position:absolute;right:20px;bottom:calc(100% - 12px);width:240px;background:#fff;border:1px solid var(--border);border-radius:16px;box-shadow:0 12px 32px rgba(26,18,72,.16);padding:6px;z-index:3}.menu a{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;border-radius:10px;font-size:14px;color:var(--ink-700)}.menu a.h{background:var(--hover)}.menu hr{border:0;border-top:1px solid var(--border);margin:4px 0}
.btn.dis{background:var(--neu-bg);color:var(--ink-500);border-color:var(--neu-line)}
"""
def whome_rows(sel):
    rows=''
    for c in CL:
        a,k,n,i,s,sl,cnt,since=c
        rows+=f'<div class="wr2 {"sel" if n==sel else ""}"><span class="av {k}" style="width:32px;height:32px">{a}</span><b>{n}</b><span class="is">{i}{f" <span class=cnt>{cnt} open</span>" if cnt>1 else ""}</span><span class="chip {s}">{sl}</span><span class="s">{since}</span></div>'
    rv=''.join(f'<div class="wr2 {"sel" if n==sel else ""}"><span class="av {k}" style="width:32px;height:32px">{a}</span><b>{n}</b><span class="is">{i}</span><span class="chip neu">{ic("check",12,w=2.2)}{m.split(" · ")[1]}</span></div>' for a,k,n,i,m in RV)
    return f'''<div class="hl"><div><div class="eb">Sun 18 Oct</div><h1 style="font-size:28px">Today</h1></div>
    <div class="wc" style="overflow:hidden"><div class="row" style="padding:14px 16px"><h3 class="b" style="font-size:17px">Needs you</h3><span class="cnt">4</span><span class="sp"></span><span class="xs muted">Most urgent first</span></div>{rows}</div>
    <div class="wc" style="overflow:hidden"><div class="row" style="padding:14px 16px"><h3 class="b" style="font-size:17px">Reviewed</h3><span class="cnt" style="background:var(--neu-bg);color:var(--neu)">2</span><span class="sp"></span><span class="xs muted">Reviewed, still open · leaves when every item is resolved</span></div>{rv}</div></div>'''
def phead(av,k,name,meta,n,m,dots,chip='',first=True,last=False):
    return f'''<div class="pnh"><div class="row"><span class="av {k}">{av}</span><div class="col sp" style="min-width:0"><b class="b" style="font-size:18px;white-space:nowrap">{name}</b><span class="xs muted">{meta}</span></div><div class="stp"><a class="{"dis" if first else ""}" aria-label="Previous item">{ic("left",18)}</a><span>{n} of {m}</span><a class="{"dis" if last else ""}" aria-label="Next item">{ic("right",18)}</a></div><a class="icb" style="border:0" aria-label="Close panel">{ic("x")}</a></div><div class="row" style="margin-top:10px"><div class="dots" style="justify-content:flex-start;margin:0">{dots}</div><span class="sp"></span>{chip}</div></div>'''
def dts(st): return ''.join(f'<i class="{c}" style="width:48px"></i>' for c in st)
def src(icn,t,kv): return f'<div class="src"><div class="t">{ic(icn,15)}{t}</div><div class="kv">{"".join(f"<span>{a}</span><span>{b}</span>" for a,b in kv)}</div></div>'
def tl(items): return '<div><div class="lab">TIMELINE</div><div class="tl">'+''.join(f'<div><i class="{c}"></i>{a}<span>· {b}</span></div>' for c,a,b in items)+'</div></div>'
ROHAN_KV=[('Planned','Lower body A · 5 exercises · 16 sets · about 50 min, at 7:00 pm'),('Window','Due by 11:59 pm Tue 13 Oct'),('Logged','Nothing logged')]
def also(): return f'<div><div class="lab">ALSO OPEN FOR ROHAN</div><div class="wc also" style="margin-top:8px;overflow:hidden"><a>{ic("dumbbell",16)}<span class="sp">2 · Missed workout · Thu 15 Oct</span><span class="chip crit" style="height:22px">Critical</span></a><a>{ic("utensils",16)}<span class="sp">3 · Breakfast not logged · Sat 17 Oct</span><span class="chip attn" style="height:22px">Attention</span></a></div></div>'
def foot_actions(menu='',limited=False):
    nud='<a class="btn dis sm" aria-disabled="true">Nudge on WhatsApp…</a>' if limited else '<a class="btn o sm">Nudge on WhatsApp…</a>'
    return f'''<div class="pnf">{menu}<div class="row" style="gap:8px"><a class="btn s sm">Mark reviewed</a>{nud}<span class="sp"></span><a class="icb" style="border-radius:14px{";background:var(--lavender)" if menu else ""}" aria-label="More actions">{ic("more")}</a><a class="btn p sm" style="min-width:120px">Resolve…</a></div><p class="xs muted" style="margin-top:8px">Mark reviewed moves Rohan to Reviewed. He leaves Home when all 3 items are resolved. Nudge opens WhatsApp with a draft; you press Send.</p></div>'''
def wpanel(sel,ph,body,foot):
    return page(web('Home',f'<div style="display:flex;flex:1;min-height:0;position:relative">{whome_rows(sel)}<aside class="panel" aria-label="Review panel">{ph}<div class="pnb">{body}</div>{foot}</aside></div>'),1440,900,WX)
crit=f'<span class="chip crit">{ic("alert",12)}Critical</span>'
def RH(dots,chip=crit): return phead('RM','a1','Rohan Mehta','Lose 6 kg · week 6 · 3 open items',1,3,dts(dots),chip)
item1='<div><h4 style="font-size:20px;color:var(--navy);font-weight:600">Missed workout · Tue 13 Oct</h4><p class="xs muted" style="margin-top:2px">Open 5 d · not reviewed yet</p></div>'+src('dumbbell','From the workout plan · Fat loss, phase 2',ROHAN_KV)
sig=f'<div><div class="lab">SIGNALS</div><div class="sig">{ic("bell",15)}Workout reminder sent 8:15 pm · not opened</div><div class="sig">{ic("clock",15)}Rohan\'s quiet hours 10:00 pm – 7:00 am</div></div>'
DET=('','Detected','Wed 14 Oct, 12:05 am')
save('02-trainer-web-home-panel-v3-web',wpanel('Rohan Mehta',RH(['on','','']),item1+sig+also()+tl([DET]),foot_actions()))
form=f'<div class="wc" style="padding:14px;border-color:#D6CFFF;box-shadow:0 0 0 3px var(--lavender)"><div class="lab">RESOLVE · OUTCOME</div><div class="ochips"><a class="on">{ic("check",14,w=2.4)}Talked to client</a><a>Plan adjusted</a><a>No action needed</a></div><div class="lab" style="margin-top:14px">NOTE · OPTIONAL · ONLY YOU SEE THIS</div><div class="ta">Called him Wed. Work trip, he\'ll do Lower body A on Saturday instead.</div></div>'
ff='<div class="pnf"><div class="row" style="gap:8px"><a class="btn o sm">Cancel</a><span class="sp"></span><a class="btn p sm" style="min-width:140px">Resolve item</a></div><p class="xs muted" style="margin-top:8px">Resolving locks this item, so Rohan can\'t log Tue 13 Oct late anymore. His other 2 items stay open.</p></div>'
save('02-trainer-web-home-panel-v3-resolve-web',wpanel('Rohan Mehta',RH(['on','','']),item1+form+tl([DET]),ff))
res=f'<div class="resb">{ic("check",16,w=2.4)}<span>Resolved by you · just now · Talked to client</span><a style="margin-left:auto;font-weight:700;min-height:44px;display:flex;align-items:center;padding:0 6px" href="#">Undo</a></div>'
fr=f'<div class="pnf"><div class="row" style="gap:8px"><span class="sm muted">1 of 3 resolved · 2 still open</span><span class="sp"></span><a class="btn p sm" style="min-width:180px">Next item · 2 of 3 {ic("right",16)}</a></div></div>'
save('02-trainer-web-home-panel-v3-resolved-web',wpanel('Rohan Mehta',RH(['ok','',''],'<span class="chip pos">'+ic("check",12,w=2.4)+'1 of 3 resolved</span>'),item1.replace('Open 5 d · not reviewed yet','Resolved just now')+res+also()+tl([DET,('ok','Resolved by you · Talked to client','Sun 18 Oct, 9:44 am')]),fr))
lim=f'<div class="info">{ic("clock",16)}<span>You\'ve nudged Rohan 3 times this hour. You can nudge again in 40 min.</span></div><div class="info" style="background:var(--attn-bg);border-color:var(--attn-line);color:var(--attn)">{ic("moon",16)}<span>It\'s 10:40 pm for Rohan. His quiet hours run until 7:00 am, so a message now may wait until morning.</span></div>'
menu=f'<div class="menu"><a>{ic("note",16)}Add note</a><a>{ic("edit",16)}Adjust plan</a><a class="h">{ic("msg",16)}Message on WhatsApp</a><hr><a>{ic("user",16)}Open client</a><a>{ic("settings",16)}Client settings</a></div>'
save('131-trainer-web-home-panel-v3-nudge-limited-web',wpanel('Rohan Mehta',RH(['on','','']),item1+lim+also()+tl([DET,('on','Nudge opened in WhatsApp','10:12 pm'),("on","Nudge opened in WhatsApp","10:31 pm"),("on","Nudge opened in WhatsApp","10:38 pm")]),foot_actions(menu=menu,limited=True)))
mh=phead('MI','a3','Meera Iyer','PCOS-friendly fat loss · week 8',1,2,dts(['ok','']),'<span class="chip neu">'+ic("check",12,w=2.2)+'Reviewed, still open</span>')
mb=(f'<div><div class="row" style="gap:8px"><h4 style="font-size:20px;color:var(--navy);font-weight:600">Dinner not logged · Mon 12 Oct</h4><span class="chip pos">{ic("check",12,w=2.4)}Resolved</span></div><p class="xs muted" style="margin-top:2px">Read-only · a resolved item can\'t be changed</p></div>'
 +f'<div class="resb">{ic("check",16,w=2.4)}Resolved by you · Sat 17 Oct · Talked to client</div>'
 +src('utensils','From the diet plan · PCOS care, v3',[('Planned','Dinner · jowar roti, palak dal, salad · 480 kcal, at 8:30 pm'),('Window','Due by 11:59 pm Mon 12 Oct'),('Logged','Nothing logged · locked')])
 +'<div><div class="lab">YOUR NOTE · PRIVATE</div><p class="sm" style="margin-top:6px">Family dinner out. She\'ll log ate-out meals with a note from now on.</p></div>'
 +tl([('','Detected','Tue 13 Oct, 12:05 am'),('on','Reviewed by you','Wed 14 Oct, 9:10 am'),('ok','Resolved by you · Talked to client','Sat 17 Oct, 10:05 am')]))
mf=f'<div class="pnf"><div class="row" style="gap:8px"><span class="sm muted">Still open: Lunch not logged · Thu 15 Oct</span><span class="sp"></span><a class="btn p sm" style="min-width:160px">Next item · 2 of 2 {ic("right",16)}</a></div></div>'
save('132-trainer-web-home-panel-v3-resolved-readonly-web',wpanel('Meera Iyer',mh,mb,mf))
nh=phead('NR','a2','Neha Reddy','Lose 4 kg · week 9 · 2 open items',2,2,dts(['','on']),'<span class="chip attn">'+ic("alert",12)+'Attention</span>',first=False,last=True)
nb=f'<div style="text-align:center;padding:70px 30px 0"><span class="av" style="width:64px;height:64px;border-radius:32px;background:var(--lavender);color:var(--indigo)">{ic("alert",28)}</span><h4 style="font-size:20px;color:var(--navy);margin:16px 0 6px;font-weight:600">This item no longer exists</h4><p class="sm muted">Breakfast on Sat 17 Oct was removed by a plan change, so there\'s nothing to review. Neha\'s other item is still open.</p></div>'
nf=f'<div class="pnf"><div class="row" style="gap:8px"><a class="btn o sm">{ic("left",16)}Back to item 1 of 2</a><span class="sp"></span><a class="btn p sm">Next client: Priya Sharma {ic("right",16)}</a></div></div>'
save('133-trainer-web-home-panel-v3-not-found-web',wpanel('Neha Reddy',nh,nb,nf))

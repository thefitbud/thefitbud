from fb import *
X='''.lst{background:#fff;border:1px solid var(--border);border-radius:20px;overflow:hidden}
.cr{display:flex;gap:12px;padding:12px 14px;border-top:1px solid var(--border);align-items:flex-start;min-height:72px;background:#fff;position:relative}.cr:first-child{border-top:0}
.cr .n{flex:1;min-width:0}.cr .n b{font-size:15px;color:var(--navy);font-weight:600}.cr .n .i{font-size:13px;color:var(--ink-700);margin-top:2px}.cr .n .m{font-size:12px;color:var(--ink-500);margin-top:4px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.cr .go{align-self:center;color:var(--ink-400)}
.cnt{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:11px;background:var(--lavender);color:var(--indigo);font-size:12px;font-weight:700}
.sh2{display:flex;align-items:center;gap:8px;margin:16px 4px 8px}.sh2 h3{font-size:15px;font-weight:700;color:var(--navy)}.sh2 .x{margin-left:auto;font-size:12px;color:var(--ink-500)}
.swr{position:relative;border-top:1px solid var(--border);background:var(--pos);overflow:hidden}.swr .act{position:absolute;right:0;top:0;bottom:0;width:132px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;gap:4px}
.swr .cr{transform:translateX(-132px);border-top:0;box-shadow:4px 0 12px rgba(0,0,0,.08)}
.stp{display:flex;align-items:center;gap:4px;flex:none}.stp a{width:44px;height:44px;border-radius:12px;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--navy)}.stp a.dis{color:var(--ink-200)}.stp span{font-size:13px;font-weight:600;color:var(--ink-700);min-width:48px;text-align:center}
.dots{display:flex;gap:6px;justify-content:center;margin:6px 0 10px}.dots i{width:24px;height:4px;border-radius:2px;background:var(--ink-200)}.dots i.on{background:var(--indigo)}.dots i.ok{background:var(--pos)}
.ex{border:1px solid var(--border);border-radius:16px;padding:12px 14px;margin-bottom:10px}.ex h4{font-size:16px;color:var(--navy);font-weight:600;margin:6px 0 4px}
.kv{display:grid;grid-template-columns:96px 1fr;gap:6px 10px;font-size:13px;margin-top:8px}.kv span:nth-child(odd){color:var(--ink-500)}
.acts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
.resb{background:var(--pos-bg);border:1px solid var(--pos-line);color:var(--pos);border-radius:14px;padding:10px 12px;font-size:13px;display:flex;gap:8px;align-items:center}
'''
CL=[('RM','a1','Rohan Mehta','Missed 2 workouts · Tue 13, Thu 15 Oct','crit','Critical',3,'since 5 d'),
    ('AK','a5','Arjun Kapoor','Check-in 2 days overdue','crit','Critical',1,'since 2 d'),
    ('NR','a2','Neha Reddy','Breakfast not logged · Thu, Fri, Sat','attn','Attention',2,'since 3 d'),
    ('PS','a4','Priya Sharma','Package: 1 session left','attn','Attention',1,'today')]
RV=[('MI','a3','Meera Iyer','Lunch not logged · Thu 15 Oct','Reviewed Sat 17 Oct · 1 of 2 resolved'),
    ('DN','a3','Deepak Nair','Asked on WhatsApp: leg day swap','Reviewed today, 9:40 am · 0 of 1 resolved')]
def crow(c,extra=''):
    a,k,n,i,s,sl,cnt,since=c
    more=f'<span class="cnt">{cnt} open</span>' if cnt>1 else ''
    return f'<a class="cr" href="#" {extra}><span class="av {k}">{a}</span><div class="n"><b>{n}</b><div class="i">{i}</div><div class="m"><span class="chip {s}" style="height:22px">{ic("alert",12)}{sl}</span>{more}<span>{since}</span></div></div><span class="go">{ic("right",18)}</span></a>'
def rrow(c):
    a,k,n,i,m=c
    return f'<a class="cr" href="#"><span class="av {k}">{a}</span><div class="n"><b>{n}</b><div class="i">{i}</div><div class="m"><span class="chip neu" style="height:22px">{ic("check",12,w=2.2)}Reviewed, still open</span><span>{m}</span></div></div><span class="go">{ic("right",18)}</span></a>'
def head(n=7):
    return f'<div class="top"><div><div class="eb">Sun 18 Oct · most urgent first</div><h1>Needs you</h1></div><div class="row" style="gap:8px"><a class="icb">{ic("search")}</a><a class="icb">{ic("bell")}</a></div></div><div class="seg"><a class="on" href="#">Needs you {n}</a><a href="#">Asked 1</a><a href="#">Check-ins 2</a></div>'
def needs(swipe=False,after=False):
    cl=CL[1:] if after else CL
    rows=''
    for i,c in enumerate(cl):
        if swipe and i==0: rows+=f'<div class="swr"><div class="act">{ic("check",22,w=2.4)}Mark reviewed</div>{crow(c)}</div>'
        else: rows+=crow(c)
    rv=([( 'RM','a1','Rohan Mehta','Missed 2 workouts · Tue 13, Thu 15 Oct','Reviewed just now · 0 of 3 resolved')] if after else [])+RV
    body=head(len(cl))+f'<div class="sh2"><h3>Needs you</h3><span class="cnt">{len(cl)}</span><span class="x">Swipe left to mark reviewed</span></div><div class="lst">{rows}</div><div class="sh2"><h3>Reviewed</h3><span class="cnt" style="background:var(--neu-bg);color:var(--neu)">{len(rv)}</span><span class="x">Stay here until every item is resolved</span></div><div class="lst">{"".join(rrow(r) for r in rv)}</div>'
    ov=f'<div class="toast">{ic("check",18,w=2.4)}Rohan moved to Reviewed · 3 still open<a href="#">Undo</a></div>' if after else ''
    return page(phone(body,tab='Needs you',tabs=TC,t='9:41',overlay=ov,badges={'Check-ins':2}),extra=X)
save('05-trainer-mobile-needs-you-v3-ios',needs())
save('05-trainer-mobile-needs-you-v3-swipe-ios',needs(swipe=True))
save('05-trainer-mobile-needs-you-v3-reviewed-toast-ios',needs(after=True))
EX=[('Missed workout · Tue 13 Oct','Lower body A was planned for 7:00 pm and wasn\'t logged.',[('Planned','5 exercises · 16 sets · about 50 min'),('Logged','Nothing logged'),('Reminder','Sent 8:15 pm · not opened')]),
    ('Missed workout · Thu 15 Oct','Upper body B was planned for 7:00 pm and wasn\'t logged.',[('Planned','6 exercises · 18 sets'),('Logged','Nothing logged'),('Reminder','Sent 8:15 pm · opened')]),
    ('Breakfast not logged · Sat 17 Oct','Vegetable poha, curd was planned for 8:30 am.',[('Planned','410 kcal'),('Logged','Nothing logged'),('Reminder','Sent 9:10 am · opened')])]
def rsheet(i=0,resolved=False,state=None,alldone=False):
    bg=needs()
    dots=''.join(f'<i class="{"ok" if (resolved and j==0) or (state and j<i) else ("on" if j==i else "")}"></i>' for j in range(3))
    t,d,kv=EX[i]
    if alldone:
        inner=f'''<div style="text-align:center;padding:26px 8px 8px"><span class="av" style="width:64px;height:64px;border-radius:32px;background:var(--pos-bg);color:var(--pos)">{ic("check",30,w=2.4)}</span><h4 style="font-size:20px;color:var(--navy);margin:14px 0 6px">All 3 resolved for Rohan</h4><p class="sm muted">Rohan leaves Needs you. You'll find this in his History.</p></div>
        <div class="kv" style="margin:14px 4px"><span>Tue 13 Oct</span><span>Resolved · Talked to client</span><span>Thu 15 Oct</span><span>Resolved · Plan adjusted</span><span>Sat 17 Oct</span><span>Resolved · No action needed</span></div>
        <a class="btn p" style="width:100%;margin-top:12px">Next client: Arjun Kapoor{ic("right",18)}</a><a class="btn o" style="width:100%;margin-top:8px">Back to Needs you</a>'''
    else:
        status=f'<div class="resb">{ic("check",16,w=2.4)}Resolved by you · just now · Talked to client<a style="margin-left:auto;font-weight:700;min-height:44px;display:flex;align-items:center" href="#">Undo</a></div>' if resolved else ''
        acts='' if resolved else f'<div class="acts"><a class="btn o">Nudge…</a><a class="btn s">Mark reviewed</a></div><a class="btn p" style="width:100%;margin-top:8px">Resolve…</a>'
        nxt=f'<a class="btn p" style="width:100%;margin-top:10px">Next item · 2 of 3{ic("right",18)}</a>' if resolved else ''
        inner=f'''<div class="ex"><span class="chip crit" style="height:22px">{ic("alert",12)}Critical</span> <span class="xs muted">since 5 d</span><h4>{t}</h4><p class="sm">{d}</p><div class="kv">{"".join(f"<span>{a}</span><span>{b}</span>" for a,b in kv)}</div></div>{status}{acts}{nxt}<p class="xs muted" style="text-align:center;margin-top:8px">Mark reviewed keeps Rohan in Reviewed until every item is resolved.</p>'''
    n=f'{i+1} of 3'
    hdr=f'<div class="row" style="margin-bottom:4px"><span class="av a1">RM</span><div class="col sp"><b class="b">Rohan Mehta</b><span class="xs muted">Lose 6 kg · week 6 · 3 open items</span></div><div class="stp"><a class="{"dis" if i==0 else ""}" aria-label="Previous item">{ic("left",18)}</a><span>{"Done" if alldone else n}</span><a aria-label="Next item">{ic("right",18)}</a></div></div><div class="dots">{dots if not alldone else "<i class=ok></i><i class=ok></i><i class=ok></i>"}</div>'
    ov=f'<div class="scrim"></div><div class="sheet" style="top:120px"><div class="gr"></div>{hdr}{inner}</div>'
    return page(phone(head()+'<div class="lst">'+''.join(crow(c) for c in CL)+'</div>',tab='Needs you',tabs=TC,t='9:41',overlay=ov),extra=X)
save('31-trainer-mobile-review-sheet-v3-ios',rsheet(0))
save('31-trainer-mobile-review-sheet-v3-resolved-ios',rsheet(0,resolved=True))
save('31-trainer-mobile-review-sheet-v3-item2-ios',rsheet(1,state=True))
save('31-trainer-mobile-review-sheet-v3-all-resolved-ios',rsheet(2,alldone=True))
# web Home + side panel: see p8_home_panel.py

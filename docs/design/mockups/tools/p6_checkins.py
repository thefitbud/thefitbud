from fb import *
X='''.wc,.sum,.fch,.row,.ro{flex-shrink:0}.wsh{padding:20px 28px 0;background:#fff;border-bottom:1px solid var(--border)}.tabs{display:flex;gap:26px;margin-top:16px}.tabs a{height:44px;display:flex;align-items:center;gap:6px;font-size:15px;font-weight:500;color:var(--ink-500);border-bottom:2px solid transparent}.tabs a.on{color:var(--indigo);border-color:var(--indigo);font-weight:700}
.cnt{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:10px;background:var(--lavender);color:var(--indigo);font-size:12px;font-weight:700}
.sum{display:flex;gap:12px}.sum>div{flex:1;background:#fff;border:1px solid var(--border);border-radius:16px;padding:14px 16px}.sum span{font-size:12px;color:var(--ink-500)}.sum b{display:block;font-size:17px;color:var(--navy);margin-top:2px}
.fch{display:flex;gap:8px}.fch a{height:44px;padding:0 14px;border-radius:22px;border:1px solid var(--border-strong);display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:var(--ink-700);background:#fff}.fch a.on{background:var(--navy);border-color:var(--navy);color:#fff}
.grp{font-size:12px;font-weight:700;color:var(--ink-500);margin:16px 4px 8px;letter-spacing:.2px}
.ci{display:grid;grid-template-columns:110px 1fr 200px 220px 24px;gap:16px;align-items:center;min-height:76px;padding:12px 18px;border-top:1px solid var(--border);background:#fff}.ci:first-child{border-top:0}
.ci .d b{display:block;font-size:15px;color:var(--navy)}.ci .d span{font-size:12px;color:var(--ink-500)}
.ci .nt{font-size:13px;color:var(--ink-500);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dl{font-size:13px;color:var(--ink-700)}.dl b{color:var(--navy)}
.cl{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:#0E7490;font-weight:600;margin-top:4px}
.mci{display:block;padding:12px 14px;border-top:1px solid var(--border);min-height:72px}.mci:first-child{border-top:0}
.ro{display:flex;gap:8px;align-items:center;background:var(--neu-bg);border:1px solid var(--neu-line);color:var(--neu);border-radius:14px;padding:10px 14px;font-size:13px}
'''
ST={'rev':'<span class="chip attn">To review</span>','ok':lambda o:f'<span class="chip pos">{ic("check",12,w=2.4)}Reviewed · {o}</span>','od':'<span class="chip crit">Overdue · 2 d</span>','ms':'<span class="chip neu">Missed</span>','up':'<span class="chip sel">Upcoming</span>'}
ROWS=[('OCTOBER',[
 ('Sun 25 Oct','Weekly check-in','up','Opens Sun 25 Oct, 8:00 am','','',''),
 ('Sat 17 Oct','Monthly review','od','Due Sat 17 Oct · not submitted yet','','',''),
 ('Sun 18 Oct','Weekly check-in','rev','Submitted Sun 18 Oct, 9:12 pm','Weight <b>88.2 kg</b> · down 0.6 kg · waist <b>94 cm</b>','"Long week at work, missed two sessions."','Call booked · Tue 20 Oct, 8:00 pm'),
 ('Sun 11 Oct','Weekly check-in','ok:Needs follow-up','Submitted Sun 11 Oct, 7:40 pm','Weight <b>88.8 kg</b> · down 0.4 kg','You: "Let\'s move leg day to Saturday."','Call held · Tue 13 Oct'),
 ('Sun 4 Oct','Weekly check-in','ms','Not submitted · reminder sent twice','','','')]),
 ('SEPTEMBER',[
 ('Sun 27 Sep','Weekly check-in','ok:Acknowledged','Submitted Sun 27 Sep, 8:05 pm','Weight <b>89.2 kg</b> · down 0.3 kg','You: "Good week. Keep protein up."',''),
 ('Sun 20 Sep','Monthly review','ok:Adjust coaching','Submitted Mon 21 Sep, 10:30 am · 1 d late','Weight <b>89.5 kg</b> · photos 3','You: "Calories down to 1,950 from Mon."','')])]
def RO(rs,ro): return [(d,f,('ok:Acknowledged' if k=='rev' else k),sub,dl,n,'') for d,f,k,sub,dl,n,c in rs if k not in('up','od')] if ro else rs
def st(k): return ST['ok'](k.split(':')[1]) if k.startswith('ok') else ST[k]
def wrows(flt=None,ro=False):
    o=''
    for g,rs in ROWS:
        items=''.join(f'<a class="ci" href="#" aria-label="Open {d} check-in"><div class="d"><b>{d}</b><span>{f}</span></div><div><div class="dl">{dl or "<span class=muted>"+sub+"</span>"}</div>{f"<div class=nt>{n}</div>" if n else ""}{f"<div class=cl>{ic(chr(112)+chr(104)+chr(111)+chr(110)+chr(101),13)}{c}</div>" if c else ""}</div><div>{st(k)}</div><div class="xs muted">{(sub if dl else "") if k!="od" else '<span class="btn s sm" style="height:40px" title="Opens WhatsApp with a draft. You press Send.">'+ic("msg",15)+'Remind on WhatsApp</span>'}</div><span style="color:var(--ink-400)">{ic("right",18)}</span></a>' for d,f,k,sub,dl,n,c in RO(rs,ro) if not (ro and k=='up'))
        o+=f'<div class="grp">{g}</div><div class="wc" style="overflow:hidden">{items}</div>'
    return o
def head(name='Arjun Kapoor',ini='AK',meta='Build strength · week 6 · Every Sunday check-in',ended=False):
    chips='<span class="chip neu">Ended Sat 3 Oct</span>' if ended else '<span class="chip pos">Active</span>'
    acts='' if ended else f'<a class="btn o sm">{ic("msg",16)}Message on WhatsApp</a><a class="btn p sm">{ic("plus",16)}Assign check-in</a>'
    tabs=''.join(f'<a class="{"on" if t=="Check-ins" else ""}">{t}{" <span class=cnt>2</span>" if t=="Check-ins" and not ended else ""}</a>' for t in ['Overview','Plan','Activity','Progress','Check-ins','History'])
    return f'<div class="wsh"><div class="row"><span class="av a5" style="width:52px;height:52px">{ini}</span><div class="sp"><div class="row" style="gap:8px"><b class="b" style="font-size:24px">{name}</b>{chips}</div><div class="sm muted">{meta}</div></div>{acts}<a class="icb" style="border-radius:14px" aria-label="More for this client">{ic("more")}</a></div><div class="tabs">{tabs}</div></div>'
def summ(ended=False):
    if ended: return f'<div class="ro">{ic("alert",16)}Coaching with Kavya ended Sat 3 Oct. Her check-ins are read-only.</div>'
    return f'''<div class="sum"><div><span>Cadence</span><b>Every Sunday · Weekly check-in</b></div><div><span>Next check-in</span><b>Sun 25 Oct</b></div><div><span>Check-in call</span><b style="color:#0E7490">Tue 20 Oct, 8:00 pm</b></div><div><span>This month</span><b>2 of 4 submitted</b></div></div>'''
def FCH(on='All',ro=False):
    rs=[r for _,g in ROWS for r in RO(g,ro)]
    c=lambda p:sum(1 for r in rs if p(r[2]))
    L=[('All',len(rs)),('To review',c(lambda k:k=='rev'))]+([] if ro else [('Overdue',c(lambda k:k=='od'))])+[('Reviewed',c(lambda k:k.startswith('ok'))),('Missed',c(lambda k:k=='ms'))]
    return '<div class="fch">'+''.join(f'<a class="{"on" if n==on else ""}">{n} {x}</a>' for n,x in L)+'</div>'
def wpage(name,body,hd): return page(web('Clients / '+name,hd+f'<div style="padding:18px 28px;overflow:hidden;flex:1;display:flex;flex-direction:column;gap:14px">{body}</div>','Clients'),1440,900,X)
save('162-trainer-web-client-checkins-v3-web',wpage('Arjun Kapoor',summ()+'<div class="row">'+FCH()+'<span class="sp"></span><a class="btn o sm">Change schedule</a></div>'+wrows(),head()))
EMPTYCH='<div class="fch">'+''.join(('<a class="on">' if n=='All' else '<a>')+n+' 0</a>' for n in ['All','To review','Overdue','Reviewed','Missed'])+'</div>'
emp=f'''{summ()}{EMPTYCH}<div class="wc" style="text-align:center;padding:60px 20px"><span class="av" style="width:64px;height:64px;border-radius:32px;background:var(--lavender);color:var(--indigo)">{ic("clip",28)}</span><h2 style="font-size:20px;color:var(--navy);margin:14px 0 6px;font-weight:600">No check-ins yet</h2><p class="sm muted">Priya's first weekly check-in opens Sun 25 Oct. Submitted check-ins show up here, newest first.</p><a class="btn p sm" style="margin-top:16px">{ic("plus",16)}Assign check-in</a></div>'''
save('162b-trainer-web-client-checkins-empty-v3-web',wpage('Priya Sharma',emp.replace('Tue 20 Oct, 8:00 pm','None scheduled').replace('2 of 4 submitted','0 of 0'),head('Priya Sharma','PS','Lose 4 kg · week 1 · Every Sunday check-in').replace('<span class=cnt>2</span>','')))
save('162c-trainer-web-client-checkins-ended-v3-web',wpage('Kavya Nair',summ(True)+'<div class="row">'+FCH(ro=True)+'</div>'+wrows(ro=True),head('Kavya Nair','KN','Lose 4 kg · 13 weeks coached',True)))
# iPad
IX=X+'.ip{width:1024px;height:768px;display:flex;background:var(--page-web)}.rail{width:76px;background:var(--navy);display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:20px;color:#C9C3EE}.rail a{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center}.rail a.on{background:var(--navy-700);color:#fff}.ci{grid-template-columns:90px 1fr 170px 170px 20px;gap:10px}.sum b{font-size:15px}'
rail='<div class="rail">'+''.join(f'<a class="{"on" if n=="users" else ""}">{ic(n,22)}</a>' for n in ['home','cal','users','clip','more'])+'</div>'
save('192b-ipad-client-checkins-v3-ipad',page(f'<div class="ip">{rail}<div class="col sp" style="min-width:0">{head().replace("Message on WhatsApp","WhatsApp")}<div style="padding:16px 20px;display:flex;flex-direction:column;gap:12px;overflow:hidden">{summ()}{FCH()}{wrows().replace('Remind on WhatsApp','Remind')}</div></div></div>',1024,768,IX))

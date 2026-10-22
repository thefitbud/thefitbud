# Check-in form builder with standard questions (web 171/171b) + trainee check-in measurements step (iOS 14/14c). 22 Oct round 2.
# Standard questions = the ones Progress charts: Weight, Body measurements (trainer picks which), Progress photos, ratings 1–5 (Energy, Sleep quality, Stress, Hunger).
# Own questions stay possible; they show in check-in review but are not charted. Trainer mobile has no form building.
from fb import *
WX='''.fb{display:grid;grid-template-columns:1fr 410px 270px;gap:16px;flex:1;min-height:0;padding:0 28px 20px}
.cv{display:flex;flex-direction:column;gap:8px;min-height:0;overflow:hidden}
.gh{display:flex;align-items:baseline;gap:10px;margin:6px 2px 0;white-space:nowrap}.gh b{font-size:12px;font-weight:700;color:var(--ink-500);letter-spacing:.4px}.gh span{font-size:12px;color:var(--ink-500)}
.q{background:#fff;border:1px solid var(--border);border-radius:14px;min-height:50px;display:flex;align-items:center;gap:10px;padding:0 6px 0 8px;flex:none}
.q.on{border-color:var(--indigo);box-shadow:0 0 0 3px var(--lavender)}
.q .gp{color:var(--ink-400);width:20px;display:flex;justify-content:center}.q .qi{width:30px;height:30px;border-radius:9px;background:var(--lavender);color:var(--indigo);display:flex;align-items:center;justify-content:center;flex:none}.q .qi.o{background:var(--hover);color:var(--ink-500)}
.q .t{flex:1;min-width:0}.q .t b{display:block;font-size:14px;color:var(--navy);font-weight:600}.q .t span{display:block;font-size:12px;color:var(--ink-500);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.q .mo{width:44px;height:44px;display:flex;align-items:center;justify-content:center;color:var(--ink-500)}
.sug{display:flex;gap:8px;flex-wrap:wrap;align-items:center;background:var(--lavender-50);border:1px dashed #D6CFFF;border-radius:14px;padding:8px 10px}
.sug a{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border-radius:18px;background:#fff;border:1px solid #D6CFFF;color:var(--indigo);font-size:13px;font-weight:600}
.addq{display:inline-flex;align-items:center;gap:6px;height:44px;padding:0 14px;border-radius:14px;background:#fff;border:1px solid var(--border-strong);font-size:14px;font-weight:600;color:var(--ink-700);align-self:flex-start}
.ins{background:#fff;border:1px solid var(--border);border-radius:16px;padding:16px;display:flex;flex-direction:column;gap:12px;position:relative;min-height:0}
.wf{display:flex;flex-direction:column;gap:6px}.wf label{font-size:13px;font-weight:600;color:var(--ink-700)}.wf .in{min-height:44px;border:1px solid var(--border-strong);border-radius:10px;display:flex;align-items:center;flex-wrap:wrap;padding:6px 10px;font-size:14px;background:#fff;gap:6px;color:var(--ink-900)}.wf .in.on{border-color:var(--indigo);box-shadow:0 0 0 3px var(--lavender)}.wf .hp{font-size:12px;color:var(--ink-500)}.wf .in.dis{background:var(--hover);color:var(--ink-500)}
.tk{display:inline-flex;align-items:center;height:28px;padding:0 10px;border-radius:14px;background:var(--lavender);color:var(--indigo);font-size:13px;font-weight:600}
.seg2{display:inline-flex;background:#EDEBF5;border-radius:12px;padding:3px;gap:3px}.seg2 a{height:36px;padding:0 12px;border-radius:9px;display:flex;align-items:center;font-size:13px;font-weight:600;color:var(--ink-500)}.seg2 a.on{background:#fff;color:var(--navy);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.inf{display:flex;gap:8px;align-items:flex-start;font-size:12px;color:var(--ink-500);background:var(--page-web);border-radius:12px;padding:10px 12px}
.pk{position:absolute;left:16px;right:16px;top:206px;background:#fff;border:1px solid var(--border);border-radius:16px;box-shadow:0 14px 36px rgba(26,18,72,.18);z-index:5;padding:6px;display:flex;flex-direction:column}
.pk .o{display:flex;align-items:center;gap:10px;min-height:48px;padding:4px 10px;border-radius:10px}.pk .o.on{background:var(--lavender-50)}
.pk .cb{width:20px;height:20px;border-radius:6px;border:1.5px solid var(--border-strong);display:flex;align-items:center;justify-content:center;flex:none;color:#fff}.pk .cb.on{background:var(--indigo);border-color:var(--indigo)}
.pk .o .t{flex:1}.pk .o b{display:block;font-size:14px;color:var(--navy);font-weight:600}.pk .o .t span{display:block;font-size:12px;color:var(--ink-500)}
.pk .ms{flex:none;white-space:nowrap;display:inline-flex;background:#EDEBF5;border-radius:10px;padding:2px;gap:2px}.pk .ms a{height:30px;padding:0 9px;border-radius:8px;display:flex;align-items:center;font-size:12px;font-weight:600;color:var(--ink-500)}.pk .ms a.on{background:#fff;color:var(--navy)}
.pk .ft{border-top:1px solid var(--border);margin-top:4px;padding:8px 6px 2px;display:flex;align-items:center;gap:10px}
.pv{background:#fff;border:1px solid var(--border);border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:10px;overflow:hidden}
.mini{border:8px solid #1A1248;border-radius:30px;background:var(--page-mobile);padding:14px 12px;display:flex;flex-direction:column;gap:8px;flex:1;overflow:hidden}
.mini .mc2{background:#fff;border:1px solid var(--border);border-radius:14px;padding:10px 12px}.mini .mr{display:flex;align-items:center;justify-content:space-between;min-height:34px;font-size:13px;color:var(--navy);font-weight:600}.mini .mr i{font-style:normal;font-weight:400;color:var(--ink-500);font-size:11px;display:block}.mini .box{width:76px;height:30px;border:1px solid var(--border-strong);border-radius:9px;display:flex;align-items:center;justify-content:flex-end;padding:0 8px;font-size:12px;color:var(--ink-400)}
'''
def q(icon,name,meta,on=False,own=False,chip=''):
    return f'<div class="q {"on" if on else ""}"><span class="gp">{ic("grip",16)}</span><span class="qi {"o" if own else ""}">{ic(icon,16)}</span><div class="t"><b>{name}</b><span>{meta}</span></div>{chip}<a class="mo" aria-label="More for {name}">{ic("more",18)}</a></div>'
CH='<span class="chip sel" style="height:24px">'+ic("chart",12)+'Charted</span>'
def canvas(stress_added=False):
    std=q('user','Weight','number, kg · required',chip=CH)+q('chart','Body measurements','waist, hip, chest, arm · cm · optional',on=True,chip=CH)+q('camera','Progress photos','front, side, back · optional',chip=CH)+q('chart','Energy','rating 1 to 5 · required',chip=CH)+q('moon','Sleep quality','rating 1 to 5 · how well you slept, not hours',chip=CH)+q('chart','Stress','rating 1 to 5 · optional',chip=CH)
    sug=f'<div class="sug"><span class="xs muted" style="font-weight:600">Suggested, not in this form yet</span><a>{ic("plus",14)}Hunger, 1 to 5</a></div>'
    own=q('msg','What went well this week?','long text',own=True)+q('msg','What was hard?','long text',own=True)+q('alert','Anything hurting?','long text · shows first in review',own=True)
    return f'''<div class="cv"><div class="gh"><b>STANDARD QUESTIONS</b><span>Charted in Progress, same wording for every client</span></div>{std}{sug}
<div class="gh" style="margin-top:10px"><b>YOUR OWN QUESTIONS</b><span>Shown in check-in review. Not charted.</span></div>{own}<a class="addq">{ic("plus",16)}Add your own question</a></div>'''
def wf(l,v,hp='',cls=''): return f'<div class="wf"><label>{l}</label><div class="in {cls}">{v}</div>{f"<span class=hp>{hp}</span>" if hp else ""}</div>'
def inspector(open_=False):
    tk=''.join(f'<span class="tk">{t}</span>' for t in ['Waist','Hip','Chest','Arm · one arm'])
    pick=wf('Measurements to collect',tk+'<span class="sp"></span>'+ic("down",16),'Clients see only the ones you pick.','on' if open_ else '')
    o=f'''<aside class="ins" aria-label="Question settings"><div class="row"><b class="b" style="font-size:16px">Body measurements</b><span class="chip sel" style="height:24px">Standard</span><span class="sp"></span></div>
{wf('Question','Body measurements','Wording is fixed for standard questions.','dis')}{pick}
<div class="wf"><label>Unit</label><div class="seg2" style="align-self:flex-start"><a class="on">cm</a><a>inches</a></div><span class="hp">Saved and charted in cm. Inches are converted.</span></div>
{wf('Tip for the client','Measure in the morning, before breakfast, tape snug but not tight.')}
<div class="row"><span class="sm" style="flex:1">Required</span><span class="tog off"></span></div>
<div class="inf">{ic("chart",14)}<span>Each value saves as a measurement and charts in Progress › Body. Need something we don't list? Add it as your own question; it shows in review but isn't charted.</span></div>'''
    if open_:
        def opt(n,hint,on,ms=None):
            m='' if ms is None else '<span class="ms">'+''.join(f'<a class="{"on" if x==ms else ""}">{x}</a>' for x in ['One','Left & right'])+'</span>'
            return f'<div class="o {"on" if on else ""}"><span class="cb {"on" if on else ""}">{ic("check",13,w=3) if on else ""}</span><div class="t"><b>{n}</b><span>{hint}</span></div>{m}</div>'
        o+='<div class="pk" role="listbox" aria-label="Measurements to collect">'+opt('Waist','At the navel',True)+opt('Hip','Widest part of the hips',True)+opt('Chest','Across the nipple line',True)+opt('Arm','Mid upper arm, relaxed',True,'One')+opt('Thigh','Widest part, standing',False,'One')+opt('Neck','Just below the Adam\'s apple',False)+opt('Calf','Widest part, standing',False,'One')+f'<div class="ft"><span class="xs muted">4 picked · all in cm</span><span class="sp"></span><a class="btn p sm" style="height:40px">Done</a></div></div>'
    return o+'</aside>'
def preview():
    rows=''.join(f'<div class="mr"><span>{n}<i>{h}</i></span><span class="box">cm</span></div>' for n,h in [('Waist','At the navel'),('Hip','Widest part'),('Chest','Nipple line'),('Arm','Mid upper arm')])
    return f'''<aside class="pv" aria-label="Client preview"><div class="row"><b class="b" style="font-size:14px">Client preview</b><span class="sp"></span><span class="xs muted">iPhone</span></div><div class="mini"><span class="xs muted">Body and photos · step 1 of 3</span>
<div class="mc2"><span class="xs muted" style="font-weight:700">WEIGHT</span><div style="font-size:24px;font-weight:600;color:var(--navy)">86.4 <span style="font-size:13px">kg</span></div></div>
<div class="mc2"><b class="b" style="font-size:13px">Body measurements</b><div class="xs muted" style="margin-bottom:4px">Measure in the morning, before breakfast.</div>{rows}</div><span class="xs muted" style="text-align:center">Photos and ratings follow</span></div></aside>'''
def builder(open_=False):
    hd=f'''<div class="row" style="padding:20px 28px 14px"><div class="sp"><div class="row" style="gap:10px"><b class="b" style="font-size:26px;font-weight:600">Weekly check-in</b><span class="chip neu">{ic("edit",12)}Draft · v3</span></div><div class="sm muted">Check-in form · v2 in use by 16 clients · they move to v3 from their next check-in</div></div><a class="btn o sm">Preview on phone</a><a class="btn p sm">Publish v3</a></div>'''
    return page(web('Templates / Check-in forms / Weekly check-in',hd+f'<div class="fb">{canvas()}{inspector(open_)}{preview()}</div>','Templates'),1440,900,WX)
save('171-trainer-web-checkin-form-builder-v3-web',builder())
save('171b-trainer-web-checkin-form-measure-picker-v3-web',builder(True))

# Trainee check-in, step 1 (iOS): weight + the measurements Rahul picked
MX='''.ck{position:absolute;left:0;right:0;top:54px;bottom:0;overflow:hidden}
.ckh{display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 8px}.ckh a{min-width:64px;min-height:44px;display:flex;align-items:center;justify-content:center;color:var(--indigo);font-weight:600;font-size:16px}.ckh b{font-size:17px;color:var(--navy);font-weight:600}
.stp{display:flex;gap:6px;padding:4px 16px 0}.stp i{flex:1;height:4px;border-radius:2px;background:var(--ink-200)}.stp i.on{background:var(--indigo)}
.stl{display:flex;justify-content:space-between;padding:8px 16px 0;font-size:13px;color:var(--ink-500)}.stl b{color:var(--indigo)}
.bd{padding:10px 16px;display:flex;flex-direction:column;gap:10px}
.wt{padding:14px 16px;display:flex;align-items:center;gap:10px}.wt .v{font-size:40px;font-weight:600;color:var(--navy);letter-spacing:-.5px}.wt .v small{font-size:17px;font-weight:500}
.stb{width:52px;height:52px;border-radius:26px;background:var(--lavender);color:var(--indigo);display:flex;align-items:center;justify-content:center;flex:none;font-size:26px;font-weight:500}
.mm{padding:14px 16px 6px}.mm .mr{display:flex;align-items:center;gap:10px;min-height:60px;border-top:1px solid var(--border)}.mm .mr:first-of-type{border-top:0}
.mm .mr .t{flex:1}.mm .mr b{display:block;font-size:15px;color:var(--navy);font-weight:600}.mm .mr .t span{display:block;font-size:12px;color:var(--ink-500)}
.nb{width:112px;height:48px;border:1px solid var(--border-strong);border-radius:14px;display:flex;align-items:center;justify-content:flex-end;gap:4px;padding:0 12px;font-size:17px;font-weight:600;color:var(--navy);background:#fff}.nb small{font-size:13px;color:var(--ink-500);font-weight:500}.nb.e{color:var(--ink-400);font-weight:500}.nb.on{border-color:var(--indigo);box-shadow:0 0 0 3px var(--lavender)}
.ft2{position:absolute;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--border);padding:12px 16px 30px;display:flex;flex-direction:column;gap:8px;align-items:center}
.kp{position:absolute;left:0;right:0;bottom:0;background:#D1D4DB;padding:0 0 30px;z-index:5}.kp .bar{height:46px;background:#F5F5F7;display:flex;align-items:center;padding:0 8px;gap:4px;border-top:1px solid #C5C7CE}.kp .bar a{min-height:44px;min-width:44px;display:flex;align-items:center;justify-content:center;color:var(--indigo);font-weight:600;font-size:15px;padding:0 8px}
.kp .keys{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding:7px}.kp .keys span{height:48px;background:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;color:#111;box-shadow:0 1px 0 #898A8D}.kp .keys span.g{background:transparent;box-shadow:none}
'''
def ckpage(inner,overlay):
    return page(f'<div class="ph">{sbar("ios","9:14")}<div class="ck"><div class="ckh"><a>Close</a><b>Weekly check-in</b><span style="min-width:64px"></span></div><div class="stp"><i class="on"></i><i></i><i></i></div><div class="stl"><span><b>Body and photos</b> · step 1 of 3</span><span>Due Fri 23 Oct, 11:59 pm</span></div><div class="bd">{inner}</div></div>{overlay}</div>',extra=MX)
def mrow(n,h,last,v,on=False):
    box=f'<span class="nb {"on" if on else ""} {"e" if not v else ""}">{v or ""}<small>cm</small></span>'
    return f'<div class="mr"><div class="t"><b>{n}</b><span>{h}</span><span>{last}</span></div>{box}</div>'
def body(focus=None,hipv=''):
    wt=f'<div class="card wt"><div class="sp"><div class="xs muted" style="font-weight:700;letter-spacing:.3px">WEIGHT</div><div class="v">86.1 <small>kg</small></div><div class="xs muted">Last: 86.4 kg · Fri 16 Oct</div></div><a class="stb" aria-label="Decrease weight">−</a><a class="stb" aria-label="Increase weight">+</a></div>'
    rows=mrow('Waist','At the navel','Last: 94 cm · Fri 9 Oct','93.5')+mrow('Hip','Widest part of the hips','Last: 102 cm · Fri 9 Oct',hipv,focus=='hip')+mrow('Chest','Across the nipple line','Last: 101 cm · Fri 9 Oct','')+mrow('Arm','Mid upper arm, relaxed · either arm','Last: 34 cm · Fri 9 Oct','')
    mm=f'<div class="card mm"><div class="row" style="align-items:flex-start"><div class="sp"><b class="b" style="font-size:16px">Body measurements</b><div class="xs muted">Rahul asks for these 4. Measure in the morning, before breakfast.</div></div><a style="color:var(--indigo);font-weight:600;font-size:14px;min-height:44px;display:flex;align-items:center">How to</a></div>{rows}</div>'
    ph=lambda n,done: f'<div style="flex:1;height:84px;border-radius:14px;{"background:var(--lavender);color:var(--indigo)" if done else "border:1.5px dashed var(--border-strong);color:var(--indigo)"};display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-size:13px;font-weight:600">{ic("check" if done else "camera",18)}{n}</div>'
    pr=f'<div class="row" style="margin:2px 4px -4px"><b class="b" style="font-size:16px;font-weight:600">Progress photos</b><span class="xs muted">optional</span><span class="sp"></span></div><div class="row" style="gap:8px">{ph("Front",True)}{ph("Side",False)}{ph("Back",False)}</div>'
    return mm if focus else wt+mm+pr
ft='<div class="ft2"><a class="btn p" style="width:100%">Continue</a><span class="xs muted">'+ic("cloud",13)+' Draft saved · 9:14 pm · measurements are optional</span></div>'
save('14-trainee-check-in-v3-ios',ckpage(body(),ft))
keys=''.join(f'<span>{k}</span>' for k in '123456789')+'<span>.</span><span>0</span><span class="g" aria-label="Delete">'+ic("del",24)+'</span>'
kp=f'<div class="kp" role="group" aria-label="Number keypad"><div class="bar"><a aria-label="Previous">{ic("left",18)}</a><a aria-label="Next">{ic("down",18)}</a><span class="sp"></span><span class="xs muted">Hip · cm · last 102</span><span class="sp"></span><a>Done</a></div><div class="keys">{keys}</div></div>'
save('14c-trainee-check-in-measure-entry-v3-ios',ckpage(body('hip','102.5'),kp))

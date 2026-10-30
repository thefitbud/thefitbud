# Active workout set entry (iOS, light theme): number keypad with kg default + Bodyweight toggle, so logged loads stay numeric.
# 11 = weighted set (kg), 11c = bodyweight set (reps only). Replaces 11-trainee-active-workout-ios. 22 Oct round 2.
from fb import *
X='''.aw{position:absolute;left:0;right:0;top:54px;bottom:0;overflow:hidden;padding:0 16px}
.awh{display:flex;align-items:center;gap:12px;height:60px}
.ex{padding:12px 14px;display:flex;align-items:center;gap:12px;margin-top:8px}.ex .n{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:700;flex:none}.ex .n.d{background:var(--navy);color:#fff}.ex .n.a{background:var(--indigo);color:#fff}.ex .n.u{background:var(--lavender);color:var(--indigo)}
.ex .t{flex:1;min-width:0}.ex .t b{display:block;font-size:16px;color:var(--navy);font-weight:600}.ex .t span{display:block;font-size:13px;color:var(--ink-500)}
.act{margin-top:8px;padding:12px 14px 10px;border-color:#D6CFFF;box-shadow:0 0 0 3px var(--lavender)}
.cn{font-size:13px;color:var(--indigo);margin:6px 0 8px 52px}
.sh{display:grid;grid-template-columns:26px 1fr 92px 64px 44px;gap:8px;font-size:11px;font-weight:700;color:var(--ink-500);letter-spacing:.3px;padding:0 4px}
.sr{display:grid;grid-template-columns:26px 1fr 92px 64px 44px;gap:8px;align-items:center;min-height:56px;padding:0 4px;border-radius:12px;font-size:15px;color:var(--ink-700)}
.sr.dn{background:var(--lavender-50)}.sr.cur{background:#fff;box-shadow:0 0 0 2px var(--indigo)}
.cell{height:44px;border-radius:12px;background:var(--hover);display:flex;align-items:center;justify-content:center;font-weight:600;color:var(--navy);font-size:16px;gap:3px}.cell small{font-size:12px;color:var(--ink-500);font-weight:500}
.cell.on{background:#fff;box-shadow:0 0 0 2px var(--indigo)}.cell.bw{font-size:12px;background:var(--lavender);color:var(--indigo)}.cell.pl{color:var(--ink-400);font-weight:500}
.tick{width:44px;height:44px;border-radius:12px;border:1.5px solid var(--border-strong);display:flex;align-items:center;justify-content:center;color:var(--ink-400)}.tick.on{background:var(--navy);border-color:var(--navy);color:#fff}
.pad{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:24px 24px 0 0;box-shadow:0 -8px 30px rgba(26,18,72,.16);padding:10px 12px 30px;z-index:5}
.pad .gr{width:40px;height:5px;border-radius:3px;background:var(--ink-200);margin:0 auto 10px}
.pad .tp{display:flex;align-items:center;gap:10px;padding:0 4px 10px}
.pad .seg{flex:none;width:210px}
.kg{display:grid;grid-template-columns:repeat(3,1fr) 92px;gap:8px}.kg span{height:52px;border-radius:12px;background:var(--hover);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:600;color:var(--navy)}.kg span.q{font-size:15px;background:var(--lavender);color:var(--indigo)}.kg span.nx{grid-row:span 2;height:auto;background:var(--indigo);color:#fff;font-size:15px;flex-direction:column;gap:2px}.kg span.dis{color:var(--ink-200)}
'''
def sr(n,prev,load,reps,state=''):
    return f'<div class="sr {state}"><span style="text-align:center;font-weight:600">{n}</span><span class="sm muted" style="white-space:nowrap">{prev}</span>{load}{reps}<span class="tick {"on" if state=="dn" else ""}" aria-label="Log set {n}">{ic("check",20,w=2.4)}</span></div>'
def cell(v,unit='',cls=''): return f'<span class="cell {cls}">{v}{f"<small>{unit}</small>" if unit else ""}</span>'
def pad(mode='kg',label='Set 2 · load',nxt='Next: reps'):
    seg='<div class="seg" role="radiogroup" aria-label="Load type">'+''.join(f'<a class="{"on" if m==mode else ""}" role="radio">{t}</a>' for m,t in [('kg','kg'),('bw','Bodyweight')])+'</div>'
    q=('<span class="q">−2.5</span>','<span class="q">+2.5</span>') if mode=='kg' else ('<span class="q">−1</span>','<span class="q">+1</span>')
    dot='<span>.</span>' if mode=='kg' else '<span class="dis" aria-disabled="true">.</span>'
    k=lambda a,b,c,x:f'<span>{a}</span><span>{b}</span><span>{c}</span>{x}'
    keys=k(1,2,3,q[0])+k(4,5,6,q[1])+k(7,8,9,f'<span class="nx">{nxt}{ic("right",18)}</span>')+dot+'<span>0</span><span aria-label="Delete">'+ic("del",22)+'</span>'
    hint='Weight used, in kg' if mode=='kg' else 'Holding weights? Switch to kg'
    return f'<div class="pad" role="group" aria-label="Set entry keypad"><div class="gr"></div><div class="tp"><div class="sp"><b class="b" style="font-size:16px">{label}</b><div class="xs muted">{hint}</div></div>{seg}</div><div class="kg">{keys}</div></div>'
def hdr(): return f'<div class="awh"><a class="icb" aria-label="Pause workout">{ic("pause",18)}</a><div class="sp"><b class="b" style="font-size:17px;font-weight:600">Lower body B</b><div class="sm muted"><span style="color:var(--coral)">●</span> 21 min · exercise {{}} of 6</div></div><a class="btn s sm">Finish</a></div>'
done=f'<div class="card ex"><span class="n d">{ic("check",18,w=2.6)}</span><div class="t"><b>Goblet squat</b><span>Done · 3 of 3 sets · 12 × 14 kg</span></div>{ic("down",18)}</div>'
H='<div class="sh"><span>SET</span><span>PREVIOUS</span><span>LOAD</span><span>REPS</span><span></span></div>'
# 11: Romanian deadlift, set 2 load being typed (kg)
rdl=f'''<div class="card act"><div class="row"><span class="n a" style="width:40px;height:40px;border-radius:12px;background:var(--indigo);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">2</span><div class="sp"><b class="b" style="font-size:16px;font-weight:600">Romanian deadlift</b><div class="sm muted">3 × 10 · 20 kg · rest 90 s</div></div><a class="icb" style="border:0" aria-label="Watch demo">{ic("play",18)}</a></div><div class="cn">Rahul: soft knees, push the hips back.</div>{H}
{sr(1,"17.5 × 10",cell("20","kg"),cell("10"),"dn")}{sr(2,"17.5 × 10",cell("22.5","kg","on"),cell("10"),"cur")}{sr(3,"17.5 × 10",cell("20","kg","pl"),cell("10","","pl"))}</div>'''
save('11-trainee-active-workout-v3-ios',page(f'<div class="ph">{sbar("ios","7:21")}<div class="aw">{hdr().format(2)}{done}{rdl}</div>{pad()}</div>',extra=X))
# 11c: Step-ups, bodyweight: load shows Bodyweight, reps being typed
done2=done+f'<div class="card ex"><span class="n d">{ic("check",18,w=2.6)}</span><div class="t"><b>Romanian deadlift</b><span>Done · 3 of 3 sets · 22.5 kg × 10</span></div>{ic("down",18)}</div>'
su=f'''<div class="card act"><div class="row"><span style="width:40px;height:40px;border-radius:12px;background:var(--indigo);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">3</span><div class="sp"><b class="b" style="font-size:16px;font-weight:600">Step-ups</b><div class="sm muted">3 × 10 each leg · bodyweight · rest 60 s</div></div><a class="icb" style="border:0" aria-label="Watch demo">{ic("play",18)}</a></div><div style="height:8px"></div>{H}
{sr(1,"BW × 10",cell("Bodyweight","","bw"),cell("10"),"dn")}{sr(2,"BW × 9",cell("Bodyweight","","bw"),cell("8","","on"),"cur")}{sr(3,"BW × 9",cell("Bodyweight","","bw pl"),cell("10","","pl"))}</div>'''
save('11c-trainee-active-workout-bodyweight-v3-ios',page(f'<div class="ph">{sbar("ios","7:29")}<div class="aw">{hdr().format(3)}{done2}{su}</div>{pad("bw","Set 2 · reps","Log set 2")}</div>',extra=X))
# 11b: rest timer between exercises (light): lavender rest card under the header, next set ready below
RX='''.rest{margin-top:8px;background:var(--lavender);border:1px solid #D6CFFF;border-radius:20px;padding:12px 14px 14px}
.rest .big{font-size:40px;font-weight:600;color:var(--navy);letter-spacing:-.5px;line-height:1}.rest .big small{font-size:15px;font-weight:500;color:var(--ink-700);margin-left:4px}
.rest .rb{min-width:52px;height:44px;border-radius:14px;background:#fff;border:1px solid #D6CFFF;color:var(--indigo);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;padding:0 10px}
.rest .bar2{height:6px;border-radius:3px;background:#fff;margin-top:12px;overflow:hidden}.rest .bar2 i{display:block;height:100%;width:64%;background:var(--indigo);border-radius:3px}
.upn{display:flex;align-items:baseline;gap:6px;margin:14px 4px 0}.upn b{font-size:15px;color:var(--navy);font-weight:600}
.lf{position:absolute;left:0;right:0;bottom:0;background:#fff;border-top:1px solid var(--border);padding:12px 16px 30px;display:flex;flex-direction:column;align-items:center;gap:8px;z-index:5}
'''
rest=f'''<div class="rest" role="timer" aria-label="Rest, 58 seconds left"><div class="row" style="align-items:flex-end"><div class="sp"><div class="xs" style="font-weight:700;color:var(--indigo);letter-spacing:.3px">REST</div><div class="big">58<small>s left</small></div></div><a class="rb" aria-label="15 seconds less">−15 s</a><a class="rb" aria-label="15 seconds more">+15 s</a><a class="rb">Skip</a></div><div class="bar2"><i></i></div><div class="sm" style="margin-top:8px;color:var(--ink-700)">Next: Step-ups, set 1 · bodyweight</div></div>'''
done3=done.replace('class="card ex"','class="card ex" style="margin-top:8px"')+f'<div class="card ex"><span class="n d">{ic("check",18,w=2.6)}</span><div class="t"><b>Romanian deadlift</b><span>Done · 3 of 3 sets · 22.5 kg × 10</span></div>{ic("down",18)}</div>'
su3=f'''<div class="card act"><div class="row"><span style="width:40px;height:40px;border-radius:12px;background:var(--indigo);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700">3</span><div class="sp"><b class="b" style="font-size:16px;font-weight:600">Step-ups</b><div class="sm muted">3 × 10 each leg · bodyweight · rest 60 s</div></div><a class="icb" style="border:0" aria-label="Watch demo">{ic("play",18)}</a></div><div class="cn">Rahul: use a 40 cm box, drive through the front heel.</div>{H}
{sr(1,"BW × 10",cell("Bodyweight","","bw"),cell("10"),"cur")}{sr(2,"BW × 10",cell("Bodyweight","","bw pl"),cell("10","","pl"))}{sr(3,"BW × 9",cell("Bodyweight","","bw pl"),cell("10","","pl"))}</div>'''
lf=f'<div class="lf"><a class="btn p" style="width:100%">{ic("check",18,w=2.4)}Log set 1 · Bodyweight × 10</a><span class="xs muted">Ready early? Logging a set ends the rest.</span></div>'
save('11b-trainee-active-workout-rest-v3-ios',page(f'<div class="ph">{sbar("ios","7:27")}<div class="aw">{hdr().format(3).replace("21 min","27 min")}{rest}{done3}{su3}</div>{lf}</div>',extra=X+RX))

from fb import *
from p4_calendar import X, ai, D, hh
def hint(): return f'<div class="row" style="gap:10px;background:var(--lavender-50);border:1px solid #ECE8FB;border-radius:16px;padding:12px 14px;margin-top:12px"><span style="color:var(--indigo)">{ic("pin",18)}</span><span class="xs muted sp">In-person sessions show up here too if you add an in-person client.</span></div>'
join='<span class="chip sel">'+ic("link",13)+'Join</span>'
pop=f'''<div class="top"><div><div class="eb">Check-in calls · Mon 19 Oct</div><h1>Sessions</h1></div><a class="icb" aria-label="Add call">{ic("plus")}</a></div>
<div class="seg"><a class="on">Upcoming 4</a><a>Past</a></div>
<div class="sec"><h3>Today · Mon 19 Oct</h3><span>1</span></div><div class="ag">{ai("11:00 am","30 min","Meera Iyer","Video call · after her check-in","c",join)}</div>
<div class="sec"><h3>This week</h3><span>3</span></div><div class="ag">{ai("Tue 20","8:00 pm","Arjun Kapoor","Phone call · 30 min · travel week","c")}{ai("Thu 22","12:00 pm","Priya Sharma","Video · 15 min · no link yet","c",'<span class="chip attn">Add link</span>')}{ai("Sun 25","9:00 am","Rohan Mehta","Monthly review · 45 min","c",join)}</div>
<div class="sec"><h3>Past · last 7 days</h3><a>See all</a></div><div class="ag">{ai("Sat 17","7:00 pm","Neha Reddy","Video · 30 min","c",'<span class="chip pos">Done</span>')}{ai("Thu 15","6:30 pm","Deepak Nair","Phone · didn't happen","c",'<span class="chip neu">Missed</span>')}</div>'''
save('206-trainer-mobile-sessions-online-v3-ios',page(phone(pop,tab='Sessions',tabs=TC,t='9:41',badges={'Check-ins':2}),extra=X))
emp=f'''<div class="top"><div><div class="eb">Check-in calls</div><h1>Sessions</h1></div><a class="icb" aria-label="Add call">{ic("plus")}</a></div>
<div style="text-align:center;padding:70px 20px 10px"><span class="av" style="width:72px;height:72px;border-radius:36px;background:#E6F4F6;color:#0E7490">{ic("phone",32)}</span>
<h2 style="font-size:21px;color:var(--navy);margin:16px 0 8px;font-weight:600">No calls scheduled</h2><p class="sm muted">Schedule a check-in call with a client. Calls happen on WhatsApp, Meet or phone. FitBud reminds you 15 min before.</p>
<a class="btn p" style="width:100%;margin-top:20px">{ic("plus",18)}Schedule a call</a><p class="xs muted" style="margin-top:12px">You can also schedule one when you review a check-in.</p></div>{hint()}'''
save('206b-trainer-mobile-sessions-online-empty-v3-ios',page(phone(emp,tab='Sessions',tabs=TC,t='9:41'),extra=X))
# web
PX=37;H=list(range(6,22))
E=[(0,11,.5,'Meera Iyer','11:00 am · video'),(1,20,.5,'Arjun Kapoor','8:00 pm · phone'),(3,12,.5,'Priya Sharma','12:00 pm · add link'),(6,9,.75,'Rohan Mehta','9:00 am · monthly review')]
head='<div></div>'+''.join(f'<div class="ch {"td" if d==19 else ""}">{n}<b>{d}</b></div>' for n,d in D)
hrs='<div style="position:relative">'+''.join(f'<div class="hr" style="position:absolute;top:{(h-6)*PX-6}px;right:0">{hh(h)}</div>' for h in H)+'</div>'
cols=''
for i in range(7):
    ev=''.join(f'<div class="ev c" style="top:{(s-6)*PX+1}px;height:{max(d*PX-3,34)}px"><b>Call · {t}</b>{sub}</div>' for c,s,d,t,sub in E if c==i)
    ln=''.join(f'<div style="position:absolute;left:0;right:0;top:{(h-6)*PX}px;border-top:1px solid #EEF0F5"></div>' for h in H)
    cols+=f'<div class="colm" style="{"background:var(--lavender-50)" if i==0 else ""}">{ln}{ev}</div>'
cal=f'<div class="cal" style="grid-template-columns:56px repeat(7,1fr);grid-template-rows:52px {16*PX}px">{head}{hrs}{cols}</div>'
side=f'''<div class="col" style="width:320px;gap:14px;flex:none"><div class="wc" style="padding:16px"><b class="b">Next up</b>{ai("11:00 am","30 min","Meera Iyer","Video · after her check-in","c",join)}</div>
<div class="wc" style="padding:16px"><b class="b">Clients without a call this month</b><div class="ai" style="padding:8px 0"><span class="av a2" style="width:32px;height:32px">NR</span><div class="sp sm">Neha Reddy</div><a class="btn s sm" style="height:36px">Schedule</a></div><div class="ai" style="padding:8px 0"><span class="av a3" style="width:32px;height:32px">DN</span><div class="sp sm">Deepak Nair</div><a class="btn s sm" style="height:36px">Schedule</a></div></div>
<div class="row" style="gap:10px;background:var(--lavender-50);border:1px solid #ECE8FB;border-radius:16px;padding:12px 14px"><span style="color:var(--indigo)">{ic("pin",18)}</span><span class="xs muted">In-person sessions show up here too if you add an in-person client.</span></div></div>'''
body=f'''<div style="padding:20px 28px 0;display:flex;align-items:flex-end;gap:12px"><div><div class="eb">Check-in calls · Mon 19 – Sun 25 Oct</div><h1 style="font-size:28px">Sessions</h1></div><span class="sp"></span>
<a class="btn o sm" aria-label="Previous week">{ic("left",16)}</a><a class="btn o sm">This week</a><a class="btn o sm" aria-label="Next week">{ic("right",16)}</a><a class="btn p sm">{ic("plus",16)}Schedule a call</a></div>
<div style="display:flex;gap:20px;margin:14px 28px 20px;flex:1;min-height:0"><div class="wc sp" style="overflow:hidden">{cal}</div>{side}</div>'''
save('207-trainer-web-sessions-online-v3-web',page(web('Sessions',body,'Sessions'),1440,900,X))

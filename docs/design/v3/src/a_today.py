from kit import *
A='today'
hdr=lambda eb='Saturday, 14 Nov',dot=True:lhdr('Today',eb,circ('bell',dot=dot))
upnext=f'''{sec("Up next",'<span class="link">Diet</span>',"margin:20px 2px 10px")}<div class="meals">{meal("cookie","Evening snack","Due now","Roasted chana 1 katori · masala chai",220,"up")}</div>'''
note=f'''<div class="card pad row" style="gap:12px;margin-top:12px;align-items:flex-start">{coach_av(False)}<div class="f1"><div class="row sp"><span class="t-bodym">Rahul</span><span class="t-cap">8:05 am</span></div><div class="t-sub" style="color:var(--ink)">Strong week. Try 42.5 kg on the RDLs today if set 2 feels easy.</div></div></div>'''
screen('TR-06a-today-default','Today, default: glance + workout + up next',f'''<div class="content">{hdr()}{week()}{today_summary()}{workout_card()}{upnext}</div>{fade()}{tabbar("Today")}''',A)
screen('TR-06a2-today-scrolled','Today, scrolled: coach note, check-in due, steps',f'''<div class="content" style="top:54px">
<div class="row sp" style="height:44px"><span class="t-head">Today</span><span class="t-cap">Sat 14 Nov</span></div>
{workout_card()}{upnext}
{sec("From Rahul","","margin:20px 2px 10px")}{note}
<div class="card pad row" style="gap:12px;margin-top:12px"><div class="mt" style="background:var(--warn-tint);color:var(--warn)">{ic("clipboard-check",20,2)}</div><div class="f1"><div class="t-bodym">Weekly check-in</div><div class="t-sub">Due today · about 3 minutes</div></div>{btn("Start","tint","",cls="sm")}</div></div>{fade()}{tabbar("Today")}''',A)
rest=f'''<div style="margin-top:12px;border-radius:18px;background:var(--card);padding:16px;box-shadow:0 0 0 .5px var(--line)"><div class="row" style="gap:12px"><div class="mt" style="background:var(--done-tint);color:var(--done)">{ic("moon-star",20,2)}</div><div class="f1"><div class="t-head">Rest day</div><div class="t-sub">Recovery is part of Rahul’s plan.</div></div></div>
<div class="row sp" style="margin-top:14px;padding-top:12px;border-top:.5px solid var(--line)"><span class="t-sub">Next: <b class="b">Upper body A</b></span><span class="t-sub tnum">Mon 16 · 6:30 pm</span></div></div>'''
screen('TR-06b-today-rest-day','Rest day',f'''<div class="content">{hdr("Friday, 13 Nov",False)}{week(sel=5,on=5)}{today_summary(1640,1850,(104,110),(196,210),(49,55),[('dumbbell','Workout','Rest',0),('utensils','Meals','5 of 5',100),('footprints','Steps','9,812',100)])}{rest}</div>{fade()}{tabbar("Today")}''',A)
screen('TR-06c-today-past-day','Past day, read-only plus late log',f'''<div class="content">{hdr("Thursday, 12 Nov · past day",False)}{week(sel=4)}
<div style="margin-top:12px">{banner("Past days are read-only. You can still log a missed meal until Rahul reviews the day.","neutral","lock")}</div>
<div class="card pad row" style="gap:12px;margin-top:12px"><div class="dt">{ic("check",20,2.6)}</div><div class="f1"><div class="t-bodym">Upper body B · done</div><div class="t-sub tnum">48 min · 4,860 kg · 18 sets</div></div>{tag(ic("medal",11,2.4)+"2 PRs","pr")}</div>
{sec("Meals",'<span class="t-sub tnum">4 of 5 logged</span>',"margin:20px 2px 10px")}<div class="meals">
{meal("coffee","Breakfast","8:30 am","Vegetable poha, masala chai",412)}{meal("soup","Lunch","1:30 pm","2 roti, rajma 1 katori, salad",590)}
<div class="card meal" style="box-shadow:0 0 0 1.5px var(--warn)"><div class="mt" style="background:var(--warn-tint);color:var(--warn)">{ic("moon",20,2)}</div><div class="mx"><div class="row" style="gap:6px;align-items:baseline"><span class="t-bodym">Dinner</span><span class="t-cap">8:30 pm</span></div><div class="t-sub msub">Not logged</div></div><div class="pill tint">Log late</div></div></div></div>{fade()}{tabbar("Today")}''',A)
screen('TR-06d-today-future-day','Future day preview (plan only)',f'''<div class="content">{hdr("Monday, 16 Nov · planned",False)}{week(sel=1,on=-1,days=[('S','15','plan'),('M','16','plan'),('T','17','rest'),('W','18','plan'),('T','19','plan'),('F','20','rest'),('S','21','plan')])}
<div style="margin-top:12px">{banner("This is Rahul’s plan for Monday. Logging opens on the day.","brand","calendar-days")}</div>
{workout_card("Upper body A","5 exercises · about 45 min · 15 sets","Mon 16 · 6:30 pm","Preview exercises","list")}
{sec("Meals",'<span class="t-sub tnum">1,850 kcal planned</span>',"margin:20px 2px 10px")}<div class="meals">
{meal("sunrise","Early morning","6:30 am","Soaked almonds · 6 pcs",50,"up")}{meal("coffee","Breakfast","8:30 am","Moong dal chilla 2, curd 1 katori",380,"up")}{meal("soup","Lunch","1:30 pm","2 roti, palak paneer, salad",560,"up")}</div></div>{fade()}{tabbar("Today")}''',A)
screen('TR-06e-today-offline','Offline, cached, with sync chip',f'''<div class="content">{lhdr("Today","Saturday, 14 Nov",sync("offline")+circ("bell"))}{week()}
<div style="margin-top:12px">{banner("You’re offline. Showing what was saved at 9:40 am. Logs will send when you’re back.","neutral","wifi-off")}</div>
{today_summary(1292,1850,(66,110),(150,210),(36,55),[('dumbbell','Workout','0 of 1',0),('utensils','Meals','4 of 5',80),('footprints','Steps','6,240',78)])}
{sec("Up next",'',"margin:20px 2px 10px")}<div class="meals">{meal("cookie","Evening snack","5:00 pm","Not sent yet · eaten as planned",220,"pend")}</div></div>{fade()}{tabbar("Today")}''',A)
sk=lambda:f'''<div class="card pad" style="margin-top:12px"><div class="row" style="gap:18px">{skel("120px",120,60)}<div class="f1 col" style="gap:14px">{skel("60%",20)}{skel("100%",10)}{skel("100%",10)}{skel("100%",10)}</div></div><div class="row" style="gap:8px;margin-top:14px">{skel("33%",52,12)}{skel("33%",52,12)}{skel("33%",52,12)}</div></div>'''
screen('TR-06f-today-loading','Loading skeleton',f'''<div class="content">{hdr(dot=False)}{week()}{sk()}<div style="margin-top:12px">{skel("100%",170,18)}</div><div style="margin-top:22px">{skel("40%",18)}</div><div style="margin-top:12px">{skel("100%",62,16)}</div></div>{fade()}{tabbar("Today")}''',A)
screen('TR-06g-today-refresh-error','Inline refresh error, last good day kept',f'''<div class="content">{hdr()}
<div style="margin-top:12px">{banner("Couldn’t refresh. Showing 9:40 am.","crit","circle-alert","Retry")}</div>{week()}{today_summary()}{workout_card()}</div>{fade()}{tabbar("Today")}''',A)
screen('TR-06h-today-inapp-banner','In-app banner over Today (coach note)',f'''<div class="content">{hdr()}{week()}{today_summary()}{workout_card()}{upnext}</div>{fade()}{tabbar("Today")}
<div style="position:absolute;top:56px;left:10px;right:10px;z-index:85;border-radius:20px;background:var(--glass);backdrop-filter:blur(20px);box-shadow:0 12px 34px rgba(var(--sh),.22);padding:12px 14px;display:flex;gap:12px;align-items:flex-start">
{coach_av(False)}<div class="f1"><div class="row sp"><span class="t-bodym" style="font-size:15px">Rahul left a note</span><span class="t-cap">now</span></div><div class="t-sub" style="font-size:14px;color:var(--ink)">Try 42.5 kg on the RDLs today if set 2 feels easy.</div></div></div>''',A)
save_reg()

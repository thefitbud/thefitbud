from kit import *
A='diet'
H=lambda eb='Saturday, 14 Nov · Rahul’s plan',right='':lhdr('Diet',eb,right)
M1=meal("sunrise","Early morning","6:30 am","Soaked almonds · 6 pcs",50)
M2=meal("coffee","Breakfast","8:30 am","Vegetable poha, masala chai, banana",412)
M3=meal("soup","Lunch","1:30 pm",'<span style="color:var(--warn);font-weight:600">Changed</span> · 2 roti, dal tadka, salad',610)
DUE=due_meal("Evening snack","5:00 pm","Roasted chana 1 katori · masala chai",220)
M5=meal("moon","Dinner","8:30 pm","Paneer bhurji, 2 roti, cucumber raita",560,"up")
def day(summary,meals,count='3 of 5 logged',extra='',eb=None,right=''):
    return f'''<div class="content">{H(eb or 'Saturday, 14 Nov · Rahul’s plan',right)}{week()}{extra}{summary}{sec("Meals",f'<span class="t-sub tnum">{count}</span>',"margin:20px 2px 10px")}<div class="meals">{meals}</div></div>{fade()}{tabbar("Diet")}'''
S0=diet_summary(1072,1850,(58,110),(132,210),(31,55))
screen('TR-07a-diet-day','Diet day: ring kept, collapsed meal cards',day(S0,M1+M2+M3+DUE+M5),A)
S1=diet_summary(1292,1850,(69,110),(158,210),(36,55))
M4d=meal("cookie","Evening snack","5:00 pm","Roasted chana 1 katori · masala chai",220)
screen('TR-07b-eaten-as-planned-undo','Eaten as planned, with Undo',day(S1,M1+M2+M3+M4d+M5,'4 of 5 logged')+toast("Evening snack logged as planned","Undo",96),A)
screen('TR-07c-diet-no-meals-planned','No meals planned today',f'''<div class="content">{H('Saturday, 14 Nov')}{week()}
<div class="card" style="margin-top:14px;padding:26px 18px">{empty("utensils","No meals planned today","Rahul hasn’t set meals for today. If you eat something, you can still log it.",btn("Log what I ate","tint",icon="plus")+'<div style="margin-top:8px">'+btn("Ask Rahul on WhatsApp","textb")+'</div>')}</div></div>{fade()}{tabbar("Diet")}''',A)
M4p=meal("cookie","Evening snack","5:00 pm","Eaten as planned · not sent yet",220,"pend")
screen('TR-07d-diet-offline','Offline: logs saved on phone',day(S1,M1+M2+M3+M4p+M5,'4 of 5 logged',f'<div style="margin-top:12px">{banner("Offline. 1 meal is saved on your phone and will send when you’re back.","neutral","wifi-off")}</div>',right=sync("offline")),A)
S2=diet_summary(2130,1850,(96,110),(262,210),(78,55))
M5o=meal("pizza","Dinner","8:30 pm",'<span style="color:var(--warn);font-weight:600">Ate out</span> · 1,120 kcal',"1,120")
screen('TR-07e-diet-over-budget','Over the day’s calories',day(S2,M2+M3+M4d+M5o,'5 of 5 logged',eb='Saturday, 14 Nov · Rahul’s plan'),A)
ML=meal("coffee","Breakfast","8:30 am","Closed by Rahul · can’t be logged now",380,"lock")
MM=meal("soup","Lunch","1:30 pm","Not logged yet · 2 roti, rajma, salad",560,"miss")
screen('TR-07f-diet-locked-and-missed','Locked meal and an unlogged earlier meal',day(diet_summary(270,1850,(18,110),(31,210),(9,55)),M1+ML+MM+due_meal("Evening snack","5:00 pm","Roasted chana 1 katori · masala chai",220),'1 of 5 logged',eb='Saturday, 14 Nov · Rahul’s plan'),A)
item=lambda n,q,k,ch='':f'<div class="li" style="--inset:14px"><div class="f1"><div class="t-body">{n}</div><div class="t-sub tnum" style="font-size:13.5px">{q}</div></div>{ch}<span class="n-sm">{k}</span><span class="unit" style="font-size:12px">kcal</span></div>'
screen('TR-07g-logged-meal-detail','Logged meal: edit or delete',day(S0,M1+M2+M3+DUE+M5)+sheet(f'''<div class="row sp"><div><div class="t-title">Lunch</div><div class="t-sub">Logged 1:42 pm · changed from the plan</div></div><div class="kc"><span class="n-lg">610</span><span class="t-cap">kcal</span></div></div>
<div class="group" style="margin-top:14px;box-shadow:none;background:var(--bg)">{item("Chapati / roti","2 pieces · plan 3",160,tag("−1","warn"))}{item("Dal tadka","1 katori (150 g)",210)}{item("Jeera rice","½ katori · not in plan",120,tag("Added","brand"))}{item("Cucumber salad","1 bowl",40)}</div>
<div class="row" style="gap:12px;margin-top:10px" ><span class="t-sub tnum">P 22 g · C 88 g · F 16 g</span><span class="t-cap" style="margin-left:auto">Rahul sees the changes</span></div>
<div class="col" style="gap:8px;margin-top:16px">{btn("Edit foods","tint",icon="pencil")}{btn("Delete this log","dangerq")}</div>''',bgc=False),A)
screen('TR-07h-delete-log-confirm','Delete a meal log confirm',day(S0,M1+M2+M3+DUE+M5)+dialog("Delete the lunch log?","Lunch goes back to not logged. Rahul will see that you removed it.",[btn("Delete log","danger"),btn("Cancel","secondary")],"trash-2"),A)
opt=lambda i,t,s,c=('var(--brand-tint)','var(--brand)'):f'<div class="card row" style="gap:12px;padding:14px;margin-top:8px;box-shadow:0 0 0 .5px var(--line2)"><div class="mt" style="background:{c[0]};color:{c[1]}">{ic(i,20,2)}</div><div class="f1"><div class="t-bodym">{t}</div><div class="t-sub" style="font-size:13.5px">{s}</div></div><span class="chev">{ic("chevron-right",18,2.2)}</span></div>'
screen('TR-08a-something-different','Something different: choices',day(S0,M1+M2+M3+DUE+M5)+sheet(f'''<div class="t-title">What did you have instead?</div><div class="t-sub" style="margin-top:2px">Evening snack · plan 220 kcal</div>
{opt("sliders-horizontal" if "sliders-horizontal" in IC else "scale","Changed the portion","Same foods, more or less of each")}{opt("search","Log it myself","Search foods and set amounts")}{opt("store","Ate out","Enter the kcal from the menu or label")}
<div class="row" style="justify-content:center;gap:6px;margin-top:16px" class="link"><span class="link row" style="gap:6px">{ic("message-circle",16,2.2)}Ask Rahul about this meal</span></div>'''),A)
prow=lambda n,unit,v,plan,k:f'''<div class="li" style="--inset:14px;min-height:64px"><div class="f1"><div class="t-body">{n}</div><div class="t-sub tnum" style="font-size:13px">Plan {plan} · <span class="b" style="font-weight:600">{k} kcal</span></div></div><div class="col" style="align-items:center;gap:3px">{stepper(v)}<span class="t-cap">{unit}</span></div></div>'''
screen('TR-08b-changed-portion','Changed the portion (katori, roti)',f'''<div class="content" style="background:var(--bg-plain);top:0;padding-top:54px;bottom:0">{nav("Changed the portion",left="Cancel",right='<span class="navbtn strong">Save</span>',sub="Lunch · 1:30 pm")}
<div class="t-sub" style="margin:8px 2px 4px">Change how much you had. Steps are ½.</div>
<div class="group" style="box-shadow:0 0 0 .5px var(--line2)">{prow("Chapati / roti","pieces","2","3 pieces",160)}{prow("Dal tadka","katori","1½","1 katori",315)}{prow("Jeera rice","katori","0","½ katori",0)}{prow("Cucumber salad","bowl","1","1 bowl",40)}</div>
<div class="row sp" style="margin-top:16px"><span class="link row" style="gap:5px">{ic("rotate-ccw",15,2.2)}Reset to plan</span><span class="t-sub">Rahul sees the difference</span></div></div>
<div class="stick"><div class="row sp" style="margin-bottom:10px"><span class="t-sub">Total</span><span><span class="n-md">515 kcal</span> <span class="tag" style="background:var(--done-tint);color:var(--done)">−45 vs plan</span></span></div>{btn("Save portion")}</div>''',A)
screen('TR-08c-ate-out','Ate out: exact kcal only',f'''<div class="content" style="background:var(--bg-plain);top:0;padding-top:54px;bottom:0">{nav("Ate out",left="Cancel",right='<span class="navbtn strong">Save</span>',sub="Dinner · 8:30 pm")}
<div class="t-sub" style="margin:10px 2px 0">How many kcal? Check the menu, the bill or the label.</div>
<div class="row" style="justify-content:center;align-items:baseline;gap:8px;margin-top:22px"><span class="tnum" style="font-size:52px;line-height:60px;font-weight:700;letter-spacing:-2px">1,120</span><span class="caret" style="display:inline-block;width:3px;height:48px;background:var(--brand);align-self:center"></span><span style="font-size:20px;font-weight:600;color:var(--ink3)">kcal</span></div>
<div class="t-cap" style="text-align:center;margin-top:4px">Rahul’s plan for dinner: 560 kcal</div>
{field("Note for Rahul (optional)","Office party · biryani and gulab jamun")}</div>{kb_num()}''',A)
fr=lambda n,s,act='plus',added=0:f'''<div class="li" style="--inset:14px"><div class="f1"><div class="t-body">{n}</div><div class="t-sub tnum" style="font-size:13px">{s}</div></div>{f'<span class="tag" style="background:var(--done-tint);color:var(--done)">{added} added</span>' if added else ''}<div style="width:34px;height:34px;border-radius:17px;display:flex;align-items:center;justify-content:center;{"background:var(--done);color:var(--on-brand)" if act=="check" else "background:var(--brand-tint);color:var(--brand)"}">{ic(act,18,2.6)}</div></div>'''
mealttl='Evening snack'
screen('TR-26a-food-search-default','Food search before typing: from your plan, then recent',f'''<div class="content" style="background:var(--bg-plain);top:0;padding-top:54px;bottom:0">{nav(mealttl,left="Cancel",right='<span class="navbtn dis">Save</span>',sub="Plan 220 kcal")}
<div class="search">{ic("search",18,2)}Search Indian foods, brands</div>
<div class="t-label glabel">From your plan</div><div class="group" style="box-shadow:0 0 0 .5px var(--line2)">{fr("Roasted chana","1 katori · 180 kcal")}{fr("Masala chai, less sugar","1 cup · 40 kcal")}</div>
<div class="t-label glabel">Recently logged</div><div class="group" style="box-shadow:0 0 0 .5px var(--line2)">{fr("Banana","1 medium · 105 kcal")}{fr("Sprouts chaat","1 katori · 150 kcal")}{fr("Greek yoghurt","1 cup · 120 kcal")}{fr("Peanut chikki","1 piece · 95 kcal")}</div>
<div class="t-cap" style="margin:12px 2px">Tap a food to set katori, piece, cup or grams.</div></div>''',A)
screen('TR-26b-food-search-results-added','Search results with instant add and the log tray',f'''<div class="content" style="background:var(--bg-plain);top:0;padding-top:54px;bottom:0">{nav(mealttl,left="Cancel",right='<span class="navbtn strong">Save</span>',sub="Plan 220 kcal")}
<div class="search" style="color:var(--ink)">{ic("search",18,2,"var(--ink3)")}roti<span class="caret" style="display:inline-block;width:2px;height:20px;background:var(--brand)"></span><span style="margin-left:auto;color:var(--ink4)">{ic("x",16,2.4)}</span></div>
<div class="t-label glabel">Results</div><div class="group" style="box-shadow:0 0 0 .5px var(--line2)">{fr("Chapati / roti","1 piece · 80 kcal","check",2)}{fr("Phulka (no ghee)","1 piece · 70 kcal")}{fr("Tandoori roti","1 piece · 120 kcal")}{fr("Missi roti","1 piece · 150 kcal")}{fr("Ragi roti","1 piece · 95 kcal")}</div></div>
<div class="stick"><div class="row sp" style="margin-bottom:10px"><span class="t-bodym">In this log · 2</span><span class="t-sub tnum">200 kcal</span></div>
<div class="row" style="gap:8px;margin-bottom:12px" data-offok="1"><span class="chip tint">Chapati / roti × 2 {ic("x",14,2.4)}</span><span class="chip tint">Masala chai {ic("x",14,2.4)}</span></div>{btn("Save evening snack")}</div>
{toast("Added Chapati / roti · 1 piece","Undo",196)}''',A)
uchip=lambda t,on=False:f'<span class="chip{" on" if on else ""}" style="height:36px">{t}</span>'
screen('TR-26c-food-detail-katori','Food detail: amount in katori',f'''<div class="content" style="background:var(--bg-plain);top:0;padding-top:54px;bottom:0">{nav("",left="back",left_label="Results",right='<span class="navbtn strong">Add</span>')}
<div class="t-large" style="font-size:26px;line-height:32px">Sprouts chaat</div><div class="t-sub">Moong sprouts, onion, tomato, lemon</div>
<div class="t-label glabel">Unit</div><div class="row" style="gap:8px">{uchip("Katori (150 g)",True)}{uchip("Cup")}{uchip("Grams")}</div>
<div class="row sp" style="margin-top:18px"><span class="t-head">Amount</span><div class="stepper" style="height:44px"><span style="width:44px">{ic("minus",18,2.4)}</span><b class="tnum" style="font-size:20px;min-width:60px">1½</b><span style="width:44px">{ic("plus",18,2.4)}</span></div></div>
<div class="row" style="gap:8px;margin-top:10px">{''.join(uchip(x) for x in ["½","1","1½","2"])}</div>
<div class="card row" style="gap:18px;margin-top:20px;padding:16px;box-shadow:0 0 0 .5px var(--line2)"><div class="rc">{ring(225,220,96,9)}<div class="in"><span class="n-lg">225</span><span class="t-cap">kcal</span></div></div>
<div class="f1 col" style="gap:8px">{''.join(f'<div class="row sp"><span class="mlab row" style="gap:6px"><i style="width:8px;height:8px;border-radius:2px;background:{c};display:inline-block"></i>{l}</span><span class="n-sm">{v} g</span></div>' for l,v,c in [("Protein",14,"var(--protein)"),("Carbs",33,"var(--carbs)"),("Fat",4,"var(--fat)")])}</div></div>
<div class="group" style="margin-top:14px;box-shadow:0 0 0 .5px var(--line2)">{li("Meal","",None,trail="Evening snack",chev=True)}</div></div>
<div class="stick">{btn("Add to evening snack · 225 kcal")}</div>''',A)
screen('TR-26d-food-search-empty-offline','Food search: no match, offline index',f'''<div class="content" style="background:var(--bg-plain);top:0;padding-top:54px;bottom:0">{nav(mealttl,left="Cancel",right='<span class="navbtn dis">Save</span>',sub="Plan 220 kcal")}
<div class="search" style="color:var(--ink)">{ic("search",18,2,"var(--ink3)")}ragi dosa<span style="margin-left:auto;color:var(--ink4)">{ic("x",16,2.4)}</span></div>
<div style="margin-top:12px">{banner("Offline. Showing foods saved on your phone.","neutral","wifi-off")}</div>
<div style="margin-top:60px">{empty("search","No foods match “ragi dosa”","Try a shorter word, like “dosa”. Or create it with its kcal.",btn("Create “Ragi dosa”","tint",icon="plus")+'<div style="margin-top:8px">'+btn("Log as Ate out","textb")+'</div>')}</div></div>''',A)
screen('TR-07i-diet-load-error','Diet couldn’t load (no cache)',f'''<div class="content">{H()}{week()}<div class="card" style="margin-top:14px;padding:26px 18px">{empty("cloud-off","Couldn’t load your meals","Check your connection. Anything you logged is saved on your phone.",btn("Try again","tint",icon="refresh-cw"))}</div></div>{fade()}{tabbar("Diet")}''',A)
save_reg()

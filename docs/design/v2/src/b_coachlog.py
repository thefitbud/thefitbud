from kit_trainer import *
A='client'
BAN=lambda n:f'<div style="position:absolute;left:0;right:0;top:54px;z-index:50;background:var(--navy);color:#fff;padding:8px 16px" class="row sp"><span class="row" style="gap:8px;font-size:14px;font-weight:600">{ic("user-round-check",16,2.2)}Logging for {n} · in person</span><span style="font-size:14px;font-weight:600;color:#C9BEFF">Done</span></div>'
M=meal("coffee","Breakfast","8:30 am","Logged by you · as planned",380)+due_meal("Lunch","1:30 pm","2 roti, rajma, salad",560,"soup","Due now")
screen('TM-15a-coach-logs-meal','Coach logs a meal for a client (in person)',f'<div class="content" style="top:94px">{lhdr("Meera’s food","Saturday, 14 Nov")}{diet_summary(380,1700,(22,100),(48,190),(12,50))}<div class="t-label glabel">Meals</div><div class="meals">{M}</div></div>{BAN("Meera")}',A)
rows=sethead()+setrow('done',1,'50 × 8','50','8')+setrow('done',2,'50 × 8','52.5','8')+setrow('cur',3,'50 × 7','52.5','8',focus='kg')
screen('TM-15b-coach-logs-workout','Coach logs a workout for a client (in person)',wnav('Upper body A','<span style="color:var(--brand);font-weight:600">Logging for Meera</span> · in person')+wstats("18:02","1,240","5","12",40)+f'<div class="wlog">{exhead("Bench press","dumbbell",("3 × 8 · 50 kg","1:30"),"You’re logging in person. Meera sees these sets in her history.")}{rows}</div>',A,cls='white')
save_reg()

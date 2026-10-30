# Today states drawn on the locked v3 Today (Option B): banners 29/29b/113, skeleton 96, offline 104, paused card 115
from p1_today import *
X2='''.iab{position:absolute;left:10px;right:10px;top:50px;background:rgba(255,255,255,.97);border-radius:22px;box-shadow:0 10px 30px rgba(26,18,72,.22);display:flex;align-items:center;gap:12px;padding:12px 10px 12px 14px;min-height:72px;z-index:5}
.iab .ap{width:40px;height:40px;border-radius:11px;background:var(--navy);display:flex;align-items:center;justify-content:center;flex:none}.iab .tx{flex:1;min-width:0}.iab .tx span{display:block;font-size:12px;color:var(--ink-500)}.iab .tx b{display:block;font-size:15px;color:var(--navy);font-weight:600}.iab .tx i{display:block;font-style:normal;font-size:13px;color:var(--ink-700);margin-top:1px}
.iab a{min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;color:var(--ink-400)}
.off{display:flex;align-items:center;gap:8px;background:var(--attn-bg);border:1px solid var(--attn-line);color:var(--attn);border-radius:14px;min-height:44px;padding:0 12px;font-size:13px;font-weight:500;margin-top:6px}
.chip.info{background:var(--info-bg);color:var(--info);border-color:var(--info-line)}
.pz{margin-top:12px;padding:14px}.pz .row{align-items:flex-start}.pz .ib{width:40px;height:40px;border-radius:12px;background:var(--lavender);color:var(--indigo);display:flex;align-items:center;justify-content:center;flex:none}
.sk{background:#ECEBF3;border-radius:8px}.skc{position:relative;overflow:hidden}
'''
def banner(title,body):
    return f'<div class="iab" role="status"><span class="ap"><img src="assets/mark-white.svg" width="22" height="22" alt=""></span><div class="tx"><span>FitBud · now</span><b>{title}</b><i>{body}</i></div><a href="#" aria-label="Open">{ic("right",18)}</a></div>'
def P(html): return html.replace('</style>',X2+'</style>')
# 29 / 29b: early morning, nothing much logged
S['early']=dict(k=50,p=2,c=2,f=4,w=('0 of 1',''),m=('1 of 5',''),s=('1,180',''),t='8:40',day=18,n=1)
save('29-trainee-inapp-meal-v3-ios',P(screen('early','ios',overlay=banner('Breakfast isn\'t logged yet','Vegetable poha, curd · tap to log'))))
save('29b-trainee-inapp-note-v3-ios',P(screen('early','ios',overlay=banner('Rahul has a note for you','"Keep protein up on rest days."'))))
# 113: rest day, check-in reviewed banner
save('113-notif-checkin-reviewed-banner-v3-ios',P(screen('rest','ios',t='1:20',overlay=banner('Rahul reviewed your check-in','Tap to read his note'))))
# 115: rest day + reminders paused card under the workout card
pz=f'<section class="card pz" aria-label="Meal reminders paused"><div class="row"><span class="ib">{ic("pause",18)}</span><div class="sp"><b class="b" style="font-size:16px">Meal reminders paused for a week</b><p class="sm muted" style="margin-top:2px">They didn\'t seem to help, so FitBud paused them until Sun 25 Oct. Turn them back on anytime.</p></div></div><a class="btn s" style="width:100%;margin-top:12px">Turn back on</a></section>'
save('115-notif-paused-today-v3-ios',P(screen('rest','ios',t='7:45',after_wo=pz)))
# 104: Android offline
off=f'<div class="off" role="status">{ic("wifioff",16)}You\'re offline. Logs are saved on this phone.</div>'
wt={1:f'<span class="chip info">{ic("upload",14)}Waiting to send</span>'}
save('104-trainee-today-offline-v3-android',P(screen('partial','android',pre=off,cloud=('cloudoff','Offline · 1 log waiting to send'),meal_chips=wt)))
# 96: loading skeleton mirroring v3 layout (header + week strip are real, content is skeleton)
def sk(w,h,extra=''): return f'<div class="sk" style="width:{w};height:{h}px;{extra}"></div>'
skel=(f'<section class="card pc" aria-busy="true" aria-label="Loading today"><div class="pr"><div style="width:104px;height:104px;border-radius:52px;border:10px solid #ECEBF3;flex:none"></div><div class="mb">'
 +''.join(f'<div><div class="row" style="justify-content:space-between;margin-bottom:6px">{sk("58px",12)}{sk("70px",12)}</div>{sk("100%",6)}</div>' for _ in range(3))
 +'</div></div><div class="pch">'+''.join(f'<div class="sk" style="height:48px;border-radius:14px"></div>' for _ in range(3))+'</div></section>'
 +'<div style="margin-top:12px;border-radius:22px;background:linear-gradient(135deg,#ECEBF3,#E3E1EE);height:150px;padding:16px">'+sk('110px',28,'border-radius:14px;background:#F6F5FB')+sk('60%',20,'margin-top:14px;background:#F6F5FB')+sk('100%',50,'margin-top:16px;border-radius:16px;background:#F6F5FB')+'</div>'
 +f'<div class="sec"><h3>Meals</h3>{sk("80px",12)}</div><div class="ml">'+''.join(f'<div class="mr">{sk("50px",12)}<div class="n">{sk("60%",14)}{sk("85%",11,"margin-top:6px")}</div>{sk("72px",26,"border-radius:13px")}</div>' for _ in range(3))+'</div>')
DAYS2=''.join(f'<a class="d {"on" if x==18 else ""}" href="#"><span>{"Today" if x==18 else n}</span><b>{x}</b><i class="n"></i></a>' for n,x in DAYS)
top=f'<div class="top"><div><div class="eb">Sun 18 Oct</div><h1>Today</h1></div><div class="row" style="gap:8px"><a class="icb" aria-label="Sync status">{ic("cloud")}</a><a class="icb" aria-label="Notifications">{ic("bell")}</a></div></div>'
wk=f'<div class="wk"><a class="ar" href="#">{ic("left",18)}</a>{DAYS2}<a class="ar" style="opacity:.35">{ic("right",18)}</a></div>'
save('96-trainee-today-loading-v3-ios',page(phone(top+wk+skel,tab='Today',t='7:30'),extra=X+X2))

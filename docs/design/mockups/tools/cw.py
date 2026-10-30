# Client workspace kit (web 1440 / iPad 1024): v3 header with lifecycle chips, one primary CTA, WhatsApp, ⋯ menu, standard tabs.
# Standard client tabs (TW-09a): Overview · Plan · Activity · Progress · Check-ins · History. No Sessions/Packages/Configure tabs:
# coaching setup lives in Plan › Coaching setup, basic details + subscription/package in Client settings (⋯ menu).
from fb import *
TABS=['Overview','Plan','Activity','Progress','Check-ins','History']
CX='''.wsh{padding:18px 28px 0;background:#fff;border-bottom:1px solid var(--border);flex:none}.tabs{display:flex;gap:26px;margin-top:14px}.tabs a{height:44px;display:flex;align-items:center;gap:6px;font-size:15px;font-weight:500;color:var(--ink-500);border-bottom:2px solid transparent}.tabs a.on{color:var(--indigo);border-color:var(--indigo);font-weight:700}
.cnt{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:10px;background:var(--lavender);color:var(--indigo);font-size:12px;font-weight:700}
.wbd{flex:1;min-height:0;overflow:hidden;padding:18px 28px;display:flex;flex-direction:column;gap:14px;position:relative}
.wbd>*{flex-shrink:0}
.ro{display:flex;gap:8px;align-items:center;background:var(--neu-bg);border:1px solid var(--neu-line);color:var(--neu);border-radius:14px;padding:10px 14px;font-size:13px}
.cm{position:absolute;width:260px;background:#fff;border:1px solid var(--border);border-radius:16px;box-shadow:0 12px 32px rgba(26,18,72,.16);padding:6px;z-index:6}.cm a{display:flex;align-items:center;gap:10px;min-height:44px;padding:0 12px;border-radius:10px;font-size:14px;color:var(--ink-700)}.cm a.h{background:var(--lavender-50);color:var(--indigo);font-weight:600}.cm a.dg{color:var(--crit)}.cm hr{border:0;border-top:1px solid var(--border);margin:4px 0}.cm small{display:block;font-size:12px;color:var(--ink-500);font-weight:400}
.seg2{display:inline-flex;background:#EDEBF5;border-radius:12px;padding:3px;gap:3px}.seg2 a{height:38px;padding:0 14px;border-radius:9px;display:flex;align-items:center;font-size:14px;font-weight:600;color:var(--ink-500)}.seg2 a.on{background:#fff;color:var(--navy);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.lab{font-size:12px;font-weight:700;color:var(--ink-500);letter-spacing:.3px}
.kv2{display:grid;grid-template-columns:170px 1fr;gap:10px 16px;font-size:14px}.kv2>span:nth-child(odd){color:var(--ink-500)}.kv2>span:nth-child(even){color:var(--navy);font-weight:500}
.wf{display:flex;flex-direction:column;gap:6px}.wf label{font-size:13px;font-weight:600;color:var(--ink-700)}.wf .in{height:44px;border:1px solid var(--border-strong);border-radius:10px;display:flex;align-items:center;padding:0 12px;font-size:14px;background:#fff;gap:8px;color:var(--ink-900)}.wf .in.err{border-color:var(--crit);box-shadow:0 0 0 3px var(--crit-bg)}.wf .er{font-size:12px;color:var(--crit);display:flex;gap:6px;align-items:center}.wf .hp{font-size:12px;color:var(--ink-500)}.wf .in.dis{background:var(--hover);color:var(--ink-500)}
.scrimw{position:absolute;inset:0;background:rgba(15,17,21,.32);z-index:4}
.drw{position:absolute;top:0;right:0;bottom:0;width:560px;background:#fff;z-index:5;display:flex;flex-direction:column;box-shadow:-12px 0 32px rgba(26,18,72,.16)}.drw .dh{padding:18px 24px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}.drw .db{flex:1;overflow:hidden;padding:20px 24px;display:flex;flex-direction:column;gap:16px}.drw .df{border-top:1px solid var(--border);padding:14px 24px;display:flex;gap:10px;align-items:center}
.btn.dg{background:#fff;border-color:var(--crit-line);color:var(--crit)}.btn.dis{background:var(--neu-bg);color:var(--ink-500);border-color:var(--neu-line)}
.tst{position:absolute;left:50%;transform:translateX(-50%);bottom:24px;background:var(--navy);color:#fff;border-radius:14px;min-height:48px;display:flex;align-items:center;gap:10px;padding:0 18px;font-size:14px;font-weight:500;z-index:7}
.pill2{display:inline-flex;align-items:center;gap:6px;height:44px;padding:0 14px;border-radius:22px;border:1px solid var(--border-strong);font-size:14px;font-weight:600;color:var(--ink-700);background:#fff}.pill2.on{background:var(--navy);color:#fff;border-color:var(--navy)}
'''
C={
'rohan':dict(n='Rohan Mehta',i='RM',a='a1',chips='<span class="chip pos">Active</span><span class="chip attn">'+ic("alert",12)+'Needs attention</span>',meta='Lose 6 kg · <a style="color:var(--indigo);font-weight:600">Fat loss, phase 2</a> · week 6 · Next check-in Fri 23 Oct · 29 · Male · <span class="chip attn" style="height:22px">Renews Sat 24 Oct</span>',cta='Review issue',first='Rohan'),
'neha':dict(n='Neha Reddy',i='NR',a='a2',chips='<span class="chip pos">Active</span>',meta='Lose 4 kg · Fat loss, phase 1 · week 9 · Hybrid · Gold\'s Gym Andheri · 31 · Female',cta='Adjust plan',first='Neha'),
'kavya':dict(n='Kavya Nair',i='KN',a='a3',chips='<span class="chip neu">Ended Sat 3 Oct</span>',meta='Lose 4 kg · coached Mon 6 Jul – Sat 3 Oct · 27 · Female',cta='Reactivate coaching',first='Kavya',ended=True),
'priya':dict(n='Priya Sharma',i='PS',a='a4',chips='<span class="chip pos">Active</span>',meta='Lose 4 kg · week 1 · First check-in Sun 25 Oct · 26 · Female',cta='Adjust plan',first='Priya'),
'ishita':dict(n='Ishita Banerjee',i='IB',a='a5',chips='<span class="chip pos">Active</span>',meta='Get fitter for trekking · week 2 · Next check-in Sun 25 Oct · 30 · Female',cta='Adjust plan',first='Ishita'),
'vikram':dict(n='Vikram Singh',i='VS',a='a2',chips='<span class="chip sel">Ready to coach</span>',meta='Marathon prep · No plan yet · Joined Mon 12 Oct · 34 · Male',cta='Set up coaching',first='Vikram'),
}
def head(k,tab='Overview',menu=False,count=1,ipad=False):
    c=C[k];ended=c.get('ended')
    wa='' if ended else f'<a class="btn o sm">{ic("msg",16)}{"WhatsApp" if ipad else "Message on WhatsApp"}</a>'
    more=f'<a class="icb" style="border-radius:14px;{"background:var(--lavender);border-color:#D6CFFF;color:var(--indigo)" if menu else ""}" aria-label="More for {c["first"]}" title="More for {c["first"]}">{ic("more")}</a>'
    tabs=''.join(f'<a class="{"on" if t==tab else ""}">{t}{f" <span class=cnt>{count}</span>" if t=="Check-ins" and count and not ended else ""}</a>' for t in TABS)
    return f'<div class="wsh"><div class="row"><span class="av {c["a"]}" style="width:52px;height:52px;font-size:16px">{c["i"]}</span><div class="sp" style="min-width:0"><div class="row" style="gap:8px"><b class="b" style="font-size:24px;font-weight:600">{c["n"]}</b>{c["chips"]}</div><div class="sm muted" style="margin-top:2px">{c["meta"]}</div></div>{wa}<a class="btn p sm">{c["cta"]}</a>{more}</div><div class="tabs">{tabs}</div></div>'
def menu(k,top=118,right=28,hl='Client settings'):
    c=C[k];ended=c.get('ended')
    it=[('settings','Client settings','Basic details, subscription & package'),('clip','Coaching setup','Goal, expectations, check-ins, reminders'),('note','Onboarding answers',''),('bell','Reminder settings',''),('edit','Add note','')]
    h=''.join(f'<a class="{"h" if n==hl else ""}">{ic(i,16)}<span>{n}{f"<small>{s}</small>" if s else ""}</span></a>' for i,n,s in it if not (ended and n in('Add note','Reminder settings')))
    end='' if ended else f'<hr><a class="dg">{ic("stop",16)}End coaching…</a>'
    return f'<div class="cm" style="top:{top}px;right:{right}px">{h}{end}</div>'
def wpage(k,body,tab='Overview',crumb=None,overlay='',menu_open=False,extra='',count=1,on='Clients'):
    c=C[k]
    return page(web('Clients / '+(crumb or c['n']),head(k,tab,menu_open,count)+f'<div class="wbd">{body}</div>{overlay}',on).replace('<div class="main">','<div class="main" style="position:relative">'),1440,900,CX+extra)
RAIL=lambda on='users':'<div class="rail">'+''.join(f'<a class="{"on" if n==on else ""}">{ic(n,22)}</a>' for n in ['home','cal','users','clip','more'])+'</div>'
IPX='.ip{width:1024px;height:768px;display:flex;background:var(--page-web);position:relative;overflow:hidden}.rail{width:76px;background:var(--navy);display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:20px;color:#C9C3EE;flex:none}.rail a{width:48px;height:48px;border-radius:12px;display:flex;align-items:center;justify-content:center}.rail a.on{background:var(--navy-700);color:#fff}.wsh{padding:16px 20px 0}.wbd{padding:16px 20px}'
def ipage(k,body,tab='Overview',overlay='',menu_open=False,extra='',count=1):
    return page(f'<div class="ip">{RAIL()}<div class="col sp" style="min-width:0;position:relative">{head(k,tab,menu_open,count,True)}<div class="wbd">{body}</div>{overlay}</div></div>',1024,768,CX+IPX+extra)

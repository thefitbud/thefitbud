# FitBud v3 mockup kit — shared chrome, tokens, icons. Output: html/*.html
import os
T='../../../mockups/html/tokens.css'
I={ # lucide-style paths
'dumbbell':'<path d="m6.5 6.5 11 11"/><path d="m21 21-1-1"/><path d="m3 3 1 1"/><path d="m18 22 4-4"/><path d="m2 6 4-4"/><path d="m3 10 7-7"/><path d="m14 21 7-7"/>',
'utensils':'<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
'foot':'<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/>',
'home':'<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
'chart':'<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>',
'more':'<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
'bell':'<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
'cloud':'<path d="m17 15-5.5 5.5L9 18"/><path d="M5.516 16.07A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 3.501 7.327"/>',
'check':'<path d="M20 6 9 17l-5-5"/>','x':'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
'clock':'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
'play':'<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
'left':'<path d="m15 18-6-6 6-6"/>','right':'<path d="m9 18 6-6-6-6"/>','down':'<path d="m6 9 6 6 6-6"/>',
'inbox':'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
'users':'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
'clip':'<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
'cal':'<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
'pin':'<path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
'phone':'<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
'video':'<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
'undo':'<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
'plus':'<path d="M5 12h14"/><path d="M12 5v14"/>','search':'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
'moon':'<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>','wallet':'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
'msg':'<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>','edit':'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
'grip':'<circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>','link':'<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
'alert':'<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
}
def ic(n,s=20,c='currentColor',w=1.75): return f'<svg class="ic" width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">{I[n]}</svg>'
CSS='''*{box-sizing:border-box;margin:0;padding:0}a{color:inherit;text-decoration:none}
body{font-family:Satoshi,system-ui,sans-serif;color:var(--ink-700);font-feature-settings:"tnum";-webkit-font-smoothing:antialiased;background:var(--page-mobile)}
.ic{flex:none;vertical-align:middle}
/* phone */
.ph{width:393px;height:852px;position:relative;overflow:hidden;background:var(--page-mobile)}
.sb{height:54px;display:flex;align-items:center;justify-content:space-between;padding:0 30px 0 44px;font-weight:600;font-size:17px;color:var(--ink-900)}
.sb .isl{width:124px;height:36px;border-radius:20px;background:#000;position:absolute;left:134px;top:11px}
.sb.and{height:36px;padding:0 20px;font-size:14px}.sb.and .isl{width:12px;height:12px;left:190px;top:12px}
.sbi{display:flex;gap:6px;align-items:center}
.scr{position:absolute;left:0;right:0;top:54px;bottom:84px;overflow:hidden;padding:0 16px}
.and .scr,.ph.and .scr{top:36px;bottom:80px}
.tb{position:absolute;left:0;right:0;bottom:0;height:84px;background:rgba(255,255,255,.96);border-top:1px solid var(--border);display:flex;padding:6px 6px 0}
.tb a{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11px;font-weight:500;color:var(--ink-500);min-height:48px;position:relative}
.tb a.on{color:var(--indigo);font-weight:700}.tb .hb{position:absolute;bottom:8px;left:134px;width:125px;height:5px;border-radius:3px;background:#111}
.tb.m3{height:80px;background:#F3F1FA;border:0}.tb.m3 a.on .pill{background:var(--lavender);}
.tb .pill{width:56px;height:30px;border-radius:15px;display:flex;align-items:center;justify-content:center}
.tb .bdg{position:absolute;top:-2px;left:52%;min-width:18px;height:18px;border-radius:9px;background:var(--indigo);color:#fff;font-size:11px;display:flex;align-items:center;justify-content:center;padding:0 5px}
h1{font-size:30px;font-weight:600;color:var(--navy);letter-spacing:-.3px}
.eb{font-size:13px;font-weight:500;color:var(--ink-500)}
.top{display:flex;justify-content:space-between;align-items:flex-end;padding:8px 2px 10px}
.icb{width:44px;height:44px;border-radius:22px;background:#fff;border:1px solid var(--border);display:inline-flex;align-items:center;justify-content:center;color:var(--ink-700);position:relative}
.icb .d{position:absolute;top:10px;right:11px;width:8px;height:8px;border-radius:4px;background:var(--coral);}
.card{background:#fff;border:1px solid var(--border);border-radius:20px}
.sec{display:flex;justify-content:space-between;align-items:baseline;margin:18px 4px 8px}.sec h3{font-size:17px;font-weight:600;color:var(--navy)}.sec span,.sec a{font-size:13px;color:var(--ink-500)}.sec a{color:var(--indigo);font-weight:600}
.chip{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:600;border:1px solid}
.chip.pos{background:var(--pos-bg);color:var(--pos);border-color:var(--pos-line)}.chip.neu{background:var(--neu-bg);color:var(--neu);border-color:var(--neu-line)}
.chip.attn{background:var(--attn-bg);color:var(--attn);border-color:var(--attn-line)}.chip.crit{background:var(--crit-bg);color:var(--crit);border-color:var(--crit-line)}
.chip.sel{background:var(--sel-bg);color:var(--sel);border-color:#D6CFFF}.chip.navy{background:var(--navy);color:#fff;border-color:var(--navy)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:48px;border-radius:16px;font-weight:600;font-size:15px;padding:0 16px;border:1px solid transparent}
.btn.p{background:var(--indigo);color:#fff}.btn.s{background:var(--lavender);color:var(--indigo)}.btn.o{background:#fff;border-color:var(--border-strong);color:var(--ink-700)}.btn.w{background:#fff;color:var(--navy)}
.btn.sm{height:44px;font-size:14px;border-radius:14px}
.av{width:40px;height:40px;border-radius:20px;display:inline-flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex:none}
.av.a1{background:#FFE4EA;color:#B4234A}.av.a2{background:#E0F2F1;color:#0E7490}.av.a3{background:#FFF1DC;color:#9A5B00}.av.a4{background:var(--lavender);color:var(--indigo)}.av.a5{background:#E8F0FF;color:#1D4ED8}
.muted{color:var(--ink-500)}.sm{font-size:13px}.xs{font-size:12px}.b{font-weight:700;color:var(--navy)}
.row{display:flex;align-items:center;gap:12px}.col{display:flex;flex-direction:column}.sp{flex:1}
.sheet{position:absolute;left:0;right:0;bottom:0;background:#fff;border-radius:24px 24px 0 0;box-shadow:0 -8px 30px rgba(26,18,72,.18);padding:8px 16px 34px}
.sheet .gr{width:40px;height:5px;border-radius:3px;background:var(--ink-200);margin:0 auto 10px}
.scrim{position:absolute;inset:0;background:rgba(15,17,21,.38)}
.toast{position:absolute;left:16px;right:16px;bottom:96px;background:var(--navy);color:#fff;border-radius:16px;min-height:52px;display:flex;align-items:center;gap:10px;padding:0 8px 0 16px;font-size:14px;font-weight:500}
.toast a{margin-left:auto;color:var(--indigo-300);font-weight:700;min-height:44px;display:flex;align-items:center;padding:0 12px}
.seg{display:flex;background:#EDEBF5;border-radius:14px;padding:3px;gap:3px}.seg a{flex:1;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:var(--ink-500);gap:6px}.seg a.on{background:#fff;color:var(--navy);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.field{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}.field label{font-size:13px;font-weight:600;color:var(--ink-700)}.field .in{height:48px;border:1px solid var(--border-strong);border-radius:14px;display:flex;align-items:center;padding:0 14px;font-size:15px;background:#fff;gap:8px}.field .in.ph2{color:var(--ink-400)}
.tog{width:51px;height:31px;border-radius:16px;background:var(--indigo);position:relative;flex:none}.tog:after{content:"";position:absolute;right:2px;top:2px;width:27px;height:27px;border-radius:14px;background:#fff}.tog.off{background:#D9DCE8}.tog.off:after{right:auto;left:2px}
/* web */
.web{width:1440px;height:900px;display:flex;background:var(--page-web);overflow:hidden}
.side{width:240px;background:var(--navy);color:#C9C3EE;padding:20px 12px;display:flex;flex-direction:column;gap:4px;flex:none}
.side .lg{color:#fff;font-weight:700;font-size:20px;padding:4px 10px 22px;display:flex;align-items:center;gap:8px}
.side a{height:42px;border-radius:10px;display:flex;align-items:center;gap:12px;padding:0 12px;font-size:15px;font-weight:500}.side a.on{background:var(--navy-700);color:#fff}
.side a .n{margin-left:auto;font-size:12px;background:rgba(255,255,255,.12);border-radius:8px;padding:2px 7px}
.main{flex:1;display:flex;flex-direction:column;min-width:0}
.tbar{height:60px;background:#fff;border-bottom:1px solid var(--border);display:flex;align-items:center;padding:0 28px;gap:16px;font-weight:600;color:var(--navy)}
.srch{margin-left:auto;width:340px;height:40px;border:1px solid var(--border);border-radius:10px;display:flex;align-items:center;gap:8px;padding:0 12px;color:var(--ink-500);font-weight:400;font-size:14px;background:var(--page-web)}
.wc{background:#fff;border:1px solid var(--border);border-radius:16px}
.wbody{padding:24px 28px;display:flex;gap:20px;flex:1;min-height:0}
'''
def page(body,w=393,h=852,extra=''):
    return f'<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><link rel="stylesheet" href="{T}"><style>{CSS}{extra}</style></head><body style="width:{w}px;height:{h}px">{body}</body></html>'
def sbar(os='ios',t='7:30'):
    if os=='ios': return f'<div class="sb" data-chrome><span>{t}</span><span class="isl"></span><span class="sbi"><svg width="18" height="12"><rect y="8" width="3" height="4" rx="1" fill="#111"/><rect x="5" y="5" width="3" height="7" rx="1" fill="#111"/><rect x="10" y="2" width="3" height="10" rx="1" fill="#111"/><rect x="15" width="3" height="12" rx="1" fill="#111"/></svg><svg width="26" height="12"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="#111"/><rect x="2" y="2" width="17" height="8" rx="2" fill="#111"/></svg></span></div>'
    return f'<div class="sb and" data-chrome><span>{t}</span><span class="isl"></span><span class="sbi">▾ ▴ ▮</span></div>'
TT=[('Today','home'),('Workout','dumbbell'),('Diet','utensils'),('Progress','chart'),('More','more')]
TC=[('Needs you','inbox'),('Sessions','cal'),('Clients','users'),('Check-ins','clip'),('More','more')]
def tabbar(on,tabs=TT,os='ios',badges={}):
    h=f'<nav class="tb{" m3" if os!="ios" else ""}">'
    for n,i in tabs:
        b=f'<span class="bdg">{badges[n]}</span>' if n in badges else ''
        h+=f'<a class="{"on" if n==on else ""}" href="#"><span class="pill">{ic(i,22)}</span>{n}{b}</a>'
    return h+('<span class="hb"></span>' if os=='ios' else '<span class="hb" style="width:108px;left:142px;height:4px"></span>')+'</nav>'
def phone(inner,os='ios',tab=None,tabs=TT,t='7:30',overlay='',badges={}):
    return f'<div class="ph{" and" if os!="ios" else ""}">{sbar(os,t)}<div class="scr">{inner}</div>{tabbar(tab,tabs,os,badges) if tab else ""}{overlay}</div>'
SIDE=[('Home','home','11'),('Sessions','cal','5'),('Clients','users',''),('Check-ins','clip','2'),('Templates','clip',''),('More','more','')]
def web(title,body,on='Home'):
    s=''.join(f'<a class="{"on" if n==on else ""}" href="#">{ic(i,18)}{n}{f"<span class=n>{c}</span>" if c else ""}</a>' for n,i,c in SIDE)
    return f'<div class="web"><aside class="side"><div class="lg"><span style="color:var(--coral)">●</span>FitBud</div>{s}<div class="sp"></div><a href="#"><span class="av a4" style="width:30px;height:30px">RV</span>Rahul Verma</a></aside><div class="main"><div class="tbar">{title}<div class="srch">{ic("search",16)}Search clients<span style="margin-left:auto;font-size:12px">⌘K</span></div><span class="icb" style="border:0">{ic("bell")}<span class="d"></span></span></div>{body}</div></div>'
def save(name,html):
    open(f'html/{name}.html','w').write(html)

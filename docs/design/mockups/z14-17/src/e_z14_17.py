"""Z14-17 trainer mocks (24 Nov 2026, Firoz list 2): Attention with jump pills / capped sections / See all,
review panel with Remind · Noted, keep open · Resolve…, client profile refresh, one note sheet, header back + iOS swipe-back.
Words per D-W14-29 (confirmed by Firoz 24 Nov 2026). Run from src/: python3 e_z14_17.py"""
import kit_trainer as kt
from kit_trainer import *
kt.TTR[0]=('Attention','inbox')
kt.GR['reviewed']=('Noted, still open','eye','var(--fill)','var(--ink2)')
kt.SEV['rev']=('Noted','eye','var(--fill)','var(--ink2)')
BADGE={'Attention':9,'Check-ins':2}
CSS='''<style>
.arow{background:var(--card);border-radius:14px;padding:12px 12px 12px 12px;display:grid;grid-template-columns:40px minmax(0,1fr) 84px;column-gap:12px;align-items:start;box-shadow:0 0 0 .5px rgba(var(--sh),.06)}
.arow+.arow,.arow+.seeall{margin-top:8px}
.arow .slot{align-self:center;display:flex;justify-content:flex-end}
.arow .slot .btn{height:44px;width:84px;padding:0;border-radius:12px;font-size:14.5px}
.arow .who{display:flex;align-items:baseline;gap:8px;min-height:22px}
.arow .who .t-bodym{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.arow .iss{font-size:14px;line-height:19px;margin-top:1px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.shd{display:flex;align-items:center;gap:8px;min-height:44px;margin:12px 2px 4px}
.shd .gi{width:24px;height:24px;border-radius:7px;display:flex;align-items:center;justify-content:center;flex:none}
.shd .cv{margin-left:auto;width:44px;height:44px;display:flex;align-items:center;justify-content:center;color:var(--ink2);margin-right:-10px}
.shd.closed{background:var(--card);border-radius:14px;padding:0 12px;margin:12px 0 4px;box-shadow:0 0 0 .5px rgba(var(--sh),.06)}
.shd.closed .cv{margin-right:-6px}
.seeall{height:44px;border-radius:14px;background:var(--card);display:flex;align-items:center;justify-content:center;gap:4px;color:var(--brand);font-size:15px;font-weight:600;box-shadow:0 0 0 .5px rgba(var(--sh),.06)}
.jgrid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.jt{background:var(--card);border-radius:14px;padding:10px 4px 10px 10px;box-shadow:0 0 0 .5px rgba(var(--sh),.06);display:flex;align-items:center;gap:8px;min-height:60px}
.jt.pr{box-shadow:0 0 0 2px var(--brand)}
.jt .si{width:26px;height:26px;border-radius:9px;display:flex;align-items:center;justify-content:center;flex:none}
.jt .snum{font-size:22px;line-height:26px;font-weight:700;letter-spacing:-.4px;font-feature-settings:'tnum'}
.jt.zero .snum,.jt.zero .t-bodym{color:var(--ink4)}
.jt .jd{color:var(--ink3);flex:none;width:18px;display:flex;justify-content:center}
.pbar{position:absolute;left:0;right:0;top:54px;z-index:45;background:var(--glass);backdrop-filter:blur(16px);border-bottom:.5px solid var(--line)}
.pbar .nav{margin:0;padding:0 16px}
.prow{display:flex;gap:8px;padding:0 16px 6px;overflow:hidden}
.pl{height:44px;display:flex;align-items:center;flex:none}
.pl span{height:34px;border-radius:17px;padding:0 13px;display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;background:var(--card);box-shadow:0 0 0 .5px var(--line2);white-space:nowrap}
.pl.on span{background:var(--ink);color:var(--on-brand);box-shadow:none}
.pl.zero span{color:var(--ink4)}
.tlink{height:44px;display:inline-flex;align-items:center;gap:6px;font-size:15px;font-weight:600;color:var(--brand);padding:0 6px}
.step{display:flex;align-items:center;gap:2px}
.step .sb2{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px var(--line2);color:var(--ink)}
.step .sb2.dis{color:var(--ink4)}
.step .sb2.go{background:var(--brand-tint);color:var(--brand);box-shadow:none}
.dash{display:flex;gap:6px;justify-content:center;margin:8px 0 2px}.dash i{width:22px;height:4px;border-radius:2px;background:var(--line2)}.dash i.on{background:var(--brand);width:28px}.dash i.dn{background:var(--done)}
.rc{border-radius:16px;box-shadow:0 0 0 1px var(--line2);padding:14px 16px;margin-top:12px}
.whoh{display:flex;align-items:center;gap:12px;min-height:48px}
.opt{display:flex;align-items:center;gap:12px;min-height:48px;padding:0 14px;border-top:.5px solid var(--line)}
.opt:first-child{border-top:0}
.opt .rd{width:22px;height:22px;border-radius:11px;box-shadow:inset 0 0 0 2px var(--line2);flex:none}
.opt .rd.on{box-shadow:inset 0 0 0 7px var(--brand)}
.actrow{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:14px}
.actrow .btn{height:44px;padding:0 8px;font-size:14.5px;border-radius:12px}
.seg.big{height:44px;border-radius:12px}.seg.big span{border-radius:10px;font-size:15px;gap:6px}
.nrow{padding:12px 0;border-top:.5px solid var(--line)}
.nav.wide .ttl{left:122px;right:122px}
</style>'''
def navb(title,label='Back',right=''): return nav(title,left='back',left_label=label,right=right).replace('<div class="nav">','<div class="nav wide">',1)
def S(sid,label,body,area,**k): screen(sid,label,CSS+body,area,**k)
# ---------- rows ----------
def arow(n,chips,issue,age,act='Review',kind='secondary',dim=False):
    slot=f'<div class="btn {kind}">{act}</div>' if act else f'<div style="width:44px;height:44px;display:flex;align-items:center;justify-content:center;color:var(--ink4)">{ic("chevron-right",18,2.2)}</div>'
    return f'''<div class="arow"{' style="opacity:.55"' if dim else ''}>{cav(n)}<div><div class="who"><span class="t-bodym">{C[n][3]}</span><span class="t-cap" style="margin-left:auto;white-space:nowrap">{age}</span></div>
<div class="t-sub iss">{issue}</div><div class="row" style="gap:6px;margin-top:7px">{chips}</div></div><div class="slot">{slot}</div></div>'''
def shd(k,n,open_=True,extra=''):
    l,i,bg,fg=GR[k]
    return f'<div class="shd tap{"" if open_ else " closed"}"><span class="gi" style="background:{bg};color:{fg}">{ic(i,14,2.4)}</span><span class="t-head">{l}</span><span class="t-sub tnum">{n}</span>{extra}{"" if open_ else '<span class="t-cap" style="margin-left:auto">Show</span>'}<span class="cv"{" style=\"margin-left:0\"" if not open_ else ""}>{ic("chevron-up" if open_ else "chevron-down",20,2.2)}</span></div>'
def seeall(n,what): return f'<div class="seeall tap">See all {n} {what}{ic("chevron-right",17,2.4)}</div>'
R={ 'Rohan':lambda **k:arow('Rohan',sch('crit'),'Missed 2 workouts · Tue, Thu','5 d',**k),
    'Neha':lambda **k:arow('Neha',sch('warn'),'Breakfast not logged · Wed, Thu, Fri','3 d',**k),
    'Farhan':lambda **k:arow('Farhan',sch('warn'),'Missed Upper body A · Thu','2 d',**k),
    'Deepak':lambda **k:arow('Deepak',sch('warn'),'Missed Lower body B · Fri','1 d',**k),
    'Ishita':lambda **k:arow('Ishita',sch('warn'),'Lunch not logged · Fri','1 d',**k),
    'Aarav':lambda **k:arow('Aarav',sch('pain'),'“Lower back feels tight on the last reps of deadlifts. Should I drop to 40 kg?”','12 min',act='Reply',**k),
    'Ishita2':lambda **k:arow('Ishita',sch('ask'),'“Is 1 katori rice too much at dinner?”','1 h',act='Reply',**k),
    'Sneha':lambda **k:arow('Sneha',sch('ci'),'Weekly check-in · week 2 · 2 photos','1 d',**k),
    'Deepak2':lambda **k:arow('Deepak',sch('ci'),'Weekly check-in · week 8','4 h',**k),
    'Priya':lambda **k:arow('Priya',sch('off'),'Over calories 3 of the last 5 days · ate out twice','2 d',**k),
    'Meera':lambda **k:arow('Meera',sch('rev','Noted 9:52 am'),'Lunch not logged · Thu','2 d',**k)}
def jt(k,n,sub,pr=False):
    l,i,bg,fg=GR[k]; lab={'checkins':'Check-ins','reviewed':'Noted','asked':'Asked'}.get(k,l)
    return f'<div class="jt tap{" pr" if pr else ""}{" zero" if n==0 else ""}"><span class="si" style="background:{bg};color:{fg}">{ic(i,17,2.2)}</span><div class="f1" style="min-width:0"><div class="row" style="gap:6px;align-items:baseline"><span class="snum">{n}</span><span class="t-bodym" style="font-size:14.5px">{lab}</span></div><div class="t-cap">{sub}</div></div><span class="jd">{ic("arrow-down",16,2.2) if n else ""}</span></div>'
def jgrid(pr=None,vals=None):
    v=vals or {'missed':(5,'1 critical'),'asked':(2,'1 with pain'),'checkins':(2,'oldest 1 d'),'off':(1,'3 days over')}
    return '<div class="jgrid">'+''.join(jt(k,*v[k],pr=(k==pr)) for k in ['missed','asked','checkins','off'])+'</div>'
EB='Saturday, 14 Nov · 9 clients need you'
def hdr(eb=EB): return lhdr('Attention',eb,circ('search'))
def att(body,extra='',eb=EB,badges=BADGE): return f'<div class="content">{hdr(eb)}{body}<div style="height:110px"></div></div>{fade()}{ttab("Attention",badges)}{extra}'
def pbar(on='checkins',z=()):
    P=[('missed','Missed',5),('asked','Asked',2),('checkins','Check-ins',2),('off','Off plan',1),('reviewed','Noted',1)]
    return f'<div class="pbar">{nav("Attention",left="")}<div class="prow" data-offok="1">'+''.join(f'<div class="pl tap{" on" if k==on else ""}"><span>{l} <b class="tnum" style="font-weight:700">{n}</b></span></div>' for k,l,n in P)+'</div></div>'
A='attention'
MISSED3=shd('missed',5)+R['Rohan']()+R['Neha']()+R['Farhan']()+seeall(5,'missed')
ASKED=shd('asked',2)+R['Aarav']()+R['Ishita2']()
CHECK=shd('checkins',2)+R['Sneha']()+R['Deepak2']()
OFF=shd('off',1)+R['Priya']()
NOTED=shd('reviewed',1)+R['Meera']()
S('TM-01a3-attention-pills','Attention: summary tiles are jump pills; each section shows 3 rows and See all',att(jgrid()+MISSED3+ASKED),A)
S('TM-01a4-attention-after-pill-tap','After tapping Check-ins: jumped there, pills stick under the title, Check-ins highlighted',
  pbar()+f'<div class="content" style="top:0;padding-top:150px">{CHECK}{OFF}{NOTED}{shd("wins",2,False)}<div style="height:110px"></div></div>{fade()}{ttab("Attention",BADGE)}',A)
S('TM-01a5-attention-collapsed','Missed collapsed: header keeps the count; the next section moves up',att(jgrid()+shd('missed',5,False)+ASKED+CHECK),A)
S('TM-01a6-section-see-all','See all: the whole Missed section as its own list (back to Attention)',
  page(navb("Missed · 5","Attention"),'<div style="height:8px"></div>'+R['Rohan']()+R['Neha']()+R['Farhan']()+R['Deepak']()+R['Ishita']()+'<div class="t-cap" style="text-align:center;margin-top:14px">That’s everything in Missed</div>'),A)
S('TM-01a7-section-empty','Section emptied: the last Missed item was resolved',
  page(navb("Missed","Attention"),f'<div style="margin-top:150px">{empty("circle-check","Nothing missed right now","Every missed workout and meal is resolved or noted.",btn("Back to Attention","tint"))}</div>'),A)
sk=''.join(f'<div class="arow" style="margin-top:8px">{skel("40px",40,20)}<div class="col" style="gap:8px">{skel("55%",14)}{skel("85%",12)}{skel("30%",18,7)}</div><div class="slot">{skel("84px",44,12)}</div></div>' for _ in range(3))
S('TM-01a8-attention-loading','Loading: title and tab bar at once, skeleton tiles and rows (no zeros)',
  att('<div class="jgrid">'+''.join(f'<div class="jt">{skel("30px",30,9)}<div class="f1 col" style="gap:6px">{skel("60%",16)}{skel("40%",10)}</div></div>' for _ in range(4))+f'</div><div class="shd">{skel("24px",24,7)}{skel("35%",16)}</div>{sk}',eb='Saturday, 14 Nov',badges={}),A)
off=lambda s:s.replace('class="btn secondary"','class="btn dis"')
S('TM-01a9-attention-offline','Offline: neutral banner, last update shown, jumping works, Review waits for a connection',
  att(f'<div style="margin-top:12px">{banner("You’re offline. Showing what was here at 9:40 am. Reviewing comes back when you’re online.","neutral","wifi-off")}</div>'+jgrid()+off(MISSED3+ASKED),eb='Saturday, 14 Nov · as of 9:40 am'),A)
# ================= Review panel (D-W14-29) =================
kv=lambda k,v:f'<div class="row sp" style="padding:9px 0;border-top:.5px solid var(--line);gap:12px"><span class="t-sub" style="flex:none">{k}</span><span class="t-bodym tnum" style="font-size:15px;text-align:right">{v}</span></div>'
def whoh(n,sub,pos,tot,prev=False,nxt=True,go=False):
    return f'''<div class="whoh"><div class="row tap" style="gap:12px;min-height:48px;flex:1;min-width:0">{cav(n)}<div style="min-width:0"><div class="row" style="gap:2px"><span class="t-head">{C[n][3]}</span><span style="color:var(--ink3);display:flex">{ic("chevron-right",16,2.4)}</span></div><div class="t-cap">{sub}</div></div></div>
<div class="step"><div class="sb2{"" if prev else " dis"}">{ic("chevron-left",20,2.2)}</div><span class="t-bodym tnum" style="font-size:15px;min-width:56px;text-align:center">{pos} of {tot}</span><div class="sb2{" go" if go else ""}{"" if nxt else " dis"}">{ic("chevron-right",20,2.2)}</div></div></div>'''
def dash(on=0,done=()): return '<div class="dash">'+''.join(f'<i class="{"on" if i==on else ("dn" if i in done else "")}"></i>' for i in range(3))+'</div>'
def rcard(chips=None,extra=''):
    return f'''<div class="rc"><div class="row" style="gap:8px">{chips or sch("crit")}<span class="t-cap">since 5 d</span></div><div class="t-head" style="margin-top:8px">Missed 2 workouts</div>
<div class="t-sub" style="margin-top:2px">Lower body A on Tue 10 Nov and Upper body B on Thu 12 Nov were planned for 7:00 pm and not logged.</div>
<div style="margin-top:8px">{kv("Planned","5 exercises · 16 sets · 50 min")}{kv("Reminder","Sent 6:00 pm · not opened")}</div>{extra}</div>'''
def two(a,b): return '<div class="row" style="gap:10px;margin-top:14px">'+a.replace('class="btn','style="flex:1;padding:0 10px" class="btn',1)+b.replace('class="btn','style="flex:1;padding:0 10px" class="btn',1)+'</div>'
LINKS=f'<div class="row" style="justify-content:center;gap:18px;margin-top:6px"><span class="tlink">{ic("notebook-pen",17,2.2)}Add note</span><span class="tlink">{ic("message-circle",17,2.2)}WhatsApp</span></div>'
ACT_OPEN=two(btn("Remind Rohan","secondary",icon="bell-ring"),btn("Noted, keep open","tint"))+f'<div style="margin-top:10px">{btn("Resolve…")}</div>'+LINKS
NOTEDLINE=f'<div style="margin-top:12px">{banner("Noted by you at 9:52 am · still open","neutral","eye",action="Undo")}</div>'
ACT_NOTED=two(btn("Remind Rohan","secondary",icon="bell-ring"),btn("Resolve…"))+LINKS
SUB='Week 6 · 3 open'
BASE=att(jgrid()+MISSED3+ASKED)
def rsheet(inner): return f'<div class="scrim"></div><div class="sheet"><div class="grab"></div>{inner}</div>'
OPEN=whoh('Rohan',SUB,1,3)+dash(0)+rcard()+ACT_OPEN
A='review'
S('RP-01-review-open','Review: Remind · Noted, keep open · Resolve…, stepper is the only way to move, no More menu',BASE+rsheet(OPEN),A)
NOTED_IN=whoh('Rohan',SUB,1,3)+dash(0)+rcard(sch("crit")+sch("rev","Noted"))+NOTEDLINE+ACT_NOTED
S('RP-02-review-noted','After Noted, keep open: state line with Undo; Resolve… becomes the main action',BASE+rsheet(NOTED_IN),A)
opt=lambda t,on=False:f'<div class="opt tap"><span class="rd{" on" if on else ""}"></span><span class="t-body f1">{t}</span></div>'
RES=f'''<div class="grab"></div><div class="row sp" style="min-height:44px"><span class="navbtn">Cancel</span><span class="t-head">Resolve</span><span style="width:52px"></span></div>
<div class="t-sub" style="text-align:center;margin-top:-2px">Missed 2 workouts · Rohan</div>
<div class="t-label glabel" style="margin:16px 4px 8px">What was the outcome?</div>
<div class="group" style="background:var(--bg);box-shadow:none">{opt("Talked to Rohan",True)}{opt("Plan adjusted")}{opt("No action needed")}</div>
{field("Note (only you)",ph="Optional")}
<div style="margin-top:12px">{banner("Resolving locks these workouts, so Rohan can’t log them late any more.","neutral","lock")}</div>
<div style="margin-top:14px">{btn("Resolve")}</div>'''
S('RP-03-resolve-confirm','Resolve… opens a short confirm sheet that asks for the outcome',BASE+rsheet(NOTED_IN)+f'<div class="scrim" style="z-index:75"></div><div class="sheet" style="z-index:80">{RES}</div>',A)
RESOLVED_IN=whoh('Rohan','Week 6 · 2 open',1,3,go=True)+dash(0,(0,))+rcard(sch("resolved"),f'<div style="margin-top:10px">{banner("Resolved by you at 10:05 am · Talked to Rohan","ok","circle-check",action="Undo")}</div>')+'<div class="t-cap" style="text-align:center;margin-top:14px">2 more open for Rohan</div>'
S('RP-04-review-resolved','Resolved: read only with Undo; the stepper shows where to go next',BASE+rsheet(RESOLVED_IN),A)
DONE_IN=whoh('Rohan','Week 6 · all done',3,3,prev=True,nxt=False)+dash(9,(0,1,2))+f'''<div style="margin-top:28px">{empty("circle-check","All done for Rohan","2 resolved · 1 noted, still open")}</div>
<div style="margin-top:24px">{btn("Next client: Neha Reddy",icon="arrow-right")}</div><div style="margin-top:10px">{btn("Back to Attention","secondary")}</div>'''
S('RP-05-review-all-done','All done: Next client and Back to Attention, nothing else moves',BASE+rsheet(DONE_IN),A)
S('RP-06-review-from-profile','The same review opened from Rohan’s profile: same card, same actions, back to the profile',
  page(navb("Missed workouts","Rohan"),whoh('Rohan',SUB,1,3)+dash(0)+rcard()+ACT_OPEN,white=True),A)

# ================= Client profile (D-W14-27) =================
A='profile'
card=lambda t,inner,right='',st='':f'<div class="card" style="padding:14px 16px;margin-top:12px;{st}"><div class="row sp" style="min-height:24px"><span class="t-head">{t}</span>{right}</div>{inner}</div>'
link=lambda t:f'<span class="tlink" style="padding:0;font-size:14.5px">{t}</span>'
MENU_BTN='<div class="circbtn sm tap" style="width:44px;height:44px;border-radius:22px">'+ic("ellipsis",18,2.2)+'</div>'
ACTS=f'<div class="actrow">{btn("WhatsApp","tint",icon="message-circle")}{btn("Remind…","secondary",icon="bell-ring")}{btn("Add note","secondary",icon="notebook-pen")}</div>'
def nrow(i,ii,c): return f'<div style="display:grid;grid-template-columns:minmax(0,1fr) 84px;column-gap:12px;align-items:center;padding:10px 0;border-top:.5px solid var(--line)"><div><div class="row">{sch(i)}</div><div class="t-body" style="font-size:15px;line-height:20px;margin-top:5px">{ii}</div></div><div class="btn secondary" style="height:44px;width:84px;padding:0;font-size:14.5px;border-radius:12px">{c}</div></div>'
ATTN=card("Needs attention",'<div style="margin-top:8px">'+nrow('pain','Asked about lower back pain · 12 min','Reply')+nrow('warn','Missed Upper body A · Thu','Review')+'</div>','<span class="t-cap">2 open</span>')
WEEK=card("This week",wdots(["ok","ok","rest","miss","ok","today","plan"])+'<div class="row" style="gap:16px;margin-top:12px"><span class="t-sub"><b class="b">3 of 4</b> workouts</span><span class="t-sub"><b class="b">21 of 25</b> meals</span></div>','<span class="t-cap">Mon 9 – Sun 15 Nov</span>')
FOOD=card("Today’s food",'<div class="row" style="gap:12px;margin-top:8px;align-items:baseline"><span class="n-lg">1,240</span><span class="t-sub">of 1,800 kcal planned</span></div><div class="track" style="height:6px;margin-top:8px"><i style="width:69%;background:var(--brand)"></i></div>',link("Review day"))
NEXT=card("Next check-in",'<div class="t-sub" style="margin-top:4px">Weekly · due Sun 15 Nov · not started</div>')
HDR=chdr("Aarav",sch("pain","Mentions pain"),"Fat loss · week 3 of 12")
TOP=page(navb("","Attention",MENU_BTN),HDR+ACTS+ATTN+WEEK+FOOD+NEXT,pad_bottom=40)
S('TM-03a3-profile-top','Profile top: header, one action row (one Add note), Needs attention with the same fixed slot',TOP,A)
act=lambda i,t,w:f'<div class="row" style="gap:10px;padding:9px 0;border-top:.5px solid var(--line)">{ic(i,17,2,"var(--ink3)")}<span class="t-body f1" style="font-size:15px">{t}</span><span class="t-cap">{w}</span></div>'
def note(vis,when,txt,box=True):
    i,l=("eye",f"Aarav sees it · {when}") if vis else ("lock",f"Only you · {when}")
    st='margin-top:8px;padding:10px 12px;border-radius:12px;background:var(--bg)' if box else ''
    return f'<div style="{st}"><div class="row" style="gap:6px;color:var(--ink3)">{ic(i,14,2)}<span class="t-cap">{l}</span></div><div class="t-body" style="font-size:15px;line-height:21px;margin-top:4px">{txt}</div></div>'
NOTES3=note(True,"Fri 13 Nov","Keep the last set at 40 kg this week. Tell me if the back still feels tight.")+note(False,"Wed 11 Nov","Desk job, sits 9 hours. Add hip mobility before deadlifts.")+note(True,"Mon 9 Nov","Great first week. Dal and roti portions look right.")
S('TM-03b3-profile-scrolled','Profile scrolled: activity, latest 3 notes with See all notes, reminders, profile and safety; no Edit plan card',
  '<div class="content" style="top:44px">'+card("Recent activity",act("utensils","Logged Lunch · as planned","1:40 pm")+act("dumbbell","Finished Lower body B · 1 new best","Fri")+act("eye","Saw your note","Fri")+act("calendar-x","Missed Upper body A","Thu"),link("See all"))
  +card("Coach notes",NOTES3+f'<div style="margin-top:4px">{link("See all 7 notes")}</div>')
  +card("Reminders",'<div class="t-sub" style="margin-top:4px">On · workout 6:00 pm, meals when due, check-in Sun 9 am. Quiet 10 pm – 7 am.</div>')
  +card("Profile and safety",f'<div class="row" style="gap:10px;margin-top:8px">{sch("warn","Limitation")}<span class="t-body" style="font-size:15px">Lower back, no heavy good mornings</span></div>')+'<div style="height:40px"></div></div>',A)
sk2=lambda *w:'<div class="col" style="gap:10px;margin-top:12px">'+''.join(skel(x,14) for x in w)+'</div>'
LOAD=page(navb("","Attention",MENU_BTN),HDR.replace(sch("pain","Mentions pain"),skel("110px",22,7))+ACTS+card("Needs attention",sk2("80%","60%"))+card("This week",'<div class="row sp" style="margin-top:12px">'+''.join(skel("34px",34,17) for _ in range(7))+'</div>'+sk2("50%"))+card("Today’s food",sk2("40%","100%"))+card("Next check-in",sk2("70%")),pad_bottom=40)
S('TM-03a4-profile-loading','Loading: the header paints at once from the list; skeletons sit inside the cards (no loader above, no zeros)',LOAD,A)
MENU=f'''<div class="t-head" style="text-align:center;margin:4px 0 12px">Aarav Sharma</div><div class="group" style="background:var(--bg);box-shadow:none">{li("Goal, intake and limitations","","target")}{li("Log in person for Aarav","Workout, meal or measurement","dumbbell")}{li("Copy FitBud web link","Edit the plan on FitBud web","copy",chev=False)}</div><div style="margin-top:10px">{btn("Cancel","secondary")}</div>'''
S('TM-03i2-profile-menu','More menu trimmed: no Add note (it lives in the action row)',TOP+sheet(MENU),A)
nl=lambda vis,when,txt,first=False:f'<div class="nrow"{" style=\"border-top:0\"" if first else ""}>{note(vis,when,txt,False)}</div>'
S('TM-03k-notes-all','See all notes: newest first, who can see each one, loads more as you scroll',
  page(navb("Notes · 7","Aarav"),'<div class="card" style="padding:2px 16px 4px;margin-top:8px">'+nl(True,"Fri 13 Nov","Keep the last set at 40 kg this week. Tell me if the back still feels tight.",True)+nl(False,"Wed 11 Nov","Desk job, sits 9 hours. Add hip mobility before deadlifts.")+nl(True,"Mon 9 Nov","Great first week. Dal and roti portions look right.")+nl(False,"Sat 7 Nov","Prefers evening workouts after 7 pm. Vegetarian, eats eggs.")+nl(True,"Thu 5 Nov","Welcome, Aarav! Start with the lighter weights this week.")+nl(False,"Tue 3 Nov","Intake call: wants to lose 6 kg by March. Old lower back strain in 2023.")+'</div>'),A)

# ================= Note sheet (D-W14-27 c) =================
A='note'
def nsheet(txt='',sel=0,caret=True):
    c='<span class="caret"></span>' if caret else ''
    t=f'<span>{txt}{c}</span>' if txt else f'<span>{c}<span class="ph">Write a note for Aarav</span></span>'
    cons="Only you can see this note." if sel==0 else "Shows on Aarav’s Today. He gets one notification."
    return f'''<div class="row sp" style="min-height:44px"><span class="navbtn">Cancel</span><span class="t-head">Note for Aarav</span><span class="navbtn strong{"" if txt else " dis"}">Save</span></div>
<div class="inp focus" style="margin-top:10px;min-height:104px;height:auto;align-items:flex-start;padding-top:12px;padding-bottom:12px;line-height:22px" data-wrapok="1">{t}</div>
<div class="t-label glabel" style="margin:14px 4px 8px">Who can see it</div>
<div class="seg big tap"><span class="{"on" if sel==0 else ""}">{ic("lock",15,2.2)}Only me</span><span class="{"on" if sel==1 else ""}">{ic("eye",15,2.2)}Aarav too</span></div>
<div class="t-cap" style="margin:8px 4px 0">{cons}</div>'''
NS='bottom:261px;border-radius:14px 14px 0 0;padding-bottom:14px'
S('TM-04k2-note-sheet-empty','Note sheet: Cancel and Save, Only me by default, keyboard up, Save off while empty',TOP+sheet(nsheet(),style=NS)+kb_alpha('return'),A)
TXT='Keep the last set at 40 kg this week. Tell me if the back still feels tight.'
S('TM-04k3-note-sheet-typed','Typed, Aarav too picked: the line says what happens; Save is on',TOP+sheet(nsheet(TXT,1),style=NS)+kb_alpha('return'),A)
DLG=dialog("Discard this note?","Your note for Aarav won’t be saved.",[btn("Keep writing","secondary"),btn("Discard","danger")]).replace('<div class="scrim"></div>','',1).replace('<div class="dialog">','<div class="dialog" style="z-index:80">',1)
S('TM-04k4-note-discard','Cancel (or swipe down, tap outside, back) with text typed: Discard this note?',TOP+sheet(nsheet(TXT,1,False))+'<div class="scrim" style="z-index:75"></div>'+DLG,A)

# ================= Back (D-W14-24) =================
A='back'
LOGW=page(navb("Log workout","Aarav"),f'''<div class="t-sub" style="margin:6px 4px 14px">Log a session Aarav did with you in person.</div>
{group([li("Date","",trail='<span class="t-sub">Today, Sat 14 Nov</span>'),li("Workout","",trail='<span class="t-sub">Upper body A</span>')])}
<div style="margin-top:18px">{btn("Start logging")}</div>''')
S('BK-01-pushed-screen-header-back','Every pushed screen: a header back with the parent’s name (Android shows ←)',LOGW,A)
L1=f'<div data-offok="1" style="position:absolute;inset:0;overflow:hidden;z-index:1;transform:translateX(-56px)"><div class="content">{hdr()}{jgrid()+MISSED3}</div>{ttab("Attention",BADGE)}<div style="position:absolute;inset:0;background:rgba(10,8,30,.14)"></div></div>'
L2=f'<div data-offok="1" style="position:absolute;inset:0;overflow:hidden;z-index:2;transform:translateX(190px);background:var(--bg);box-shadow:-10px 0 30px rgba(16,12,40,.22)">{TOP}</div>'
TOUCH=f'''<div style="position:absolute;z-index:4;left:164px;top:440px;width:52px;height:52px;border-radius:26px;background:rgba(255,255,255,.55);box-shadow:0 0 0 2px var(--brand),0 6px 18px rgba(16,12,40,.25)"></div>
<div style="position:absolute;z-index:4;left:16px;right:16px;bottom:118px;border-radius:16px;background:var(--ink);color:var(--on-brand);padding:12px 14px" class="row" data-wrapok="1"><span style="display:flex;flex:none">{ic("arrow-right",20,2.4)}</span><span style="margin-left:10px;font-size:14px;line-height:19px">Drag from the left edge: Attention shows underneath. Let go past a third of the screen, or flick, to go back.</span></div>'''
S('BK-02-ios-swipe-back','iOS edge swipe half-way: the previous screen is really underneath (gesture note)',L1+L2+TOUCH,A)
save_reg()

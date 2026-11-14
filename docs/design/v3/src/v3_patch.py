"""One-shot v2 -> v3 conversion of screen scripts (hex -> tokens, copy fixes). Kept for the record; already applied."""
import re,sys
def sub(f,pairs):
    s=open(f).read()
    for a,b,*n in pairs:
        c=s.count(a)
        if c==0: sys.exit(f'MISSING in {f}: {a[:80]}')
        if n and c!=n[0]: sys.exit(f'COUNT {c}!={n[0]} in {f}: {a[:80]}')
        s=s.replace(a,b)
    open(f,'w').write(s)
G=[('background:#fff;top:0;padding-top:54px','background:var(--bg-plain);top:0;padding-top:54px'),
   ('rgba(22,18,58,','rgba(var(--sh),'),('rgba(16,12,40,','rgba(var(--sh),')]
ONB=[('background:var(--brand);color:#fff','background:var(--brand);color:var(--on-brand)'),
     ('background:var(--done);color:#fff','background:var(--done);color:var(--on-brand)'),
     ('background:var(--crit);color:#fff','background:var(--crit);color:var(--on-brand)'),
     ('background:var(--ink2);color:#fff','background:var(--ink2);color:var(--on-brand)')]
PH=[("('#cfc8e8','#9d93c4')","('var(--ph-a)','var(--ph-b)')"),('("#d9d4ea","#aaa1cc")','("var(--ph-a2)","var(--ph-b2)")'),
    ('fill="#ffffff66"','fill="white" fill-opacity=".4"'),('fill="#ffffff55"','fill="white" fill-opacity=".33"')]
def opt(pairs,f):
    s=open(f).read();return [p for p in pairs if p[0] in s]
import glob
files=sorted(glob.glob('[abc]_*.py'))+['kit.py','kit_trainer.py']
# specific first (before generic brand/#fff rules)
sub('b_review.py',[('background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;flex:none;align-self:flex-start','background:var(--icon-tile);color:var(--white);display:flex;align-items:center;justify-content:center;flex:none;align-self:flex-start'),
                   ('Rahul · FitBud</span>','Rahul nudged you</span>',1)])
for f in ['a_rest.py','b_more.py']:
    sub(f,[('background:var(--brand);color:#fff;display:flex;align-items:center;justify-content:center;flex:none">{ic("dumbbell",20,2.2)}','background:var(--icon-tile);color:var(--white);display:flex;align-items:center;justify-content:center;flex:none">{ic("dumbbell",20,2.2)}'),
           ('background:rgba(255,255,255,.72)','background:var(--lock-glass)')])
sub('a_rest.py',[('background:rgba(255,255,255,.55)','background:var(--lock-glass2)',1),
   ('av("AS","#EEEAFF","#4527C6")','av("AS")',2),('fill="#fff" stroke="var(--brand)"','style="fill:var(--card)" stroke="var(--brand)"',1)])
sub('a_onboarding.py',[('justify-content:center;color:#fff">{ic("dumbbell",19,2.2)}','justify-content:center;color:var(--on-brand)">{ic("dumbbell",19,2.2)}',1),
   ('av("RV","#2B1F70","#fff")','av("RV","var(--coach)","var(--on-coach)")',2),('inset 0 0 0 9px #fff','inset 0 0 0 9px var(--card)',1),
   # TR-01b: WhatsApp is a redirect only, never a sign-in channel
   ('''<div class="t-sub" style="margin-top:6px">We’ll send a 6-digit code. It works for 10 minutes.</div>
<div class="field"><div class="lab">Send code to</div>{seg(["Email","WhatsApp"],0)}</div>
<div class="row" style="gap:6px;margin-top:8px">{tag("Coming soon","neutral")}<span class="t-cap">Codes on WhatsApp are coming soon.</span></div>
''','''<div class="t-sub" style="margin-top:6px">We’ll email you a 6-digit code. It works for 10 minutes.</div>
''',1),("'Sign in with a code: choose where to send'","'Sign in with a code: email'",1)])
sub('a_today.py',[('background:rgba(255,255,255,.96)','background:var(--glass)',1)])
sub('a_workout.py',[('color:rgba(255,255,255,.8)">Rest done','opacity:.8">Rest done',1),
   ('<div class="restbar" style="background:var(--done)">','<div class="restbar" style="background:var(--done);color:var(--on-brand)">',1),
   ('<div class="rb" style="background:#fff;color:var(--done)">','<div class="rb" style="background:var(--on-brand);color:var(--done)">',1),
   ('background:#8F8BA6;color:#fff','background:var(--ink3);color:var(--on-brand)',1),
   ('margin:0;background:#F7F5FF','margin:0;background:var(--row-cur)',1),
   ('linear-gradient(135deg,#FFF4D6,#FFE7A8);box-shadow:0 10px 26px rgba(169,120,10,.25)','linear-gradient(135deg,var(--pr-tint),var(--pr-tint2));box-shadow:0 10px 26px rgba(var(--sh),.18)',1),
   ('border-radius:20px;background:#fff;color:var(--pr)','border-radius:20px;background:var(--card);color:var(--pr)',1),
   ('color:#5C4100','color:var(--pr-ink)',2),('color:#7A5A00','color:var(--pr-ink2)',2),
   ('linear-gradient(135deg,#2A1C7A,#4527C6);display:flex;align-items:center;justify-content:center;position:relative;color:#fff','linear-gradient(135deg,var(--hero-a),var(--hero-b));display:flex;align-items:center;justify-content:center;position:relative;color:var(--white)',1),
   ('background:rgba(0,0,0,.28);color:#fff','background:rgba(0,0,0,.28);color:var(--white)',1)])
sub('b_coachlog.py',[('background:var(--navy);color:#fff','background:var(--navy);color:var(--white)',1),('color:#C9BEFF">Done','color:var(--white);opacity:.8">Done',1)])
sub('b_more.py',[('av("KM","#E6EEFF","#2850B8")','av("KM","var(--av4-bg)","var(--av4-fg)")',1),('border-radius:18px;background:#fff;','border-radius:18px;background:var(--card);',1),
   ('{push("Aarav mentions pain"','{push("Aarav mentions pain"',1)])
sub('c_gaps_trainee.py',[('border-radius:18px;background:#fff;','border-radius:18px;background:var(--card);',1)])
sub('c_gaps_trainer.py',[('background:#0B0A12','background:var(--media-bg)',1),('rgba(255,255,255,.14);color:#fff','rgba(255,255,255,.14);color:var(--white)',1),
   ('<span style="color:#fff;font-weight:600','<span style="color:var(--white);font-weight:600',1),('<div style="color:#fff;text-align:center','<div style="color:var(--white);text-align:center',1),
   ('"background:#fff;color:var(--ink)"','"background:var(--white);color:var(--fixed-navy)"',1),('rgba(255,255,255,.12);color:#fff;box-shadow:none','rgba(255,255,255,.12);color:var(--white);box-shadow:none',1)])
sub('kit.py',[
 ("""    col='#fff' if dark else '#0B0A12'""","""    col='var(--white)' if dark else 'var(--ink)'"""),
 ('def av(ini,bg=\'#EEEAFF\',fg=\'#4527C6\'','def av(ini,bg=\'var(--brand-tint)\',fg=\'var(--brand-ink)\''),
 ('{ic(icon,18,2.2,"#7FE0B4")}','{ic(icon,18,2.2,"var(--toast-ok)")}'),
 ('<div class="rb" style="background:#fff;color:var(--navy)">Skip','<div class="rb" style="background:var(--white);color:var(--navy)">Skip'),
 ('<div class="kpad" style="background:#D7D6DE">','<div class="kpad" style="background:var(--kbd)">'),
 ('background:linear-gradient(135deg,#2A1C7A,#1B1546);color:#fff;padding:16px','background:linear-gradient(135deg,var(--hero-a),var(--hero-b));color:var(--hero-fg);padding:16px'),
 ('background:rgba(255,255,255,.12);color:#fff">{ic("clock"','background:rgba(255,255,255,.12);color:var(--hero-fg)">{ic("clock"'),
 ('<div class="btn" style="background:#fff;color:var(--navy);margin-top:14px;height:46px">','<div class="btn" style="background:var(--hero-btn);color:var(--hero-btn-fg);margin-top:14px;height:46px">'),
 ('<span class="t-cap" style="color:var(--brand);font-weight:600">{label}</span>','<span class="t-cap" style="color:var(--coral-ink);font-weight:600">{label}</span>',1),
])
# status bar: SVG presentation attributes cannot take var(); draw with currentColor
s=open('kit.py').read()
s=s.replace('fill="{col}"','fill="currentColor"').replace('stroke="{col}"','stroke="currentColor"')
s=s.replace("""return f'<div class="sb"><div class="time tnum" style="color:{col}">""","""return f'<div class="sb" style="color:{col}"><div class="time tnum">""")
# theme switch
s=s.replace("""    html=(f'<!doctype html>""","""    if os.environ.get('THEME')=='dark': cls=(cls+' dark').strip()
    html=(f'<!doctype html>""")
open('kit.py','w').write(s)
AV={"'#FDE7E4','#B0322A'":1,"'#E3F4EC','#0A7A52'":2,"'#FFF1DC','#9A5A06'":3,"'#E6EEFF','#2850B8'":4,"'#EEEAFF','#4527C6'":5,"'#E2F4F5','#0F7880'":6,
    "'#FCE8F3','#A3286B'":1,"'#FFF4D6','#8A6400'":3,"'#E9F6E2','#3E7A16'":2}
kt=[(k,f"'var(--av{v}-bg)','var(--av{v}-fg)'") for k,v in AV.items()]
kt+=[("'#F1EFF6','#5A5672'","'var(--fill)','var(--ink2)'"),("'#F1EFF6','#8F8BA6'","'var(--fill)','var(--ink3)'"),
     ("'ok':('var(--done)','#fff','check')","'ok':('var(--done)','var(--on-brand)','check')"),("'plan':('#fff','var(--ink4)',None)","'plan':('var(--card)','var(--ink4)',None)"),
     ("'today':('#fff','var(--brand)',None)","'today':('var(--card)','var(--ink)',None)"),
     ("bd='box-shadow:0 0 0 1.5px var(--brand);' if s=='today'","bd='box-shadow:inset 0 0 0 2.5px var(--coral-strong);' if s=='today'"),
     ('background:#E7F7E1;border-radius:14px','background:var(--wa-bubble);border-radius:14px'),('style="color:#2E7D32;margin-top:4px"','style="color:var(--wa-ink);margin-top:4px"'),
     ("W='background:#fff;","W='background:var(--bg-plain);"),
     ('<div class="btn tint sm act">','<div class="btn secondary sm act">'),
     ("'asked':(2,'1 mentions pain')","'asked':(2,'1 with pain')")]
sub('kit_trainer.py',kt)
sub('b_needsyou.py',[("'asked':(2,'1 mentions pain')","'asked':(2,'1 with pain')",1)])
for f in files:
    sub(f,opt(G,f));sub(f,opt(ONB,f));sub(f,opt(PH,f))
# W constants in a_rest / c_gaps_trainee
for f in ['a_rest.py','c_gaps_trainee.py']: sub(f,[("W='background:#fff;","W='background:var(--bg-plain);")]) if "W='background:#fff;" in open(f).read() else None
print('ok')

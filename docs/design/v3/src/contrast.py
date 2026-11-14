"""Recompute DESIGN-SYSTEM-v3 §2.3 contrast pairs (plus the v3 re-render's added tokens) from kit.css, both themes.
Usage: python3 contrast.py  -> prints a table, exits 1 if any pair is below its threshold."""
import re,sys,os
css=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'kit.css')).read()
def block(sel):
    t={}
    for m in re.finditer(r'(?m)^'+re.escape(sel)+r'\{([^}]*)\}',css):
        for k,v in re.findall(r'--([\w-]+):([^;]+);',m.group(1)+';'): t[k]=v.strip()
    return t
L=block(':root');D=dict(L);D.update(block('body.dark'))
def hexrgb(v):
    v=v.strip().lstrip('#');v=''.join(c*2 for c in v) if len(v)==3 else v[:6];return tuple(int(v[i:i+2],16)/255 for i in (0,2,4))
def res(T,x):
    if x.startswith('#'): return x
    v=T[x.lstrip('-')] if not x.startswith('--') else T[x[2:]]
    return res(T,v[4:-1]) if v.startswith('var(') else v
def lum(c):
    f=lambda u:u/12.92 if u<=.03928 else ((u+.055)/1.055)**2.4
    r,g,b=map(f,hexrgb(c));return .2126*r+.7152*g+.0722*b
def cr(a,b):
    x,y=sorted([lum(a),lum(b)],reverse=True);return (x+.05)/(y+.05)
T,G=4.5,3.0
P=[('--ink','--bg',T),('--ink','--card',T),('--ink2','--card',T),('--ink2','--fill',T),('--ink3','--bg',T),('--ink3','--card',T),('--ink3','--fill',T),
   ('--on-brand','--brand',T),('--coach-ink','--card',T),('--coach-ink','--coach-tint',T),('--coral-strong','--card',G),('--coral-strong','--bg',G),
   ('--coral-ink','--card',T),('--coral-ink','--coral-tint',T),('#1A1248','--coral-strong',T),('--done','--card',T),('--done','--done-tint',T),
   ('--on-brand','--done',T),('--ink3','--done-row',T),('--warn','--warn-tint',T),('--crit','--crit-tint',T),('--info','--info-tint',T),('--pr','--pr-tint',T),
   ('--carbs','--fill2',G),('--fat','--fill2',G)]
X=[('--hero-fg','--hero-b',T),('--hero-fg','--hero-a',T),('--hero-btn-fg','--hero-btn',T),('--hero-btn','--hero-b',G),('--white','--icon-tile',T),('--toast-ok','--navy',G),
   ('--white','--navy',T),('--pr-ink','--pr-tint',T),('--pr-ink2','--pr-tint2',T),('--wa-ink','--wa-bubble',T),('--on-coach','--coach',T),('--ghost','--row-cur',T),
   ('--on-brand','--crit',T),('--on-brand','--ink3',T),('--on-brand','--ink2',T),('--done','--on-brand',G)]
X+=[(f'--av{i}-fg',f'--av{i}-bg',T) for i in range(1,7)]
bad=0;out=['| Pair | Need | Light | Dark |','|---|---|---|---|']
for grp,rows in (('spec §2.3',P),('v3 re-render additions',X)):
    out.append(f'| **{grp}** | | | |')
    for a,b,th in rows:
        l=cr(res(L,a),res(L,b));d=cr(res(D,a),res(D,b));f=lambda v:f'{v:.2f}'+('' if v>=th else ' ❌')
        bad+=(l<th)+(d<th);out.append(f'| `{a}` on `{b}` | {th} | {f(l)} | {f(d)} |')
print('\n'.join(out));print(f'\n{len(P)+len(X)} pairs x 2 themes, {bad} below threshold');sys.exit(1 if bad else 0)

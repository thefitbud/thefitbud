import json,collections,os
F=json.load(open('../_work/flows.json'));R=json.load(open('../_work/registry.json'));TM=json.load(open('../_work/tapmap.json'))
side=lambda s:R[s].get('side') or 'trainee'
use=collections.defaultdict(list)
for f in F:
    for st in f['steps']:
        if f['fid'] not in use[st['sid']]: use[st['sid']].append(f['fid'])
def cov(sids):
    c=collections.Counter()
    for s in sids:
        for t in TM.get(s,[]): c[t[2].split(':')[0] if ':' in t[2] else ('BACK' if t[2]=='BACK' else 'INERT' if t[2]=='INERT' else 'SCREEN')]+=1
    return c
GOALS=[('Trainee','First install, invite, intake, reminders','F01'),('Trainee','Sign in / code / reset / auth errors','F02, F02b'),('Trainee','First workout, log sets, rest, PR, finish','F03, F05'),
('Trainee','Plan deviation: add set/exercise, swap, skip, note','F04'),('Trainee','Interruptions, offline then sync','F06, F10'),
('Trainee','Diet day: as planned, changed portion, logged it myself, ate out, edit, delete, late log, locked','F07, F08, F09'),
('Trainee','Weekly check-in','F11'),('Trainee','Progress and weight','F12'),('Trainee','Notification deep links incl. Nudge push','F13'),('Trainee','Ask Rahul (existing WhatsApp redirect)','F14'),
('Trainee','Settings, help, sign out','F15'),('Trainee','Session expiry, errors, ended coaching','F16'),('Karan (dual)','Role select and switch','F17'),
('Coach','Morning triage on Needs you + Nudge (push)','F20'),('Coach','Resolve / mark reviewed / notes','F21'),('Coach','Reply to a question','F22'),('Coach','Review a check-in','F23'),
('Coach','Review a session with trainee-added sets and PRs; diet day','F24'),('Coach','Client detail, activity','F25'),('Coach','Ended / reactivated client','F26'),('Coach','Offline, loading, errors','F27'),('Coach','Settings, log in person, sign out','F28')]
o=['# FitBud mobile flows (Phase C)','','Personas: **Aarav Sharma** (trainee), **Karan Malhotra** (dual role, coached by Priya), **Coach Rahul Verma**. Demo date Sat 14 Nov 2026.','',
'Nudge = push notification (decided 10 Nov). WhatsApp only for Ask Rahul and Reply on WhatsApp.','','## Goal coverage','','| Role | Goal | Flow |','|---|---|---|']
o+=[f'| {a} | {b} | {c} |' for a,b,c in GOALS]
for f in F:
    o+=['',f"## {f['fid']} · {f['role']} · {f['title']}",'',f"Sheet: `png/flows/{f['fid']}.png`",'']
    for i,st in enumerate(f['steps']):
        k='Tap' if st['tap'] else 'System'
        j=f" → lands on {st['status'][5:]}" if st['status'].startswith('jump') else ''
        o.append(f"{i+1}. `{st['sid']}` — {k}: {st['call']}{j}")
open('../flows/flows.md','w').write('\n'.join(o)+'\n')
o=['# Flow index','','Tap coverage = every tappable on the flow\'s screens resolves to a screen, back, a state of the same screen, an external app, or a marked Later item. GAP = 0 everywhere.','','| Flow | Role | Title | Steps | Screens | Taps (screen/state/back/ext/later/inert) | Result | Sheet |','|---|---|---|---|---|---|---|---|']
for f in F:
    sids=list(dict.fromkeys(s['sid'] for s in f['steps']));c=cov(sids)
    o.append(f"| {f['fid']} | {f['role']} | {f['title']} | {len(f['steps'])} | {', '.join(s.split('-')[0]+'-'+s.split('-')[1] for s in sids)} | {c['SCREEN']}/{c['STATE']}/{c['BACK']}/{c['EXT']}/{c['LATER']}/{c['INERT']} | {'PASS' if not c['GAP'] else 'GAP '+str(c['GAP'])} | `png/flows/{f['fid']}.png` |")
open('../flows/index.md','w').write('\n'.join(o)+'\n')
tot=collections.Counter(side(s) for s in R);orph=[s for s in R if s not in use]
o=['# Screen profile — FitBud mobile','',f"Total mobile screens: **{len(R)}** (trainee {tot['trainee']}, trainer {tot['trainer']}). Flows: {len(F)}. Screens used by at least one flow: {len(R)-len(orph)}; reachable-only via tap map (variant/state screens): {len(orph)}.",'',
'Reference for Fable refinement, then Claude implementation. HTML source: `html/<side>/<id>.html`; scripts in `src/`.','']
for sd in ('trainee','trainer'):
    o+=[f'## {sd.title()}','','| Screen | Area | PNG | Purpose | Flows |','|---|---|---|---|---|']
    for s in sorted(x for x in R if side(x)==sd):
        o.append(f"| `{s}` | {R[s].get('area','')} | `png/{sd}/{s}.png` | {R[s].get('label','')} | {', '.join(use.get(s,[])) or '— (state/variant)'} |")
    o.append('')
o+=open('profile_tail.md').read().splitlines()
open('../screen-profile.md','w').write('\n'.join(o)+'\n');print(len(R),tot,len(orph))

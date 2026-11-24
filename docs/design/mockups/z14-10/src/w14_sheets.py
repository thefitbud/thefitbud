import json,os,sys
from PIL import Image,ImageDraw,ImageFont
REG=json.load(open('../_work/registry.json'))
F='/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf'
def font(s,w=600):
    f=ImageFont.truetype(F,s)
    try: f.set_variation_by_axes([14,w])
    except Exception:
        try: f.set_variation_by_axes([w])
        except Exception: pass
    return f
IN='../png-w14'; OUT=sys.argv[1]; os.makedirs(OUT,exist_ok=True)
ids=open('w14_ids.txt').read().split()
G=[('1-workout-summary','Post-workout summary with RPE + read-only View summary (D-W14-10)','W-17'),
   ('2-time-zone','Time-zone list (D-W14-16)','TR-20'),
   ('3-assigned-diet-plan','Assigned diet plan, v3 (diagnosis #7)','TR-07l'),
   ('4-meal-actions-photo','Meal card buttons + meal photo (D-W14-11)',('TR-07a','TR-07m')),
   ('5-something-different','Something different: loading, portion, ate out (diagnosis #12)','TR-08'),
   ('6-android-live-workout','Android Live workout notification (D-W14-12, D-W14-15)','TR-15e')]
S=1/3*1.0  # thumbnails at 1x (393 wide) — readable in chat
ROWS=[('ios-light','iOS · light · 393×852'),('android-light','Android · light · 412×915'),('ios-dark','iOS · dark · 393×852')]
for gid,title,pre in G:
    gs=[i for i in ids if i.startswith(pre)]
    rows=[r for r in ROWS if any(os.path.exists(f'{IN}/{r[0]}/{i}.png') for i in gs)]
    cw,ch,pad,lab,top=412,915,24,64,90
    W=pad+len(gs)*(cw+pad)+150; H=top+len(rows)*(ch+lab+pad)
    im=Image.new('RGB',(W,H),'#F4F5F8'); d=ImageDraw.Draw(im)
    d.text((pad,24),f'Z14-10 · {title}',fill='#1A1248',font=font(30,700))
    d.text((pad,60),'FitBud W14 mocks for Firoz · pending approval (D-W14-14) · 24 Nov 2026',fill='#5B5F72',font=font(18,500))
    for r,(m,ml) in enumerate(rows):
        y=top+r*(ch+lab+pad)
        d.text((W-140,y+lab),ml.replace(' · ','\n',1),fill='#5B5F72',font=font(16,600))
        for c,i in enumerate(gs):
            x=pad+c*(cw+pad); p=f'{IN}/{m}/{i}.png'
            if c==0 or True:
                lbl=i.split('-')[0]+'-'+i.split('-')[1]
                d.text((x,y+8),lbl,fill='#1A1248',font=font(19,700))
                d.text((x,y+34),(REG[i]['label'][:52]+('…' if len(REG[i]['label'])>52 else '')) if r==0 else '',fill='#5B5F72',font=font(14,500))
            if os.path.exists(p):
                t=Image.open(p).convert('RGB'); t=t.resize((t.width//3,t.height//3),Image.LANCZOS)
                im.paste(t,(x,y+lab)); d.rectangle([x-1,y+lab-1,x+t.width,y+lab+t.height],outline='#D0D3DC')
            else:
                d.text((x+20,y+lab+40),'Android only',fill='#9A9EB0',font=font(16,500))
    im.save(f'{OUT}/{gid}.png',optimize=True); print(gid,im.size)

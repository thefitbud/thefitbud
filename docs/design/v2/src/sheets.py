# Contact sheet per area: png/sheets/trainee-<area>.png. Thumbs at 1x (393x852) with ID labels.
import json,os,sys
from PIL import Image,ImageDraw,ImageFont
D=os.path.dirname(os.path.abspath(__file__));R=json.load(open(D+'/../_work/registry.json'))
F='/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf'
f1=ImageFont.truetype(F,34);f2=ImageFont.truetype(F,19);f3=ImageFont.truetype(F,15)
SIDE=os.environ.get('SIDE','trainee');R={k:v for k,v in R.items() if v.get('side','trainee')==SIDE}
areas=sys.argv[1:] or sorted({v['area'] for v in R.values()})
for area in areas:
    ids=sorted([k for k,v in R.items() if v['area']==area])
    cols=min(6,len(ids)) or 1;rows=(len(ids)+cols-1)//cols;tw,th=393,852;gx,gy=28,80
    W=cols*tw+(cols+1)*gx;H=120+rows*(th+gy)
    S=Image.new('RGB',(W,H),'#E9E7F1');d=ImageDraw.Draw(S)
    d.text((gx,36),f'FitBud {SIDE} · {area} · v2 Phase {"A" if SIDE=="trainee" else "B"} · {len(ids)} screens',font=f1,fill='#16123A')
    for i,k in enumerate(ids):
        x=gx+(i%cols)*(tw+gx);y=120+(i//cols)*(th+gy)
        im=Image.open(D+f'/../png/{SIDE}/{k}.png').convert('RGB').resize((tw,th),Image.LANCZOS)
        m=Image.new('L',(tw,th),0);ImageDraw.Draw(m).rounded_rectangle((0,0,tw-1,th-1),radius=30,fill=255);S.paste(im,(x,y),m)
        d.text((x+2,y+th+8),k,font=f2,fill='#4527C6');d.text((x+2,y+th+32),R[k]['label'][:52],font=f3,fill='#5A5672')
    S.save(D+f'/../png/sheets/{SIDE}-{area}.png',optimize=True);print(area,len(ids),S.size)

"""Before/after sheet per area: v2 | v3 light | v3 dark for each screen -> ../before-after/<side>-<area>.png"""
import json,os,sys
from PIL import Image,ImageDraw,ImageFont
D=os.path.dirname(os.path.abspath(__file__));R=json.load(open(D+'/../_work/registry.json'))
F='/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf'
f1=ImageFont.truetype(F,34);f2=ImageFont.truetype(F,18);f3=ImageFont.truetype(F,14)
s=2/3;tw,th=int(393*s),int(852*s);g=10;G=56;per=2;O=D+'/../before-after';os.makedirs(O,exist_ok=True)
SRC=[('v2',D+'/../../v2/png'),('v3 light',D+'/../png'),('v3 dark',D+'/../png-dark')]
for side in ['trainee','trainer']:
    for area in (sys.argv[1:] or sorted({v['area'] for v in R.values() if v.get('side','trainee')==side})):
        ids=sorted(k for k,v in R.items() if v['area']==area and v.get('side','trainee')==side)
        gw=3*tw+2*g;cols=min(per,len(ids));rows=(len(ids)+per-1)//per
        W=G+cols*(gw+G);H=110+rows*(th+86)
        S=Image.new('RGB',(W,H),'#E3E5EC');d=ImageDraw.Draw(S)
        d.text((G,30),f'FitBud {side} · {area} · before/after · v2 | v3 light | v3 dark · {len(ids)} screens',font=f1,fill='#1A1248')
        for i,k in enumerate(ids):
            x0=G+(i%per)*(gw+G);y=100+(i//per)*(th+86)
            for j,(lab,src) in enumerate(SRC):
                x=x0+j*(tw+g);p=f'{src}/{side}/{k}.png'
                if not os.path.exists(p):
                    im=Image.new('RGB',(tw,th),'#ECEEF3');ImageDraw.Draw(im).text((tw//2,th//2),'new in v3 (W12)',font=f2,fill='#46445F',anchor='mm')
                else: im=Image.open(p).convert('RGB').resize((tw,th),Image.LANCZOS)
                m=Image.new('L',(tw,th),0);ImageDraw.Draw(m).rounded_rectangle((0,0,tw-1,th-1),radius=22,fill=255);S.paste(im,(x,y),m)
                d.text((x+2,y+th+28),lab,font=f3,fill='#46445F')
            d.text((x0+2,y+th+6),k,font=f2,fill='#1A1248')
        S.save(f'{O}/{side}-{area}.png',optimize=True);print(side,area,len(ids),S.size)

import json,textwrap
from PIL import Image,ImageDraw,ImageFont
FL=json.load(open('../_work/flows.json'));R=json.load(open('../_work/registry.json'));LOC=json.load(open('../_work/locs.json'))
Fp='/usr/share/fonts/truetype/sand-box/google/Inter/Inter-VariableFont_opsz,wght.ttf'
f1=ImageFont.truetype(Fp,30);f2=ImageFont.truetype(Fp,17);f3=ImageFont.truetype(Fp,15);f4=ImageFont.truetype(Fp,14)
s=2/3;tw,th=int(393*s),int(852*s);gx,cols=76,6;CAP=96
for f in FL:
    n=len(f['steps']);rows=(n+cols-1)//cols;W=gx+cols*(tw+gx);H=110+rows*(th+CAP+50)
    S=Image.new('RGB',(W,H),'#E3E5EC');d=ImageDraw.Draw(S)
    d.text((gx,30),f"{f['fid']} · {f['role']} · {f['title']}",font=f1,fill='#1A1248')
    d.text((gx,70),f"{n} steps · numbered red rings = where you tap · arrows = next screen",font=f3,fill='#46445F')
    for i,st in enumerate(f['steps']):
        r,c=divmod(i,cols);x=gx+c*(tw+gx);y=110+r*(th+CAP+50)
        im=Image.open(f"../png/{R[st['sid']].get('side','trainee')}/{st['sid']}.png").convert('RGB').resize((tw,th),Image.LANCZOS)
        m=Image.new('L',(tw,th),0);ImageDraw.Draw(m).rounded_rectangle((0,0,tw-1,th-1),radius=22,fill=255);S.paste(im,(x,y),m)
        if st['tap'] and (q:=LOC.get(st['sid']+'|'+st['tap'])):
            cx,cy=x+(q[0]+q[2]/2)*s,y+(q[1]+q[3]/2)*s;rw,rh=max(q[2]*s/2+5,16),max(q[3]*s/2+5,16)
            d.rounded_rectangle((cx-rw,cy-rh,cx+rw,cy+rh),radius=12,outline='#E5484D',width=4)
            d.ellipse((cx+rw-14,cy-rh-14,cx+rw+14,cy-rh+14),fill='#E5484D');d.text((cx+rw,cy-rh),str(i+1),font=f4,fill='white',anchor='mm')
        d.text((x,y+th+10),f"{i+1}. {st['sid']}",font=f3,fill='#1A1248')
        lab=('Tap: ' if st['tap'] else ('System: ' if st['status']=='system' else '')) + st['call']
        if st['status'].startswith('jump'): lab+=f"  (goes to {st['status'][5:].split('-')[0]}-{st['status'][5:].split('-')[1]})"
        for k,line in enumerate(textwrap.wrap(lab,30)[:3]): d.text((x,y+th+32+k*19),line,font=f2,fill='#1A1248')
        if i<n-1 and c<cols-1:
            ay=y+th/2;ax=x+tw+10;d.line((ax,ay,ax+gx-22,ay),fill='#1A1248',width=4);d.polygon([(ax+gx-20,ay-9),(ax+gx-20,ay+9),(ax+gx-6,ay)],fill='#1A1248')
    S.save(f"../png/flows/{f['fid']}.png",optimize=True)
print('ok',len(FL))

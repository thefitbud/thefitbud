import sys
from PIL import Image,ImageDraw,ImageFont
def F(s): return ImageFont.truetype('../../mockups/html/fonts/Satoshi-600.ttf',s)
def sheet(items,out,title,h=852):
    ims=[(l,Image.open(p).convert('RGB')) for l,p in items]
    ims=[(l,im.resize((int(im.width*h/im.height),h))) for l,im in ims]
    W=sum(im.width for _,im in ims)+30*(len(ims)+1);S=Image.new('RGB',(W,h+110),'#F3F5FB');d=ImageDraw.Draw(S)
    d.text((30,14),title,fill='#1A1248',font=F(30));x=30
    for l,im in ims: d.text((x,62),l,fill='#25262B',font=F(20));S.paste(im,(x,96));x+=im.width+30
    S.save(out)

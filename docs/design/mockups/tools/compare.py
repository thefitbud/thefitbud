# Old-vs-new compare grid: one row per screen, BEFORE (from git) | AFTER. Usage: from compare import grid
from PIL import Image,ImageDraw,ImageFont
def F(s): return ImageFont.truetype('html/fonts/Satoshi-600.ttf',s)
def grid(rows,out,title,h=560,cols=1):
    # rows: (label, old_path|None, new_path); cols = rows per line of the sheet
    def ld(p): 
        im=Image.open(p).convert('RGB');return im.resize((int(im.width*h/im.height),h))
    cells=[]
    for l,o,n in rows:
        ni=ld(n);oi=ld(o) if o else None
        cw=(oi.width if oi else ni.width)+ni.width+90
        cells.append((l,oi,ni,cw))
    lines=[cells[i:i+cols] for i in range(0,len(cells),cols)]
    W=max(sum(c[3] for c in ln)+40*(len(ln)+1) for ln in lines);RH=h+90
    S=Image.new('RGB',(W,90+RH*len(lines)),'#F3F5FB');d=ImageDraw.Draw(S);d.text((40,24),title,fill='#1A1248',font=F(34))
    for r,ln in enumerate(lines):
        x=40;y=90+r*RH
        for l,oi,ni,cw in ln:
            d.text((x,y),l,fill='#25262B',font=F(22))
            if oi: d.text((x,y+34),'BEFORE',fill='#B91C1C',font=F(16));S.paste(oi,(x,y+58));x2=x+oi.width+30
            else:
                w=ni.width;d.rectangle([x,y+58,x+w,y+58+h],fill='#E9E7F2');d.text((x+20,y+80),'NEW FRAME (no earlier version)',fill='#5B616B',font=F(20));x2=x+w+30
            d.text((x2,y+34),'AFTER',fill='#047857',font=F(16));S.paste(ni,(x2,y+58));x=x2+ni.width+60
    S.save(out,optimize=True)

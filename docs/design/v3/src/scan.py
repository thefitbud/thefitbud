"""Heuristic pixel scan of rendered PNGs: leftover v2 indigo, bright boxes on dark. Usage: python3 scan.py"""
import glob,os,numpy as np
from PIL import Image
B=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..')
def load(p): return np.asarray(Image.open(p).convert('RGB').resize((393,852)),dtype=np.float32)
V2=np.array([[0x45,0x27,0xC6],[0x3A,0x1F,0xB0],[0x9C,0x8C,0xEB],[0xEE,0xEA,0xFF],[0xDC,0xD4,0xFF],[0x8A,0x73,0xFF],[0x2A,0x1C,0x7A]],dtype=np.float32)
SKIP=('TR-15c','TM-13a')  # lock-screen wallpapers keep their v2 gradients
for d in ['png','png-dark']:
    rows=[]
    for p in sorted(glob.glob(f'{B}/{d}/*/*.png')):
        k=os.path.basename(p)[:-4];a=load(p)
        ind=min(((np.abs(a-c).sum(-1)<18).mean() for c in V2[:3]))  # strong indigo hits only
        ind=max((np.abs(a-c).sum(-1)<14).mean() for c in V2)
        bright=((a.min(-1)>225)).mean() if d=='png-dark' else 0
        if (ind>0.002 and not k.startswith(SKIP)) or bright>0.06: rows.append((k,round(ind*100,2),round(bright*100,1)))
    print(d,'flagged',len(rows));[print('  ',*r) for r in rows]

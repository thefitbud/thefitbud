import sys
from PIL import Image
f,x,y,w,h,out=sys.argv[1],*map(int,sys.argv[2:6]),sys.argv[6]
Image.open(f).crop((x,y,x+w,y+h)).save(out)

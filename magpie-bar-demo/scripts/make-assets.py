"""Original procedural surface textures and typesetting; no scene photographs are used."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

out = Path(__file__).resolve().parents[1] / 'textures'
out.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(93026)
n = 512
y, x = np.mgrid[:n, :n]
def save(name, data):
    Image.fromarray(np.clip(data, 0, 255).astype('uint8')).save(out / name, quality=92)
grain = 10*np.sin((x + 4*np.sin(y*.023))*.12) + 5*np.sin(x*.77+y*.014) + rng.normal(0, 2, (n,n))
save('walnut.jpg', np.array([100,61,40])[None,None,:] + grain[...,None]*[1,.75,.5])
save('dark-timber.jpg', np.array([48,30,28])[None,None,:] + grain[...,None]*[.65,.44,.4])
pores = rng.normal(0,2,(n,n)) + 1.5*np.sin(x*.9)*np.sin(y*1.1)
save('leather.jpg', np.array([25,25,29])[None,None,:] + pores[...,None])
tiles = rng.uniform(-8,8,(8,8))[y//64,x//64]
floor = np.array([107,91,87])[None,None,:] + tiles[...,None] + rng.normal(0,1.3,(n,n,1))
floor[(x%64<2)|(y%64<2)] = [39,34,36]
save('tiles.jpg', floor)
save('plaster.jpg', np.array([49,45,45])[None,None,:] + rng.normal(0,3,(n,n,1)))
font = lambda size: ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', size)
sign = Image.new('RGB',(2048,512),'#181820')
d = ImageDraw.Draw(sign)
d.rounded_rectangle((12,12,2036,500),20,outline='#9c666c',width=3)
d.text((1024,191),'喜鹊音乐酒馆',font=font(211),fill='#ffdfd4',anchor='mm',stroke_width=1)
d.text((1024,397),'P I C A   P I C A   B A R',font=font(72),fill='#ee89c1',anchor='mm')
sign.save(out/'facade-sign.png')
screen = Image.new('RGB',(1536,768),'#151127')
d = ImageDraw.Draw(screen)
for i in range(37):
    px=18+i*42; h=int(60+230*abs(np.sin(i*.64)))
    d.rounded_rectangle((px,650-h,px+20,650),6,fill=(int(100+i*2),45,int(125+i*2)))
d.text((768,162),'PICA PICA',font=font(139),fill='#ffdfc8',anchor='mm')
d.text((768,305),'今 夜 有 现 场',font=font(75),fill='#eba3c5',anchor='mm')
d.text((768,703),'Y A N G S H U O   /   L I V E   M U S I C',font=font(27),fill='#c5afa8',anchor='mm')
screen.save(out/'stage-screen.png')
menu = Image.new('RGB',(512,768),'#e8dcca')
d=ImageDraw.Draw(menu); d.rectangle((18,18,493,749),outline='#79604f',width=2)
d.text((256,125),'PICA PICA',font=font(54),fill='#392c37',anchor='mm')
d.text((256,214),'今夜有现场',font=font(41),fill='#392c37',anchor='mm')
for j,text in enumerate(['LIVE BAND','COCKTAILS','CRAFT BEER','西街 · 夜色']):
    d.text((256,325+j*78),text,font=font(30),fill='#7c5059',anchor='mm')
menu.save(out/'table-menu.png')
print('Generated 8 original material textures:',out)

"""Generate original tiling furniture/floor textures; retain source reference photos unchanged."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / 'textures'
OUT.mkdir(exist_ok=True)
rng = np.random.default_rng(72025)
N = 1024
y, x = np.mgrid[0:N, 0:N]

def save(name, pixels):
    Image.fromarray(np.clip(pixels, 0, 255).astype('uint8')).save(OUT / name)

# Warm ash/elm grain: broad waves and thin pores at distinct frequencies.
warp = x + 9*np.sin(y*.006) + 4*np.sin(y*.019+x*.005)
grain = 9*np.sin(warp*.047) + 4*np.sin(warp*.26) + 2*np.sin(warp*.94)
grain += rng.normal(0, 1.5, (N, N))
wood = np.array([157, 119, 76])[None, None, :] + grain[..., None] * [1, .85, .63]
save('elm-color.jpg', wood)

# Small warm-grey pavers, seam layout references the central walkway.
rows, cols = 8, 4
iy, ix = y // (N//rows), ((x + (y//(N//rows)%2)*(N//cols//2)) % N) // (N//cols)
variation = rng.uniform(-10, 10, (rows, cols))[iy, ix]
seams = ((y % (N//rows)) < 3) | (((x + (iy%2)*(N//cols//2)) % (N//cols)) < 3)
floor = np.array([124, 117, 101])[None,None,:] + variation[...,None] + rng.normal(0,1.7,(N,N,1))
floor[seams] *= .55
save('pavers-color.jpg', floor)

# Fine woven cane used on the timber chair backs.
weave = np.array([182, 155, 111])[None,None,:] + np.zeros((N,N,3))
weave += (np.sin(x*.8)*9+np.sin(y*.85)*7)[...,None]
weave[(x%18<3) | (y%18<3)] *= .73
save('cane-color.jpg', weave)

# Sign and bottle/menu lettering are original typesetting.
font_path = 'C:/Windows/Fonts/msyh.ttc'
def font(size):
    return ImageFont.truetype(font_path, size)

sign = Image.new('RGB', (2048, 512), '#434e40')
d = ImageDraw.Draw(sign)
d.text((1024,180), '岩洞餐厅', font=font(214), fill='#f0eee2', anchor='mm', stroke_width=1)
d.text((1024,386), 'C A V E   R E S T A U R A N T', font=font(71), fill='#e8e5d7', anchor='mm')
sign.save(OUT/'restaurant-sign.png')

label = Image.new('RGB',(512,512),'#ece5d2')
d = ImageDraw.Draw(label)
d.rectangle((22,22,490,490),outline='#81724e',width=3)
d.text((256,158),'NANYANG',font=font(45),fill='#29392d',anchor='mm')
d.text((256,238),'PRIVATE DINING',font=font(26),fill='#72603c',anchor='mm')
d.text((256,323),'山水之间',font=font(50),fill='#29392d',anchor='mm')
d.text((256,413),'RESERVE  ·  2026',font=font(24),fill='#72603c',anchor='mm')
label.save(OUT/'wine-label.png')
print('Generated five original surface/lettering textures:', OUT)

"""Original procedural surface textures and typesetting; no scene photographs are used."""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

out = Path(__file__).resolve().parents[1] / 'textures'
out.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(93026)
n = 512
y, x = np.mgrid[:n, :n]
def save(name, data, quality=88):
    image = Image.fromarray(np.clip(data, 0, 255).astype('uint8'))
    if name.endswith('.png'):
        image.save(out / name, optimize=True)
    else:
        image.save(out / name, quality=quality, optimize=True, subsampling=0)


def periodic_noise(gx, gy=None):
    """Smooth, deterministic noise with wrapping lattice points at all edges."""
    gy = gy or gx
    grid = rng.uniform(-1, 1, (gy, gx))
    px, py = x * gx / n, y * gy / n
    ix, iy = px.astype(int), py.astype(int)
    fx, fy = px - ix, py - iy
    fx, fy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    lower = grid[iy % gy, ix % gx] * (1 - fx) + grid[iy % gy, (ix + 1) % gx] * fx
    upper = grid[(iy + 1) % gy, ix % gx] * (1 - fx) + grid[(iy + 1) % gy, (ix + 1) % gx] * fx
    return lower * (1 - fy) + upper * fy


def normal(height, strength):
    # glTF samples the first image row at V=0. Our geometry bakes V=1-v,
    # so Three's UV-derived bitangent follows increasing image rows, too.
    # A raised surface normal opposes BOTH height derivatives in that frame.
    # Do not add the green flip used when an unflipped, bottom-origin UV set
    # samples an image-row height field: it would turn horizontal grout inward.
    dx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * strength
    dy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * strength
    vectors = np.stack((-dx, -dy, np.ones_like(height)), axis=-1)
    vectors /= np.linalg.norm(vectors, axis=-1)[..., None]
    return (vectors * .5 + .5) * 255


def pbr(name, height, roughness, ao=1, metalness=0, strength=1):
    """Normal and ARM are linear data, never sRGB color textures."""
    save(name + '-normal.png', normal(height, strength))
    channels = [np.broadcast_to(channel, (n, n)) for channel in (ao, roughness, metalness)]
    save(name + '-arm.jpg', np.stack(channels, axis=-1) * 255, quality=91)


# Fine elongated pores and irregular growth rings; all frequencies are periodic.
wood_warp = 1.6 * periodic_noise(3, 3) + .65 * periodic_noise(7, 2)
wood_phase = 2 * np.pi * (x * 13 / n + wood_warp)
growth = np.sin(wood_phase) * .35 + np.sin(wood_phase * 2) * .12
pores = np.maximum(0, periodic_noise(100, 10) - .23) ** 1.4
wood_fine = periodic_noise(180, 32)
wood_tone = 13 * growth + 8 * periodic_noise(8, 2) - 35 * pores + 2 * wood_fine
save('walnut.jpg', np.array([91, 55, 34])[None, None, :] + wood_tone[..., None] * [1, .75, .49])
save('dark-timber.jpg', np.array([43, 29, 27])[None, None, :] + wood_tone[..., None] * [.6, .4, .35])
pbr('walnut', .13 * growth - .32 * pores + .025 * wood_fine,
    .43 + .06 * periodic_noise(8, 4) + .12 * pores,
    1 - .22 * pores, strength=2.4)

# Mottled pebbled leather with a shallow creased grain, not white speckle noise.
leather_grain = periodic_noise(105) + .3 * periodic_noise(210)
creases = np.exp(-np.abs(leather_grain) * 13)
leather_height = .1 * leather_grain - .07 * creases
leather_tone = 2.8 * leather_grain + 1.4 * periodic_noise(9) - 2 * creases
save('leather.jpg', np.array([25, 25, 29])[None, None, :] + leather_tone[..., None])
pbr('leather', leather_height, .65 + .035 * leather_grain + .06 * creases,
    1 - .06 * creases, strength=1.7)

# Ceramic tile has a rounded bevel, dark grout and subtle variations per tile.
tile_tone = rng.uniform(-5, 5, (8, 8))[y // 64, x // 64]
edge_distance = np.minimum(np.minimum(x % 64, 64 - x % 64), np.minimum(y % 64, 64 - y % 64))
bevel = np.clip((edge_distance - 1) / 3, 0, 1)
bevel = bevel * bevel * (3 - 2 * bevel)
ceramic = periodic_noise(70) * .6 + periodic_noise(8) * 1.3
tile_color = np.array([104, 88, 82])[None, None, :] + (tile_tone + ceramic)[..., None]
grout_color = np.array([43, 39, 40])[None, None, :] + periodic_noise(150)[..., None]
save('tiles.jpg', tile_color * bevel[..., None] + grout_color * (1 - bevel[..., None]))
pbr('tiles', .24 * bevel + .0015 * ceramic, .86 - .34 * bevel + .02 * periodic_noise(15),
    .76 + .24 * bevel, strength=2)
save('plaster.jpg', np.array([49, 45, 45])[None, None, :] +
     (2 * periodic_noise(150) + 1.5 * periodic_noise(25))[..., None])

# Woven red lantern silk: restrained weave highlights and translucent fabric color.
weft = np.sin(2 * np.pi * x * 128 / n)
warp = np.sin(2 * np.pi * y * 128 / n)
silk_weave = .55 * weft + .45 * warp + .17 * weft * warp
silk_variation = periodic_noise(8) * 2.6 + silk_weave * 2
save('silk.jpg', np.array([151, 34, 39])[None, None, :] + silk_variation[..., None] * [1, .47, .39])
pbr('silk', .04 * silk_weave + .008 * periodic_noise(100),
    .79 + .03 * silk_weave, strength=.6)

# Fine brushed metal. Metallic base color is defined by the model's brass material.
brushing = periodic_noise(4, 240) + .22 * periodic_noise(12, 256)
pbr('brass', .04 * brushing, .34 + .045 * brushing + .02 * periodic_noise(4),
    metalness=1, strength=.45)
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
label = Image.new('RGB', (512, 256), '#e6d8bc')
d = ImageDraw.Draw(label)
d.rectangle((10, 10, 501, 245), outline='#80684b', width=2)
d.rectangle((17, 17, 494, 238), outline='#bca477', width=1)
d.text((256, 80), 'PICA PICA', font=font(52), fill='#332632', anchor='mm')
d.line((151, 123, 361, 123), fill='#80684b', width=2)
d.text((256, 158), 'HOUSE SELECT', font=font(24), fill='#80684b', anchor='mm')
d.text((256, 205), 'YANGSHUO / LIVE MUSIC', font=font(14), fill='#80684b', anchor='mm')
label.save(out / 'bottle-label.png', optimize=True)
# This label is original scene decoration, not an image of a real wine brand.
detail_files = list(out.glob('*-normal.png')) + list(out.glob('*-arm.jpg')) + [out / 'silk.jpg', out / 'bottle-label.png']
print('Generated original material textures:', out)
print('Additional detail assets: %.2f MiB' % (sum(p.stat().st_size for p in detail_files) / 1024 ** 2))

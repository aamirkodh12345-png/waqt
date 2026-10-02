"""Erzeugt die Buchstaben J, N, H als fertige Bilder (Anybody Black, schmal) im Riso-Druck-Look:
raue Druckkanten, Farbaussetzer und die Blau-Textur aus assets/img/ink.webp. Dazu die App-Icons.
Aufruf: python3 tools/make-jnnh.py   (braucht numpy, scipy, Pillow, fontTools, brotli)
Andere Schrift oder Breite: unten WDTH/WGHT und FONT anpassen."""
import os, numpy as np
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from scipy import ndimage as ndi
HERE = os.path.dirname(os.path.abspath(__file__)); IMG = os.path.join(HERE, '..', 'assets', 'img')
FONT = os.path.join(HERE, '..', 'assets', 'fonts', 'anybody-var.woff2'); WDTH, WGHT = 62, 900
CAP, PAD = 800, 26                                              # Kappenhöhe der Buchstaben in Pixeln, Rand oben und unten
PAPER = (232, 218, 195)
TTF = '/tmp/anybody-var.ttf'; f = TTFont(FONT); f.flavor = None; f.save(TTF)
rng = np.random.default_rng(5)
ink = np.asarray(Image.open(os.path.join(IMG, 'ink.webp')).convert('RGB'))

def font_at(size):
    ft = ImageFont.truetype(TTF, size); vals = []
    for ax in ft.get_variation_axes():
        nm = ax['name'].decode() if isinstance(ax['name'], bytes) else ax['name']
        vals.append(WDTH if 'idth' in nm else WGHT)
    ft.set_variation_by_axes(vals); return ft

probe = font_at(400); size = 400 * CAP / -probe.getbbox('H', anchor='ls')[1]; ft = font_at(size)
noise = lambda shape, s: (lambda n: n / n.std())(ndi.gaussian_filter(rng.standard_normal(shape), s))
smooth = lambda x, a, b: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))

def letter(ch):
    x0, y0, x1, y1 = ft.getbbox(ch, anchor='ls'); w = int(x1 - x0 + 2 * PAD); h = CAP + 2 * PAD
    im = Image.new('L', (w, h), 0); ImageDraw.Draw(im).text((PAD - x0, PAD + CAP), ch, font=ft, fill=255, anchor='ls')
    m = ndi.gaussian_filter(np.asarray(im).astype(float) / 255, 1.8)
    near = smooth(ndi.gaussian_filter(m, 9), 0.015, 0.09)                       # Spritzer nur in Buchstabennähe
    edge = smooth(m + 0.16 * noise(m.shape, 2.8) + 0.08 * noise(m.shape, 0.9), 0.40, 0.60) * np.maximum(near, m > 0.5)
    drop = (noise(m.shape, 1.2) > 2.7) | (noise(m.shape, 5) > 3.2)
    a = edge * (1 - 0.9 * (drop & (m > 0.95)))
    oy, ox = rng.integers(0, 768, 2); tile = np.tile(ink, (h // 768 + 2, w // 768 + 2, 1))[oy:oy + h, ox:ox + w]
    out = np.dstack([tile, (a * 255)[..., None]]).astype(np.uint8)
    return Image.fromarray(out, 'RGBA')

for ch in 'JNH':
    im = letter(ch); p = os.path.join(IMG, f'L-{ch}.webp'); im.save(p, 'WEBP', quality=80, method=6, alpha_quality=85)
    print(ch, im.size, f'Seitenverhältnis {im.width / im.height:.3f}', os.path.getsize(p) // 1024, 'KB')

# App-Icons: 2×2 Buchstaben in Papierweiß auf der Blau-Textur (Inhalt liegt in der Maskable-Sicherheitszone)
def icon(n):
    bg = Image.fromarray(np.tile(ink, (n // 768 + 2, n // 768 + 2, 1))[:n, :n]).convert('RGB').resize((n, n)); d = ImageDraw.Draw(bg)
    cap = n * 0.27; fi = font_at(size * cap / CAP); gap = cap * 0.12; rows = ['JN', 'NH']
    for r, row in enumerate(rows):
        ws = [fi.getlength(c) for c in row]; tot = sum(ws) + gap; x = (n - tot) / 2; base = n / 2 + (r - 0.5) * (cap + gap) + cap * (0.5 if r else -0.5) + cap * 0.5 - (0 if r else 0)
        base = n / 2 - gap / 2 + (cap if r else 0) + (gap if r else 0) - (0 if r else 0)
        for c, w in zip(row, ws): d.text((x, base), c, font=fi, fill=PAPER, anchor='ls'); x += w + gap
    return bg
for n in (192, 512): icon(n).save(os.path.join(IMG, f'icon-{n}.png'), optimize=True)
print('Icons ok')

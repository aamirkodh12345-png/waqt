"""Erzeugt die nahtlosen Druck-Texturen (Riso-Look) aus den Messwerten des Posters.
Aufruf: python3 tools/make-textures.py   (braucht numpy und Pillow)"""
import os, numpy as np
from PIL import Image
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'img'); os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(11)
INK = np.array([45, 84, 161.]); INK_STD = np.array([13, 13, 10.7])     # Median und Streuung des Posterblaus (#2D54A1)
PAPER = np.array([232, 218, 195.])                                      # Median des Posterpapiers (#E8DAC3)

def fnoise(n, sigma):                                                    # periodisches (nahtloses) Rauschen, Std = 1
    f = np.fft.fftfreq(n); g = np.exp(-2 * (np.pi * sigma) ** 2 * (f[:, None] ** 2 + f[None, :] ** 2))
    out = np.fft.ifft2(np.fft.fft2(rng.standard_normal((n, n))) * g).real
    return out / out.std()

def ink(n=768):
    d = 0.30 * fnoise(n, 70) + 0.40 * fnoise(n, 9) + 0.55 * fnoise(n, 1.3)          # Farbdichte: Wolken, Fasern, Korn
    y, x = np.mgrid[0:n, 0:n]; p = 4.0 * 1.414                                       # feines Rasternetz im 45°-Winkel
    d = d + 0.22 * np.cos(2 * np.pi * (x + y) / p) * np.cos(2 * np.pi * (x - y) / p)
    img = INK + d[..., None] * INK_STD * np.array([1, 1, .85])
    fl = (fnoise(n, 0.9) > 2.55)[..., None]                                          # helle Papier-Sprenkel (~1 %)
    k = (0.45 + 0.4 * rng.random((n, n)))[..., None] * fl
    return np.clip(img * (1 - k) + PAPER * k, 0, 255).astype(np.uint8)

def paper(n=512):
    d = 0.6 * fnoise(n, 50) + 0.5 * fnoise(n, 1.4) + 0.3 * fnoise(n, 6)
    img = PAPER + d[..., None] * np.array([2.2, 2.4, 2.8])
    img[fnoise(n, 0.8) > 3.0] *= 0.955                                               # vereinzelte dunklere Fasern
    return np.clip(img, 0, 255).astype(np.uint8)

def grain(n=320):                                                                    # Korn mit Alpha, liegt über den Videos
    a = fnoise(n, 0.7)
    alpha = np.clip((np.abs(a) - 0.9) * 0.22, 0, 0.30)
    col = np.where((a > 0)[..., None], PAPER, np.array([20., 38., 80.]))
    return np.dstack([col, alpha * 255]).astype(np.uint8)

for name, arr, q, mode in [('ink', ink(), 86, 'RGB'), ('paper', paper(), 86, 'RGB'), ('grain', grain(), 70, 'RGBA')]:
    path = os.path.join(OUT, name + '.webp'); Image.fromarray(arr, mode).save(path, 'WEBP', quality=q, method=6)
    print(name, arr.shape[:2], os.path.getsize(path) // 1024, 'KB')

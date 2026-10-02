"""Erzeugt eine statische Anybody-Kopie (breit, schwarz) OHNE Überlappungen, nur für Umrissschrift (-webkit-text-stroke).
Grund: Variable Schriften haben überlappende Konturen, die man im Umriss als wirre Innenlinien sieht.
Aufruf: python3 tools/make-outline-font.py   (braucht fontTools, skia-pathops, brotli)"""
import os
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.ttLib.removeOverlaps import removeOverlaps
from fontTools import subset
HERE = os.path.dirname(os.path.abspath(__file__)); FONTS = os.path.join(HERE, '..', 'assets', 'fonts')
f = TTFont(os.path.join(FONTS, 'anybody-var.woff2')); f.flavor = None
f = instancer.instantiateVariableFont(f, {'wght': 900, 'wdth': 125})
removeOverlaps(f)
opt = subset.Options(); opt.flavor = 'woff2'; opt.layout_features = ['kern']; opt.notdef_outline = True
sub = subset.Subsetter(opt); sub.populate(unicodes=list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + [0x2013, 0x2014, 0x2019, 0x201E, 0x201C]); sub.subset(f)
out = os.path.join(FONTS, 'anybody-outline.woff2'); f.flavor = 'woff2'; f.save(out); print('anybody-outline.woff2', os.path.getsize(out) // 1024, 'KB')

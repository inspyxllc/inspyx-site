"""Tile screenshots into one contact sheet.

usage: python3 -I montage.py <out.png> <cols> <cellWidth> <img1> <img2> ...
"""
import sys
from PIL import Image, ImageDraw

out, cols, cw = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
paths = sys.argv[4:]
ims = [Image.open(p).convert('RGB') for p in paths]
cells = []
for im, p in zip(ims, paths):
    h = round(im.height * cw / im.width)
    c = im.resize((cw, h), Image.LANCZOS)
    d = ImageDraw.Draw(c)
    label = p.rsplit('/', 1)[-1].replace('shot-', '').replace('.png', '')
    d.rectangle([0, 0, 8 + 7 * len(label), 16], fill=(0, 0, 0))
    d.text((4, 2), label, fill=(255, 255, 255))
    cells.append(c)
rows = (len(cells) + cols - 1) // cols
ch = max(c.height for c in cells)
gap = 6
sheet = Image.new('RGB', (cols * cw + (cols + 1) * gap, rows * ch + (rows + 1) * gap), (30, 30, 30))
for i, c in enumerate(cells):
    sheet.paste(c, (gap + (i % cols) * (cw + gap), gap + (i // cols) * (ch + gap)))
sheet.save(out)
print(out, sheet.size)

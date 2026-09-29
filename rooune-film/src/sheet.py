# contact sheet of stills: python3 src/sheet.py out/stills out/sheet.png [cols] [scale]
import sys, glob
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
sc = float(sys.argv[4]) if len(sys.argv) > 4 else 0.3
fs = sorted(glob.glob(d + '/*.png'))
ims = [Image.open(f).convert('RGB') for f in fs]
w, h = int(1080 * sc), int(1920 * sc)
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (cols * w + (cols + 1) * 6, rows * h + (rows + 1) * 6), (60, 60, 60))
dr = ImageDraw.Draw(sheet)
for i, (im, f) in enumerate(zip(ims, fs)):
    x, y = 6 + (i % cols) * (w + 6), 6 + (i // cols) * (h + 6)
    sheet.paste(im.resize((w, h), Image.LANCZOS), (x, y))
    dr.text((x + 6, y + 6), f.split('/')[-1], fill=(255, 0, 0))
sheet.save(out)

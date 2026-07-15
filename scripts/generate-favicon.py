from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
canvas = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
draw = ImageDraw.Draw(canvas)

draw.rounded_rectangle((8, 8, 248, 248), radius=66, fill="#10261f")

font_path = Path("C:/Windows/Fonts/arialbd.ttf")
font = ImageFont.truetype(str(font_path), 176)
bounds = draw.textbbox((0, 0), "P", font=font)
width = bounds[2] - bounds[0]
height = bounds[3] - bounds[1]
draw.text(((256 - width) / 2 - 5, (256 - height) / 2 - bounds[1] - 5), "P", font=font, fill="#c8ff43")
draw.ellipse((194, 194, 230, 230), fill="#ff835f")

canvas.save(root / "app" / "icon.png", format="PNG", optimize=True)
canvas.save(root / "app" / "favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])

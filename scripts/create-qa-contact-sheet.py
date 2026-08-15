import sys
from pathlib import Path

from PIL import Image, ImageDraw


root = Path(sys.argv[1])
output = Path(sys.argv[2])
sources = sorted(root.glob("resume-collection-cn-*/fixed-sample/page-1.png"))
thumb_width = 360
label_height = 34
thumbs = []
for source in sources:
    with Image.open(source).convert("RGB") as image:
        height = round(image.height * thumb_width / image.width)
        thumbs.append((source.parts[-3], image.resize((thumb_width, height))))
cell_height = max(image.height for _, image in thumbs) + label_height
sheet = Image.new("RGB", (thumb_width * 5, cell_height * 2), "white")
draw = ImageDraw.Draw(sheet)
for index, (label, image) in enumerate(thumbs):
    x = index % 5 * thumb_width
    y = index // 5 * cell_height
    draw.text((x + 8, y + 8), label, fill="black")
    sheet.paste(image, (x, y + label_height))
output.parent.mkdir(parents=True, exist_ok=True)
sheet.save(output, quality=92)

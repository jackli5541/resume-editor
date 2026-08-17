import sys
from pathlib import Path

from PIL import Image


quality = 88
source_names = []
for argument in sys.argv[1:]:
    if argument.startswith("--quality="):
        quality = max(1, min(100, int(argument.split("=", 1)[1])))
    else:
        source_names.append(argument)

for source_name in source_names:
    source = Path(source_name)
    target = source.with_suffix(".webp")
    with Image.open(source) as image:
        image.save(target, "WEBP", quality=quality, method=4)
    source.unlink()

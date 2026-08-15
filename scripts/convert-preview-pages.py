import sys
from pathlib import Path

from PIL import Image


for source_name in sys.argv[1:]:
    source = Path(source_name)
    target = source.with_suffix(".webp")
    with Image.open(source) as image:
        image.save(target, "WEBP", quality=88, method=4)
    source.unlink()

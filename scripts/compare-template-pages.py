import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def blur(values, radius=5):
    size = radius * 2 + 1
    padded = np.pad(values, radius, mode="reflect")
    integral = np.pad(padded, ((1, 0), (1, 0)), mode="constant").cumsum(0).cumsum(1)
    return (integral[size:, size:] - integral[:-size, size:] - integral[size:, :-size] + integral[:-size, :-size]) / (size * size)


def metrics(reference_path, candidate_path):
    reference_image = Image.open(reference_path).convert("L")
    candidate_image = Image.open(candidate_path).convert("L").resize(reference_image.size)
    reference = np.asarray(reference_image, dtype=np.float64)
    candidate = np.asarray(candidate_image, dtype=np.float64)
    mean_x, mean_y = blur(reference), blur(candidate)
    var_x = np.maximum(0, blur(reference * reference) - mean_x * mean_x)
    var_y = np.maximum(0, blur(candidate * candidate) - mean_y * mean_y)
    covariance = blur(reference * candidate) - mean_x * mean_y
    c1, c2 = (0.01 * 255) ** 2, (0.03 * 255) ** 2
    score = ((2 * mean_x * mean_y + c1) * (2 * covariance + c2)) / ((mean_x ** 2 + mean_y ** 2 + c1) * (var_x + var_y + c2))
    ssim = float(np.mean(score))
    changed = float(np.mean(np.abs(reference - candidate) > 20))
    return {"ssim": ssim, "changedRatio": changed}


reference_dir, candidate_dir = map(Path, sys.argv[1:3])
references = sorted(reference_dir.glob("page-*.png"))
candidates = sorted(candidate_dir.glob("page-*.png"))
if not references or len(references) != len(candidates):
    raise SystemExit("page count mismatch or missing pages")
pages = [metrics(reference, candidate) for reference, candidate in zip(references, candidates)]
result = {
    "pages": pages,
    "minimumSsim": min(page["ssim"] for page in pages),
    "maximumChangedRatio": max(page["changedRatio"] for page in pages),
}
result["approved"] = result["minimumSsim"] >= 0.98 and result["maximumChangedRatio"] <= 0.02
print(json.dumps(result))
raise SystemExit(0 if result["approved"] else 2)

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageEnhance


ROOT = Path(__file__).resolve().parent.parent
STORAGE = ROOT / "var" / "templates"
EVIDENCE = ROOT / "output" / "native-template-qa"
SAMPLE = ROOT / "scripts" / "qa-sample.json"


def run(command, **kwargs):
    return subprocess.run(command, cwd=ROOT, check=True, text=True, capture_output=True, **kwargs)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render(docx, directory):
    if directory.exists():
        shutil.rmtree(directory)
    directory.mkdir(parents=True)
    container_docx = "/workspace/" + str(docx.relative_to(ROOT)).replace("\\", "/")
    container_dir = "/workspace/" + str(directory.relative_to(ROOT)).replace("\\", "/")
    mount = f"{ROOT}:/workspace"
    run(["docker", "run", "--rm", "-v", mount, "--entrypoint", "soffice",
         "resume-editor-mvp-document-worker:latest", "--headless", "--nologo", "--nodefault",
         "--nolockcheck", "--nofirststartwizard", "--convert-to", "pdf", "--outdir", container_dir,
         container_docx], timeout=90)
    pdf = f"{container_dir}/{docx.stem}.pdf"
    run(["docker", "run", "--rm", "-v", mount, "--entrypoint", "pdftoppm",
         "resume-editor-mvp-document-worker:latest", "-png", "-r", "120", pdf,
         f"{container_dir}/page"], timeout=90)
    return sorted(directory.glob("page-*.png"))


def create_diffs(reference_dir, candidate_dir, diff_dir):
    diff_dir.mkdir(parents=True, exist_ok=True)
    for reference, candidate in zip(sorted(reference_dir.glob("page-*.png")), sorted(candidate_dir.glob("page-*.png"))):
        with Image.open(reference).convert("RGB") as left, Image.open(candidate).convert("RGB") as right:
            right = right.resize(left.size)
            diff = ImageEnhance.Contrast(ImageChops.difference(left, right)).enhance(4)
            diff.save(diff_dir / reference.name)


def update_manifest(slug, status, native_path, slots, qa):
    manifest_path = STORAGE / slug / "v1" / "manifest.json"
    item = json.loads(manifest_path.read_text("utf-8"))
    item.update({"status": status, "engine": "docx-native", "selectable": status == "ready",
                 "sourcePath": f"{slug}/v1/{native_path.name}"})
    item["manifest"] = {**item.get("manifest", {}), "nativeSlots": slots, "qa": qa,
                        "renderPipeline": "docx-word-qa-libreoffice-production"}
    manifest_path.write_text(json.dumps(item, ensure_ascii=False, indent=2) + "\n", "utf-8")
    catalog_path = STORAGE / "catalog.json"
    catalog = json.loads(catalog_path.read_text("utf-8"))
    for catalog_item in catalog["templates"]:
        if catalog_item.get("slug") == slug:
            catalog_item.update(item)
            break
    catalog["generatedAt"] = datetime.now(timezone.utc).isoformat()
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", "utf-8")


def process(slug, manual_approved, rejection_note=None):
    version_dir = STORAGE / slug / "v1"
    source = version_dir / "source.docx"
    sanitized = version_dir / "sanitized.docx"
    native = version_dir / "native.docx"
    evidence = EVIDENCE / slug
    evidence.mkdir(parents=True, exist_ok=True)

    run([sys.executable, "-X", "utf8", str(ROOT / "scripts" / "sanitize-docx.py"), str(source), str(sanitized)])
    annotation = json.loads(run([sys.executable, "-X", "utf8", str(ROOT / "scripts" / "annotate-docx-template.py"),
                                 slug, str(sanitized), str(native)]).stdout)
    analysis = json.loads(run([sys.executable, "-X", "utf8", str(ROOT / "scripts" / "analyze-docx.py"), str(native)]).stdout)
    slots = json.loads(run([sys.executable, "-X", "utf8", str(ROOT / "scripts" / "fill-docx-template.py"), "--inspect", str(native)]).stdout)

    if analysis["macroParts"] or analysis["externalRelationships"]:
        qa = {"approved": False, "automaticApproved": False, "manualApproved": False,
              "failure": "unsafe OOXML relationship", "checkedAt": datetime.now(timezone.utc).isoformat()}
        update_manifest(slug, "blocked", native, slots, qa)
        return {"slug": slug, "status": "blocked", "qa": qa}

    reference_pages = render(sanitized, evidence / "reference")
    candidate_pages = render(native, evidence / "candidate")
    compared = subprocess.run([sys.executable, "-X", "utf8", str(ROOT / "scripts" / "compare-template-pages.py"),
                               str(evidence / "reference"), str(evidence / "candidate")],
                              cwd=ROOT, text=True, capture_output=True)
    if compared.returncode not in (0, 2):
        raise RuntimeError(compared.stderr or compared.stdout)
    comparison = json.loads(compared.stdout)
    create_diffs(evidence / "reference", evidence / "candidate", evidence / "diff")

    filled = evidence / "fixed-sample.docx"
    sample = json.loads(SAMPLE.read_text("utf-8"))
    run([sys.executable, "-X", "utf8", str(ROOT / "scripts" / "fill-docx-template.py"), str(native), str(filled)],
        input=json.dumps({"resume": sample["resume"]}, ensure_ascii=False))
    sample_pages = render(filled, evidence / "fixed-sample")

    automatic = bool(slots["hasProfile"] and comparison["approved"] and sample_pages)
    approved = automatic and manual_approved
    qa = {
        "approved": approved,
        "automaticApproved": automatic,
        "manualApproved": bool(manual_approved),
        "minimumSsim": comparison["minimumSsim"],
        "maximumChangedRatio": comparison["maximumChangedRatio"],
        "pageCount": len(candidate_pages),
        "samplePageCount": len(sample_pages),
        "sampleVersion": sample["version"],
        "templateSha256": sha256(native),
        "annotation": annotation,
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "manualChecks": ["crop", "overlap", "alignment", "pagination", "font-substitution", "image-distortion", "decoration-loss"] if manual_approved else []
    }
    if rejection_note:
        qa["manualRejection"] = rejection_note
    status = "ready" if approved else ("needs_qa" if slots["hasProfile"] else "needs_mapping")
    report_path = evidence / "qa-report.json"
    report_path.write_text(json.dumps({"slug": slug, "status": status, "source": str(native.relative_to(ROOT)),
                                       "slots": slots, "qa": qa}, ensure_ascii=False, indent=2) + "\n", "utf-8")
    qa["reportPath"] = str(report_path.relative_to(ROOT)).replace("\\", "/")
    update_manifest(slug, status, native, slots, qa)
    return {"slug": slug, "status": status, "qa": qa}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--slug", action="append")
    parser.add_argument("--approve-manual", action="store_true")
    parser.add_argument("--reject-note")
    args = parser.parse_args()
    slugs = args.slug or [f"resume-collection-cn-{index:03d}" for index in range(1, 11)]
    results = []
    for slug in slugs:
        result = process(slug, args.approve_manual, args.reject_note)
        results.append(result)
        print(json.dumps(result, ensure_ascii=False))
    (EVIDENCE / "summary.json").write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", "utf-8")


if __name__ == "__main__":
    main()

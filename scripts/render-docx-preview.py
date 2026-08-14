import os
import shutil
import subprocess
import sys
import tempfile


def main():
    source = os.path.abspath(sys.argv[1])
    output = os.path.abspath(sys.argv[2])
    soffice = os.environ.get("SOFFICE_BIN", "soffice")
    pdftoppm = os.environ.get("PDFTOPPM_BIN", "pdftoppm")

    os.makedirs(os.path.dirname(output), exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="resume-template-preview-") as workdir:
        profile = os.path.join(workdir, "profile")
        os.makedirs(profile, exist_ok=True)
        subprocess.run([
            soffice,
            "--headless",
            f"-env:UserInstallation=file:///{profile.replace(os.sep, '/')}",
            "--convert-to", "pdf",
            "--outdir", workdir,
            source,
        ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        pdfs = [name for name in os.listdir(workdir) if name.lower().endswith(".pdf")]
        if not pdfs:
            raise RuntimeError("LibreOffice did not create a PDF")
        prefix = os.path.join(workdir, "preview")
        subprocess.run([
            pdftoppm, "-f", "1", "-singlefile", "-png", "-r", "96",
            os.path.join(workdir, pdfs[0]), prefix,
        ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        shutil.copyfile(f"{prefix}.png", output)


if __name__ == "__main__":
    main()

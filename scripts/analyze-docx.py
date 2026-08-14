import hashlib
import json
import sys
import zipfile
import xml.etree.ElementTree as ET


NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
}


def qname(namespace, name):
    return f"{{{NS[namespace]}}}{name}"


def main():
    path = sys.argv[1]
    with open(path, "rb") as stream:
        sha256 = hashlib.sha256(stream.read()).hexdigest()

    with zipfile.ZipFile(path) as package:
        names = package.namelist()
        root = ET.fromstring(package.read("word/document.xml"))
        tags = {}
        for node in root.iter():
            local = node.tag.split("}")[-1]
            tags[local] = tags.get(local, 0) + 1

        section = root.find(".//w:sectPr", NS)
        page_size = section.find("w:pgSz", NS) if section is not None else None
        margins = section.find("w:pgMar", NS) if section is not None else None
        text = "".join(node.text or "" for node in root.findall(".//w:t", NS))
        macro_parts = [name for name in names if "vbaProject" in name or name.endswith(".bin")]
        external_relationships = []
        for name in names:
            if not name.endswith(".rels"):
                continue
            rel_root = ET.fromstring(package.read(name))
            for relationship in rel_root:
                if relationship.attrib.get("TargetMode") == "External":
                    external_relationships.append({
                        "part": name,
                        "target": relationship.attrib.get("Target", ""),
                    })

        result = {
            "sha256": sha256,
            "packageParts": len(names),
            "page": {
                "widthTwips": int(page_size.attrib.get(qname("w", "w"), 0)) if page_size is not None else None,
                "heightTwips": int(page_size.attrib.get(qname("w", "h"), 0)) if page_size is not None else None,
                "marginsTwips": {
                    key: int(margins.attrib.get(qname("w", key), 0))
                    for key in ("top", "right", "bottom", "left")
                } if margins is not None else {},
            },
            "counts": {
                key: tags.get(key, 0)
                for key in ("p", "t", "tbl", "tr", "tc", "drawing", "pict", "txbxContent", "sdt", "sectPr", "anchor", "inline")
            },
            "media": [name for name in names if name.startswith("word/media/") and not name.endswith("/")],
            "macroParts": macro_parts,
            "externalRelationships": external_relationships,
            "sampleText": text[:2000],
            "needsMapping": tags.get("sdt", 0) == 0,
            "layoutRisk": "high" if tags.get("anchor", 0) + tags.get("txbxContent", 0) > 5 else "normal",
        }

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()

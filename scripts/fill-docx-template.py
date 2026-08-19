import base64
import copy
import json
import re
import sys
import zipfile
from html.parser import HTMLParser
from pathlib import Path

from lxml import etree


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
V = "urn:schemas-microsoft-com:vml"
NS = {"w": W, "a": A, "r": R, "v": V}
TAG = f"{{{W}}}tag"
VAL = f"{{{W}}}val"


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ("br", "li") and self.parts:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("p", "li"):
            self.parts.append("\n")

    def handle_data(self, data):
        self.parts.append(data)


def plain_text(value):
    parser = TextExtractor()
    parser.feed(str(value or ""))
    return re.sub(r"\n{3,}", "\n\n", "".join(parser.parts)).strip()


def get_path(value, path):
    current = value
    for key in path.split("."):
        if not isinstance(current, dict):
            return ""
        current = current.get(key)
    return current if current is not None else ""


def section_text(section):
    if section.get("content"):
        return section.get("content")
    values = []
    for item in section.get("items", []):
        if isinstance(item, str):
            values.append(item)
        elif isinstance(item, dict):
            values.append(" · ".join(str(item.get(key, "")) for key in ("name", "level", "date") if item.get(key)))
    return "\n".join(value for value in values if value)


def section_for(resume, section_type):
    sections = resume.get("sections", [])
    return next((item for item in sections if item.get("id") == section_type),
                next((item for item in sections if item.get("type") == section_type), {}))


def slot_value(tag, resume, item=None):
    if tag.startswith("resume:item."):
        return get_path(item or {}, tag.removeprefix("resume:item."))
    if tag.startswith("resume:profile."):
        return get_path(resume.get("profile", {}), tag.removeprefix("resume:profile."))
    if tag == "resume:title":
        return resume.get("title", "")
    match = re.fullmatch(r"resume:section:([a-z]+)\.(title|content|visible)", tag)
    if match:
        section = section_for(resume, match.group(1))
        if match.group(2) == "content":
            return section_text(section)
        if match.group(2) == "visible":
            return "1" if section.get("visible", True) else ""
        return section.get(match.group(2), "")
    return ""


def sdt_tag(sdt):
    node = sdt.find("./w:sdtPr/w:tag", NS)
    return node.get(VAL, "") if node is not None else ""


def replace_text(sdt, value):
    content = sdt.find("./w:sdtContent", NS)
    if content is None:
        return
    texts = content.xpath(".//w:t", namespaces=NS)
    text = plain_text(value)
    if texts:
        texts[0].text = text
        for node in texts[1:]:
            node.text = ""


def reorder_zones(root, resume):
    ordered_ids = [section.get("id") for section in resume.get("sections", []) if section.get("visible", True)]
    order = {section_id: index for index, section_id in enumerate(ordered_ids)}
    for zone in root.xpath('.//w:sdt[starts-with(w:sdtPr/w:tag/@w:val, "resume:zone:")]', namespaces=NS):
        content = zone.find("./w:sdtContent", NS)
        if content is None:
            continue
        blocks = [child for child in content if child.tag == f"{{{W}}}sdt" and sdt_tag(child).startswith("resume:section-block:")]
        if len(blocks) < 2:
            continue
        indexes = [content.index(block) for block in blocks]
        for block in blocks:
            content.remove(block)
        blocks.sort(key=lambda block: order.get(sdt_tag(block).removeprefix("resume:section-block:"), 10_000))
        for index, block in zip(sorted(indexes), blocks):
            content.insert(index, block)


def fill_tree(root, resume, item=None):
    if item is None:
        reorder_zones(root, resume)
    repeats = root.xpath('.//w:sdt[starts-with(w:sdtPr/w:tag/@w:val, "resume:repeat:")]', namespaces=NS)
    for sdt in repeats:
        section_type = sdt_tag(sdt).removeprefix("resume:repeat:")
        section = section_for(resume, section_type)
        items = section.get("items", []) if section.get("visible", True) else []
        content = sdt.find("./w:sdtContent", NS)
        if content is None:
            continue
        prototypes = [copy.deepcopy(child) for child in content]
        for child in list(content):
            content.remove(child)
        for current in items:
            for prototype in prototypes:
                clone = copy.deepcopy(prototype)
                fill_tree(clone, resume, current)
                content.append(clone)

    for sdt in root.xpath(".//w:sdt", namespaces=NS):
        tag = sdt_tag(sdt)
        if tag.startswith("resume:item.") and item is None:
            continue
        if tag.startswith("resume:") and not tag.startswith("resume:repeat:") and tag != "resume:profile.photo":
            replace_text(sdt, slot_value(tag, resume, item))


def apply_typography(root, resume):
    settings = resume.get("settings", {})
    font_size = max(12, min(18, int(settings.get("fontSize", 14))))
    font_name = {
        "source-han-sans": "Source Han Sans SC", "source-han-serif": "Source Han Serif SC",
        "lxgw-wenkai": "LXGW WenKai", "zhuque-fangsong": "Zhuque Fangsong (technical preview)",
        "system": "Source Han Sans SC", "serif": "Source Han Serif SC", "rounded": "Source Han Sans SC",
    }.get(settings.get("fontFamily"), "Source Han Sans SC")
    for run_properties in root.xpath(".//w:rPr", namespaces=NS):
        fonts = run_properties.find("./w:rFonts", NS)
        if fonts is None:
            fonts = etree.SubElement(run_properties, f"{{{W}}}rFonts")
        for key in ("ascii", "hAnsi", "eastAsia"):
            fonts.set(f"{{{W}}}{key}", font_name)
        size = run_properties.find("./w:sz", NS)
        original_size = int(size.get(VAL, "28")) if size is not None else 28
        scaled_size = max(16, round(original_size * font_size / 14))
        if size is None:
            size = etree.SubElement(run_properties, f"{{{W}}}sz")
        size.set(VAL, str(scaled_size))
        complex_size = run_properties.find("./w:szCs", NS)
        if complex_size is None:
            complex_size = etree.SubElement(run_properties, f"{{{W}}}szCs")
        complex_size.set(VAL, str(scaled_size))


def replace_photo(parts, document, resume):
    photo = str(get_path(resume.get("profile", {}), "photo") or "")
    match = re.fullmatch(r"data:image/(png|jpeg);base64,([A-Za-z0-9+/=]+)", photo)
    photo_controls = document.xpath('.//w:sdt[w:sdtPr/w:tag/@w:val="resume:profile.photo"]', namespaces=NS)
    if not match:
        # The image in the versioned template is an editing/placement sample,
        # not user resume data. Leave its layout cell empty when no photo exists.
        for sdt in photo_controls:
            parent = sdt.getparent()
            if parent is not None:
                parent.remove(sdt)
        return
    for sdt in photo_controls:
        image_node = sdt.find(".//a:blip", NS)
        rel_id = image_node.get(f"{{{R}}}embed") if image_node is not None else None
        if image_node is None:
            image_node = sdt.find(".//v:imagedata", NS)
            rel_id = image_node.get(f"{{{R}}}id") if image_node is not None else None
        if image_node is None or not rel_id:
            continue
        rels_name = "word/_rels/document.xml.rels"
        rels = etree.fromstring(parts[rels_name])
        relationship = next((node for node in rels if node.get("Id") == rel_id), None)
        if relationship is None:
            continue
        target = relationship.get("Target", "")
        media_name = str((Path("word") / target).resolve()).replace("\\", "/")
        marker = "/word/"
        media_name = "word/" + media_name.split(marker, 1)[-1] if marker in media_name else f"word/{target}"
        media_name = str(Path(media_name)).replace("\\", "/")
        if media_name in parts:
            parts[media_name] = base64.b64decode(match.group(2))


def fill_docx(source_path, output_path, resume):
    with zipfile.ZipFile(source_path) as package:
        parts = {name: package.read(name) for name in package.namelist()}
    document = etree.fromstring(parts["word/document.xml"])
    fill_tree(document, resume)
    replace_photo(parts, document, resume)
    parts["word/document.xml"] = etree.tostring(document, xml_declaration=True, encoding="UTF-8", standalone=True)
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as package:
        for name, value in parts.items():
            package.writestr(name, value)


def extract_defaults(document):
    profile = {}
    sections = {}
    for node in document.xpath(".//w:sdt", namespaces=NS):
        tag = sdt_tag(node)
        value = "".join(node.xpath("./w:sdtContent//w:t/text()", namespaces=NS)).strip()
        if tag.startswith("resume:profile.") and value:
            profile.setdefault(tag.removeprefix("resume:profile."), value)
        match = re.fullmatch(r"resume:section:([a-z]+)\.(title|content)", tag)
        if match and value:
            sections.setdefault(match.group(1), {}).setdefault(match.group(2), value)
    for node in document.xpath('.//w:sdt[starts-with(w:sdtPr/w:tag/@w:val, "resume:repeat:")]', namespaces=NS):
        section_id = sdt_tag(node).removeprefix("resume:repeat:")
        item = {}
        for field_node in node.xpath('.//w:sdt[starts-with(w:sdtPr/w:tag/@w:val, "resume:item.")]', namespaces=NS):
            field = sdt_tag(field_node).removeprefix("resume:item.")
            value = "".join(field_node.xpath("./w:sdtContent//w:t/text()", namespaces=NS)).strip()
            if value:
                item[field] = value
        if item:
            sections.setdefault(section_id, {})["items"] = [item]
    return {"profile": profile, "sections": sections}


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] in ("--inspect", "--extract-defaults"):
        with zipfile.ZipFile(sys.argv[2]) as package:
            document = etree.fromstring(package.read("word/document.xml"))
        if sys.argv[1] == "--extract-defaults":
            print(json.dumps(extract_defaults(document)))
        else:
            tags = sorted({sdt_tag(node) for node in document.xpath(".//w:sdt", namespaces=NS) if sdt_tag(node).startswith("resume:")})
            print(json.dumps({"tags": tags, "hasProfile": "resume:profile.name" in tags, "repeatSections": [tag.removeprefix("resume:repeat:") for tag in tags if tag.startswith("resume:repeat:")]}))
    else:
        payload = json.load(sys.stdin)
        fill_docx(sys.argv[1], sys.argv[2], payload["resume"])

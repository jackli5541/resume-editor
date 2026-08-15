import copy
import sys
import zipfile
from lxml import etree


REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def owner_part(relationship_part):
    prefix, name = relationship_part.rsplit("/_rels/", 1)
    return f"{prefix}/{name[:-5]}" if name.endswith(".rels") else None


def sanitize(source, output):
    replacements = {}
    with zipfile.ZipFile(source) as package:
        for name in package.namelist():
            if not name.endswith(".rels"):
                continue
            root = etree.fromstring(package.read(name))
            removed = set()
            for relationship in list(root):
                if relationship.attrib.get("TargetMode") == "External":
                    removed.add(relationship.attrib.get("Id"))
                    root.remove(relationship)
            if removed:
                replacements[name] = (etree.tostring(root, encoding="UTF-8", xml_declaration=True, standalone=True)
                                      if len(root) else None)
                owner = owner_part(name)
                if owner:
                    owner_root = etree.fromstring(package.read(owner))
                    for parent in owner_root.iter():
                        for child in list(parent):
                            if child.attrib.get(f"{{{OFFICE_REL_NS}}}id") in removed:
                                parent.remove(child)
                    replacements[owner] = etree.tostring(owner_root, encoding="UTF-8", xml_declaration=True, standalone=True)

        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
            for info in package.infolist():
                value = replacements.get(info.filename, package.read(info.filename))
                if value is not None:
                    target.writestr(copy.copy(info), value)


if __name__ == "__main__":
    sanitize(sys.argv[1], sys.argv[2])

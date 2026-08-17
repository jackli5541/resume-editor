import base64
import json
import re
import sys
import uuid
import zipfile
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from xml.sax.saxutils import escape


TEMPLATE_THEMES = {
    "resume-collection-cn-001": "5A779B",
    "resume-collection-cn-002": "3F6F78",
    "resume-collection-cn-003": "173E5A",
    "resume-collection-cn-004": "EF6464",
    "resume-collection-cn-005": "294D70",
    "resume-collection-cn-006": "438FC9",
    "resume-collection-cn-007": "08A8DE",
    "resume-collection-cn-008": "3498DB",
    "resume-collection-cn-009": "1599C7",
    "resume-collection-cn-010": "009DCC",
}
FONT_NAME = "Microsoft YaHei"
FONT_SCALE = 1.0
FONT_FILES = {
    "source-han-sans": ("Source Han Sans SC", "SourceHanSansSC-Regular.otf"),
    "source-han-serif": ("Source Han Serif SC", "SourceHanSerifSC-Regular.otf"),
    "lxgw-wenkai": ("LXGW WenKai", "LXGWWenKai-Regular.ttf"),
    "zhuque-fangsong": ("Zhuque Fangsong (technical preview)", "ZhuqueFangsong-Regular.ttf"),
    # Backward-compatible values stored by earlier resume versions.
    "system": ("Source Han Sans SC", "SourceHanSansSC-Regular.otf"),
    "serif": ("Source Han Serif SC", "SourceHanSerifSC-Regular.otf"),
    "rounded": ("Source Han Sans SC", "SourceHanSansSC-Regular.otf"),
}
FONT_DIR = Path(__file__).resolve().parents[1] / "public" / "fonts"


def decode_profile_photo(value):
    match = re.fullmatch(r"data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)", str(value or ""))
    if not match:
        return None
    try:
        data = base64.b64decode(match.group(2), validate=True)
    except ValueError:
        return None
    if not data or len(data) > 1_500_000:
        return None
    extension = {"jpeg": "jpg"}.get(match.group(1).lower(), match.group(1).lower())
    return {"data": data, "extension": extension}


def photo_paragraph():
    return (
        '<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:drawing>'
        '<wp:inline distT="0" distB="0" distL="0" distR="0">'
        '<wp:extent cx="1097280" cy="1463040"/><wp:docPr id="1" name="个人照片"/>'
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<pic:pic><pic:nvPicPr><pic:cNvPr id="1" name="个人照片"/><pic:cNvPicPr/></pic:nvPicPr>'
        '<pic:blipFill><a:blip r:embed="rId3"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>'
        '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="1097280" cy="1463040"/></a:xfrm>'
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>'
        '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    )


class RichTextParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.lines = []
        self.current = []
        self.list_depth = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("ul", "ol"):
            self.list_depth += 1
        if tag in ("p", "li") and self.current:
            self.flush(False)

    def handle_endtag(self, tag):
        if tag in ("p", "li"):
            self.flush(tag == "li")
        if tag in ("ul", "ol"):
            self.list_depth = max(0, self.list_depth - 1)

    def handle_data(self, data):
        self.current.append(data)

    def flush(self, bullet):
        text = "".join(self.current).strip()
        if text:
            self.lines.append((text, bullet or self.list_depth > 0))
        self.current = []

    def finish(self):
        self.flush(False)
        return self.lines


def rich_lines(value):
    parser = RichTextParser()
    parser.feed(str(value or ""))
    return parser.finish()


# 字段 Schema 的 Python 侧回退表（老草稿 / 直接调用渲染器时可能没有 section.fields）。
DEFAULT_FIELDS = {
    "objective": [("job", "求职岗位", "text", "meta"), ("city", "意向城市", "text", "meta"),
                  ("salary", "期望薪资", "text", "meta"), ("availability", "到岗时间", "text", "meta")],
    "education": [("start", "开始时间", "month", "range"), ("end", "结束时间", "month", "range"),
                  ("organization", "学校名称", "text", "primary"), ("role", "专业与学历", "text", "secondary"),
                  ("content", "在校经历", "richtext", "body")],
    "experience": [("start", "开始时间", "month", "range"), ("end", "结束时间", "month", "range"),
                   ("organization", "公司名称", "text", "primary"), ("role", "职位名称", "text", "secondary"),
                   ("content", "工作内容", "richtext", "body")],
    "projects": [("start", "开始时间", "month", "range"), ("end", "结束时间", "month", "range"),
                 ("organization", "项目名称", "text", "primary"), ("role", "项目角色", "text", "secondary"),
                 ("content", "项目描述", "richtext", "body")],
    "campus": [("start", "开始时间", "month", "range"), ("end", "结束时间", "month", "range"),
               ("organization", "组织名称", "text", "primary"), ("role", "担任职务", "text", "secondary"),
               ("content", "经历描述", "richtext", "body")],
    "certificates": [("name", "名称", "text", "primary"), ("level", "级别", "text", "secondary"), ("date", "获得时间", "month", "secondary")],
    "awards": [("name", "名称", "text", "primary"), ("level", "级别", "text", "secondary"), ("date", "获得时间", "month", "secondary")],
    "skills": [("content", "技能描述", "richtext", "body")],
    "languages": [("name", "名称", "text", "primary"), ("level", "熟练程度", "text", "secondary")],
    "interests": [("items", "兴趣标签", "text", "meta")],
    "summary": [("content", "自我评价", "richtext", "body")],
}


def _field(key, label, type_, role, builtin=True, visible=True):
    return {"key": key, "label": label, "type": type_, "role": role, "builtin": builtin, "visible": visible}


def default_fields(section):
    rows = DEFAULT_FIELDS.get(section.get("id", ""))
    if rows is None:
        stype = section.get("type")
        if stype in ("education", "experience", "projects", "campus", "timeline"):
            rows = DEFAULT_FIELDS["experience"]
        elif stype == "list":
            rows = DEFAULT_FIELDS["certificates"]
        elif stype == "levels":
            rows = DEFAULT_FIELDS["languages"]
        elif stype == "tags":
            rows = DEFAULT_FIELDS["interests"]
        elif stype == "objective":
            rows = DEFAULT_FIELDS["objective"]
        else:
            rows = DEFAULT_FIELDS["summary"]
    return [_field(key, label, type_, role) for key, label, type_, role in rows]


def resolve_fields(section):
    fields = section.get("fields")
    if isinstance(fields, list) and fields:
        return [f for f in fields if f.get("visible", True)]
    return [f for f in default_fields(section) if f.get("visible", True)]


def role_values(item, fields, role):
    return [str(item.get(f["key"], "") or "").strip() for f in fields if f.get("role") == role]


def meta_paragraph(label, value, field, size=18, after=40, color="64748B"):
    text_value = str(value or "").strip()
    if not text_value:
        return ""
    if field.get("type") == "richtext":
        return "".join(paragraph(text, size=19, after=45, bullet=bullet) for text, bullet in rich_lines(value))
    content = f"{label}：{text_value}" if label else text_value
    return paragraph(content, size=size, color=color, after=after)


def run(text, bold=False, size=21, color="334155"):
    size = max(16, round(size * FONT_SCALE))
    properties = [
        f'<w:rFonts w:ascii="{FONT_NAME}" w:eastAsia="{FONT_NAME}" w:hAnsi="{FONT_NAME}"/>',
        f'<w:color w:val="{color}"/>',
        f'<w:sz w:val="{size}"/><w:szCs w:val="{size}"/>',
    ]
    if bold:
        properties.append("<w:b/><w:bCs/>")
    return f'<w:r><w:rPr>{"".join(properties)}</w:rPr><w:t xml:space="preserve">{escape(str(text or ""))}</w:t></w:r>'


def paragraph(text="", *, bold=False, size=21, color="334155", before=0, after=80,
              keep_next=False, bullet=False, align=None):
    props = [f'<w:spacing w:before="{before}" w:after="{after}" w:line="300" w:lineRule="auto"/>']
    if keep_next:
        props.append("<w:keepNext/>")
    if align:
        props.append(f'<w:jc w:val="{align}"/>')
    if bullet:
        props.append('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')
    return f'<w:p><w:pPr>{"".join(props)}</w:pPr>{run(text, bold, size, color)}</w:p>'


def section_heading(title, theme):
    return (
        '<w:p><w:pPr><w:keepNext/><w:spacing w:before="180" w:after="100"/>'
        f'<w:pBdr><w:bottom w:val="single" w:sz="14" w:space="5" w:color="{theme}"/></w:pBdr>'
        '</w:pPr>'
        + run(title, True, 24, theme)
        + '</w:p>'
    )


def table_cell(content, width, shade=None):
    fill = f'<w:shd w:val="clear" w:color="auto" w:fill="{shade}"/>' if shade else ""
    return (
        f'<w:tc><w:tcPr><w:tcW w:w="{width}" w:type="dxa"/>{fill}'
        '<w:tcMar><w:top w:w="90" w:type="dxa"/><w:left w:w="100" w:type="dxa"/>'
        '<w:bottom w:w="90" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar>'
        f'</w:tcPr>{content}</w:tc>'
    )


def objective_table(data, fields, theme):
    data = data or {}
    cells = []
    for field in fields:
        value = str(data.get(field["key"], "") or "")
        content = paragraph(field["label"], size=18, color="64748B", after=20) + paragraph(value, bold=True, size=20, after=0)
        cells.append(table_cell(content, 2430, "F5F7FA"))
    if not cells:
        return ""
    return (
        '<w:tbl><w:tblPr><w:tblW w:w="9720" w:type="dxa"/><w:tblLayout w:type="fixed"/>'
        '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="40" w:type="dxa"/>'
        '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar>'
        '</w:tblPr><w:tblGrid>' + ''.join('<w:gridCol w:w="2430"/>' for _ in cells) + '</w:tblGrid>'
        '<w:tr>' + ''.join(cells) + '</w:tr></w:tbl>'
    )


def timeline_item(item, fields):
    start = next((f for f in fields if f["key"] == "start"), None)
    end = next((f for f in fields if f["key"] == "end"), None)
    range_fields = [f for f in fields if f.get("role") == "range"]
    if start or end:
        left = str(item.get("start", "") or "").strip() or "—"
        right = str(item.get("end", "") or "").strip() or "至今"
        date_range = f"{left} — {right}"
    else:
        date_range = " — ".join(v for v in [str(item.get(f["key"], "") or "").strip() for f in range_fields] if v)

    primary = " · ".join(v for v in role_values(item, fields, "primary") if v)
    secondary = " · ".join(v for v in role_values(item, fields, "secondary") if v)
    body_fields = [f for f in fields if f.get("role") == "body"]
    meta_fields = [f for f in fields if f.get("role") not in ("range", "primary", "secondary", "body")]

    header = (
        '<w:tbl><w:tblPr><w:tblW w:w="9720" w:type="dxa"/><w:tblLayout w:type="fixed"/>'
        '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>'
        '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr>'
        '<w:tblGrid><w:gridCol w:w="2200"/><w:gridCol w:w="4700"/><w:gridCol w:w="2820"/></w:tblGrid><w:tr>'
        + table_cell(paragraph(date_range, size=19, color="64748B", after=0), 2200)
        + table_cell(paragraph(primary, bold=True, size=21, after=0), 4700)
        + table_cell(paragraph(secondary, bold=True, size=19, color="0F9F76", after=0, align="right"), 2820)
        + '</w:tr></w:tbl>'
    )
    details = "".join(
        paragraph(text, size=19, after=45, bullet=bullet)
        for field in body_fields
        for text, bullet in rich_lines(item.get(field["key"], ""))
    )
    meta = "".join(meta_paragraph(field["label"], item.get(field["key"], ""), field) for field in meta_fields)
    return header + details + meta + paragraph("", after=30)


def compact_item(item, fields):
    if isinstance(item, str):
        return paragraph(item, size=20, after=45, bullet=True)
    primary = " · ".join(v for v in role_values(item, fields, "primary") if v)
    secondary = " · ".join(v for v in role_values(item, fields, "secondary") if v)
    parts = [paragraph(" · ".join(v for v in (primary, secondary) if v), size=20, after=45, bullet=True)]
    for field in fields:
        if field.get("role") in ("primary", "secondary"):
            continue
        meta = meta_paragraph(field["label"], item.get(field["key"], ""), field, size=18, after=45)
        if meta:
            parts.append(meta)
    return "".join(parts)


def render_section(section, theme):
    content = [section_heading(section.get("title", ""), theme)]
    fields = resolve_fields(section)
    stype = section.get("type")
    if stype == "objective":
        content.append(objective_table(section.get("data") or {}, fields, theme))
    elif stype == "tags":
        data_fields = [f for f in fields if f["key"] != "items"]
        content.extend(meta_paragraph(f["label"], (section.get("data") or {}).get(f["key"], ""), f) for f in data_fields)
        content.extend(paragraph(item, size=20, after=45, bullet=True) for item in (section.get("items") or []))
    elif isinstance(section.get("items"), list):
        timeline = stype in ("education", "experience", "projects", "timeline", "campus") or any(f.get("role") == "body" for f in fields)
        content.extend((timeline_item(item, fields) if timeline and isinstance(item, dict) else compact_item(item, fields)) for item in section["items"])
    else:
        content.extend(paragraph(text, size=20, after=60, bullet=bullet) for text, bullet in rich_lines(section.get("content", "")))
        data_fields = [f for f in fields if f["key"] != "content"]
        content.extend(meta_paragraph(f["label"], (section.get("data") or {}).get(f["key"], ""), f) for f in data_fields)
    return "".join(content)


def two_column_table(left_content, right_content, left_width=3300, shade=None):
    right_width = 9720 - left_width
    return (
        '<w:tbl><w:tblPr><w:tblW w:w="9720" w:type="dxa"/><w:tblLayout w:type="fixed"/>'
        '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>'
        '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr>'
        f'<w:tblGrid><w:gridCol w:w="{left_width}"/><w:gridCol w:w="{right_width}"/></w:tblGrid><w:tr>'
        + table_cell(left_content, left_width, shade)
        + table_cell(right_content, right_width)
        + '</w:tr></w:tbl>'
    )


def build_document(payload, has_photo=False):
    global FONT_NAME, FONT_SCALE
    resume = payload["resume"]
    profile = resume.get("profile", {})
    settings = resume.get("settings", {})
    FONT_NAME = FONT_FILES.get(settings.get("fontFamily"), FONT_FILES["source-han-sans"])[0]
    FONT_SCALE = max(12, min(18, int(settings.get("fontSize", 14)))) / 14
    template_slug = str((payload.get("template") or {}).get("slug", "clean-single"))
    theme = TEMPLATE_THEMES.get(template_slug)
    if not theme:
        theme = re.sub(r"[^0-9A-Fa-f]", "", settings.get("theme", "12A77D"))[:6].upper() or "12A77D"
    body = []
    name_block = paragraph(profile.get("name") or "你的姓名", bold=True, size=42, color="172033", after=80, keep_next=True)
    job_block = paragraph(profile.get("job") or "求职岗位", bold=True, size=24, color=theme, after=90, keep_next=True)
    contact = " · ".join(filter(None, [profile.get("mobile"), profile.get("email"), profile.get("city"), profile.get("workYears")]))
    contact_block = paragraph(contact, size=20, color="64748B", after=160)
    banner_slugs = {"resume-collection-cn-001", "resume-collection-cn-006"}
    profile_block = name_block + job_block + contact_block
    if has_photo:
        body.append(
            '<w:tbl><w:tblPr><w:tblW w:w="9720" w:type="dxa"/><w:tblLayout w:type="fixed"/></w:tblPr>'
            '<w:tblGrid><w:gridCol w:w="7900"/><w:gridCol w:w="1820"/></w:tblGrid><w:tr>'
            + table_cell(profile_block, 7900, theme if template_slug in banner_slugs else None)
            + table_cell(photo_paragraph(), 1820, theme if template_slug in banner_slugs else None)
            + '</w:tr></w:tbl>'
        )
    elif template_slug in banner_slugs:
        body.append('<w:tbl><w:tblPr><w:tblW w:w="9720" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="9720"/></w:tblGrid><w:tr>' + table_cell(profile_block, 9720, theme) + '</w:tr></w:tbl>')
    else:
        body.extend([name_block, job_block, contact_block])

    sections = [section for section in resume.get("sections", []) if section.get("visible") is not False]
    sidebar_ids = {
        "resume-collection-cn-004": {"objective", "skills"},
        "resume-collection-cn-005": {"skills", "interests"},
        "resume-collection-cn-007": {"objective", "skills", "interests"},
        "resume-collection-cn-008": {"certificates", "interests"},
    }
    if template_slug in sidebar_ids:
        side = "".join(render_section(section, theme) for section in sections if section.get("id") in sidebar_ids[template_slug])
        main = "".join(render_section(section, theme) for section in sections if section.get("id") not in sidebar_ids[template_slug])
        if template_slug == "resume-collection-cn-007":
            body.append(two_column_table(main, side, 6500, "E9EEF2"))
        else:
            body.append(two_column_table(side, main, 3150, "EAF4F8"))
    elif template_slug in {"resume-collection-cn-009", "resume-collection-cn-010"}:
        left_ids = {"summary", "education", "skills"} if template_slug.endswith("009") else {"summary", "education", "projects"}
        left = "".join(render_section(section, theme) for section in sections if section.get("id") in left_ids)
        right = "".join(render_section(section, theme) for section in sections if section.get("id") not in left_ids)
        body.append(two_column_table(left, right, 4550))
    else:
        body.extend(render_section(section, theme) for section in sections)

    body.append(
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="680" w:right="680" w:bottom="680" w:left="680" w:header="360" w:footer="360" w:gutter="0"/>'
        '<w:cols w:space="720"/><w:docGrid w:linePitch="312"/></w:sectPr>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
        'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
        'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
        'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">'
        '<w:body>' + "".join(body) + '</w:body></w:document>'
    )


def write_docx(payload, output_path):
    photo = decode_profile_photo(payload.get("resume", {}).get("profile", {}).get("photo"))
    font_key = payload.get("resume", {}).get("settings", {}).get("fontFamily", "source-han-sans")
    font_name, font_file_name = FONT_FILES.get(font_key, FONT_FILES["source-han-sans"])
    font_path = FONT_DIR / font_file_name
    font_guid = uuid.uuid4()
    font_bytes = bytearray(font_path.read_bytes())
    obfuscation_key = font_guid.bytes[::-1]
    for index in range(min(32, len(font_bytes))):
        font_bytes[index] ^= obfuscation_key[index % 16]
    font_guid_text = "{" + str(font_guid).upper() + "}"
    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Default Extension="webp" ContentType="image/webp"/>
  <Default Extension="odttf" ContentType="application/vnd.openxmlformats-officedocument.obfuscatedFont"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>'''
    root_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>'''
    document_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>
  {photo_relationship}
</Relationships>'''
    document_rels = document_rels.format(photo_relationship=(
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" '
        f'Target="media/profile.{photo["extension"]}"/>' if photo else ""
    ))
    styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="{font_name}" w:eastAsia="{font_name}" w:hAnsi="{font_name}"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
</w:styles>'''.format(font_name=escape(font_name))
    font_table = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:font w:name="{escape(font_name)}"><w:embedRegular r:id="rId1" w:fontKey="{font_guid_text}"/></w:font>
</w:fonts>'''
    font_table_rels = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="fonts/font1.odttf"/>
</Relationships>'''
    numbering = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="360"/></w:tabs><w:ind w:left="360" w:hanging="180"/></w:pPr></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>'''
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    title = escape(str(payload.get("resume", {}).get("title", "简历")))
    core = f'''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>{title}</dc:title><dc:creator>轻简历</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">{now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">{now}</dcterms:modified></cp:coreProperties>'''
    app = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>轻简历</Application></Properties>'''

    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as package:
        package.writestr("[Content_Types].xml", content_types)
        package.writestr("_rels/.rels", root_rels)
        package.writestr("word/document.xml", build_document(payload, bool(photo)))
        package.writestr("word/_rels/document.xml.rels", document_rels)
        package.writestr("word/styles.xml", styles)
        package.writestr("word/numbering.xml", numbering)
        package.writestr("word/fontTable.xml", font_table)
        package.writestr("word/_rels/fontTable.xml.rels", font_table_rels)
        package.writestr("word/fonts/font1.odttf", font_bytes)
        package.writestr("docProps/core.xml", core)
        package.writestr("docProps/app.xml", app)
        if photo:
            package.writestr(f'word/media/profile.{photo["extension"]}', photo["data"])


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    write_docx(payload, sys.argv[1])

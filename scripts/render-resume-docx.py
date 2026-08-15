import json
import re
import sys
import zipfile
from datetime import datetime, timezone
from html.parser import HTMLParser
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


def objective_table(data, theme):
    values = [
        ("意向岗位", data.get("job", "")),
        ("意向城市", data.get("city", "")),
        ("期望薪资", data.get("salary", "")),
        ("到岗时间", data.get("availability", "")),
    ]
    cells = []
    for label, value in values:
        content = paragraph(label, size=18, color="64748B", after=20) + paragraph(value, bold=True, size=20, after=0)
        cells.append(table_cell(content, 2430, "F5F7FA"))
    return (
        '<w:tbl><w:tblPr><w:tblW w:w="9720" w:type="dxa"/><w:tblLayout w:type="fixed"/>'
        '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="40" w:type="dxa"/>'
        '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar>'
        '</w:tblPr><w:tblGrid>' + ''.join('<w:gridCol w:w="2430"/>' for _ in range(4)) + '</w:tblGrid>'
        '<w:tr>' + ''.join(cells) + '</w:tr></w:tbl>'
    )


def timeline_item(item):
    date_range = " — ".join(value for value in (item.get("start", ""), item.get("end", "")) if value)
    header = (
        '<w:tbl><w:tblPr><w:tblW w:w="9720" w:type="dxa"/><w:tblLayout w:type="fixed"/>'
        '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/>'
        '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr>'
        '<w:tblGrid><w:gridCol w:w="2200"/><w:gridCol w:w="4700"/><w:gridCol w:w="2820"/></w:tblGrid><w:tr>'
        + table_cell(paragraph(date_range, size=19, color="64748B", after=0), 2200)
        + table_cell(paragraph(item.get("organization", ""), bold=True, size=21, after=0), 4700)
        + table_cell(paragraph(item.get("role", ""), bold=True, size=19, color="0F9F76", after=0, align="right"), 2820)
        + '</w:tr></w:tbl>'
    )
    details = "".join(
        paragraph(text, size=19, after=45, bullet=bullet)
        for text, bullet in rich_lines(item.get("content", ""))
    )
    return header + details + paragraph("", after=30)


def compact_item(item):
    if isinstance(item, str):
        return paragraph(item, size=20, after=45, bullet=True)
    primary = item.get("name", "")
    secondary = " · ".join(value for value in (item.get("level", ""), item.get("date", "")) if value)
    return paragraph(" · ".join(value for value in (primary, secondary) if value), size=20, after=45, bullet=True)


def render_section(section, theme):
    content = [section_heading(section.get("title", ""), theme)]
    if section.get("type") == "objective":
        content.append(objective_table(section.get("data") or {}, theme))
    elif isinstance(section.get("items"), list):
        timeline = section.get("type") in ("education", "experience", "projects", "timeline")
        content.extend((timeline_item(item) if timeline and isinstance(item, dict) else compact_item(item)) for item in section["items"])
    else:
        content.extend(paragraph(text, size=20, after=60, bullet=bullet) for text, bullet in rich_lines(section.get("content", "")))
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


def build_document(payload):
    global FONT_NAME, FONT_SCALE
    resume = payload["resume"]
    profile = resume.get("profile", {})
    settings = resume.get("settings", {})
    FONT_NAME = {"system": "Microsoft YaHei", "serif": "SimSun", "rounded": "Microsoft YaHei"}.get(settings.get("fontFamily"), "Microsoft YaHei")
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
    if template_slug in banner_slugs:
        body.append('<w:tbl><w:tblPr><w:tblW w:w="9720" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="9720"/></w:tblGrid><w:tr>' + table_cell(name_block + job_block + contact_block, 9720, theme) + '</w:tr></w:tbl>')
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
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:body>' + "".join(body) + '</w:body></w:document>'
    )


def write_docx(payload, output_path):
    content_types = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
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
</Relationships>'''
    styles = '''<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Microsoft YaHei" w:hAnsi="Arial"/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:rPrDefault></w:docDefaults>
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
</w:styles>'''
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
        package.writestr("word/document.xml", build_document(payload))
        package.writestr("word/_rels/document.xml.rels", document_rels)
        package.writestr("word/styles.xml", styles)
        package.writestr("word/numbering.xml", numbering)
        package.writestr("docProps/core.xml", core)
        package.writestr("docProps/app.xml", app)


if __name__ == "__main__":
    payload = json.load(sys.stdin)
    write_docx(payload, sys.argv[1])

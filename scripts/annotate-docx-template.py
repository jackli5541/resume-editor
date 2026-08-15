import copy
import json
import re
import sys
import zipfile
from io import BytesIO
from pathlib import Path

from lxml import etree
from PIL import Image


W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS = {"w": W}
TAG = f"{{{W}}}tag"
VAL = f"{{{W}}}val"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
V = "urn:schemas-microsoft-com:vml"
NS.update({"a": "http://schemas.openxmlformats.org/drawingml/2006/main", "r": R, "v": V})


def q(name):
    return f"{{{W}}}{name}"


def sdt(tag, children):
    node = etree.Element(q("sdt"))
    properties = etree.SubElement(node, q("sdtPr"))
    if children and children[0].tag == q("r"):
        run_properties = children[0].find("./w:rPr", NS)
        content_properties = copy.deepcopy(run_properties) if run_properties is not None else etree.Element(q("rPr"))
        if content_properties.find("./w:b", NS) is None:
            etree.SubElement(content_properties, q("b")).set(VAL, "0")
        if content_properties.find("./w:bCs", NS) is None:
            etree.SubElement(content_properties, q("bCs")).set(VAL, "0")
        properties.append(content_properties)
    etree.SubElement(properties, q("tag")).set(VAL, tag)
    content = etree.SubElement(node, q("sdtContent"))
    for child in children:
        content.append(child)
    return node


def wrap_text_match(text_node, match, tag):
    run = text_node.getparent()
    if run is None:
        return False
    parent = run.getparent()
    if parent is None or run.tag != q("r") or any(ancestor.tag == q("sdt") for ancestor in run.iterancestors()):
        return False
    value = text_node.text or ""
    before, selected, after = value[:match.start()], value[match.start():match.end()], value[match.end():]
    index = parent.index(run)
    parent.remove(run)
    insertions = []
    for fragment, wrapped in ((before, False), (selected, True), (after, False)):
        if not fragment:
            continue
        clone = copy.deepcopy(run)
        texts = clone.xpath(".//w:t", namespaces=NS)
        if len(texts) != 1:
            return False
        texts[0].text = fragment
        if fragment[:1].isspace() or fragment[-1:].isspace():
            texts[0].set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        insertions.append(sdt(tag, [clone]) if wrapped else clone)
    for offset, node in enumerate(insertions):
        parent.insert(index + offset, node)
    return True


def annotate_pattern(root, tag, pattern, group=1):
    regex = re.compile(pattern, re.I)
    for text_node in root.xpath(".//w:t", namespaces=NS):
        match = regex.search(text_node.text or "")
        if match:
            selected = match.span(group)
            proxy = type("Match", (), {"start": lambda self: selected[0], "end": lambda self: selected[1]})()
            if wrap_text_match(text_node, proxy, tag):
                return True
    return False


def annotate_exact_value(root, tag, expected):
    for text_node in root.xpath(".//w:t", namespaces=NS):
        value = text_node.text or ""
        if expected in value:
            match = re.search(re.escape(expected), value)
            if wrap_text_match(text_node, match, tag):
                return True
    for paragraph in root.xpath(".//w:p", namespaces=NS):
        if paragraph_text(paragraph) != expected or any(ancestor.tag == q("sdt") for ancestor in paragraph.iterancestors()):
            continue
        children = [child for child in list(paragraph) if child.tag != q("pPr")]
        if children:
            for child in children:
                paragraph.remove(child)
            paragraph.append(sdt(tag, children))
            return True
    return False


def annotate_photo(root, parts):
    rels_name = "word/_rels/document.xml.rels"
    if rels_name not in parts:
        return False
    rels = etree.fromstring(parts[rels_name])
    targets = {node.get("Id"): node.get("Target", "") for node in rels if node.get("Id")}
    candidates = []
    for node in root.xpath(".//a:blip|.//v:imagedata", namespaces=NS):
        rel_id = node.get(f"{{{R}}}embed") or node.get(f"{{{R}}}id")
        target = targets.get(rel_id, "")
        media_name = str(Path("word") / target).replace("\\", "/")
        if media_name not in parts:
            continue
        try:
            with Image.open(BytesIO(parts[media_name])) as image:
                width, height = image.size
        except Exception:
            continue
        ratio = width / max(height, 1)
        if width >= 80 and height >= 80 and 0.55 <= ratio <= 1.15:
            moderate = width <= 1200 and height <= 1200
            square_like = 0.78 <= ratio <= 1.15
            candidates.append(((moderate, square_like, width * height), node))
    if not candidates:
        return False
    for _, node in sorted(candidates, key=lambda item: item[0], reverse=True):
        run = next((ancestor for ancestor in node.iterancestors() if ancestor.tag == q("r")), None)
        if run is None or any(ancestor.tag == q("sdt") for ancestor in run.iterancestors()):
            continue
        parent = run.getparent()
        index = parent.index(run)
        parent.remove(run)
        parent.insert(index, sdt("resume:profile.photo", [run]))
        return True
    return False


PROFILE_FALLBACKS = {
    "resume-collection-cn-002": {"ethnicity": "汉", "birthday": "1996.05", "height": "177cm", "politicalStatus": "中共党员", "school": "免费科技大学", "education": "本科"},
    "resume-collection-cn-004": {"birthday": "1993/9/16", "school": "北京师范大学", "education": "本科", "politicalStatus": "党员", "major": "国际贸易"},
    "resume-collection-cn-005": {"age": "24岁", "city": "北京市", "email": "Jianlmoban-ziyuan"},
    "resume-collection-cn-006": {"birthday": "1999.12.12", "gender": "女", "nativePlace": "南京", "city": "北京"},
    "resume-collection-cn-007": {"birthday": "1990/12/8", "school": "中央美院", "education": "本科", "major": "项目经理", "nativePlace": "北京", "city": "北京"},
    "resume-collection-cn-008": {"birthday": "1981.04", "gender": "女", "ethnicity": "汉族", "politicalStatus": "中共党员", "height": "167cm"},
    "resume-collection-cn-010": {"name": "林萧", "school": "广州科技大学", "major": "国际贸易", "politicalStatus": "中共党员", "birthday": "1990/12/12", "email": "jianlimoban-ziyuan.com", "city": "广东广州"}
}


def paragraph_text(paragraph):
    return "".join(paragraph.xpath(".//w:t/text()", namespaces=NS)).strip()


def wrap_repeat(root, section_type, predicate):
    candidates = [p for p in root.xpath(".//w:p", namespaces=NS)
                  if not p.xpath(".//w:drawing|.//w:pict", namespaces=NS) and predicate(paragraph_text(p))]
    if not candidates:
        return False
    paragraph = max(candidates, key=lambda p: len(paragraph_text(p)))
    if any(ancestor.tag == q("sdt") for ancestor in paragraph.iterancestors()):
        return False
    runs = [child for child in list(paragraph) if child.tag != q("pPr")]
    if not runs:
        return False
    for child in runs:
        paragraph.remove(child)
    paragraph.append(sdt("resume:item.content", runs))
    parent = paragraph.getparent()
    index = parent.index(paragraph)
    parent.remove(paragraph)
    parent.insert(index, sdt(f"resume:repeat:{section_type}", [paragraph]))
    return True


SECTION_ANCHORS = {
    "resume-collection-cn-001": {
        "skills": "语言能力：大学英语6级证书", "experience": "拥负责本部的行政人事管理",
        "education": "主修课程：基础会计学", "summary": "工作积极认真，细心负责"
    },
    "resume-collection-cn-002": {
        "education": "管理学、微观经济学、宏观经济学", "summary": "深度互联网从业人员",
        "experience": "负责公司线上端资源的销售工作", "campus": "目标带领自己的团队",
        "certificates": "大学英语四/六级"
    },
    "resume-collection-cn-003": {
        "summary": "本人具有良好的公共关系意识", "experience": "华中师范大学经济管理学院学生会",
        "awards": "广州科技大学校级一等奖奖学金", "skills": "全国计算机等级二级证书",
        "courses": "管理学、行政管理、企业运营管理", "education": "华中师范大学  国际经济与贸易"
    },
    "resume-collection-cn-004": {
        "experience": "根据办公室领导的要求", "education": "主修课程：政治经济学",
        "certificates": "初级会计证", "summary": "我性格开朗、思维活跃"
    },
    "resume-collection-cn-005": {
        "interests": "篮球", "objective": "求职意向：市场专员",
        "education": "基本会计、统计学、市场营销", "experience": "负责社团组织建设",
        "awards": "2009.10获国家奖学金", "summary": "本人是市场营销专业毕业生"
    },
    "resume-collection-cn-006": {
        "summary": "性格阳光，乐于交友", "objective": "求职意向：管理",
        "education": "简历模板资源网学院     财务管理", "experience": "在小组讨论中制定Kellogg",
        "certificates": "英语  ：英语雅思7分", "campus": "在职期间注重培养班级团结意识",
        "interests": "兴趣爱好"
    },
    "resume-collection-cn-007": {
        "skills": "办工软件：", "awards": "大学一直担任班长", "courses": "英文口语、笔译口译",
        "education": "2013.09       上海宝山互联网公司", "experience": "担任职位：总经理",
        "summary": "我正在寻找一个更好的发展平台", "languages": "北京话："
    },
    "resume-collection-cn-008": {
        "summary": "本人接受过全方位的大学基础教育", "experience": "负责出诊及各项医疗器械",
        "objective": "求职目标：护士岗位", "awards": "2013年获得我校心理剧大赛三等奖",
        "courses": "人体解剖学、生理学、医学伦理学", "education": "上海市妇儿医院培训",
        "competencies": "安全意识", "certificates": "护士资格证"
    },
    "resume-collection-cn-009": {
        "summary": "本人是市场营销专业毕业生", "experience": "广州简历模板资源网信息科技",
        "campus": "深圳华为科技", "education": "中国传媒大学熟练操作",
        "awards": "大学一直担任班长"
    },
    "resume-collection-cn-010": {
        "awards": "大学一直担任班长", "experience": "广州蓝丁信息科技",
        "education": "中山大学    熟练操作", "summary": "本人是市场营销专业毕业生"
    }
}

SECTION_TITLES = {
    "resume-collection-cn-001": {"summary": "自我评价", "education": "教育背景", "experience": "工作经验", "skills": "职业技能"},
    "resume-collection-cn-002": {"education": "教育背景", "summary": "自我评价", "experience": "实习经历", "campus": "校园经历", "certificates": "技能证书"},
    "resume-collection-cn-003": {"education": "教育背景", "courses": "主修课程", "skills": "个人能力", "awards": "获奖情况", "experience": "工作经验", "summary": "自我评价"},
    "resume-collection-cn-004": {"experience": "工作经验", "education": "教育背景", "certificates": "荣誉&证书", "summary": "自我评价"},
    "resume-collection-cn-005": {"objective": "求职意向", "education": "教育背景", "experience": "工作经验", "awards": "奖项荣誉", "summary": "自我评价", "interests": "兴趣爱好"},
    "resume-collection-cn-006": {"objective": "求职意向", "education": "教育背景", "experience": "工作经历", "campus": "校园经历", "certificates": "技能证书", "interests": "兴趣爱好"},
    "resume-collection-cn-007": {"summary": "个人简介", "experience": "工作经历", "education": "教育/培训经历", "courses": "主修课程", "awards": "获得荣誉", "skills": "技能", "languages": "语言"},
    "resume-collection-cn-008": {"summary": "个人简介", "experience": "工作实践", "objective": "求职目标", "education": "教育培训", "courses": "主修课程", "awards": "奖项荣誉", "competencies": "我所具备的", "certificates": "我的证书"},
    "resume-collection-cn-009": {"summary": "自我评价", "education": "教育背景", "awards": "获得荣誉"},
    "resume-collection-cn-010": {"summary": "自我评价", "education": "教育背景", "experience": "工作经历", "awards": "获得荣誉"}
}


def annotate_title(root, section_id, title):
    changed = False
    count = 0
    for node in root.xpath(".//w:t", namespaces=NS):
        value = node.text or ""
        compact = re.sub(r"\s+", "", value)
        repeated_title_only = bool(compact) and not compact.replace(title, "")
        if value.strip() != title and not value.strip().startswith(f"{title}：") and not value.strip().startswith(f"{title}:") and not repeated_title_only:
            continue
        match = re.search(re.escape(title), value)
        if match and wrap_text_match(node, match, f"resume:section:{section_id}.title"):
            changed = True
            count += 1
            if count >= 4:
                break
    return changed


def annotate_section(root, section_id, anchor):
    candidates = []
    for paragraph in root.xpath(".//w:p", namespaces=NS):
        value = paragraph_text(paragraph)
        if anchor in value and not any(ancestor.tag == q("sdt") for ancestor in paragraph.iterancestors()):
            # Ignore aggregate paragraphs which include nested text boxes. They are not safe edit boundaries.
            if paragraph.xpath(".//w:p", namespaces=NS):
                continue
            candidates.append(paragraph)
    changed = False
    shortest = sorted(candidates, key=lambda paragraph: len(paragraph_text(paragraph)))[:2]
    for paragraph in shortest:
        children = [child for child in list(paragraph) if child.tag != q("pPr")]
        if not children:
            continue
        for child in children:
            paragraph.remove(child)
        paragraph.append(sdt(f"resume:section:{section_id}.content", children))
        changed = True
    return changed


def annotate(slug, source, output):
    with zipfile.ZipFile(source) as package:
        infos = package.infolist()
        parts = {info.filename: package.read(info.filename) for info in infos}
    root = etree.fromstring(parts["word/document.xml"])
    found = {}
    patterns = [
        ("resume:profile.email", r"([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})", 1),
        ("resume:profile.mobile", r"((?:1[3-9]\d)[ -]?\d{4}[ -]?\d{4})", 1),
        ("resume:profile.name", r"姓\s*名\s*[：:]\s*([^\s|]{2,16})", 1),
        ("resume:profile.job", r"求职(?:意向|目标)\s*[：:]\s*([^|\r\n]{2,30})", 1),
        ("resume:profile.city", r"(?:地址|现居(?:住地)?)\s*[：:]\s*([^|\r\n]{2,30})", 1),
        ("resume:profile.age", r"年\s*龄\s*[：:]\s*([^|\r\n]{1,12})", 1),
        ("resume:profile.birthday", r"(?:出生年月|生\s*日)\s*[：:]\s*([^|\r\n]{2,20})", 1),
        ("resume:profile.gender", r"性\s*别\s*[：:]\s*([^|\r\n]{1,8})", 1),
        ("resume:profile.education", r"学\s*历\s*[：:]\s*([^|\r\n]{1,20})", 1),
        ("resume:profile.politicalStatus", r"政治面貌\s*[：:]\s*([^|\r\n]{1,20})", 1),
        ("resume:profile.school", r"(?:毕业院校|毕业学校)\s*[：:]\s*([^|\r\n]{2,30})", 1),
        ("resume:profile.major", r"专\s*业\s*[：:]\s*([^|\r\n]{2,30})", 1),
        ("resume:profile.nativePlace", r"籍\s*贯\s*[：:]\s*([^|\r\n]{1,20})", 1),
        ("resume:profile.ethnicity", r"民\s*族\s*[：:]\s*([^|\r\n]{1,12})", 1),
        ("resume:profile.height", r"身\s*高\s*[：:]\s*([^|\r\n]{1,12})", 1),
    ]
    for field, expected in PROFILE_FALLBACKS.get(slug, {}).items():
        tag = f"resume:profile.{field}"
        found[tag] = annotate_exact_value(root, tag, expected)
    for tag, pattern, group in patterns:
        if slug == "resume-collection-cn-009" and tag not in ("resume:profile.name", "resume:profile.mobile"):
            found.setdefault(tag, False)
            continue
        if not found.get(tag):
            found[tag] = annotate_pattern(root, tag, pattern, group)
    found["resume:profile.photo"] = annotate_photo(root, parts)

    if not found["resume:profile.name"]:
        # Some designs put the candidate name in a standalone text box without a label.
        fallback = re.compile(r"^(?:林萧|简历模板资源网?|免费简历资源素材|余涵|林宇萧)$")
        for text_node in root.xpath(".//w:t", namespaces=NS):
            value = (text_node.text or "").strip()
            if fallback.match(value):
                match = re.search(re.escape(value), text_node.text or "")
                if wrap_text_match(text_node, match, "resume:profile.name"):
                    found["resume:profile.name"] = True
                    break

    for section_id, title in SECTION_TITLES.get(slug, {}).items():
        tag = f"resume:section:{section_id}.title"
        found[tag] = annotate_title(root, section_id, title)

    found["resume:repeat:education"] = wrap_repeat(
        root, "education", lambda value: len(value) > 20 and "大学" in value and bool(re.search(r"(?:19|20)\d{2}", value))
    )
    found["resume:repeat:experience"] = wrap_repeat(
        root, "experience", lambda value: len(value) > 35 and bool(re.search(r"(?:19|20)\d{2}", value)) and any(k in value for k in ("公司", "工作", "实习", "项目"))
    )

    rules = SECTION_ANCHORS.get(slug)
    if rules is None:
        raise ValueError(f"No section annotation rules for {slug}")
    for section_id, anchor in rules.items():
        tag = f"resume:section:{section_id}.content"
        found[tag] = annotate_section(root, section_id, anchor)

    parts["word/document.xml"] = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
        for info in infos:
            target.writestr(copy.copy(info), parts[info.filename])
    return found


if __name__ == "__main__":
    result = annotate(sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]))
    print(json.dumps(result, ensure_ascii=False))

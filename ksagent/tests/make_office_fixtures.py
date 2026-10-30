#!/usr/bin/env python3
"""Writes the Office files and DEFLATE cases that ksagent's tests read (`ksagent/tests/office_test.kspl`).

The Word file comes from python-docx and the Excel file from openpyxl, so both look like what other
programs write. Neither library writes everything a company's file holds, so this script adds the
rest to the XML by hand, each piece named where it is added:

* Word: list numbering of its own (第1条, （１）, ①), tracked changes, a text box, a footnote.
* Excel: shared strings (openpyxl writes every string inline), the cached value of a formula,
  and furigana on a shared string.

The DEFLATE cases come from Python's own `zlib`, at every strategy it offers, so ksagent's decoder
is checked against zlib byte for byte. The files are committed, so the tests need no Python. Run
this again only when a case changes:

  python3 -m venv .venv && . .venv/bin/activate && pip install python-docx openpyxl
  python3 ksagent/tests/make_office_fixtures.py --out-dir ksagent/tests/office_data

Run with no argument, it self-tests the parts that need the standard library alone: the DEFLATE
cases' file layout and the rewriting of a zip.

The DEFLATE file is `deflate_cases.bin`: the 4 bytes `KSDF` and a little-endian U32 count. Each
case follows as a U32 name length, a U32 plain length and a U32 packed length, then the name, the
SHA-256 of the plain bytes (32 bytes) and the packed bytes. The packed bytes are raw DEFLATE, with
no zlib header. The plain bytes are left out to keep the file small; their digest names them.
"""
import argparse
import hashlib
import html
import io
import os
import random
import re
import struct
import sys
import zipfile
import zlib
from xml.sax import saxutils

FIXED_TIME = (2026, 4, 1, 9, 0, 0)  # every zip entry's time, so a run writes the same bytes
SEED = 20261028

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


# ---------------------------------------------------------------------------------------------
# DEFLATE cases
# ---------------------------------------------------------------------------------------------

def deflate_raw(data, level=6, strategy=zlib.Z_DEFAULT_STRATEGY, mem_level=8):
    """Raw DEFLATE, with no zlib header or trailer."""
    c = zlib.compressobj(level, zlib.DEFLATED, -15, mem_level, strategy)
    return c.compress(data) + c.flush()


def deflate_cases():
    """The cases: each block type, long matches, far distances, and the empty input."""
    rng = random.Random(SEED)
    text = ("第3条 年次有給休暇は、入社6か月後に10日を付与する。"
            "Overtime work requires prior approval. ").encode("utf-8")
    noise = bytes(rng.getrandbits(8) for _ in range(20000))
    window = bytes(rng.getrandbits(8) for _ in range(32768))
    mixed = b"".join(text[: rng.randint(1, len(text))] + bytes([rng.getrandbits(8)])
                     for _ in range(800))
    return [
        ("empty", b"", deflate_raw(b"")),
        ("empty_stored", b"", deflate_raw(b"", level=0)),
        ("short_fixed", b"hello, hello, hello", deflate_raw(b"hello, hello, hello",
                                                            strategy=zlib.Z_FIXED)),
        ("text_fixed", text * 40, deflate_raw(text * 40, strategy=zlib.Z_FIXED)),
        ("text_dynamic", text * 200, deflate_raw(text * 200, level=9)),
        ("noise", noise, deflate_raw(noise)),
        ("stored_blocks", text * 700, deflate_raw(text * 700, level=0)),
        ("long_run", b"a" * 100000, deflate_raw(b"a" * 100000, level=9)),
        ("far_distance", window + window, deflate_raw(window + window, level=9)),
        ("huffman_only", mixed, deflate_raw(mixed, strategy=zlib.Z_HUFFMAN_ONLY)),
        ("rle", mixed, deflate_raw(mixed, strategy=zlib.Z_RLE)),
        ("mixed_small_window", mixed, deflate_raw(mixed, level=1, mem_level=1)),
        ("one_byte", b"\x00", deflate_raw(b"\x00")),
    ]


def pack_cases(cases):
    """The cases in the layout the module docstring gives."""
    out = [b"KSDF", struct.pack("<I", len(cases))]
    for name, plain, packed in cases:
        raw_name = name.encode("ascii")
        out.append(struct.pack("<III", len(raw_name), len(plain), len(packed)))
        out += [raw_name, hashlib.sha256(plain).digest(), packed]
    return b"".join(out)


def unpack_cases(blob):
    """The reverse of `pack_cases`, for the self-test."""
    assert blob[:4] == b"KSDF"
    (count,) = struct.unpack_from("<I", blob, 4)
    at, cases = 8, []
    for _ in range(count):
        n, p, k = struct.unpack_from("<III", blob, at)
        at += 12
        name = blob[at:at + n].decode("ascii")
        at += n
        digest = blob[at:at + 32]
        at += 32
        packed = blob[at:at + k]
        at += k
        cases.append((name, p, digest, packed))
    assert at == len(blob)
    return cases


# ---------------------------------------------------------------------------------------------
# Rewriting a zip: the parts the libraries cannot write are added to their XML here
# ---------------------------------------------------------------------------------------------

def rewrite_zip(blob, edits):
    """The zip with `edits` applied: a map of part name to a function of its text, or to bytes.

    Each entry keeps its order and is packed again with DEFLATE at the fixed time. A part named in
    `edits` that the zip lacks is added at the end.
    """
    src = zipfile.ZipFile(io.BytesIO(blob))
    out = io.BytesIO()
    done = set()
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as dst:
        for info in src.infolist():
            data = src.read(info.filename)
            edit = edits.get(info.filename)
            if callable(edit):
                data = edit(data.decode("utf-8")).encode("utf-8")
            elif edit is not None:
                data = edit
            done.add(info.filename)
            dst.writestr(zipfile.ZipInfo(info.filename, FIXED_TIME), data,
                         zipfile.ZIP_DEFLATED)
        for name, edit in edits.items():
            if name not in done:
                dst.writestr(zipfile.ZipInfo(name, FIXED_TIME), edit, zipfile.ZIP_DEFLATED)
    return out.getvalue()


def replace_once(text, old, new):
    """`text` with the one `old` it holds made `new`; anything else is a mistake in this script."""
    assert text.count(old) == 1, old
    return text.replace(old, new)


# ---------------------------------------------------------------------------------------------
# The Word file
# ---------------------------------------------------------------------------------------------

# Two lists of their own: chapters (第1章) and articles (第1条, with （１） and ① below them).
# The articles do not restart at a new chapter, as in a real regulation.
NUMBERING = f"""
<w:abstractNum xmlns:w="{W_NS}" w:abstractNumId="90">
  <w:multiLevelType w:val="singleLevel"/>
  <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/>
    <w:lvlText w:val="第%1章"/><w:suff w:val="space"/></w:lvl>
</w:abstractNum>
<w:abstractNum xmlns:w="{W_NS}" w:abstractNumId="91">
  <w:multiLevelType w:val="multilevel"/>
  <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/>
    <w:lvlText w:val="第%1条"/></w:lvl>
  <w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimalFullWidth"/>
    <w:lvlText w:val="（%2）"/></w:lvl>
  <w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="decimalEnclosedCircle"/>
    <w:lvlText w:val="%3"/></w:lvl>
</w:abstractNum>
<w:num xmlns:w="{W_NS}" w:numId="90"><w:abstractNumId w:val="90"/></w:num>
<w:num xmlns:w="{W_NS}" w:numId="91"><w:abstractNumId w:val="91"/></w:num>
"""

# A text box as Word writes it: the shape in mc:Choice, and the same text again in mc:Fallback for
# older readers. A reader that takes both shows the text twice.
TEXT_BOX = """<w:r><mc:AlternateContent
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
 xmlns:v="urn:schemas-microsoft-com:vml"><mc:Choice Requires="wps"><w:drawing><wp:anchor
 distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="1" behindDoc="0" locked="0"
 layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH
 relativeFrom="column"><wp:posOffset>0</wp:posOffset></wp:positionH><wp:positionV
 relativeFrom="paragraph"><wp:posOffset>0</wp:posOffset></wp:positionV><wp:extent cx="2000000"
 cy="500000"/><wp:wrapSquare wrapText="bothSides"/><wp:docPr id="10" name="Text Box 10"/><a:graphic>
<a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp>
<wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2000000" cy="500000"/>
</a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></wps:spPr><wps:txbx><w:txbxContent>
<w:p><w:r><w:t>相談窓口：人事部（内線1234）</w:t></w:r></w:p></w:txbxContent></wps:txbx>
<wps:bodyPr/></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></mc:Choice>
<mc:Fallback><w:pict><v:shape style="width:157pt;height:39pt"><v:textbox><w:txbxContent><w:p><w:r>
<w:t>相談窓口：人事部（内線1234）</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict>
</mc:Fallback></mc:AlternateContent></w:r>"""

FOOTNOTES = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:footnotes xmlns:w="{W_NS}">
<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>
<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r>
</w:p></w:footnote>
<w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r><w:r><w:t xml:space="preserve"> 出勤率は、\
全労働日に対する出勤日の割合をいう。</w:t></w:r></w:p></w:footnote>
</w:footnotes>"""


def number(paragraph, num_id, level):
    """Gives the paragraph list numbering: the list `num_id`, at `level` from 0."""
    from docx.oxml import parse_xml
    ppr = paragraph._p.get_or_add_pPr()
    ppr.append(parse_xml(f'<w:numPr xmlns:w="{W_NS}"><w:ilvl w:val="{level}"/>'
                         f'<w:numId w:val="{num_id}"/></w:numPr>'))


def make_docx():
    """The Word file, as python-docx writes it, before the hand-made parts are added."""
    import docx
    from docx.oxml import parse_xml

    d = docx.Document()
    d.core_properties.author = "ksagent tests"
    d.sections[0].header.paragraphs[0].text = "社外秘（ヘッダー）"
    numbering = d.part.numbering_part.element
    first_num = numbering.find(f"{{{W_NS}}}num")
    for el in parse_xml(f'<w:x xmlns:w="{W_NS}">{NUMBERING}</w:x>'):
        if el.tag.endswith("abstractNum"):
            first_num.addprevious(el)
        else:
            numbering.append(el)

    d.add_heading("就業規則", level=1)
    number(d.add_heading("総則", level=2), 90, 0)
    number(d.add_paragraph("この規則は、従業員の労働条件を定める。"), 91, 0)
    p = d.add_paragraph("Overtime work requires prior approval by the manager.")
    d.add_comment(p.runs, text="要確認：この文はコメントに入っている", author="reviewer")
    number(d.add_heading("休暇", level=2), 90, 0)
    number(d.add_paragraph("年次有給休暇は、次のとおり付与する。"), 91, 0)
    number(d.add_paragraph("入社6か月後に10日を付与する"), 91, 1)
    item = d.add_paragraph("以後1年ごとに1日を加算する")
    number(item, 91, 1)
    item.add_run("FOOTNOTE_HERE")
    number(d.add_paragraph("出勤率が8割以上であること"), 91, 2)
    number(d.add_paragraph("TRACKED_HERE"), 91, 0)
    d.add_paragraph("休暇の申請は、所属長へ行う。", style="List Bullet")

    table = d.add_table(rows=4, cols=3)
    rows = [("勤続年数", "付与日数", "備考"), ("6か月", "10日", "最大20日まで"),
            ("1年6か月", "11日", ""), ("※ 出勤率8割以上が条件", "", "")]
    for r, values in enumerate(rows):
        for c, value in enumerate(values):
            table.cell(r, c).text = value
    table.cell(1, 2).merge(table.cell(3, 2))  # a vertical merge, as Word writes it
    table.cell(3, 0).merge(table.cell(3, 1))  # a horizontal merge
    table.cell(1, 2).text = "最大20日まで"
    d.add_paragraph("TEXTBOX_HERE")
    d.add_paragraph("附則　この規則は、2024年4月1日から施行する。")

    out = io.BytesIO()
    d.save(out)
    return out.getvalue()


def finish_docx(blob):
    """Adds what python-docx cannot write: tracked changes, a text box and a footnote."""
    def document(text):
        text = replace_once(text, "<w:r><w:t>TRACKED_HERE</w:t></w:r>",
                            '<w:r><w:t xml:space="preserve">特別休暇は、</w:t></w:r>'
                            '<w:del w:id="801" w:author="hr" w:date="2026-04-01T09:00:00Z">'
                            '<w:r><w:delText>3日</w:delText></w:r></w:del>'
                            '<w:ins w:id="802" w:author="hr" w:date="2026-04-01T09:00:00Z">'
                            '<w:r><w:t>5日</w:t></w:r></w:ins>'
                            '<w:r><w:t>とする。</w:t></w:r>')
        text = replace_once(text, "<w:r><w:t>FOOTNOTE_HERE</w:t></w:r>",
                            '<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr>'
                            '<w:footnoteReference w:id="1"/></w:r>')
        return replace_once(text, "<w:r><w:t>TEXTBOX_HERE</w:t></w:r>",
                            '<w:r><w:t>相談は次の窓口へ。</w:t></w:r>' + TEXT_BOX)

    def rels(text):
        return replace_once(text, "</Relationships>",
                            '<Relationship Id="rId900" Type="http://schemas.openxmlformats.org/'
                            'officeDocument/2006/relationships/footnotes" '
                            'Target="footnotes.xml"/></Relationships>')

    def types(text):
        return replace_once(text, "</Types>",
                            '<Override PartName="/word/footnotes.xml" ContentType="application/'
                            'vnd.openxmlformats-officedocument.wordprocessingml.footnotes+xml"/>'
                            "</Types>")

    return rewrite_zip(blob, {"word/document.xml": document, "word/_rels/document.xml.rels": rels,
                              "[Content_Types].xml": types,
                              "word/footnotes.xml": FOOTNOTES.encode("utf-8")})


# ---------------------------------------------------------------------------------------------
# The Excel file
# ---------------------------------------------------------------------------------------------

def make_xlsx():
    """The Excel file, as openpyxl writes it, before the hand-made parts are added."""
    import datetime
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "規程一覧"
    ws.append(["項目", "内容", "施行日", "日数"])
    ws.append(["有給休暇", "入社6か月後に付与", datetime.date(2024, 4, 1), 10])
    ws.append(["特別休暇", "慶弔時", datetime.date(2025, 10, 1), 5])
    ws.append(["休職", "私傷病", None, 90])
    ws.append([None, "家族の介護", None, 93])
    ws.merge_cells("A4:A5")
    ws.append(["合計", None, None, "=SUM(D2:D5)"])
    ws.append(["割増賃金率", 0.25])
    ws["B7"].number_format = "0%"
    ws.append([])
    ws.append(["始業時刻", datetime.time(9, 0), True, 1234.5])
    ws["B9"].number_format = "h:mm"
    ws.append(["INLINE_HERE"])
    ws.append(["社内規程"])  # given furigana below
    for cell in ("C2", "C3"):
        ws[cell].number_format = 'yyyy"年"m"月"d"日"'

    old = wb.create_sheet("旧規程")
    old.append(["旧：有給休暇", "15日"])
    old.sheet_state = "hidden"

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


INLINE_CELL = re.compile(r'<c r="([A-Z]+[0-9]+)"([^>]*) t="inlineStr"><is><t(?: [^>]*)?>(.*?)</t></is></c>')
SST_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"


def to_shared(text, table):
    """The sheet with each inline string made a shared string, as Excel writes them.

    openpyxl writes every string inline, and each character past ASCII as a numeric reference.
    Excel writes each string into `xl/sharedStrings.xml` once, as UTF-8, and refers to it by its
    index. `table` collects the strings, in order.
    """
    def one(m):
        value = html.unescape(m.group(3))
        if value not in table:
            table.append(value)
        return f'<c r="{m.group(1)}"{m.group(2)} t="s"><v>{table.index(value)}</v></c>'
    return INLINE_CELL.sub(one, text)


def finish_xlsx(blob):
    """Adds what openpyxl cannot write: shared strings, a formula's cached value, furigana.

    One cell stays an inline string, so both kinds are read.
    """
    src = zipfile.ZipFile(io.BytesIO(blob))
    table = []
    sheet1 = src.read("xl/worksheets/sheet1.xml").decode("utf-8")
    sheet1 = replace_once(sheet1, "<f>SUM(D2:D5)</f><v></v>", "<f>SUM(D2:D5)</f><v>198</v>")
    sheet1 = replace_once(sheet1, "<t>INLINE_HERE</t>", "<t>インライン文字列</t>")
    sheet1 = sheet1.replace('t="inlineStr"><is><t>インライン', 't="keep"><is><t>インライン')
    sheet1 = to_shared(sheet1, table).replace('t="keep"', 't="inlineStr"')
    sheet2 = to_shared(src.read("xl/worksheets/sheet2.xml").decode("utf-8"), table)
    items = []
    for s in table:
        furigana = ('<rPh sb="0" eb="2"><t>シャナイ</t></rPh><rPh sb="2" eb="4"><t>キテイ</t></rPh>'
                    '<phoneticPr fontId="1"/>' if s == "社内規程" else "")
        items.append(f"<si><t>{saxutils.escape(s)}</t>{furigana}</si>")
    shared = (f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<sst xmlns="{SST_NS}" '
              f'count="{len(table)}" uniqueCount="{len(table)}">{"".join(items)}</sst>')

    def rels(text):
        return replace_once(text, "</Relationships>",
                            f'<Relationship Id="rId900" Type="{REL_NS}/sharedStrings" '
                            'Target="sharedStrings.xml"/></Relationships>')

    def types(text):
        return replace_once(text, "</Types>",
                            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/'
                            'vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
                            "</Types>")

    return rewrite_zip(blob, {"xl/worksheets/sheet1.xml": sheet1.encode("utf-8"),
                              "xl/worksheets/sheet2.xml": sheet2.encode("utf-8"),
                              "xl/_rels/workbook.xml.rels": rels, "[Content_Types].xml": types,
                              "xl/sharedStrings.xml": shared.encode("utf-8")})


# ---------------------------------------------------------------------------------------------

def write_all(out_dir):
    """Writes every fixture into `out_dir`."""
    os.makedirs(out_dir, exist_ok=True)
    files = {"rules.docx": finish_docx(make_docx()), "leave.xlsx": finish_xlsx(make_xlsx()),
             "deflate_cases.bin": pack_cases(deflate_cases())}
    for name, blob in files.items():
        with open(os.path.join(out_dir, name), "wb") as f:
            f.write(blob)
        print(f"wrote {os.path.join(out_dir, name)} ({len(blob)} bytes)")


def self_test():
    """Checks the case layout and the zip rewriting, with the standard library alone."""
    cases = deflate_cases()
    for name, size, digest, packed in unpack_cases(pack_cases(cases)):
        plain = zlib.decompress(packed, -15)
        assert len(plain) == size and hashlib.sha256(plain).digest() == digest, name
    blob = io.BytesIO()
    with zipfile.ZipFile(blob, "w") as z:
        z.writestr("a.xml", "<a>OLD</a>")
    again = rewrite_zip(blob.getvalue(), {"a.xml": lambda t: replace_once(t, "OLD", "NEW"),
                                          "b.bin": b"\x01"})
    z = zipfile.ZipFile(io.BytesIO(again))
    assert z.read("a.xml") == b"<a>NEW</a>" and z.read("b.bin") == b"\x01"
    assert z.getinfo("a.xml").date_time == FIXED_TIME
    print(f"[self-test] {len(cases)} DEFLATE cases unpack as packed, and a zip is rewritten.")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--out-dir", help="where to write the fixtures; none runs the self-test")
    args = parser.parse_args()
    if args.out_dir is None:
        self_test()
        return 0
    write_all(args.out_dir)
    return 0


if __name__ == "__main__":
    sys.exit(main())

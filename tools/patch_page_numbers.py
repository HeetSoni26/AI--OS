from __future__ import annotations

import re
import shutil
import tempfile
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

DOCX = Path(r"C:\Users\Heet\OneDrive\Desktop\AI OS\AI_OS_Complete_Roadmap_and_12_Build_Prompts.docx")
W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PR = "http://schemas.openxmlformats.org/package/2006/relationships"


def patch_footer(xml: str, number_format: str) -> str:
    replacement = f" PAGE \\* {number_format} \\* MERGEFORMAT "
    return re.sub(
        r"(<w:instrText[^>]*>)\s*PAGE(?:\s+\\\*\s+\w+)?(?:\s+\\\*\s+MERGEFORMAT)?\s*(</w:instrText>)",
        lambda match: match.group(1) + replacement + match.group(2),
        xml,
        flags=re.IGNORECASE,
    )


def main() -> None:
    with zipfile.ZipFile(DOCX, "r") as archive:
        files = {name: archive.read(name) for name in archive.namelist()}

    document_xml = files["word/document.xml"].decode("utf-8")
    document_xml = re.sub(r"<w:pgNumType\s*/>", "", document_xml)
    files["word/document.xml"] = document_xml.encode("utf-8")

    root = ET.fromstring(document_xml)
    rel_root = ET.fromstring(files["word/_rels/document.xml.rels"])
    relationships = {
        rel.get("Id"): rel.get("Target")
        for rel in rel_root.findall(f"{{{PR}}}Relationship")
    }
    sections = root.findall(f".//{{{W}}}sectPr")
    if len(sections) < 3:
        raise RuntimeError(f"Expected at least three sections, found {len(sections)}")

    patched: list[tuple[str, str]] = []
    for section_index, number_format in ((1, "ROMAN"), (2, "arabic")):
        reference = sections[section_index].find(f"{{{W}}}footerReference")
        if reference is None:
            raise RuntimeError(f"Section {section_index + 1} has no footer reference")
        relationship_id = reference.get(f"{{{R}}}id")
        target = relationships.get(relationship_id)
        if not target:
            raise RuntimeError(f"Footer relationship {relationship_id} was not found")
        footer_path = "word/" + target.replace("\\", "/").lstrip("/")
        original = files[footer_path].decode("utf-8")
        updated = patch_footer(original, number_format)
        if updated == original:
            raise RuntimeError(f"No PAGE field patched in {footer_path}")
        files[footer_path] = updated.encode("utf-8")
        patched.append((footer_path, number_format))

    with tempfile.NamedTemporaryFile(delete=False, suffix=".docx") as temp_file:
        temp_path = Path(temp_file.name)
    try:
        with zipfile.ZipFile(temp_path, "w", zipfile.ZIP_DEFLATED) as archive:
            for name, data in files.items():
                archive.writestr(name, data)
        shutil.move(str(temp_path), DOCX)
    finally:
        temp_path.unlink(missing_ok=True)

    print("Removed empty cover page-number elements")
    for footer_path, number_format in patched:
        print(f"Patched {footer_path} with PAGE format {number_format}")


if __name__ == "__main__":
    main()

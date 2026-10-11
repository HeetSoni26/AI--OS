from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "packages/data/prisma/schema.prisma"
OUTPUT = ROOT / "docs/architecture/data-dictionary.md"

MODEL = re.compile(r"^model\s+(\w+)\s*\{\s*$")
ENUM = re.compile(r"^enum\s+(\w+)\s*\{\s*$")
FIELD = re.compile(r"^\s{2}(\w+)\s+([^\s]+)(?:\s+(.*))?$")


def parse_blocks(text: str, kind: str) -> list[tuple[str, list[str]]]:
    pattern = MODEL if kind == "model" else ENUM
    lines = text.splitlines()
    result: list[tuple[str, list[str]]] = []
    index = 0
    while index < len(lines):
        match = pattern.match(lines[index])
        if not match:
            index += 1
            continue
        name = match.group(1)
        body: list[str] = []
        index += 1
        while index < len(lines) and lines[index].strip() != "}":
            body.append(lines[index])
            index += 1
        result.append((name, body))
        index += 1
    return result


def main() -> None:
    text = SCHEMA.read_text(encoding="utf-8")
    models = parse_blocks(text, "model")
    enums = parse_blocks(text, "enum")
    out = [
        "# AI OS Data Dictionary",
        "",
        "Generated from `packages/data/prisma/schema.prisma`. The Prisma schema and migration SQL remain authoritative; regenerate this document after schema changes.",
        "",
        f"**Inventory:** {len(models)} models, {len(enums)} enums.",
        "",
        "## Models",
        "",
    ]
    for name, body in models:
        out.extend([f"### {name}", "", "| Field | Type | Constraints / mapping |", "|---|---|---|"])
        for line in body:
            if line.strip().startswith("@@") or line.strip().startswith("//") or not line.strip():
                continue
            match = FIELD.match(line)
            if match:
                constraints = (match.group(3) or "").replace("|", "\\|")
                out.append(f"| `{match.group(1)}` | `{match.group(2)}` | `{constraints}` |")
        block_constraints = [line.strip() for line in body if line.strip().startswith("@@")]
        if block_constraints:
            out.extend(["", "**Model constraints/indexes:**", ""] + [f"- `{item}`" for item in block_constraints])
        out.append("")
    out.extend(["## Enums", ""])
    for name, body in enums:
        values = [line.strip() for line in body if line.strip() and not line.strip().startswith("//")]
        out.extend([f"### {name}", "", ", ".join(f"`{value}`" for value in values), ""])
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text("\n".join(out), encoding="utf-8")
    print(f"Wrote {OUTPUT} ({len(models)} models, {len(enums)} enums)")


if __name__ == "__main__":
    main()

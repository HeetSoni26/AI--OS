import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  NumberFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from "file:///C:/Users/Heet/OneDrive/Desktop/AI%20OS/tools/.docx-build/node_modules/docx/dist/index.mjs";

const ROOT = "C:\\Users\\Heet\\OneDrive\\Desktop\\AI OS";
const OUTPUT = path.join(ROOT, "AI_OS_Complete_Roadmap_and_12_Build_Prompts.docx");
const PAGE = { width: 11906, height: 16838 };
const BODY_MARGIN = { top: 1440, bottom: 1440, left: 1701, right: 1417 };
const COLORS = {
  background: "162235",
  primary: "122033",
  accent: "1B6B7A",
  accentBright: "37DCF2",
  surface: "EDF3F5",
  body: "000000",
  secondary: "5B6573",
  border: "C8DDE2",
  white: "FFFFFF",
};
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = {
  top: NB,
  bottom: NB,
  left: NB,
  right: NB,
  insideHorizontal: NB,
  insideVertical: NB,
};
const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 2, color: COLORS.accent },
  bottom: { style: BorderStyle.SINGLE, size: 2, color: COLORS.accent },
  left: { style: BorderStyle.NONE },
  right: { style: BorderStyle.NONE },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border },
};

let listCounter = 0;
const numberingConfig = [];

function addNumberingReference() {
  const reference = `numbered-list-${++listCounter}`;
  numberingConfig.push({
    reference,
    levels: [
      {
        level: 0,
        format: LevelFormat.DECIMAL,
        text: "%1.",
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      },
    ],
  });
  return reference;
}

function cleanInline(text) {
  return text
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\\\|/g, "|")
    .replace(/<br\s*\/?>/gi, " ")
    .trim();
}

function inlineRuns(text, options = {}) {
  const source = cleanInline(text);
  const runs = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    if (match.index > cursor) {
      runs.push(new TextRun({ text: source.slice(cursor, match.index), ...options }));
    }
    const token = match[0];
    if (token.startsWith("**")) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true, ...options }));
    } else {
      runs.push(
        new TextRun({
          text: token.slice(1, -1),
          font: { ascii: "Courier New", eastAsia: "Microsoft YaHei" },
          color: COLORS.accent,
          ...options,
        }),
      );
    }
    cursor = match.index + token.length;
  }
  if (cursor < source.length) {
    runs.push(new TextRun({ text: source.slice(cursor), ...options }));
  }
  return runs.length ? runs : [new TextRun({ text: source, ...options })];
}

function bodyParagraph(text, options = {}) {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 312, after: 120 },
    ...options,
    children: inlineRuns(text, { size: 24, color: COLORS.body }),
  });
}

function heading(text, level) {
  return new Paragraph({
    heading: level,
    outlineLevel:
      level === HeadingLevel.HEADING_1 ? 0 : level === HeadingLevel.HEADING_2 ? 1 : 2,
    spacing: {
      before: level === HeadingLevel.HEADING_1 ? 420 : level === HeadingLevel.HEADING_2 ? 300 : 220,
      after: 140,
      line: 420,
      lineRule: "atLeast",
    },
    keepNext: true,
    children: inlineRuns(text, {
      bold: true,
      color: COLORS.primary,
      size: level === HeadingLevel.HEADING_1 ? 34 : level === HeadingLevel.HEADING_2 ? 30 : 27,
      font: { ascii: "Times New Roman", eastAsia: "SimHei" },
    }),
  });
}

function parseTableRow(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split(/(?<!\\)\|/).map((cell) => cleanInline(cell.trim()));
}

function isSeparatorRow(line) {
  return /^\s*\|?(\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(line);
}

function buildTable(lines) {
  const parsed = lines.map(parseTableRow);
  if (parsed.length > 1 && isSeparatorRow(lines[1])) parsed.splice(1, 1);
  const columns = Math.max(...parsed.map((row) => row.length));
  const width = Math.floor(100 / columns);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: TABLE_BORDERS,
    rows: parsed.map(
      (row, rowIndex) =>
        new TableRow({
          tableHeader: rowIndex === 0,
          cantSplit: true,
          children: Array.from({ length: columns }, (_, columnIndex) => {
            const text = row[columnIndex] || "-";
            return new TableCell({
              width: { size: width, type: WidthType.PERCENTAGE },
              margins: { top: 70, bottom: 70, left: 100, right: 100 },
              shading:
                rowIndex === 0
                  ? { type: ShadingType.CLEAR, fill: COLORS.accent }
                  : rowIndex % 2 === 0
                    ? { type: ShadingType.CLEAR, fill: COLORS.surface }
                    : { type: ShadingType.CLEAR, fill: COLORS.white },
              children: [
                new Paragraph({
                  spacing: { line: 312, after: 0 },
                  children: inlineRuns(text, {
                    size: 18,
                    bold: rowIndex === 0,
                    color: rowIndex === 0 ? COLORS.white : COLORS.body,
                    font: { ascii: "Times New Roman", eastAsia: "SimSun" },
                  }),
                }),
              ],
            });
          }),
        }),
    ),
  });
}

function codeParagraph(code) {
  return new Paragraph({
    spacing: { line: 312, after: 80 },
    indent: { left: 280, right: 160 },
    border: {
      left: { style: BorderStyle.SINGLE, size: 6, color: COLORS.accent, space: 10 },
    },
    shading: { type: ShadingType.CLEAR, fill: "F4F7F9" },
    children: [
      new TextRun({
        text: code || " ",
        size: 18,
        color: "243040",
        font: { ascii: "Courier New", eastAsia: "Microsoft YaHei" },
      }),
    ],
  });
}

function markdownToDocx(markdown, { skipFirstTitle = true } = {}) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const children = [];
  let skippedTitle = !skipFirstTitle;
  let index = 0;
  while (index < lines.length) {
    const raw = lines[index];
    const line = raw.trimEnd();
    if (!line.trim() || /^---+$/.test(line.trim())) {
      index += 1;
      continue;
    }
    if (line.trim().startsWith("```")) {
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        children.push(codeParagraph(lines[index]));
        index += 1;
      }
      index += 1;
      continue;
    }
    if (line.trim().startsWith("|") && index + 1 < lines.length && isSeparatorRow(lines[index + 1])) {
      const tableLines = [line, lines[index + 1]];
      index += 2;
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        tableLines.push(lines[index]);
        index += 1;
      }
      children.push(buildTable(tableLines));
      continue;
    }
    const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
    if (headingMatch) {
      if (!skippedTitle && headingMatch[1].length === 1) {
        skippedTitle = true;
        index += 1;
        continue;
      }
      const sourceLevel = headingMatch[1].length;
      const level =
        sourceLevel <= 2
          ? HeadingLevel.HEADING_2
          : sourceLevel === 3
            ? HeadingLevel.HEADING_3
            : HeadingLevel.HEADING_3;
      children.push(heading(headingMatch[2], level));
      index += 1;
      continue;
    }
    const bulletMatch = /^\s*[-*]\s+(.+)$/.exec(raw);
    if (bulletMatch) {
      let text = bulletMatch[1];
      if (/^\[[ xX]\]\s*/.test(text)) {
        const checked = /^\[[xX]\]/.test(text);
        text = `${checked ? "☑" : "☐"} ${text.replace(/^\[[ xX]\]\s*/, "")}`;
      }
      children.push(
        new Paragraph({
          bullet: { level: 0 },
          spacing: { line: 312, after: 70 },
          children: inlineRuns(text, { size: 24, color: COLORS.body }),
        }),
      );
      index += 1;
      continue;
    }
    if (/^\s*\d+\.\s+/.test(raw)) {
      const reference = addNumberingReference();
      while (index < lines.length) {
        const item = /^\s*\d+\.\s+(.+)$/.exec(lines[index]);
        if (!item) break;
        children.push(
          new Paragraph({
            numbering: { reference, level: 0 },
            spacing: { line: 312, after: 70 },
            children: inlineRuns(item[1], { size: 24, color: COLORS.body }),
          }),
        );
        index += 1;
      }
      continue;
    }
    children.push(bodyParagraph(line.trim()));
    index += 1;
  }
  return children;
}

function cover() {
  const content = [
    new Paragraph({
      spacing: { before: 2200, after: 420 },
      indent: { left: 1200, right: 900 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLORS.accentBright, space: 10 } },
      children: [
        new TextRun({
          text: "AI AUTOMATION AGENCY OS",
          size: 18,
          bold: true,
          color: COLORS.accentBright,
          font: { ascii: "Arial", eastAsia: "Microsoft YaHei" },
          characterSpacing: 40,
        }),
      ],
    }),
    new Paragraph({
      spacing: { line: 920, lineRule: "atLeast", after: 90 },
      indent: { left: 1200, right: 900 },
      children: [
        new TextRun({
          text: "Complete Implementation Roadmap",
          size: 76,
          bold: true,
          color: COLORS.white,
          font: { ascii: "Arial", eastAsia: "SimHei" },
        }),
      ],
    }),
    new Paragraph({
      spacing: { line: 780, lineRule: "atLeast", after: 420 },
      indent: { left: 1200, right: 900 },
      children: [
        new TextRun({
          text: "and 12 Detailed Build Prompts",
          size: 60,
          bold: true,
          color: COLORS.white,
          font: { ascii: "Arial", eastAsia: "SimHei" },
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 700, line: 360, lineRule: "atLeast" },
      indent: { left: 1200, right: 900 },
      children: [
        new TextRun({
          text: "A requirement-preserving delivery program for SRS-AIOS-2026-001",
          size: 24,
          color: "B0B8C0",
          font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
        }),
      ],
    }),
    ...[
      "Source SRS: Version 1.0 · July 2026",
      "Coverage: 246 numbered requirements · 0 omitted",
      "Delivery structure: 12 sequential implementation parts",
      "Product model: Personal single-operator agency command center",
    ].map(
      (text) =>
        new Paragraph({
          spacing: { after: 110, line: 360, lineRule: "atLeast" },
          indent: { left: 1400, right: 900 },
          border: { left: { style: BorderStyle.SINGLE, size: 8, color: COLORS.accentBright, space: 12 } },
          children: [
            new TextRun({
              text,
              size: 24,
              color: "D7DEE6",
              font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
            }),
          ],
        }),
    ),
    new Paragraph({
      spacing: { before: 2500, line: 312 },
      indent: { left: 1200, right: 900 },
      border: { top: { style: BorderStyle.SINGLE, size: 3, color: COLORS.accentBright, space: 10 } },
      children: [
        new TextRun({ text: "Prepared July 31, 2026", size: 18, color: "90989F", font: "Arial" }),
        new TextRun({ text: "                                Confidential Planning Package", size: 18, color: "90989F", font: "Arial" }),
      ],
    }),
  ];
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows: [
        new TableRow({
          height: { value: 16838, rule: "exact" },
          cantSplit: true,
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: COLORS.background },
              borders: NO_BORDERS,
              verticalAlign: "top",
              margins: { left: 0, right: 0 },
              children: content,
            }),
          ],
        }),
      ],
    }),
  ];
}

function pageFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 312 },
        children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "808080" })],
      }),
    ],
  });
}

function pageHeader() {
  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 312, after: 0 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: COLORS.border, space: 6 } },
        children: [
          new TextRun({
            text: "AI Automation Agency OS · Roadmap and Build Prompts",
            size: 18,
            color: "808080",
            font: { ascii: "Times New Roman", eastAsia: "Microsoft YaHei" },
          }),
        ],
      }),
    ],
  });
}

const volumes = [
  { title: "Volume I - Master Implementation Roadmap", file: "01_AI_OS_Master_Roadmap.md" },
  { title: "Volume II - Twelve Detailed Build Prompts", file: "02_AI_OS_12_Detailed_Build_Prompts.md" },
  { title: "Volume III - SRS Coverage and Traceability", file: "03_SRS_Coverage_and_Traceability_Matrix.md" },
  { title: "Volume IV - Architecture, Quality, and Release Gates", file: "04_Architecture_Quality_and_Release_Gates.md" },
];

const bodyChildren = [];
for (const [volumeIndex, volume] of volumes.entries()) {
  if (volumeIndex > 0) {
    bodyChildren.push(
      new Paragraph({
        children: [new TextRun({ text: `End of ${volumes[volumeIndex - 1].title}`, color: "808080", size: 18 }), new PageBreak()],
      }),
    );
  }
  bodyChildren.push(heading(volume.title, HeadingLevel.HEADING_1));
  const markdown = fs.readFileSync(path.join(ROOT, volume.file), "utf8");
  bodyChildren.push(...markdownToDocx(markdown));
}

const executiveSummary = [
  heading("Executive Summary", HeadingLevel.HEADING_1),
  bodyParagraph(
    "This document converts the complete AI Automation Agency OS Software Requirements Specification into an executable engineering program. It preserves every numbered and unnumbered SRS obligation, sequences the work into exactly 12 implementation parts, and supplies 12 detailed prompts suitable for use with a coding agent.",
  ),
  bodyParagraph(
    "The source SRS contains 246 unique numbered requirements: 175 functional, 38 non-functional, and 33 security requirements. The accompanying traceability matrix maps every ID to an accountable roadmap part and mandatory verification evidence. Architecture, graph behavior, data fields, API routes, realtime events, webhooks, integrations, user-interface specifications, deployment controls, future scope, and business success metrics are also traced.",
  ),
  bodyParagraph(
    "The roadmap retains the SRS's single-owner operating model and 20-week production-readiness intent. It adds clearly labeled safeguards-including transactional outbox processing, idempotency, adapter boundaries, structured observability, dead-letter replay, data classification, deterministic AI tests, and restore drills-without removing or weakening any original requirement.",
  ),
  bodyParagraph(
    "Use the prompts sequentially. A part is complete only after its migrations, APIs, user experience, background processing, security controls, documentation, and test evidence pass. The source SRS remains authoritative whenever interpretation is required.",
  ),
  buildTable([
    "| Delivery volume | Contents |",
    "|---|---|",
    "| Volume I | Master 12-part roadmap, architecture, schedule, risks, and milestones |",
    "| Volume II | Twelve self-contained, copy/paste implementation prompts |",
    "| Volume III | Complete 246-requirement traceability and unnumbered-scope matrices |",
    "| Volume IV | Cross-cutting architecture, security, testing, operations, and release gates |",
  ]),
  new Paragraph({
    children: [new TextRun({ text: "End of Executive Summary", size: 18, color: "808080" }), new PageBreak()],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 360, after: 260, line: 420 },
    children: [
      new TextRun({
        text: "Table of Contents",
        bold: true,
        size: 34,
        color: COLORS.primary,
        font: { ascii: "Times New Roman", eastAsia: "SimHei" },
      }),
    ],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({
    spacing: { before: 200, line: 312 },
    children: [
      new TextRun({
        text: 'Note: This Table of Contents is generated via field codes. For accurate page numbers after editing, right-click the TOC and select "Update Field," then update the entire table.',
        italics: true,
        size: 18,
        color: "888888",
      }),
      new PageBreak(),
    ],
  }),
];

const document = new Document({
  creator: "ZCode",
  title: "AI Automation Agency OS - Complete Implementation Roadmap and 12 Detailed Build Prompts",
  subject: "Requirement-preserving roadmap for SRS-AIOS-2026-001",
  description: "Master roadmap, twelve implementation prompts, traceability matrix, and production release gates.",
  keywords: "AI Automation Agency OS, roadmap, SRS, implementation prompts, traceability",
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimSun" }, size: 24, color: COLORS.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: 34, bold: true, color: COLORS.primary },
        paragraph: { spacing: { before: 420, after: 160, line: 420 }, outlineLevel: 0 },
      },
      heading2: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: 30, bold: true, color: COLORS.primary },
        paragraph: { spacing: { before: 300, after: 140, line: 380 }, outlineLevel: 1 },
      },
      heading3: {
        run: { font: { ascii: "Times New Roman", eastAsia: "SimHei" }, size: 27, bold: true, color: COLORS.primary },
        paragraph: { spacing: { before: 220, after: 120, line: 350 }, outlineLevel: 2 },
      },
    },
  },
  numbering: { config: numberingConfig },
  sections: [
    {
      properties: { page: { size: PAGE, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: cover(),
    },
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: PAGE,
          margin: BODY_MARGIN,
          pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN },
        },
      },
      headers: { default: pageHeader() },
      footers: { default: pageFooter() },
      children: executiveSummary,
    },
    {
      properties: {
        type: SectionType.CONTINUOUS,
        page: {
          size: PAGE,
          margin: BODY_MARGIN,
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: { default: pageHeader() },
      footers: { default: pageFooter() },
      children: bodyChildren,
    },
  ],
});

const buffer = await Packer.toBuffer(document);
fs.writeFileSync(OUTPUT, buffer);
console.log(`Wrote ${OUTPUT}`);
console.log(`Body elements: ${bodyChildren.length}`);
console.log(`Numbered list definitions: ${numberingConfig.length}`);

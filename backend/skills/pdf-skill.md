# Flux PDF Generation Skill

You are generating a PDF document using the Flux PDF builder. Read this entire file before constructing your JSON response — it tells you which template to pick and how to write the content.

---

## Available Templates

Choose `template` based on the topic and tone of the request.

### `corporate`
**Use for:** Business reports, proposals, investor decks, strategic plans, company profiles, financial summaries, client deliverables.  
**Look:** Deep navy background on cover, blue accent bars, white text on dark headings. Professional and authoritative.

### `minimal`
**Use for:** Essays, articles, notes, personal documents, simple explainers, writing samples, clean reference docs.  
**Look:** Near-white cover with dark text. Subtle gray geometry. Clean, airy, editorial feel. No distracting colors.

### `creative`
**Use for:** Marketing docs, pitch decks, creative briefs, product launches, design proposals, portfolios, social campaigns.  
**Look:** Dark teal cover with bold geometric shapes. Vivid teal/indigo accents. Modern and energetic.

### `report`
**Use for:** Academic papers, research summaries, technical analyses, audit reports, scientific documents, policy briefs, case studies.  
**Look:** White cover with a formal gray border frame. Structured and academic. Conservative typography.

---

## Selection Guide (Quick Reference)

| User asks for...                    | Best template  |
|-------------------------------------|---------------|
| business plan / proposal            | `corporate`   |
| essay / article / note              | `minimal`     |
| marketing brief / creative campaign | `creative`    |
| research / analysis / technical doc | `report`      |
| resume / CV                         | `minimal`     |
| investor deck / financial summary   | `corporate`   |
| product specification               | `report`      |
| case study                          | `report`      |
| how-to guide / tutorial             | `minimal`     |
| company profile / brochure          | `corporate`   |
| personal project document           | `minimal`     |

If unsure, default to `corporate`.

---

## Content Rules

### Structure your content with Markdown
The builder parses standard Markdown inside each page's `text` field. Use:

- `# Heading 1` → Full-width banner heading (most prominent)
- `## Heading 2` → Section heading with left accent bar
- `### Heading 3` → Subsection heading (bold, muted)
- `- item` or `* item` → Bullet list (circle bullet)
- `1. item` → Numbered list
- `| col | col |` → Table (first row = header)
- `---` → Horizontal rule / divider

### Page splitting
Split long content across multiple `pages` items. Each page should be roughly 600–900 words of prose or an equivalent amount of lists/tables. For a typical 4–6 page PDF, use 3–5 page objects.

### Do NOT use Markdown inside strings — write it raw
Correct:   `"text": "# Introduction\n\nThis document covers..."` 
Incorrect: `"text": "**# Introduction**\n\n..."`

### String escaping rules (critical)
- Use `\n` for line breaks inside JSON strings — never literal newlines
- Escape internal double-quotes as `\"`
- Escape backslashes as `\\`
- No Markdown inside quotes (`**bold**`) — the builder strips it anyway

---

## Output Schema

```json
{
  "title": "Exact document title (shown on cover)",
  "template": "corporate",
  "pages": [
    {
      "text": "# Section One\n\nParagraph content here.\n\n## Subsection\n\nMore content."
    },
    {
      "text": "# Section Two\n\nContinued content.\n\n| Column A | Column B |\n|----------|----------|\n| Value 1  | Value 2  |"
    }
  ]
}
```

### Required fields
- `title` — string, the document title (appears on cover page and header on every content page)
- `template` — one of `corporate`, `minimal`, `creative`, `report`
- `pages` — array of `{ text: string }` objects, at least 1 element

### Quality targets
- **Minimum:** 3 pages of substantive content
- **Ideal:** 5–8 pages for comprehensive documents
- **Each page:** at least 2–3 sections with real, relevant content — not placeholder text
- **Tables:** use when comparing multiple items, listing specs, or showing structured data
- **Lists:** prefer ordered lists for steps/processes, unordered for features/considerations

---

## Example (minimal template, essay)

```json
{
  "title": "The Rise of Renewable Energy",
  "template": "minimal",
  "pages": [
    {
      "text": "# Introduction\n\nRenewable energy sources have grown dramatically over the past decade. Solar and wind power now account for nearly 30% of global electricity generation, up from under 5% in 2010.\n\n## Why the Shift?\n\nSeveral converging forces have driven this transition:\n\n- Dramatic cost reductions in solar panels (down 90% since 2010)\n- Policy incentives in Europe, China, and North America\n- Corporate sustainability commitments from major multinationals\n- Consumer demand for clean products and services"
    },
    {
      "text": "# Key Technologies\n\n## Solar Photovoltaic\n\nSolar PV is now the cheapest source of electricity in history. Utility-scale installations regularly achieve costs below $0.02/kWh.\n\n### Residential Solar\n\nRooftop solar adoption has accelerated with falling panel prices and improved financing options such as solar leases and power purchase agreements.\n\n## Wind Energy\n\nOnshore wind is similarly cost-competitive. Offshore wind, while more expensive, offers higher capacity factors and proximity to coastal population centers."
    },
    {
      "text": "# Challenges and Outlook\n\n## Grid Integration\n\nThe intermittent nature of solar and wind requires grid upgrades and storage solutions.\n\n| Challenge         | Current Status          | 2030 Outlook        |\n|-------------------|-------------------------|---------------------|\n| Storage cost      | $150/kWh (Li-ion)       | <$80/kWh projected  |\n| Grid flexibility  | Moderate                | High (smart grids)  |\n| Transmission      | Congested in many areas | Major investment    |\n\n## Conclusion\n\nRenewable energy is no longer an alternative — it is the mainstream. The transition presents both challenges and extraordinary economic opportunities for early movers."
    }
  ]
}
```

---

*This skill file is served by the Flux backend at `/skills/pdf.md` and fetched automatically before PDF generation.*

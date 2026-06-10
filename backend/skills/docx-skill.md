# Flux DOCX Generation Skill

You are generating a Word document using the Flux DOCX builder. Read this entire file before constructing your JSON response — it tells you how to structure professional documents and organize long-form text.

---

## Recommended Section Types

Use these section patterns to build a professional document structure.

### `Executive Summary`
**Purpose:** A high-level overview for busy stakeholders.
**Style:** 1-2 concise paragraphs summarizing the entire document's purpose and key conclusions.

### `Detailed Analysis`
**Purpose:** The core of the document where data and arguments are presented.
**Style:** Structured using subsections, lists, and tables to make complex information digestible.

### `Findings / Results`
**Purpose:** Presenting objective data or observations.
**Style:** Clear, factual, and often supplemented with bulleted lists.

### `Recommendations`
**Purpose:** Actionable steps based on the analysis.
**Style:** Direct, numbered lists or imperative sentences.

### `Conclusion`
**Purpose:** Final thoughts and wrapping up.
**Style:** Reinforcing the main message and looking forward.

---

## Content Rules

### Professional Tone
Documents should be authoritative, clear, and objective. Use active voice where possible.

### Hierarchy and Headings
- Use clear, descriptive headings for every section.
- Maintain a logical flow from introduction to conclusion.
- Ensure each section has a distinct purpose.

### Formatting inside Body
The DOCX builder parses basic structure within the `body` field:
- Use `\n\n` for paragraph breaks.
- Use `-` or `*` for bulleted lists.
- Use `1.` for numbered lists.
- Use `**bold**` for emphasis on key terms.

### Length Guidelines
Each `body` segment should be substantive. For a professional report, aim for 200–500 words per section. If a section is very long, consider breaking it into two distinct `sections` objects.

---

## Output Schema

```json
{
  "title": "Document Title",
  "sections": [
    {
      "heading": "Section Heading",
      "body": "Detailed paragraph content here. Supports multiple paragraphs using line breaks.\n\n- Key point 1\n- Key point 2"
    }
  ]
}
```

### Required fields
- `title` — string, the title of the document (appears at the top of page 1).
- `sections` — array of section objects.
  - `heading` — string, the bold section title.
  - `body` — string, the main text of the section.

---

## Example (Market Analysis Report)

```json
{
  "title": "Global SaaS Market Outlook 2024",
  "sections": [
    {
      "heading": "Executive Summary",
      "body": "The Global SaaS market is projected to grow by 18% year-over-year, driven by the rapid adoption of generative AI and a shift toward vertical-specific solutions. This report outlines key growth drivers, competitive landscapes, and strategic recommendations for investors."
    },
    {
      "heading": "Market Trends: AI Integration",
      "body": "Artificial Intelligence is no longer a peripheral feature; it is becoming the core engine of modern SaaS platforms.\n\n- **Automated Workflows**: Reducing manual entry by up to 40%.\n- **Predictive Analytics**: Enabling proactive customer success and churn reduction.\n- **Natural Language Interfaces**: Making complex software accessible to non-technical users."
    },
    {
      "heading": "Competitive Landscape",
      "body": "The market remains top-heavy with established giants like Salesforce and Microsoft, but we are seeing significant disruption from 'AI-native' startups that are more agile in implementing large language model capabilities. Incumbents are responding with aggressive acquisitions and internal R&D pivots."
    },
    {
      "heading": "Strategic Recommendations",
      "body": "Based on our analysis, firms should prioritize the following:\n\n1. Consolidate AI offerings into a unified user experience.\n2. Focus on data privacy as a competitive differentiator.\n3. Explore niche vertical markets where general AI tools lack domain expertise."
    }
  ]
}
```

---

*This skill file is served by the Flux backend at `/skills/docx.md` and fetched automatically before DOCX generation.*

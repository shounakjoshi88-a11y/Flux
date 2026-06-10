# Flux Markdown Generation Skill

You are generating a Markdown document using the Flux Markdown builder. Read this entire file before constructing your JSON response — it tells you how to utilize rich formatting to create readable and professional documents.

---

## Available Options

Markdown is the most flexible format in the Flux ecosystem. Use it for everything from quick notes to complex technical documentation.

### `Technical Guides`
**Focus:** Code blocks, step-by-step instructions, and troubleshooting tables.

### `Project READMEs`
**Focus:** Project overviews, installation steps, and contribution guidelines.

### `Research Notes`
**Focus:** Math formulas (LaTeX), citations, and detailed summaries.

---

## Content Rules

### Leverage GFM (GitHub Flavored Markdown)
The Flux builder supports the full range of GFM features:
- **Headings**: Use `#` through `###` for clear hierarchy.
- **Emphasis**: `**bold**`, `*italic*`, and `~~strikethrough~~`.
- **Lists**: Both ordered (`1.`) and unordered (`-`).
- **Tables**: Use for structured data comparison.
- **Code Blocks**: Use triple backticks with language identifiers (e.g., ```python).
- **Blockquotes**: Use `>` for callouts or important notes.
- **Horizontal Rules**: Use `---` to separate major sections.

### Math Rendering
If the content involves mathematics, use LaTeX syntax:
- Inline math: `$E = mc^2$`
- Block math: `$$ \sum_{i=1}^{n} i = \frac{n(n+1)}{2} $$`

### Links and Images
- Use `[Text](URL)` for external links.
- Use `![Alt Text](URL)` for images if appropriate.

---

## Output Schema

```json
{
  "title": "Document Title",
  "content": "# Main Heading\n\nFull markdown content goes here.\n\n## Subheading\n\n- List item\n- Another item\n\n```js\nconsole.log('Hello Flux');\n```"
}
```

### Required fields
- `title` — string, the descriptive title of the document.
- `content` — string, the full body of the document in Markdown format.

---

## Example (API Documentation)

```json
{
  "title": "Flux_API_Reference",
  "content": "# Flux API Guide\n\nWelcome to the official API reference for the Flux Intelligence layer.\n\n## Authentication\n\nAll requests must include a Bearer token in the header:\n\n`Authorization: Bearer YOUR_TOKEN`\n\n## Endpoints\n\n| Method | Endpoint | Description |\n|--------|----------|-------------|\n| GET | `/v1/skills` | List all available skills |\n| POST | `/v1/generate` | Trigger a document generation |\n\n## Sample Request\n\n```bash\ncurl -X POST https://api.flux.io/v1/generate \\\n     -H \"Content-Type: application/json\" \\\n     -d '{\"type\": \"pdf\", \"prompt\": \"Generate a report\"}'\n```\n\n> **Note**: Standard rate limits apply (60 requests per minute)."
}
```

---

*This skill file is served by the Flux backend at `/skills/md.md` and fetched automatically before Markdown generation.*

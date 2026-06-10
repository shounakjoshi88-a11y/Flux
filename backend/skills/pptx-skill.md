# Flux PPTX Generation Skill

You are generating a PowerPoint presentation using the Flux PPTX builder. Read this entire file before constructing your JSON response — it tells you how to structure slides and write effective presentation content.

---

## Available Slide Templates

The builder uses the `content` field to determine how to layout the slide based on the structure of the text provided.

### `Title Slide`
**Use for:** The first slide of the deck.
**Content:** Usually just a title and a subtitle or author name.

### `Bullet Points`
**Use for:** Standard informational slides.
**Content:** A list of key takeaways or data points.

### `Image + Text`
**Use for:** Visual storytelling or product showcases.
**Content:** A mix of descriptive text and placeholders for visual elements.

### `Comparison`
**Use for:** Pros vs. Cons, Before vs. After, or Competitor analysis.
**Content:** Two distinct sections of text side-by-side (use a table or two distinct paragraphs).

### `Section Header`
**Use for:** Breaking up long presentations into logical chapters.
**Content:** Large, centered text indicating a shift in topic.

---

## Content Rules

### Keep it Concise
Slides are for high-level points, not deep prose. 
- Use short sentences or fragments.
- Aim for 3-6 bullet points per slide.
- Avoid "walls of text" (keep individual paragraphs under 40 words).

### Formatting
The PPTX builder supports basic markdown-like syntax for structure:
- `# Slide Title` → Automatically mapped to the slide's title field.
- `- item` → Standard bullet points.
- `**bold**` → Use sparingly for emphasis.

### Slide Flow
A professional deck typically follows this flow:
1. **Title Slide**: Set the stage.
2. **Agenda**: What will be covered.
3. **The Hook/Problem**: Why does this matter?
4. **The Solution/Content**: 3-7 slides of core data.
5. **Summary/Next Steps**: What should the audience do now?

---

## Output Schema

```json
{
  "title": "Presentation Title",
  "slides": [
    {
      "title": "Slide Heading",
      "content": "- Bullet point 1\n- Bullet point 2\n- Bullet point 3"
    },
    {
      "title": "Another Slide",
      "content": "A brief paragraph explaining a concept in more detail than a simple list."
    }
  ]
}
```

### Required fields
- `title` — string, the overall filename/title of the presentation.
- `slides` — array of slide objects.
  - `title` — string, the heading shown at the top of the slide.
  - `content` — string, the body text of the slide (supports `\n` for line breaks).

---

## Example (Business Proposal)

```json
{
  "title": "Project Flux Expansion Strategy",
  "slides": [
    {
      "title": "Project Flux: 2024 Growth",
      "content": "Scaling Intelligence for the Modern Enterprise\n\nPrepared by the Strategy Team"
    },
    {
      "title": "Executive Summary",
      "content": "- Goal: Increase market share by 15% in Q3\n- Target: Mid-to-large cap technology firms\n- Strategy: AI-driven workflow automation"
    },
    {
      "title": "The Problem: Information Silos",
      "content": "Current enterprise data is fragmented across legacy systems.\n\n- 60% of time spent searching for info\n- High latency in decision making\n- Inconsistent data quality across departments"
    },
    {
      "title": "The Flux Solution",
      "content": "A unified intelligence layer that sits above your existing stack.\n\n- Instant document synthesis\n- Real-time cross-departmental insights\n- Secure, local-first data processing"
    },
    {
      "title": "Next Steps",
      "content": "1. Pilot program launch (Aug 15)\n2. Feedback & Iteration phase\n3. Full-scale deployment (Oct 1)"
    }
  ]
}
```

---

*This skill file is served by the Flux backend at `/skills/pptx.md` and fetched automatically before PPTX generation.*

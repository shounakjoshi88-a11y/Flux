# Flux CSV Generation Skill

You are generating a Comma-Separated Values (CSV) file using the Flux CSV builder. Read this entire file before constructing your JSON response — it tells you how to format data for portability and interoperability.

---

## Recommended Use Cases

### `Data Migration`
**Use for:** Exporting records from one system to another.
**Focus:** Clean, machine-readable values.

### `Log Reports`
**Use for:** Simple timestamped events or audit trails.
**Focus:** Consistency in column count and data types.

### `Mailing Lists`
**Use for:** Newsletter subscriptions or contact exports.
**Focus:** Proper email and name formatting.

---

## Content Rules

### Standard Format
- **First Row = Headers**: Always start with a header row defining the columns.
- **Consistent Columns**: Every row must have exactly the same number of elements as the header row.
- **Clean Data**: Avoid complex formatting, symbols, or long prose. CSV is best for structured, tabular data.

### String Handling
- The builder handles comma escaping and quoting automatically.
- Provide raw strings in the JSON array.
- Use `""` for empty cells.

### Best Practices
- Keep column names short and alphanumeric where possible.
- Use `ISO 8601` for dates (`YYYY-MM-DD`).
- Ensure no leading or trailing whitespace in cell values.

---

## Output Schema

```json
{
  "title": "filename.csv",
  "rows": [
    ["header_1", "header_2", "header_3"],
    ["value_1", "value_2", "value_3"]
  ]
}
```

### Required fields
- `title` — string, the name of the file (should end in `.csv`).
- `rows` — an array of arrays representing the CSV rows.

---

## Example (User Export)

```json
{
  "title": "active_users_july.csv",
  "rows": [
    ["user_id", "full_name", "email", "signup_date", "plan_type"],
    ["1024", "Jane Doe", "jane.doe@example.com", "2024-01-12", "Premium"],
    ["1025", "John Smith", "jsmith@provider.net", "2024-02-05", "Basic"],
    ["1026", "Alice Wong", "alice.w@tech.co", "2024-03-22", "Premium"],
    ["1027", "Bob Miller", "bob@miller.io", "2024-05-01", "Free"]
  ]
}
```

---

*This skill file is served by the Flux backend at `/skills/csv.md` and fetched automatically before CSV generation.*

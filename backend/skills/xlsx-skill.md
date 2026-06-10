# Flux XLSX Generation Skill

You are generating an Excel spreadsheet using the Flux XLSX builder. Read this entire file before constructing your JSON response — it tells you how to organize data for maximum clarity and utility.

---

## Recommended Use Cases

### `Financial Summaries`
**Data:** Budgets, profit/loss statements, expense tracking, revenue projections.
**Headers:** Date, Category, Description, Debit, Credit, Balance.

### `Project Tracking`
**Data:** Milestone progress, task assignments, resource allocation.
**Headers:** Task ID, Task Name, Owner, Status, Start Date, End Date, Priority.

### `Inventory Management`
**Data:** Product lists, stock levels, supplier info.
**Headers:** SKU, Item Name, Category, Stock Level, Reorder Point, Unit Cost.

### `Customer/Lead Lists`
**Data:** CRM exports, mailing lists, sales prospects.
**Headers:** First Name, Last Name, Email, Company, Lead Score, Last Contacted.

---

## Content Rules

### Data Organization
- **The First Row is the Header**: Always include clear, descriptive headers in the first array of the `rows` list.
- **Consistent Columns**: Every row must have the same number of elements. If data is missing, use an empty string `""` or `"N/A"`.
- **Clean Values**:
  - For currency, use numbers (e.g., `1250.50`) — the builder handles formatting.
  - For dates, use `YYYY-MM-DD` format.
  - Avoid putting long sentences inside cells.

### Structure
- Keep one "sheet" of data per request (the array represents a single sheet).
- Sort data logically (e.g., by date or priority) before generating the JSON.

---

## Output Schema

```json
{
  "title": "Spreadsheet Filename",
  "rows": [
    ["Column Header 1", "Column Header 2", "Column Header 3"],
    ["Data Row 1 - A", "Data Row 1 - B", "Data Row 1 - C"],
    ["Data Row 2 - A", "Data Row 2 - B", "Data Row 2 - C"]
  ]
}
```

### Required fields
- `title` — string, the name of the Excel file.
- `rows` — an array of arrays. Each inner array represents a row of cells.

---

## Example (Project Milestone Tracker)

```json
{
  "title": "Q3_Product_Launch_Plan",
  "rows": [
    ["ID", "Milestone", "Department", "Due Date", "Status", "Priority"],
    ["M1", "Design Finalization", "Creative", "2024-07-15", "Completed", "High"],
    ["M2", "Beta Testing Phase 1", "Engineering", "2024-08-01", "In Progress", "Critical"],
    ["M3", "Marketing Collateral", "Marketing", "2024-08-10", "Pending", "Medium"],
    ["M4", "Final Security Audit", "Engineering", "2024-08-20", "Pending", "Critical"],
    ["M5", "Public Launch", "All", "2024-09-01", "Pending", "High"]
  ]
}
```

---

*This skill file is served by the Flux backend at `/skills/xlsx.md` and fetched automatically before XLSX generation.*

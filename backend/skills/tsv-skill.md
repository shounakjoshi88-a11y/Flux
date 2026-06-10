# Flux TSV Generation Skill

You are generating a Tab-Separated Values (TSV) file using the Flux TSV builder. Read this entire file before constructing your JSON response — it tells you how to format data for technical applications and spreadsheet imports.

---

## Recommended Use Cases

### `Technical Data Exports`
**Use for:** Large datasets where commas might be frequent in the values (making TSV safer).
**Focus:** High precision and machine readability.

### `Cross-Application Transfers`
**Use for:** Data meant to be copy-pasted directly into Excel or Google Sheets.
**Focus:** Preservation of column structure.

---

## Content Rules

### Tab Separation
- The builder automatically uses tab characters (`\t`) to separate values. 
- You provide the data as an array of arrays in the JSON response.

### Row and Column Consistency
- **Header Row**: The first array in `rows` must define the column names.
- **Uniformity**: Every subsequent row must contain the same number of elements as the header row.
- **Data Types**: Keep numbers as numbers and strings as strings. Use `""` for null or missing values.

### Formatting
- Avoid using tab characters inside your string values, as this will break the file structure.
- TSV files are typically "raw" — do not include stylistic markdown or rich text.

---

## Output Schema

```json
{
  "title": "data_dump.tsv",
  "rows": [
    ["id", "timestamp", "event_type", "payload_size"],
    ["evt_001", "2024-06-01T12:00:00Z", "login", "124"],
    ["evt_002", "2024-06-01T12:05:12Z", "upload", "54200"]
  ]
}
```

### Required fields
- `title` — string, the name of the file (should end in `.tsv`).
- `rows` — an array of arrays representing the data rows.

---

## Example (Inventory Sensor Log)

```json
{
  "title": "warehouse_sensor_logs.tsv",
  "rows": [
    ["sensor_id", "location", "reading_celsius", "humidity_pct", "status"],
    ["SN-402", "Zone_A1", "22.4", "45", "OK"],
    ["SN-405", "Zone_A2", "21.9", "44", "OK"],
    ["SN-409", "Zone_B1", "25.1", "55", "WARNING"],
    ["SN-412", "Zone_C3", "22.0", "45", "OK"]
  ]
}
```

---

*This skill file is served by the Flux backend at `/skills/tsv.md` and fetched automatically before TSV generation.*

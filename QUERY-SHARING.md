# Query Sharing — Shareable SQL for PXStat Data

## The Problem

The CSO regularly receives data requests that require custom breakdowns of published datasets. For example:

> "Can I get a quarterly breakdown of table NPA03? The published data is monthly."

Today this typically means a staff member must:

1. Pull the data internally
2. Write a transformation (pivot, aggregate, filter, etc.)
3. Compile the result into a spreadsheet
4. Email the CSV back to the requester

This is manual, time-consuming, and produces a static snapshot that can't be reused or modified by the recipient.

## The Idea

Instead of compiling data in-house and sending a file, **share the query itself**. The PXStat Workbench can encode a table code and SQL query into a portable share link. The recipient pastes it in, and the app loads the table, runs the query, and shows the results — all in-browser with no server involved.

### How It Works

**Sender (e.g. CSO staff):**

1. Load the relevant PXStat table (e.g. `NPA03`)
2. Write the SQL that produces the requested breakdown:
   ```sql
   SELECT
     "Region",
     QUARTER("Month") AS quarter,
     YEAR("Month") AS year,
     AVG("VALUE") AS avg_value
   FROM px_NPA03
   GROUP BY "Region", quarter, year
   ORDER BY year, quarter
   LIMIT 200;
   ```
3. Click **Share** (or the share button on a query in History)
4. A `pxstat://` link is copied to clipboard
5. Send the link to the requester via email, Slack, Teams, etc.

**Recipient:**

1. Open PXStat Workbench
2. Click **Import**
3. The table loads, the query runs, and results appear immediately

No manual steps. The recipient sees the compiled data and can also **modify the query** if they want a different cut — change the date range, add a filter, switch from quarterly to yearly, etc.

### Share Format

The share link is a `pxstat://` URI containing a base64-encoded JSON payload:

```
pxstat://eyJ0IjoiTlBBMDMiLCJxIjoiU0VMRUNUICogRlJPTSBweF9OUEEwMyBMSU1JVCAxMDA7In0=
```

Which decodes to:

```json
{
  "t": "NPA03",
  "q": "SELECT * FROM px_NPA03 LIMIT 100;",
  "s": "population"
}
```

| Field | Description |
|-------|-------------|
| `t`   | Table code to load from PXStat |
| `q`   | SQL query to execute |
| `s`   | Catalog search term (optional) |

The URL hash is also updated when sharing, so the same browser tab can be bookmarked for later.

## Where You Can Share From

1. **Top bar "Share" button** — shares the full current state (table code, SQL editor contents, catalog search)
2. **History panel share button** — shares a specific past query from your history, along with the current table code

Both produce a `pxstat://` link copied to clipboard.

## Use Cases

### 1. Responding to Data Requests
A member of the public or a journalist asks: "What's the crime rate trend by county for the last 5 years?"

Instead of compiling a report, the CSO creates the SQL, shares the link, and the requester gets live, interactive results they can further explore.

### 2. Internal Collaboration
One analyst finds an interesting pattern across two joined tables. They share the query with a colleague who can immediately reproduce and build on the analysis.

### 3. Reusable Templates
Common queries (e.g. "quarterly aggregation of any monthly table") can be saved as favourites in History and shared repeatedly with different requesters.

### 4. Self-Service Follow-ups
The recipient isn't limited to the exact query that was shared. They can modify the SQL to change filters, groupings, or date ranges — turning a one-off data request into self-service exploration.

## Technical Notes

- **No server required** — the share link contains everything needed. The recipient's browser fetches the data directly from the CSO PXStat API and runs the SQL locally via DuckDB WASM.
- **Always fresh data** — because the table is loaded live from the API on import, the recipient gets the latest published data, not a stale snapshot.
- **Extension URL limitation** — Firefox extension URLs contain per-installation UUIDs, so the full URL isn't shareable between users. The `pxstat://` clipboard format is installation-independent and works across any two users with the extension installed.
- **Auto-execution** — when a share link contains both a table code and a query, the query runs automatically after the table loads so the recipient sees results with zero clicks.

## Future Possibilities

- **Multi-table shares** — encode multiple table codes so joins can be shared too
- **Named share links** — include a human-readable title/description with the share
- **Share via URL shortener** — generate a short URL that redirects with the encoded state
- **Export share as HTML** — generate a standalone HTML page with embedded query and results

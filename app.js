import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.30.0/+esm";

// UI
const statusEl = document.getElementById("status");
const metaEl = document.getElementById("meta");
const tableInput = document.getElementById("table");
const loadBtn = document.getElementById("load");
const runBtn = document.getElementById("run");
const schemaBtn = document.getElementById("schema");
const dropBtn = document.getElementById("drop");
const sqlEl = document.getElementById("sql");
const dropdown = document.getElementById("tablesDropdown");
const columnsList = document.getElementById("columnsList");

// Tabulator grid
let tabulator = new Tabulator("#resultTable", {
  data: [],
  layout: "fitDataStretch",
  pagination: "local",
  paginationSize: 100,
  movableColumns: true,
  height: "60vh",
});

// --- Boot DuckDB ---
const bundles = duckdb.getJsDelivrBundles();
const bundle = await duckdb.selectBundle(bundles);
const workerURL = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}")`], { type: "text/javascript" }));
const worker = new Worker(workerURL);
const logger = new duckdb.ConsoleLogger();
const db = new duckdb.AsyncDuckDB(logger, worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
const conn = await db.connect();

// Helpers
function csvUrlFor(code) {
  code = (code || "").trim().toUpperCase();
  return `https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/${code}/CSV/1.0/en`;
}
function setBusy(b) {
  loadBtn.disabled = runBtn.disabled = schemaBtn.disabled = dropBtn.disabled = !!b;
  statusEl.textContent = b ? "Working…" : "Ready.";
}
function renderTabulator(arrowTable) {
  const rows = arrowTable.toArray().map((row) => Object.fromEntries(row));
  if (!rows.length) {
    tabulator.clearData();
    tabulator.setColumns([]);
    return;
  }
  const cols = Object.keys(rows[0]);
  const data = rows.map((r) => Object.fromEntries(cols.map((c) => [c, r[c]])));
  const columns = cols.map((c) => ({ title: c, field: c, headerFilter: true, sorter: "string" }));
  tabulator.setColumns(columns);
  tabulator.replaceData(data);
}

// Tables dropdown
async function updateTablesDropdown() {
  const res = await conn.query(`PRAGMA show_tables;`);
  const tables = res.toArray().map((r) => Object.fromEntries(r)).map((r) => r.name);

  dropdown.innerHTML = '<option value="">Select table...</option>';
  for (const t of tables) {
    const opt = document.createElement("option");
    opt.value = t; opt.textContent = t;
    dropdown.appendChild(opt);
  }
  metaEl.textContent = `Loaded tables: ${tables.join(", ") || "None"}`;

  // refresh columns sidebar
  if (dropdown.value) await loadColumnsFor(dropdown.value);
}

dropdown.addEventListener("change", async () => {
  const selected = dropdown.value;
  if (selected) {
    sqlEl.value = `SELECT * FROM ${selected} LIMIT 20;`;
    statusEl.textContent = `SQL prepared for ${selected}.`;
    await loadColumnsFor(selected);
  } else {
    columnsList.innerHTML = "";
  }
});

// Sidebar columns list
async function loadColumnsFor(tableName) {
  const schema = await conn.query(`DESCRIBE ${tableName};`);
  const cols = schema.toArray().map((r) => Object.fromEntries(r)).map((r) => r.column_name);

  columnsList.innerHTML = "";
  cols.forEach((col) => {
    const a = document.createElement("div");
    a.className = "list-group-item";
    a.textContent = col;
    columnsList.appendChild(a);
  });



  
}

// Load PXStat → table px_CODE
async function loadPxStat() {
  const code = tableInput.value.trim().toUpperCase();
  if (!code) return;
  setBusy(true);
  try {
    const url = csvUrlFor(code);
    statusEl.textContent = `Fetching CSV for ${code}…`;
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
    const csv = await resp.text();

    const filePath = `/px_${code}.csv`;
    await db.registerFileText(filePath, csv);

    const tableName = `px_${code}`;
    await conn.query(`DROP TABLE IF EXISTS ${tableName};`);
    await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${filePath}', HEADER=TRUE);`);

    sqlEl.value = `SELECT * FROM ${tableName} LIMIT 20;`;
    statusEl.textContent = `Loaded ${tableName}.`;

    await updateTablesDropdown();
    dropdown.value = tableName;
    await loadColumnsFor(tableName);
  } catch (err) {
    tabulator.setColumns([{ title: "Error", field: "err" }]);
    tabulator.replaceData([{ err: err.message }]);
    statusEl.textContent = "Error.";
  } finally {
    setBusy(false);
  }
}

// Run SQL
async function runSql() {
  setBusy(true);
  try {
    const q = sqlEl.value;
    const res = await conn.query(q);
    renderTabulator(res);
    statusEl.textContent = "Query complete.";
  } catch (err) {
    tabulator.setColumns([{ title: "Error", field: "err" }]);
    tabulator.replaceData([{ err: err.message }]);
    statusEl.textContent = "Query error.";
  } finally {
    setBusy(false);
  }
}

// Show Schema of selected table
async function showSchema() {
  setBusy(true);
  try {
    const selected = dropdown.value;
    if (!selected) throw new Error("Select a table from the dropdown first");
    const schema = await conn.query(`DESCRIBE ${selected};`);
    renderTabulator(schema);
    statusEl.textContent = `Schema for ${selected}.`;
  } catch (e) {
    tabulator.setColumns([{ title: "Error", field: "err" }]);
    tabulator.replaceData([{ err: e.message }]);
    statusEl.textContent = "Error.";
  } finally {
    setBusy(false);
  }
}

// Drop selected table
async function dropTable() {
  setBusy(true);
  try {
    const selected = dropdown.value;
    if (!selected) throw new Error("Select a table to drop");
    await conn.query(`DROP TABLE IF EXISTS ${selected};`);
    statusEl.textContent = `Dropped ${selected}.`;
    await updateTablesDropdown();
    dropdown.value = "";
    sqlEl.value = "";
    tabulator.clearData(); tabulator.setColumns([]);
    columnsList.innerHTML = "";
  } catch (e) {
    tabulator.setColumns([{ title: "Error", field: "err" }]);
    tabulator.replaceData([{ err: e.message }]);
    statusEl.textContent = "Error.";
  } finally {
    setBusy(false);
  }
}

// Events
loadBtn.addEventListener("click", loadPxStat);
runBtn.addEventListener("click", runSql);
schemaBtn.addEventListener("click", showSchema);
dropBtn.addEventListener("click", dropTable);

// Keyboard shortcut: Ctrl+Enter or Cmd+Enter to run SQL
sqlEl.addEventListener("keydown", (e) => {
    console.log("Key pressed:", e.key, "ctrl?", e.ctrlKey, "meta?", e.metaKey);
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      console.log("Shortcut triggered!");
      e.preventDefault();
      runSql();
    }
  });
  
  
// Init
await updateTablesDropdown();

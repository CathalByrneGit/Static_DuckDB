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
const catalogBtn = document.getElementById("loadCatalog");
const catalogStatus = document.getElementById("catalogStatus");
const catalogList = document.getElementById("catalogList");

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
async function createDuckdbWorker(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Failed to fetch DuckDB worker script: ${resp.status} ${url}`);
  }
  const workerScript = await resp.text();
  const blob = new Blob([workerScript], { type: "text/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  return new Worker(blobUrl);
}

const worker = await createDuckdbWorker(bundle.mainWorker);
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
function normalizeRow(row) {
  if (row instanceof Map) return Object.fromEntries(row);
  if (Array.isArray(row)) return Object.fromEntries(row);
  if (row && typeof row === "object") return row;
  return {};
}

function renderTabulator(arrowTable) {
  const rows = (arrowTable?.toArray?.() || []).map((row) => normalizeRow(row));
  const schemaCols = arrowTable?.schema?.fields?.map((field) => field?.name).filter(Boolean) || [];
  const cols = schemaCols.length ? schemaCols : Object.keys(rows[0] || {});
  const columns = cols.map((c) => ({ title: c, field: c, headerFilter: true, sorter: "string" }));

  tabulator.setColumns(columns);
  tabulator.replaceData(rows);
}

globalThis.renderCatalog =
  globalThis.renderCatalog ||
  function renderCatalog(items) {
    catalogList.innerHTML = "";
    items.forEach((item) => {
      const entry = document.createElement("button");
      entry.type = "button";
      entry.className = "list-group-item list-group-item-action";
      entry.textContent = `${item.id} — ${item.title}`;
      entry.title = `Last modified: ${item.lastModified || "unknown"}`;
      entry.addEventListener("click", () => {
        tableInput.value = item.id;
        statusEl.textContent = `Selected ${item.id} from catalog.`;
      });
      catalogList.appendChild(entry);
    });
  };

// 1. Updated Parsing Logic
function parseCatalogResult(result) {
  // The CSO API typically returns items inside result.link.item
  const itemsArray = result?.link?.item || [];

  if (!Array.isArray(itemsArray)) {
    console.error("Unexpected API structure:", result);
    return [];
  }

  return itemsArray.map((row) => {
    return {
      // The Matrix ID is usually in extension.matrix
      id: row.extension?.matrix || "Unknown",
      // The Title is in the label field
      title: row.label || "Untitled",
      // The update timestamp
      lastModified: row.updated || "Unknown",
    };
  }).filter(item => item.id !== "Unknown");
}

// 2. Updated Fetch Logic
async function fetchCatalog() {
  const endpoint = "https://ws.cso.ie/public/api.jsonrpc";
  const payload = {
    jsonrpc: "2.0",
    method: "PxStat.Data.Cube_API.ReadCollection",
    params: {
      language: "en",
      datefrom: "2023-01-01", // Using a more recent date helps performance
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      // Note: CSO API sometimes requires a simple Content-Type or none at all
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const data = await response.json();
    
    if (data.error) throw new Error(data.error.message);

    // Pass the 'result' object directly to the parser
    const items = parseCatalogResult(data.result);
    console.log(`Successfully loaded ${items.length} items.`);
    return items;

  } catch (error) {
    console.error("Catalog Fetch Error:", error);
    // Fallback or rethrow
    throw error;
  }
}

// 3. UI Rendering (Remains mostly same, added error handling)
// Store the full list globally so we can filter it without re-fetching
let fullCatalogItems = [];

const getSectorName = (id) => {
  const prefix = id.charAt(0).toUpperCase();
  const sectors = {
    'A': 'Agriculture', 'B': 'Agriculture/Fishing', 'C': 'Crime/Justice',
    'E': 'Economy', 'G': 'Government', 'H': 'Housing', 
    'L': 'Labour Market', 'M': 'Manufacturing', 'P': 'Population', 
    'Q': 'Quality of Life', 'R': 'Retail', 'S': 'Social Services', 
    'T': 'Transport', 'V': 'Vital Stats', 'W': 'Wholesale'
  };
  return sectors[prefix] || 'Other Statistics';
};

globalThis.renderCatalog = function renderCatalog(items) {
  const list = document.getElementById("catalogList");
  list.innerHTML = "";
  
  if (items.length === 0) {
    list.innerHTML = '<div class="p-2 text-muted">No tables found.</div>';
    return;
  }

  // Sort by ID to group prefixes together
  items.sort((a, b) => a.id.localeCompare(b.id));

  let currentSector = "";

  items.forEach((item) => {
    const sector = getSectorName(item.id);

    // Add sticky header for Sectors
    if (sector !== currentSector) {
      const header = document.createElement("div");
      header.className = "list-group-item list-group-item-dark fw-bold small sticky-top";
      header.style.zIndex = "1"; // Ensure it stays above items but inside the container
      header.textContent = sector;
      list.appendChild(header);
      currentSector = sector;
    }

    const entry = document.createElement("button");
    entry.type = "button";
    entry.className = "list-group-item list-group-item-action py-2";
    entry.style.fontSize = "0.75rem";
    entry.innerHTML = `<strong>${item.id}</strong><br><span class="text-wrap">${item.title}</span>`;
    
    entry.addEventListener("click", () => {
      document.getElementById("table").value = item.id;
      // Optional: auto-trigger the load button click
      // document.getElementById("load").click(); 
    });
    
    list.appendChild(entry);
  });
};

// Add Search Functionality
document.getElementById("catalogSearch")?.addEventListener("input", (e) => {
  const term = e.target.value.toLowerCase();
  const filtered = fullCatalogItems.filter(item => 
    item.id.toLowerCase().includes(term) || 
    item.title.toLowerCase().includes(term)
  );
  renderCatalog(filtered);
});

// Update your existing Load Catalog button event
document.getElementById("loadCatalog").addEventListener("click", async () => {
  const status = document.getElementById("catalogStatus");
  status.textContent = "Loading...";
  try {
    fullCatalogItems = await fetchCatalog(); // Your existing fetchCatalog function
    renderCatalog(fullCatalogItems);
    status.textContent = `Found ${fullCatalogItems.length} tables.`;
  } catch (err) {
    status.textContent = "Error loading catalog.";
    console.error(err);
  }
});

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
catalogBtn.addEventListener("click", async () => {
  catalogBtn.disabled = true;
  catalogStatus.textContent = "Loading catalog…";
  try {
    const items = await fetchCatalog();
    globalThis.renderCatalog(items);
    catalogStatus.textContent = `Loaded ${items.length} tables.`;
  } catch (err) {
    catalogStatus.textContent = `Error: ${err.message}`;
  } finally {
    catalogBtn.disabled = false;
  }
});

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

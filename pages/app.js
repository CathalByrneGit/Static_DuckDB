import * as duckdb from "https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.30.0/+esm";

// UI Elements
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
const catalogSearch = document.getElementById("catalogSearch");

let fullCatalogItems = [];

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
  const workerScript = await resp.text();
  const blob = new Blob([workerScript], { type: "text/javascript" });
  return new Worker(URL.createObjectURL(blob));
}

const worker = await createDuckdbWorker(bundle.mainWorker);
const logger = new duckdb.ConsoleLogger();
const db = new duckdb.AsyncDuckDB(logger, worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
const conn = await db.connect();

// --- Helpers ---
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
  return row;
}

function renderTabulator(arrowTable) {
  const rows = (arrowTable?.toArray?.() || []).map(normalizeRow);
  const schemaCols = arrowTable?.schema?.fields?.map(f => f.name) || [];
  const columns = schemaCols.map(c => ({ title: c, field: c, headerFilter: true, sorter: "string" }));
  tabulator.setColumns(columns);
  tabulator.replaceData(rows);
}

// --- Catalog Logic ---
const getSectorName = (id) => {
  const prefix = id.charAt(0).toUpperCase();
  const sectors = {
    'A': 'Agriculture', 'C': 'Crime/Justice', 'E': 'Economy', 'G': 'Government', 
    'H': 'Housing', 'L': 'Labour Market', 'M': 'Manufacturing', 'P': 'Population', 
    'R': 'Retail', 'V': 'Vital Stats'
  };
  return sectors[prefix] || 'Other Statistics';
};

function renderCatalog(items) {
  catalogList.innerHTML = "";
  items.sort((a, b) => a.id.localeCompare(b.id));
  let currentSector = "";

  items.forEach((item) => {
    const sector = getSectorName(item.id);
    if (sector !== currentSector) {
      const header = document.createElement("div");
      header.className = "list-group-item list-group-item-dark fw-bold small sticky-top";
      header.textContent = sector;
      catalogList.appendChild(header);
      currentSector = sector;
    }

    const entry = document.createElement("button");
    entry.className = "list-group-item list-group-item-action py-2 small";
    entry.innerHTML = `<strong>${item.id}</strong> — ${item.title}`;
    entry.onclick = () => { tableInput.value = item.id; };
    catalogList.appendChild(entry);
  });
}

async function loadColumnsFor(tableName) {
  // 1. Get detailed schema info from DuckDB
  const schemaRes = await conn.query(`DESCRIBE ${tableName};`);
  const columns = schemaRes.toArray().map(r => normalizeRow(r));
  
  columnsList.innerHTML = "";
  const countBadge = document.getElementById("columnCount");
  if (countBadge) countBadge.textContent = columns.length;

  for (const col of columns) {
    const name = col.column_name;
    const type = col.column_type.toUpperCase();
    
    // Check if it's a float type (where unique values are often unhelpful)
    const isFloat = type.includes("DOUBLE") || type.includes("FLOAT") || type.includes("DECIMAL");
    
    const container = document.createElement("div");
    container.className = "list-group-item p-0 border-bottom column-row";

    // Header Area: Name and Type
    const header = document.createElement("div");
    header.className = "d-flex justify-content-between align-items-center p-2 small";
    header.style.cursor = isFloat ? "default" : "pointer";
    header.title = isFloat ? `Continuous data (${type})` : "Click to view unique values";
    
    header.innerHTML = `
      <div class="text-truncate">
        <span class="fw-bold text-primary">${name}</span>
        <span class="text-muted ms-1" style="font-size: 0.7rem;">[${type}]</span>
      </div>
      ${!isFloat ? '<span class="text-muted" style="font-size: 0.6rem;">▼</span>' : ''}
    `;

    // The expansion area for unique values
    const valuesArea = document.createElement("div");
    valuesArea.className = "bg-light border-top p-2 small d-none";

    // Click handler on the whole header
    if (!isFloat) {
      header.addEventListener("click", async () => {
        const isHidden = valuesArea.classList.contains("d-none");
        
        if (isHidden) {
          // Close other open value areas if you want a "single accordion" feel
          // document.querySelectorAll('#columnsList .bg-light').forEach(el => el.classList.add('d-none'));

          valuesArea.classList.remove("d-none");
          valuesArea.innerHTML = "<em>Querying uniques...</em>";
          
          const tempConn = await db.connect();
          try {
            const res = await tempConn.query(`
              SELECT "${name}" as val, COUNT(*) as qty 
              FROM "${tableName}" 
              GROUP BY 1 
              ORDER BY qty DESC 
              LIMIT 10
            `);
            const rows = res.toArray().map(normalizeRow);
            
            // Inside your unique value rendering loop (where rows are mapped):
            valuesArea.innerHTML = rows.map(r => {
              const displayVal = r.val === null ? 'NULL' : r.val;
              // If it's a string, wrap in single quotes for SQL
              const sqlVal = typeof r.val === 'string' ? `'${r.val}'` : r.val;

              return `
                <div class="d-flex justify-content-between border-bottom mb-1 pb-1 group-by-item" 
                    style="cursor: pointer;" 
                    title="Click to generate Group By query for this value">
                  <span class="text-truncate val-text" data-col="${name}" data-val="${sqlVal}">
                    ${displayVal}
                  </span>
                  <span class="badge bg-secondary opacity-75">${r.qty}</span>
                </div>`;
            }).join("") || "No data available";

            // Add click listeners to the new value rows
            valuesArea.querySelectorAll('.group-by-item').forEach(item => {
              item.onclick = (e) => {
                e.stopPropagation();
                const textSpan = item.querySelector('.val-text');
                const col = textSpan.dataset.col;
                const val = textSpan.dataset.val;
                
                // Generate a useful summary query
                sqlEl.value = `-- Summary for ${col} = ${val}\n` +
                              `SELECT * FROM ${dropdown.value} \n` +
                              `WHERE "${col}" = ${val} \n` +
                              `LIMIT 100;`;
                
                statusEl.textContent = `Generated filter for ${val}`;
                sqlEl.focus();
              };
            });
          } catch (err) {
            valuesArea.innerHTML = `<span class="text-danger">Query failed</span>`;
          } finally {
            await tempConn.close();
          }
        } else {
          valuesArea.classList.add("d-none");
        }
      });
    }

    container.appendChild(header);
    container.appendChild(valuesArea);
    columnsList.appendChild(container);
  }
}
// --- Fixed Show Schema ---
async function showSchema() {
  const selected = dropdown.value;
  if (!selected) {
    statusEl.textContent = "Please select a table from the dropdown first.";
    return;
  }
  
  setBusy(true);
  try {
    const res = await conn.query(`DESCRIBE ${selected};`);
    renderTabulator(res); // Pass the Arrow table directly
    statusEl.textContent = `Displaying schema for ${selected}`;
  } catch (err) {
    console.error("Schema Error:", err);
    statusEl.textContent = "Could not retrieve schema.";
  } finally {
    setBusy(false);
  }
}

// Re-bind the event listener if it was lost
schemaBtn.onclick = showSchema;

// --- Main App Logic ---
async function updateTablesDropdown() {
  // We filter for 'main' schema only, which is where user tables/views live
  const res = await conn.query(`
    SELECT table_name as name, 'Table' as type 
    FROM duckdb_tables() 
    WHERE schema_name = 'main' AND internal = false
    UNION ALL
    SELECT view_name as name, 'View' as type 
    FROM duckdb_views() 
    WHERE schema_name = 'main' AND internal = false
    ORDER BY type, name
  `);
  
  const items = res.toArray().map(r => normalizeRow(r));

  dropdown.innerHTML = '<option value="">Select table or view...</option>';
  items.forEach((item) => {
    const opt = document.createElement("option");
    opt.value = item.name;
    // Visually label them so you know which is which
    opt.textContent = `${item.type === 'View' ? '📂' : '📊'} ${item.name}`;
    dropdown.appendChild(opt);
  });
  
  metaEl.textContent = `User objects: ${items.length}`;
  
  // Inside your init or updateTablesDropdown:
  await updateJoinDropdowns();

  // Bind the button
  document.getElementById("generateJoin").onclick = prepareJoinHelper;
}

async function loadPxStat() {
  const code = tableInput.value.trim().toUpperCase();
  if (!code) return;
  setBusy(true);
  try {
    const url = csvUrlFor(code);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error("Table not found on CSO");
    const csv = await resp.text();
    const tableName = `px_${code}`;
    await db.registerFileText(`${tableName}.csv`, csv);
    await conn.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${tableName}.csv')`);
    
    await updateTablesDropdown();
    dropdown.value = tableName;
    await loadColumnsFor(tableName);
    sqlEl.value = `SELECT * FROM ${tableName} LIMIT 50;`;
    statusEl.textContent = `Loaded ${tableName} successfully.`;
  } catch (err) {
    statusEl.textContent = "Error: " + err.message;
  } finally {
    setBusy(false);
  }
}


// Drop selected table or view
async function dropSelected() {
  const selected = dropdown.value;
  if (!selected) return;

  if (!confirm(`Permanently remove '${selected}' from memory?`)) return;

  setBusy(true);
  try {
    // Determine if it's a view or table from the dropdown text
    const isView = dropdown.options[dropdown.selectedIndex].text.includes('📂');
    
    if (isView) {
      await conn.query(`DROP VIEW IF EXISTS "${selected}";`);
    } else {
      await conn.query(`DROP TABLE IF EXISTS "${selected}";`);
    }

    statusEl.textContent = `Removed ${selected}.`;
    
    // Refresh UI
    await updateTablesDropdown();
    dropdown.value = "";
    columnsList.innerHTML = "";
    tabulator.clearData();
    
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Drop failed.";
  } finally {
    setBusy(false);
  }
}

async function saveAsView() {
  const query = sqlEl.value.trim();
  if (!query) return;

  // Ask user for a view name
  const viewName = prompt("Enter a name for this view (e.g., dublin_stats):");
  if (!viewName) return;

  // Clean the name to be SQL safe
  const safeName = viewName.replace(/[^a-z0-9_]/gi, '_').toLowerCase();

  setBusy(true);
  try {
    // DuckDB command to create a view
    await conn.query(`CREATE OR REPLACE VIEW ${safeName} AS ${query}`);
    
    statusEl.textContent = `View '${safeName}' created!`;
    
    // Refresh the dropdown so the new view appears
    await updateTablesDropdown();
    dropdown.value = safeName;
  } catch (err) {
    console.error(err);
    alert("Could not save view: " + err.message);
  } finally {
    setBusy(false);
  }
}

async function prepareJoinHelper() {
  const tableA = document.getElementById("joinTableA").value;
  const tableB = document.getElementById("joinTableB").value;

  if (!tableA || !tableB || tableA === tableB) {
    alert("Select two different tables to join.");
    return;
  }

  // Fetch columns for both
  const colsA = (await conn.query(`DESCRIBE ${tableA}`)).toArray().map(r => r.toJSON().column_name);
  const colsB = (await conn.query(`DESCRIBE ${tableB}`)).toArray().map(r => r.toJSON().column_name);

  // Find common column names (CSO often uses "Year", "Region", "Census Year")
  const common = colsA.filter(value => colsB.includes(value));

  let joinCol = common.length > 0 ? common[0] : "REPLACE_WITH_COLUMN";
  
  // Generate a template SQL
  const sql = `-- Joining ${tableA} and ${tableB}\n` +
              `SELECT \n` +
              `  a.*, \n` +
              `  b.* EXCLUDE ("${joinCol}") -- Avoid duplicate columns\n` +
              `FROM ${tableA} a\n` +
              `INNER JOIN ${tableB} b \n` +
              `  ON a."${joinCol}" = b."${joinCol}"\n` +
              `LIMIT 100;`;

  sqlEl.value = sql;
  
  if (common.length > 0) {
    document.getElementById("joinSuggestions").innerHTML = 
      `Suggested join key: <strong>${common.join(", ")}</strong>`;
  } else {
    document.getElementById("joinSuggestions").innerHTML = 
      `<span class="text-danger">No matching column names found. You'll need to pick the keys manually.</span>`;
  }
}

// Update the join dropdowns whenever a table is loaded
async function updateJoinDropdowns() {
  const res = await conn.query(`SELECT table_name FROM duckdb_tables() WHERE internal = false`);
  const tables = res.toArray().map(r => r.toJSON().table_name);
  
  const selA = document.getElementById("joinTableA");
  const selB = document.getElementById("joinTableB");
  
  [selA, selB].forEach(sel => {
    sel.innerHTML = '<option value="">Select Table...</option>';
    tables.forEach(t => {
      const opt = document.createElement("option");
      opt.value = opt.textContent = t;
      sel.appendChild(opt);
    });
  });
}

function normalizeRow_view(row) {
  // Convert Arrow Map/Object to standard object
  let obj = row instanceof Map ? Object.fromEntries(row) : row;
  
  // Recursively convert BigInt to Number to avoid "can't convert BigInt to number"
  for (let key in obj) {
    if (typeof obj[key] === 'Bigint') {
      obj[key] = Number(obj[key]); 
      // Note: Number(BigInt) is safe for counts up to 9 quadrillion
    }
  }
  return obj;
}

async function checkKeyOverlap() {
  const tableA = document.getElementById("joinTableA").value;
  const tableB = document.getElementById("joinTableB").value;
  const resultsDiv = document.getElementById("overlapResults");

  if (!tableA || !tableB) {
    alert("Please select two tables first.");
    return;
  }

  // Get the column names to find the common key
  const colsA = (await conn.query(`DESCRIBE ${tableA}`)).toArray().map(r => normalizeRow(r).column_name);
  const colsB = (await conn.query(`DESCRIBE ${tableB}`)).toArray().map(r => normalizeRow(r).column_name);
  const common = colsA.filter(v => colsB.includes(v));

  if (common.length === 0) {
    resultsDiv.innerHTML = `<span class="text-danger">No common column names found to check.</span>`;
    resultsDiv.classList.remove("d-none");
    return;
  }

  const joinKey = common[0]; // Testing the first common key found
  resultsDiv.classList.remove("d-none");
  resultsDiv.innerHTML = "<em>Analyzing keys...</em>";

  try {
    // This query identifies how many unique keys match vs differ
    const overlapQuery = `
      WITH keysA AS (SELECT DISTINCT "${joinKey}" as k FROM ${tableA}),
           keysB AS (SELECT DISTINCT "${joinKey}" as k FROM ${tableB})
      SELECT 
        (SELECT COUNT(*) FROM keysA) as totalA,
        (SELECT COUNT(*) FROM keysB) as totalB,
        (SELECT COUNT(*) FROM keysA JOIN keysB ON keysA.k = keysB.k) as matches
    `;
    
    const res = await conn.query(overlapQuery);
    // ... inside checkKeyOverlap after fetching res ...
    const data = normalizeRow_view(res.toArray()[0]);

    // Ensure math is done on Numbers
    const matches = Number(data.matches);
    const totalA = Number(data.totalA);

const matchPercent = totalA > 0 ? ((matches / totalA) * 100).toFixed(1) : 0;
    resultsDiv.innerHTML = `
      <strong>Key Analysis on [${joinKey}]:</strong><br>
      • Table A has ${data.totalA} unique values.<br>
      • Table B has ${data.totalB} unique values.<br>
      • <span class="text-success">${data.matches} values match</span> (${matchPercent}% of Table A).
      ${data.matches === 0 ? '<br><span class="text-warning">⚠ Warning: No matches found. Check for spelling/format differences.</span>' : ''}
    `;
  } catch (err) {
    resultsDiv.innerHTML = `<span class="text-danger">Analysis error: ${err.message}</span>`;
  }
}


// Function to check for codes sent via right-click
async function checkPendingCodes() {
  const data = await browser.storage.local.get("pendingTableCode");
  if (data.pendingTableCode) {
    document.getElementById("table").value = data.pendingTableCode;
    statusEl.textContent = `Received ${data.pendingTableCode} via right-click.`;
    
    // Clear it so it doesn't reload every time you open the sidebar
    await browser.storage.local.remove("pendingTableCode");
    
    // Trigger the load logic
    loadPxStat(); 
  }
}



// --- Event Listeners ---
loadBtn.onclick = loadPxStat;
runBtn.onclick = async () => {
  setBusy(true);
  try {
    const res = await conn.query(sqlEl.value);
    renderTabulator(res);
  } catch (e) { statusEl.textContent = "SQL Error"; }
  setBusy(false);
};

dropBtn.addEventListener("click", dropSelected);

document.getElementById("saveView").onclick = saveAsView;

catalogBtn.onclick = async () => {
  catalogStatus.textContent = "Fetching...";
  const payload = { jsonrpc: "2.0", method: "PxStat.Data.Cube_API.ReadCollection", params: { language: "en", datefrom: "2024-01-01" } };
  const resp = await fetch("https://ws.cso.ie/public/api.jsonrpc", { method: "POST", body: JSON.stringify(payload) });
  const data = await resp.json();
  fullCatalogItems = data.result.link.item.map(i => ({ id: i.extension.matrix, title: i.label }));
  renderCatalog(fullCatalogItems);
  catalogStatus.textContent = `Loaded ${fullCatalogItems.length} tables.`;
};

catalogSearch.oninput = (e) => {
  const term = e.target.value.toLowerCase();
  renderCatalog(fullCatalogItems.filter(i => i.id.toLowerCase().includes(term) || i.title.toLowerCase().includes(term)));
};

dropdown.onchange = () => { if (dropdown.value) loadColumnsFor(dropdown.value); };

sqlEl.onkeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runBtn.click();
  }
};

// Download functionality
document.getElementById("downloadCsv").addEventListener("click", () => {
  // Check if there is data to download
  if (tabulator.getData().length === 0) {
    alert("No data available to download. Run a query first!");
    return;
  }

  const tableName = dropdown.value || "cso_data_export";
  const filename = `${tableName}_${new Date().toISOString().slice(0, 10)}.csv`;

  // Use Tabulator's built-in download method
  tabulator.download("csv", filename, { delimiter: "," });
  
  statusEl.textContent = `Exported ${filename}`;
});

document.getElementById("checkOverlap").onclick = checkKeyOverlap;

// Also listen for messages if the sidebar is ALREADY open
browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "LOAD_FROM_CONTEXT") {
    document.getElementById("table").value = msg.code;
    loadPxStat();
  }
});

// Run this on startup
checkPendingCodes();
await updateTablesDropdown();
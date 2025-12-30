import * as duckdb from '@duckdb/duckdb-wasm'; 

const MANUAL_BUNDLES = {
    mvp: {
        mainModule: browser.runtime.getURL('dist/export/lib/duckdb-mvp.wasm'),
        mainWorker: browser.runtime.getURL('dist/export/lib/duckdb-browser-mvp.worker.js'),
    },
    eh: {
        mainModule: browser.runtime.getURL('dist/export/lib/duckdb-eh.wasm'),
        mainWorker: browser.runtime.getURL('dist/export/lib/duckdb-browser-eh.worker.js'),
    },
};

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

// History panel elements
const historyPanel = document.getElementById("historyPanel");
const historyToggle = document.getElementById("historyToggle");
const closeHistory = document.getElementById("closeHistory");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistory");
const historyTabs = document.querySelectorAll(".history-tab");

// Theme elements
const themeLightBtn = document.getElementById("themeLight");
const themeDarkBtn = document.getElementById("themeDark");

let fullCatalogItems = [];
let currentTableData = []; // Store current results for download
let queryHistory = []; // Store query history
let currentHistoryTab = 'recent'; // 'recent' or 'favorites'

// --- Theme Management ---
function initTheme() {
  // Check for saved theme preference or system preference
  const savedTheme = localStorage.getItem('pxstat-theme');
  if (savedTheme) {
    setTheme(savedTheme);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    setTheme('dark');
  } else {
    setTheme('light');
  }
}

function setTheme(theme) {
  if (theme === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    themeDarkBtn.classList.add('active');
    themeLightBtn.classList.remove('active');
  } else {
    document.body.removeAttribute('data-theme');
    themeLightBtn.classList.add('active');
    themeDarkBtn.classList.remove('active');
  }
  localStorage.setItem('pxstat-theme', theme);
}

themeLightBtn.addEventListener('click', () => setTheme('light'));
themeDarkBtn.addEventListener('click', () => setTheme('dark'));

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
  if (!localStorage.getItem('pxstat-theme')) {
    setTheme(e.matches ? 'dark' : 'light');
  }
});

// --- Query History Management ---
function initHistory() {
  const saved = localStorage.getItem('pxstat-query-history');
  if (saved) {
    try {
      queryHistory = JSON.parse(saved);
    } catch (e) {
      queryHistory = [];
    }
  }
  renderHistory();
}

function saveHistory() {
  // Keep only the last 100 queries
  if (queryHistory.length > 100) {
    // Keep favorites and most recent
    const favorites = queryHistory.filter(q => q.favorite);
    const nonFavorites = queryHistory.filter(q => !q.favorite).slice(0, 100 - favorites.length);
    queryHistory = [...favorites, ...nonFavorites];
  }
  localStorage.setItem('pxstat-query-history', JSON.stringify(queryHistory));
}

function addToHistory(query, success = true, rowCount = 0, executionTime = 0) {
  // Don't add empty queries or duplicates of the last query
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return;
  
  // Check if this exact query is already the most recent
  if (queryHistory.length > 0 && queryHistory[0].query === trimmedQuery) {
    // Update the existing entry instead
    queryHistory[0].timestamp = Date.now();
    queryHistory[0].success = success;
    queryHistory[0].rowCount = rowCount;
    queryHistory[0].executionTime = executionTime;
    saveHistory();
    renderHistory();
    return;
  }
  
  const entry = {
    id: Date.now(),
    query: trimmedQuery,
    timestamp: Date.now(),
    success,
    rowCount,
    executionTime,
    favorite: false
  };
  
  queryHistory.unshift(entry);
  saveHistory();
  renderHistory();
}

function toggleFavorite(id) {
  const entry = queryHistory.find(q => q.id === id);
  if (entry) {
    entry.favorite = !entry.favorite;
    saveHistory();
    renderHistory();
  }
}

function deleteHistoryItem(id) {
  queryHistory = queryHistory.filter(q => q.id !== id);
  saveHistory();
  renderHistory();
}

function clearHistory() {
  if (confirm('Are you sure you want to clear all query history? Favorites will be preserved.')) {
    queryHistory = queryHistory.filter(q => q.favorite);
    saveHistory();
    renderHistory();
  }
}

function formatTimeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  
  return new Date(timestamp).toLocaleDateString();
}

function renderHistory() {
  const items = currentHistoryTab === 'favorites' 
    ? queryHistory.filter(q => q.favorite)
    : queryHistory;
  
  if (items.length === 0) {
    historyList.innerHTML = `
      <div class="empty-state">
        ${currentHistoryTab === 'favorites' 
          ? 'No favorite queries yet. Click the ★ on a query to add it.' 
          : 'No queries yet. Run a query to see it here.'}
      </div>
    `;
    return;
  }
  
  historyList.innerHTML = items.map(item => `
    <div class="history-item ${item.favorite ? 'favorite' : ''}" data-id="${item.id}">
      <div class="history-item-header">
        <span class="history-item-time">${formatTimeAgo(item.timestamp)}</span>
        <div class="history-item-actions">
          <button class="favorite-btn ${item.favorite ? 'active' : ''}" data-action="favorite" title="Toggle favorite">
            ${item.favorite ? '★' : '☆'}
          </button>
          <button data-action="copy" title="Copy to clipboard">📋</button>
          <button data-action="delete" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="history-item-query">${escapeHtml(truncateQuery(item.query, 150))}</div>
      <div class="history-item-meta">
        ${item.success 
          ? `<span class="badge" style="background: var(--success);">${item.rowCount} rows</span>` 
          : `<span class="badge" style="background: var(--danger);">Error</span>`}
        ${item.executionTime > 0 ? `<span>${item.executionTime}ms</span>` : ''}
      </div>
    </div>
  `).join('');
  
  // Add event listeners
  historyList.querySelectorAll('.history-item').forEach(el => {
    const id = parseInt(el.dataset.id);
    
    // Click on item to load query
    el.addEventListener('click', (e) => {
      if (e.target.closest('.history-item-actions')) return;
      const entry = queryHistory.find(q => q.id === id);
      if (entry) {
        sqlEl.value = entry.query;
        statusEl.textContent = 'Query loaded from history';
      }
    });
    
    // Action buttons
    el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        
        if (action === 'favorite') {
          toggleFavorite(id);
        } else if (action === 'copy') {
          const entry = queryHistory.find(q => q.id === id);
          if (entry) {
            navigator.clipboard.writeText(entry.query);
            statusEl.textContent = 'Query copied to clipboard';
          }
        } else if (action === 'delete') {
          deleteHistoryItem(id);
        }
      });
    });
  });
}

function truncateQuery(query, maxLength) {
  if (query.length <= maxLength) return query;
  return query.substring(0, maxLength) + '...';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// History panel controls
historyToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  historyPanel.classList.toggle('open');
});

closeHistory.addEventListener('click', () => {
  historyPanel.classList.remove('open');
});

// Close history panel when clicking outside
document.addEventListener('click', (e) => {
  if (historyPanel.classList.contains('open') && 
      !historyPanel.contains(e.target) && 
      e.target !== historyToggle) {
    historyPanel.classList.remove('open');
  }
});

// Prevent clicks inside panel from closing it
historyPanel.addEventListener('click', (e) => {
  e.stopPropagation();
});

// Close with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && historyPanel.classList.contains('open')) {
    historyPanel.classList.remove('open');
  }
});

clearHistoryBtn.addEventListener('click', clearHistory);

historyTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    historyTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentHistoryTab = tab.dataset.tab;
    renderHistory();
  });
});

// --- Boot DuckDB ---
const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);

const worker = new Worker(bundle.mainWorker, { type: 'module' });
const logger = new duckdb.ConsoleLogger();
const db = new duckdb.AsyncDuckDB(logger, worker);
await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
const conn = await db.connect();

console.log('DuckDB initialized successfully');

// --- Table Rendering Functions ---
function renderTable(arrowTable) {
  const rows = (arrowTable?.toArray?.() || []).map(normalizeRow);
  const schemaCols = arrowTable?.schema?.fields?.map(f => f.name) || [];
  
  // Store for download
  currentTableData = rows;
  
  const tableEl = document.getElementById('resultTable');
  
  if (rows.length === 0) {
    tableEl.innerHTML = '<tbody><tr><td>No results</td></tr></tbody>';
    return;
  }
  
  // Build table HTML
  const thead = `
    <thead>
      <tr>
        ${schemaCols.map((col, idx) => `
          <th data-column-index="${idx}">
            ${col}
            <input type="text" 
                   placeholder="Filter..." 
                   data-column="${col}"
                   style="display: block; margin-top: 4px; font-weight: normal;"
                   onclick="event.stopPropagation()">
          </th>
        `).join('')}
      </tr>
    </thead>
  `;
  
  const tbody = `
    <tbody>
      ${rows.map(row => `
        <tr>
          ${schemaCols.map(col => `<td>${formatValue(row[col])}</td>`).join('')}
        </tr>
      `).join('')}
    </tbody>
  `;
  
  tableEl.innerHTML = thead + tbody;
  
  // Add filter listeners
  tableEl.querySelectorAll('th input').forEach(input => {
    input.addEventListener('input', filterTable);
  });
  
  // Add sort listeners
  tableEl.querySelectorAll('th').forEach((th, index) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT') {
        sortTable(index, schemaCols);
      }
    });
  });
  
  // Reset sort state
  sortDirection = {};
  currentSortColumn = null;
}

function formatValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function filterTable() {
  const tableEl = document.getElementById('resultTable');
  const tbody = tableEl.querySelector('tbody');
  const filters = {};
  
  // Get all filter values
  tableEl.querySelectorAll('th input').forEach(input => {
    const col = input.dataset.column;
    const val = input.value.toLowerCase();
    if (val) filters[col] = val;
  });
  
  // Filter rows
  const rows = tbody.querySelectorAll('tr');
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    let show = true;
    
    Object.keys(filters).forEach((col, index) => {
      const cellText = cells[index]?.textContent.toLowerCase() || '';
      if (!cellText.includes(filters[col])) {
        show = false;
      }
    });
    
    row.style.display = show ? '' : 'none';
  });
}


let sortDirection = {};
let currentSortColumn = null;

function sortTable(columnIndex, columns) {
  const tableEl = document.getElementById('resultTable');
  const tbody = tableEl.querySelector('tbody');
  const rows = Array.from(tbody.querySelectorAll('tr'));
  const colName = columns[columnIndex];
  
  // Toggle sort direction
  sortDirection[colName] = sortDirection[colName] === 'asc' ? 'desc' : 'asc';
  const direction = sortDirection[colName];
  currentSortColumn = columnIndex;
  
  // Update header indicators
  tableEl.querySelectorAll('th').forEach((th, idx) => {
    const indicator = th.querySelector('.sort-indicator');
    if (indicator) indicator.remove();
    
    if (idx === columnIndex) {
      const arrow = document.createElement('span');
      arrow.className = 'sort-indicator';
      arrow.textContent = direction === 'asc' ? ' ▲' : ' ▼';
      arrow.style.fontSize = '0.7rem';
      arrow.style.marginLeft = '0.25rem';
      th.appendChild(arrow);
    }
  });
  
  rows.sort((a, b) => {
    const aVal = a.cells[columnIndex]?.textContent || '';
    const bVal = b.cells[columnIndex]?.textContent || '';
    
    // Try numeric sort first
    const aNum = parseFloat(aVal);
    const bNum = parseFloat(bVal);
    
    if (!isNaN(aNum) && !isNaN(bNum)) {
      return direction === 'asc' ? aNum - bNum : bNum - aNum;
    }
    
    // String sort
    return direction === 'asc' 
      ? aVal.localeCompare(bVal)
      : bVal.localeCompare(aVal);
  });
  
  // Re-append rows in sorted order
  rows.forEach(row => tbody.appendChild(row));
}

// --- Download as CSV ---
function downloadCSV() {
  if (currentTableData.length === 0) {
    alert("No data available to download. Run a query first!");
    return;
  }
  
  const tableName = dropdown.value || "cso_data_export";
  const filename = `${tableName}_${new Date().toISOString().slice(0, 10)}.csv`;
  
  // Get column names
  const columns = Object.keys(currentTableData[0]);
  
  // Build CSV
  let csv = columns.join(',') + '\n';
  
  currentTableData.forEach(row => {
    const values = columns.map(col => {
      let val = row[col];
      if (val === null || val === undefined) return '';
      
      // Escape quotes and wrap in quotes if contains comma/quote/newline
      val = String(val);
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = '"' + val.replace(/"/g, '""') + '"';
      }
      return val;
    });
    csv += values.join(',') + '\n';
  });
  
  // Download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  
  statusEl.textContent = `Exported ${filename}`;
}

// --- Helper Functions ---
function csvUrlFor(code) {
  code = (code || "").trim().toUpperCase();
  return `https://ws.cso.ie/public/api.restful/PxStat.Data.Cube_API.ReadDataset/${code}/CSV/1.0/en`;
}

function setBusy(b) {
  loadBtn.disabled = runBtn.disabled = schemaBtn.disabled = dropBtn.disabled = !!b;
  statusEl.textContent = b ? "Working…" : "Queried";
}

function normalizeRow(row) {
  if (row instanceof Map) return Object.fromEntries(row);
  return row;
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
      const header = document.createElement("li");
      header.className = "list-item list-item-header";
      header.textContent = sector;
      catalogList.appendChild(header);
      currentSector = sector;
    }

    const entry = document.createElement("li");
    entry.className = "list-item list-group-item-action";
    entry.innerHTML = `<strong>${item.id}</strong> — ${item.title}`;
    entry.onclick = () => { tableInput.value = item.id; };
    catalogList.appendChild(entry);
  });
}

async function loadColumnsFor(tableName) {
  const schemaRes = await conn.query(`DESCRIBE ${tableName};`);
  const columns = schemaRes.toArray().map(r => normalizeRow(r));
  
  columnsList.innerHTML = "";
  const countBadge = document.getElementById("columnCount");
  if (countBadge) countBadge.textContent = columns.length;

  for (const col of columns) {
    const name = col.column_name;
    const type = col.column_type.toUpperCase();
    const isFloat = type.includes("DOUBLE") || type.includes("FLOAT") || type.includes("DECIMAL");
    
    const container = document.createElement("li");
    container.className = "column-item";

    const header = document.createElement("div");
    header.className = "column-header";
    header.innerHTML = `
      <div class="text-truncate">
        <span class="fw-bold" style="color: var(--primary);">${name}</span>
        <span class="text-muted" style="font-size: 0.7rem;">[${type}]</span>
      </div>
      ${!isFloat ? '<span class="text-muted" style="font-size: 0.6rem;">▼</span>' : ''}
    `;

    const valuesArea = document.createElement("div");
    valuesArea.className = "column-values hidden";

    if (!isFloat) {
      header.addEventListener("click", async () => {
        const isHidden = valuesArea.classList.contains("hidden");
        
        if (isHidden) {
          valuesArea.classList.remove("hidden");
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
            
            valuesArea.innerHTML = rows.map(r => {
              const displayVal = r.val === null ? 'NULL' : r.val;
              const sqlVal = typeof r.val === 'string' ? `'${r.val}'` : r.val;

              return `
                <div class="value-item" data-col="${name}" data-val="${sqlVal}">
                  <span class="text-truncate">${displayVal}</span>
                  <span class="badge">${r.qty}</span>
                </div>`;
            }).join("") || "No data available";

            valuesArea.querySelectorAll('.value-item').forEach(item => {
              item.onclick = (e) => {
                e.stopPropagation();
                const col = item.dataset.col;
                const val = item.dataset.val;
                
                sqlEl.value = `-- Summary for ${col} = ${val}\n` +
                              `SELECT * FROM ${dropdown.value} \n` +
                              `WHERE "${col}" = ${val} \n` +
                              `LIMIT 100;`;
                
                statusEl.textContent = `Generated filter for ${val}`;
                sqlEl.focus();
              };
            });
          } catch (err) {
            valuesArea.innerHTML = `<span style="color: var(--danger);">Query failed</span>`;
          } finally {
            await tempConn.close();
          }
        } else {
          valuesArea.classList.add("hidden");
        }
      });
    }

    container.appendChild(header);
    container.appendChild(valuesArea);
    columnsList.appendChild(container);
  }
}

async function showSchema() {
  const selected = dropdown.value;
  if (!selected) {
    statusEl.textContent = "Please select a table from the dropdown first.";
    return;
  }
  
  setBusy(true);
  try {
    const res = await conn.query(`DESCRIBE ${selected};`);
    renderTable(res);
    statusEl.textContent = `Displaying schema for ${selected}`;
  } catch (err) {
    console.error("Schema Error:", err);
    statusEl.textContent = "Could not retrieve schema.";
  } finally {
    setBusy(false);
  }
}

schemaBtn.onclick = showSchema;

// --- Main App Logic ---
async function updateTablesDropdown() {
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
    opt.textContent = `${item.type === 'View' ? '📂' : '📊'} ${item.name}`;
    dropdown.appendChild(opt);
  });
  
  metaEl.textContent = `User objects: ${items.length}`;
  
  await updateJoinDropdowns();
  document.getElementById("generateJoin").onclick = prepareJoinHelper;
}

async function loadPxStat() {
  const code = tableInput.value.trim().toUpperCase();
  if (!code) {
    statusEl.textContent = "Please enter a table code";
    statusEl.style.background = "var(--danger)";
    statusEl.style.color = "white";
    setTimeout(() => {
      statusEl.style.background = "var(--light)";
      statusEl.style.color = "";
      statusEl.textContent = "Ready.";
    }, 3000);
    return;
  }
  
  setBusy(true);
  
  try {
    const url = csvUrlFor(code);
    statusEl.textContent = `Fetching ${code} from CSO...`;
    
    const resp = await fetch(url);
    
    // Check if the response is OK
    if (!resp.ok) {
      if (resp.status === 404) {
        throw new Error(`Table '${code}' not found. Please check the code and try again.`);
      } else if (resp.status === 500) {
        throw new Error(`Server error loading '${code}'. The CSO API may be temporarily unavailable.`);
      } else {
        throw new Error(`Failed to load table '${code}' (Status: ${resp.status})`);
      }
    }
    
    // Check content type
    const contentType = resp.headers.get('content-type');
    if (!contentType || !contentType.includes('text/csv')) {
      throw new Error(`Table '${code}' returned unexpected format. Expected CSV, got ${contentType || 'unknown'}`);
    }
    
    const csv = await resp.text();
    
    // Check if CSV is empty or invalid
    if (!csv || csv.trim().length === 0) {
      throw new Error(`Table '${code}' is empty or returned no data.`);
    }
    
    statusEl.textContent = `Loading ${code} into DuckDB...`;
    
    const tableName = `px_${code}`;
    await db.registerFileText(`${tableName}.csv`, csv);
    
    // Try to create the table
    try {
      await conn.query(`CREATE OR REPLACE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${tableName}.csv')`);
    } catch (err) {
      throw new Error(`Failed to parse CSV for '${code}'. The data format may be invalid: ${err.message}`);
    }
    
    await updateTablesDropdown();
    dropdown.value = tableName;
    await loadColumnsFor(tableName);
    sqlEl.value = `SELECT * FROM ${tableName} LIMIT 50;`;
    
    // Success message
    statusEl.textContent = `✓ Loaded ${tableName} successfully`;
    statusEl.style.background = "var(--success)";
    statusEl.style.color = "white";
    setTimeout(() => {
      statusEl.style.background = "var(--light)";
      statusEl.style.color = "";
      statusEl.textContent = "Ready";
    }, 1000);
    
  } catch (err) {
    console.error("Load error:", err);
    
    // Show error to user
    statusEl.textContent = `✗ Error: ${err.message}`;
    statusEl.style.background = "var(--danger)";
    statusEl.style.color = "white";
    
    // Keep error visible longer
    setTimeout(() => {
      statusEl.style.background = "var(--light)";
      statusEl.style.color = "";
      statusEl.textContent = "Failed to Load.";
    }, 3000);
  } finally {
    setBusy(false);
  }
}

async function dropSelected() {
  const selected = dropdown.value;
  if (!selected) return;

  if (!confirm(`Permanently remove '${selected}' from memory?`)) return;

  setBusy(true);
  try {
    const isView = dropdown.options[dropdown.selectedIndex].text.includes('📂');
    
    if (isView) {
      await conn.query(`DROP VIEW IF EXISTS "${selected}";`);
    } else {
      await conn.query(`DROP TABLE IF EXISTS "${selected}";`);
    }

    statusEl.textContent = `Removed ${selected}.`;
    await updateTablesDropdown();
    dropdown.value = "";
    columnsList.innerHTML = "";
    document.getElementById('resultTable').innerHTML = '';
    currentTableData = [];
    
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

  const viewName = prompt("Enter a name for this view (e.g., dublin_stats):");
  if (!viewName) return;

  const safeName = viewName.replace(/[^a-z0-9_]/gi, '_').toLowerCase();

  setBusy(true);
  try {
    await conn.query(`CREATE OR REPLACE VIEW ${safeName} AS ${query}`);
    statusEl.textContent = `View '${safeName}' created!`;
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

  const colsA = (await conn.query(`DESCRIBE ${tableA}`)).toArray().map(r => normalizeRow(r).column_name);
  const colsB = (await conn.query(`DESCRIBE ${tableB}`)).toArray().map(r => normalizeRow(r).column_name);

  const common = colsA.filter(value => colsB.includes(value));
  let joinCol = common.length > 0 ? common[0] : "REPLACE_WITH_COLUMN";
  
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
      `<span style="color: var(--danger);">No matching column names found. You'll need to pick the keys manually.</span>`;
  }
}

async function updateJoinDropdowns() {
  const res = await conn.query(`SELECT table_name FROM duckdb_tables() WHERE internal = false`);
  const tables = res.toArray().map(r => normalizeRow(r).table_name);
  
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
  let obj = row instanceof Map ? Object.fromEntries(row) : row;
  for (let key in obj) {
    if (typeof obj[key] === 'Bigint') {
      obj[key] = Number(obj[key]); 
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

  const colsA = (await conn.query(`DESCRIBE ${tableA}`)).toArray().map(r => normalizeRow(r).column_name);
  const colsB = (await conn.query(`DESCRIBE ${tableB}`)).toArray().map(r => normalizeRow(r).column_name);
  const common = colsA.filter(v => colsB.includes(v));

  if (common.length === 0) {
    resultsDiv.innerHTML = `<span style="color: var(--danger);">No common column names found to check.</span>`;
    resultsDiv.classList.remove("hidden");
    return;
  }

  const joinKey = common[0];
  resultsDiv.classList.remove("hidden");
  resultsDiv.innerHTML = "<em>Analyzing keys...</em>";

  try {
    const overlapQuery = `
      WITH keysA AS (SELECT DISTINCT "${joinKey}" as k FROM ${tableA}),
           keysB AS (SELECT DISTINCT "${joinKey}" as k FROM ${tableB})
      SELECT 
        (SELECT COUNT(*) FROM keysA) as totalA,
        (SELECT COUNT(*) FROM keysB) as totalB,
        (SELECT COUNT(*) FROM keysA JOIN keysB ON keysA.k = keysB.k) as matches
    `;
    
    const res = await conn.query(overlapQuery);
    const data = normalizeRow_view(res.toArray()[0]);

    const matches = Number(data.matches);
    const totalA = Number(data.totalA);
    const matchPercent = totalA > 0 ? ((matches / totalA) * 100).toFixed(1) : 0;
    
    resultsDiv.innerHTML = `
      <strong>Key Analysis on [${joinKey}]:</strong><br>
      • Table A has ${data.totalA} unique values.<br>
      • Table B has ${data.totalB} unique values.<br>
      • <span style="color: var(--success);">${data.matches} values match</span> (${matchPercent}% of Table A).
      ${data.matches === 0 ? '<br><span style="color: #ffc107;">⚠ Warning: No matches found. Check for spelling/format differences.</span>' : ''}
    `;
  } catch (err) {
    resultsDiv.innerHTML = `<span style="color: var(--danger);">Analysis error: ${err.message}</span>`;
  }
}

async function checkPendingCodes() {
  const data = await browser.storage.local.get("pendingTableCode");
  if (data.pendingTableCode) {
    document.getElementById("table").value = data.pendingTableCode;
    statusEl.textContent = `Received ${data.pendingTableCode} via right-click.`;
    await browser.storage.local.remove("pendingTableCode");
    loadPxStat(); 
  }
}

// --- Event Listeners ---
loadBtn.onclick = loadPxStat;

runBtn.onclick = async () => {
  const query = sqlEl.value.trim();
  if (!query) {
    statusEl.textContent = "Please enter a SQL query";
    return;
  }
  
  setBusy(true);
  const startTime = performance.now();
  
  try {
    const res = await conn.query(query);
    const endTime = performance.now();
    const executionTime = Math.round(endTime - startTime);
    
    renderTable(res);
    
    const rowCount = currentTableData.length;
    statusEl.textContent = `Query completed: ${rowCount} rows in ${executionTime}ms`;
    
    // Add to history
    addToHistory(query, true, rowCount, executionTime);
    
  } catch (e) { 
    statusEl.textContent = "SQL Error: " + e.message;
    addToHistory(query, false, 0, 0);
  }
  setBusy(false);
};

dropBtn.addEventListener("click", dropSelected);
document.getElementById("saveView").onclick = saveAsView;

catalogBtn.onclick = async () => {
  catalogStatus.textContent = "Fetching...";
  const payload = { 
    jsonrpc: "2.0", 
    method: "PxStat.Data.Cube_API.ReadCollection", 
    params: { language: "en", datefrom: "2024-01-01" } 
  };
  const resp = await fetch("https://ws.cso.ie/public/api.jsonrpc", { 
    method: "POST", 
    body: JSON.stringify(payload) 
  });
  const data = await resp.json();
  fullCatalogItems = data.result.link.item.map(i => ({ 
    id: i.extension.matrix, 
    title: i.label 
  }));
  renderCatalog(fullCatalogItems);
  catalogStatus.textContent = `Loaded ${fullCatalogItems.length} tables.`;
};

catalogSearch.oninput = (e) => {
  const term = e.target.value.toLowerCase();
  renderCatalog(fullCatalogItems.filter(i => 
    i.id.toLowerCase().includes(term) || 
    i.title.toLowerCase().includes(term)
  ));
};

dropdown.onchange = () => { 
  if (dropdown.value) loadColumnsFor(dropdown.value); 
};

sqlEl.onkeydown = (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runBtn.click();
  }
};

document.getElementById("downloadCsv").addEventListener("click", downloadCSV);
document.getElementById("checkOverlap").onclick = checkKeyOverlap;

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === "LOAD_FROM_CONTEXT") {
    document.getElementById("table").value = msg.code;
    loadPxStat();
  }
});

// --- Initialize ---
initTheme();
initHistory();
checkPendingCodes();
await updateTablesDropdown();
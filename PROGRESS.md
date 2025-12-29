# PXStat DuckDB Web App Progress Guide

## Purpose
Build a web app (eventually a browser add-in) that can load PXStat CSO datasets into DuckDB (WASM), run SQL queries on multiple tables, and provide an inventory of all PXStat tables.

## Goals & Aims
1. **Load PXStat data into DuckDB (WASM).**
   - Fetch PXStat tables and ingest them into an in-browser DuckDB instance.
2. **Query tables with SQL.**
   - Provide a UI to run SQL over one or many loaded tables.
3. **Inventory of all PXStat tables.**
   - Build a catalog view of available tables from the PXStat CSO website.
4. **Prepare for browser add-in.**
   - Keep architecture modular for eventual extension integration.

## Milestones
- [ ] Research PXStat API endpoints and data formats.
- [x] Prototype DuckDB WASM loading for a single table.
- [ ] Support multiple table loads and joins.
- [ ] Build table inventory (metadata list + discovery).
- [ ] Basic web UI with SQL editor and results pane (in progress).
- [ ] Document add-in integration approach.

## Current Status
- **Phase:** Planning
- **Progress:** DuckDB WASM single-table load prototype works; UI scaffold in place.

## Results So Far
- DuckDB WASM initializes successfully via fetched worker script.
- Single PXStat table loads into DuckDB from CSV and queries run locally.
- Basic UI includes SQL editor, results grid, and schema/column helpers.

## Issues & Fixes
- **Issue:** DuckDB worker failed to load due to cross-origin restrictions when loading the worker script directly from the CDN.
- **Fix:** Fetch the worker script over HTTP, create a Blob URL, and start the worker from that Blob URL.

## Next Actions
- [ ] Review the CSO Ireland `csodata` R package for API clues: https://github.com/CSOIreland/csodata
- [ ] Identify PXStat endpoints for table listing and dataset retrieval.
- [ ] Decide on data transfer format (JSON/CSV) for ingestion.
- [ ] Harden multi-table load flow and table naming conventions.

## Notes & References
- R package that may contain API clues:
  - https://github.com/CSOIreland/csodata
- PXStat CSO website:
  - https://pxstat.cso.ie/

## Open Questions
- What is the most reliable endpoint for listing all tables?
- Are there rate limits or access constraints?
- What format yields the fastest DuckDB ingestion?

## Change Log
- 2025-09-16: Created initial progress guide.
- 2025-09-16: Marked single-table DuckDB WASM load prototype complete and documented current results.
- 2025-09-16: Noted working DuckDB WASM load + query flow and adjusted next actions.
- 2025-09-16: Documented DuckDB worker CORS issue and the Blob-based worker fix.

# PXStat DuckDB Web App

## Overview
This project aims to build a web app (and eventual browser add-in) that loads PXStat CSO datasets into DuckDB (WASM), enables SQL queries across multiple tables, and provides a discoverable inventory of all PXStat tables.

## Goals
- Load PXStat tables into DuckDB (WASM) in the browser.
- Query one or many tables using SQL.
- Build an inventory/catalog of PXStat tables.
- Keep the architecture modular for future browser extension packaging.

## Roadmap (High Level)
1. Research PXStat API endpoints and data formats.
2. Prototype DuckDB WASM ingestion for a single table.
3. Support multiple table loads and joins.
4. Build a table inventory and metadata view.
5. Create a basic web UI with SQL editor and results pane.

## References
- CSO Ireland `csodata` R package: https://github.com/CSOIreland/csodata
- PXStat CSO website: https://pxstat.cso.ie/

## Status
Initial documentation and planning phase.

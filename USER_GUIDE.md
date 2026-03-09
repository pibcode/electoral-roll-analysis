# Electoral Integrity Monitor v1.0 User Guide

This document explains the app end to end:

- what the app does
- what file types it accepts
- how to load data
- how to review and correct data
- how duplicates work
- how exports work
- how sessions, insights, and token memory work
- how to use the app on mobile

This guide is written for actual use, not for developers.

---

## 1. What This App Is

Electoral Integrity Monitor is a local-first analysis tool for voter-roll Excel files.

It is designed to help you:

- load one or many electoral-roll Excel files
- preserve `AC No`, `AC Name`, and `Part Number`
- inspect voter-level records
- infer religion from elector name and relation name
- manually correct uncertain classifications
- detect duplicate rows and duplicate files
- compare religion, age, gender, status, and part-wise patterns
- export charts, tables, reports, sessions, token packs, and insight datasets

The app is local-first. Most work happens in the browser on your machine.

---

## 2. Core Concepts

### 2.1 Raw Roll Files

These are voter-level Excel files, usually generated from ECI image-based PDFs.

Typical columns:

- `ac_no`
- `ac_name`
- `part_no`
- `serial_no`
- `voter_id`
- `name`
- `relation_type`
- `relation_name`
- `house_no`
- `age`
- `gender`
- `page_no`
- `stamp_type`

These files support full analysis, editing, review, duplicates, and exports.

### 2.2 Session Files

These are used to resume work.

Supported forms:

- `.eimpack`
- session `.xlsx`

A session may include:

- voter rows
- overrides
- loaded file registry
- token overrides
- learned token count
- UI preferences

Use sessions when one person wants to continue another person’s work.

### 2.3 Insight Files

These are compact aggregated datasets exported from the app.

They are meant for:

- low-memory analysis
- charting
- trend comparisons
- sharing part-level evidence

They do not support full voter-level editing.

### 2.4 Token Memory

The religion engine uses a token model.

The app maintains:

- built-in token scores
- user-added tokens
- user-edited token scores
- learned updates from review actions
- suppressed/deleted tokens

This token memory persists in browser storage and can also be exported/imported.

---

## 3. App Structure

After loading data, the main tabs are:

- `Overview`
- `Religion`
- `Age Cohorts`
- `Custom Analytics`
- `Trends & Stats`
- `Booths`
- `Duplicates`
- `Voters`
- `Review`
- `Tokens`
- `Sources`
- `Methodology`

Not every tab is always available.

For example:

- `analysis-only mode` hides voter-level editing tabs
- some heavy chart tabs are gated on small mobile screens

---

## 4. Start Screen

The start screen supports:

- loading voter-roll `.xlsx` files
- importing sessions
- importing insight workbooks
- switching theme
- reading input-preparation instructions

The upload screen also explains how Excel files can be generated from ECI PDFs using Claude AI.

---

## 5. Supported File Types

The app tries to detect file types automatically.

It can distinguish between:

- raw voter-roll workbooks
- filtered/full exported voter workbooks
- session files
- insight workbooks
- token packs

When multiple files are uploaded together, the app shows an upload planner and decides how to merge them.

General rules:

- raw voter-level data is preferred over insight-only overlap
- identical duplicate files are reported
- conflicting coverage is reported in `Sources`

---

## 6. Loading Data

### 6.1 Upload Raw Roll Files

Use `+ Load` or drag files onto the upload area.

The app will:

- read the workbook
- auto-map columns where possible
- preserve unknown columns
- infer `status`
- infer `religion`
- index rows
- register source files

### 6.2 Import Session

Use `Import Session` when resuming work.

This restores:

- voters
- review progress
- duplicate resolutions
- tokens
- source registry
- preferences

### 6.3 Import Insight Workbook

Use this when you want part-level analysis without loading every voter row.

This loads the app in `analysis-only mode`.

### 6.4 Import Token Pack

Use the token controls in `Tokens` to import token memory separately.

Supported:

- CSV
- XLSX
- JSON

---

## 7. Upload Summary and Column Mapping

After upload, the app may show:

- mapped columns
- missing columns
- unknown columns preserved
- warnings

Important fields that should be preserved and reported:

- `AC No`
- `AC Name`
- `Part Number`

These appear in reporting, source tracking, and booth summaries.

---

## 8. Religion Classification

The app’s religion engine uses:

- elector name
- relation name
- learned token scores
- user token overrides
- manual voter override

Possible outputs:

- `Muslim`
- `Hindu`
- `Uncertain`
- `Unknown`

Rules:

- manual override takes priority
- review actions can teach the token engine
- token memory can be exported and reused

---

## 9. Review Queue

The `Review` tab focuses on uncertain or unknown classifications.

You can:

- filter the queue
- search by name, voter ID, relation name
- set religion manually
- bulk mark visible rows
- learn from review actions

Typical statuses shown:

- `Unknown`
- `Uncertain`

Use this tab to correct OCR-related or ambiguous names.

---

## 10. Voter Editing

The `Voters` tab lets you inspect and export filtered voter-level data.

Edits can include:

- name correction
- relation correction
- religion override
- status correction

Status uses canonical options:

- `Active`
- `Under Adjudication`
- `Deleted`

The app normalizes derived fields after edits.

---

## 11. Duplicates

The `Duplicates` tab has two kinds of duplicates:

### 11.1 Duplicate Voter Rows

Grouped by:

- `Part + Voter ID`
- or fallback duplicate key

The app distinguishes:

- auto-resolved exact duplicates
- open duplicates
- manually resolved duplicates

### 11.2 Same-Content Duplicate Files

Grouped by file hash / semantic hash.

These are auto-reported even if identical.

### 11.3 Duplicate Compare Modal

You can open `Compare` and inspect entries:

- side by side
- one after another

The modal now supports:

- differing field summary
- differing field highlighting
- `Keep This, Remove Others`
- `Remove This Record`
- `Keep Newest Import`
- `Keep Oldest Import`
- `Resolve Without Removing`

For file duplicates:

- `Keep This File, Remove Others`
- `Remove This File`
- `Keep Newest Import`
- `Keep Oldest Import`

When rows/files are removed, the duplicate tables recompute automatically.

---

## 12. Booths

The `Booths` tab gives part-wise analysis.

Features include:

- all-booth summary table
- selected booth voter table
- grouped publication-style booth report charts
- export image/workbook options

### 12.1 Multi-Booth Selection

You can select:

- one booth
- many booths
- or none

Behavior:

- default: first booth auto-selected
- if you select multiple booths, the report aggregates over the selected set
- if no booth is selected, no booth report/data block is shown

### 12.2 Booth Report Charts

Current report-style charts include:

- overall religion distribution
- religion of voters under adjudication
- gender of voters under adjudication
- age group of voters under adjudication

Figure settings:

- live height
- 1-column / 2-column layout
- export image through export popup

---

## 13. Overview, Religion, Age, Trends, Custom Analytics

### 13.1 Overview

Shows high-level metrics and key charts.

### 13.2 Religion

Focuses on religion-wise status tables and comparisons.

### 13.3 Age Cohorts

Shows age-wise status and religion patterns.

### 13.4 Trends & Stats

Shows part-wise trend metrics and decomposition-style evidence.

### 13.5 Custom Analytics

Lets you build custom grouped or stacked charts by:

- part
- age group
- gender
- status
- religion

Modes:

- grouped
- stacked
- 100% stacked

The app adds interpretation notes for stacked modes.

---

## 14. Sources

The `Sources` tab exists for provenance and conflict reporting.

It shows:

- raw workbooks loaded
- insight workbooks loaded
- session-derived material
- AC coverage
- part coverage
- row counts
- overlap/conflict summaries

This is important when combining:

- raw roll files
- insight files
- session files

---

## 15. Tokens

The `Tokens` tab manages religion-engine vocabulary.

You can:

- search tokens
- add tokens
- edit token score
- import labeled names XLSX
- export token packs
- import token packs

Export/import formats:

- CSV
- XLSX
- JSON

Token packs include:

- built-in effective scores
- user overrides
- learned scores
- deleted/suppressed tokens when supported by the format

---

## 16. Sessions

The app supports resumable workflows.

### 16.1 Export Session

Use this to preserve work across machines or browsers.

Formats:

- `.eimpack`
- `.xlsx`

### 16.2 Import Session

Use this to resume another person’s work.

The app restores:

- current voters
- source registry
- token memory
- overrides
- duplicate resolutions
- other persisted app state

In practice, the session `.xlsx` can be smaller than `.eimpack` in some workflows.

---

## 17. Insights

The app can export compact insights datasets for low-memory analysis.

Use `Export Insights` when you want:

- part-level analysis
- reduced memory usage
- lighter sharing workflows

Insight mode is useful when you do not need:

- voter editing
- review queue
- row-level duplicate inspection

---

## 18. Exports

There are several export systems in the app.

### 18.1 Chart Export

For charts and chart panels.

Formats:

- PNG
- SVG
- CSV (chart data)

Configurable:

- filename
- title
- subtitle
- footnote
- width
- height
- scale
- background
- header alignment
- timestamp on/off

### 18.2 Table Export

For data tables.

Formats:

- PNG
- SVG
- CSV
- XLSX

Configurable:

- filename
- title
- subtitle
- footnote
- width
- height
- scale
- border style
- background
- timestamp on/off

Table export uses intelligent sizing based on table scroll dimensions.

### 18.3 Report Pack Export

Exports a richer package of:

- charts
- tables
- workbook sheets
- report components

### 18.4 Session Export

Saves resumable state.

### 18.5 Insight Export

Saves compact aggregated analysis datasets.

---

## 19. Resize and Figure Controls

Most charts now support live resize.

Important distinction:

- live resize changes the on-screen figure
- export size controls change the exported artifact

The export dialog uses the current live figure size as its starting point.

Booth report also has a dedicated `Figure Settings` control.

---

## 20. Mobile Use

The app has special mobile behavior.

### 20.1 Header

On phones, the header shows:

- theme button
- `+ Load`
- `More`

Secondary actions are inside `More`.

### 20.2 Filters

On phones:

- search is always visible
- advanced filters are inside a `Filters` drawer/button

### 20.3 Swipe

Swipe tab navigation works on the tab strip only.

This avoids conflicts with:

- wide tables
- wide charts
- horizontal scroll regions

### 20.4 Heavy Charts

On compact screens, some heavy chart areas may be gated or simplified to keep the app stable.

---

## 21. Methodology

The `Methodology` tab documents:

- the classifier logic
- token model notes
- self-mapped cohort notes
- the ECI PDF to Excel workflow using Claude AI
- user-guide style instructions within the app

It also includes copy-ready volunteer material.

---

## 22. ECI PDF to Excel Workflow

The app includes instructions for the external volunteer workflow used to convert image-based ECI PDFs into Excel files.

This uses Claude AI and the app links to:

- ECI electoral roll download page
- Claude web app
- Claude Android app

The app also notes that Claude generation may take roughly:

- `5–15 minutes`

depending on PDF size and queue load.

Contribution addresses shown in the app:

- `wbsir2025@gmail.com`
- `wbsir2026@gmail.com`

---

## 23. Analysis-Only Mode

If you load insight files without full voter rows, the app can run in `analysis-only mode`.

This mode is intended for:

- charts
- part-wise evidence
- low-memory summaries

It does not attempt to offer:

- voter editing
- review queue
- token learning from row-level actions
- full duplicate-row inspection

---

## 24. Local AI Narrative

The app includes a local AI narrative area.

This is designed for local endpoints such as Ollama-like local model APIs.

Use it when you want:

- a text brief
- a local narrative
- no automatic cloud upload from the app itself

You are responsible for the behavior of the endpoint you configure.

---

## 25. Good Working Practices

Recommended workflow:

1. Load raw voter-roll Excel files
2. Check upload summary
3. Review uncertain religion rows
4. Check duplicates
5. Run booth and custom analytics
6. Export report pack
7. Export session
8. Export insights for lightweight sharing if needed

When collaborating:

1. send session file if someone needs full continuation
2. send insight file if they only need analysis
3. send token pack if you want to share improved token learning separately

---

## 26. Important Limits

This app helps structure analysis. It does not make legal conclusions automatically.

Always review:

- data quality
- OCR noise
- duplicate logic
- sampling/coverage issues
- constituency context

Use exported charts and reports responsibly.


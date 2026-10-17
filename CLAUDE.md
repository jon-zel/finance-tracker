# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A personal-tools monorepo of five unrelated, self-contained local apps. The GitHub
remote is named `finance-tracker`, but that is only the largest app — do not assume the
repo is a single project.

| Directory | What it is | Stack |
|---|---|---|
| `finance-tracker/` | Income/expenses/loans/investments tracker | One 8,700-line `index.html`, no build, no server |
| `travel-expenses/` | Per-trip expense tracker | FastAPI + openpyxl backend, static JS frontend |
| `med-tracker/` | Medication intake + missed-dose tracker (EN/HE, dark only) | Single `index.html` + `meds.xlsx` via File System Access API; see its README |
| `countries-visited/` | Visited-countries map | Single `index.html`, `localStorage` only |
| `design-reference/` | Static CSS/image reference assets | Not code |

`DESIGN.md` at the root is an unrelated style reference ("Slash" — a dark fintech theme).
It is **not** the design system either app implements; `finance-tracker`'s visual language
is defined in `finance-tracker-spec.md` §17.

## The Golden Rule (read before touching any save path)

Both trackers store real, irreplaceable personal data in `.xlsx` files with **no backend,
no database, and no cloud backup**. The `.xlsx` is a permanent contract:

- Read columns **by header name**, never by position.
- Never touch rows or columns the app does not own — a user's manually-added column must
  survive a write untouched.
- **Never let "not found" become "empty."** If an expected sheet is missing from a file
  that previously had it, refuse to save rather than writing zero rows over it
  (`finance-tracker/index.html:3171`).
- **Read-modify-write, never blind overwrite.** Every save re-reads the current file from
  disk immediately beforehand and merges into it. Rebuilding a file purely from
  long-lived in-memory state is the bug class that already destroyed this user's loan
  records once, via a stale second browser tab.

This is not theoretical caution — it is a post-incident rule. Treat any code path that can
delete, overwrite, or lose saved data as critical severity even when it is not what you
were asked to look at, and check the sibling app for the same bug whenever you find one.

## finance-tracker

### Running and verifying

There is no build step. To see a change in a real browser:

```bash
cd finance-tracker && python -m http.server 8777   # then drive http://localhost:8777 with Playwright
```

Opening `index.html` via `file://` will not work for testing — the File System Access API
needs an http origin. On first run the app asks for a data folder and creates
`finances.xlsx` there; the user's real ledgers live outside the repo (e.g.
`Desktop/Budget - no traveling/`), and `Desktop/mai - example/` holds a sample copy.

There is no test suite. Verification is done by serving the file and driving it with the
Playwright MCP tools.

### Syntax-checking an edit

`node --check` does not accept `.html`. The entire app is inline `<script>`, so a syntax
error anywhere kills the whole page silently — the browser just renders a dead layout. A
global `PostToolUse` hook (`~/.claude/hooks/html-syntax-check.js`) now parses each inline
block after every edit and reports failures with the line mapped back to the `.html`. To
check by hand, extract the block and parse it with `new vm.Script(...)`.

### Navigating the file

`index.html` is ~8,700 lines and **vendors three minified libraries plus a base64 font
inline**. A naive `grep` for anything generic ("write", "save", "download") matches
hundreds of thousands of characters of vendor blob. Filter by line length — e.g.
`grep -n ... index.html | awk 'length($0)<250'` — or target a known region:

| Lines | Contents |
|---|---|
| 19–852 | `<style>`; line 31 alone is a 51KB base64 woff2 font |
| 1830–2073 | `CONFIGURATION CONSTANTS` — categories, sheet names, `SAVINGS_TARGET_PERCENT`, `SEVERITY_BANDS`, `INVESTMENT_TYPES`, `RETURN_BANDS`, `RATE_DECIMALS` |
| 2080–2104 | vendored SheetJS/XLSX (minified) |
| 2107–2123 | vendored Chart.js v4.5.1 (minified) |
| 2127–2130 | vendored Sortable 1.15.6 (minified) |
| 2135–8722 | `APPLICATION LOGIC` — the entire app, one `<script>` |

Landmarks inside the app block: `WORKBOOK READ / WRITE` at 2672 (the data-safety core),
`STARTUP FLOW` at 3251, `SAVING A NEW ROW` at 3587, `AGGREGATION` at 4835.

### The persistence core

Three functions carry the safety guarantees; changes near them deserve real scrutiny:

- `peekFreshWorkbookState()` (2976) — re-reads the current on-disk file, independent of
  in-memory globals. Returns raw bytes too, so a backup can be cut from the exact content
  about to be replaced.
- `saveWithFreshMerge()` (3114) — the read-modify-write cycle every save goes through.
- `writeRollingBackup()` (3104) — snapshots the previous content to
  `finances.backup.xlsx` before every overwrite. Best-effort by design: a backup that
  cannot be written must never block the actual save.

Nine sheets: `Transactions`, `Loans`, `LoanPayments`, `MonthlyPlan`, `MonthlyPlanCells`,
`MonthlyPlanIncome`, `Investments`, `InvestmentFlows`, `InvestmentValuations`. Sheet
bundles are passed to `buildWorkbookBytesFrom()` (3028) explicitly, and it throws rather
than writing a workbook with the plan or investment bundle absent — so those sheets cannot
be silently dropped from a write.

### Behavioral rules that are easy to break

- `Transactions` is append-only from the UI, with **one exception**: a loan payment and
  its expense row are the same real payment linked by `Payment ID`, so deleting a loan or
  editing its payment also edits/deletes the linked expense row.
- Investments DO write to `Transactions` (§INVEST-LINK). Each deposit/withdrawal and its
  expense/income row are a linked pair sharing a `Flow ID`, created, edited and deleted
  together — the same contract loan payments have. This reverses the earlier "never write"
  rule, at the user's request; do not undo it. Only rows carrying a `Flow ID` are managed
  this way: hand-typed `Investment / Savings Deposit` expenses predating the link are
  unlinked and must be left alone, including when their apparent investment is deleted.
- Investment amounts are **whole numbers only**; expected annual return takes up to 4
  decimals (`RATE_DECIMALS`). Loan interest stays at 2.
- Theme and active tab live in `localStorage` only, never in the workbook.
- The spec (`finance-tracker-spec.md`, rev 2.2) predates the payment ledger, the
  Investments and Monthly Planning tabs, and the four-tab layout. **Where the spec and
  `README.md` disagree, the README reflects the current build.**

## travel-expenses

```bash
cd travel-expenses
./.venv/Scripts/python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000   # Windows
./start.sh          # or start.bat — creates .venv and installs deps on first run
```

Architecture is deliberately thin: `main.py` holds only routes and validation, and
**`excel_io.py` is the only module permitted to touch a trip file**. All frontend/backend
traffic is JSON over relative `/api/*` URLs so this can be hosted later without a rewrite;
`require_auth()` in `main.py` is a stub returning `True` and is the single place real auth
would be switched on.

`excel_io.py` holds a process-wide `_write_lock` across the whole load-modify-save cycle,
not just the save. FastAPI runs these sync handlers in a thread pool, so without it two
requests can both `load_workbook()` before either saves — the same stale-snapshot data-loss
class as the finance-tracker incident. Do not narrow that lock to only the `save()` call.

One trip = one `.xlsx` in `trips/`, named after the trip, with columns `Date`, `Amount`,
`Category`, `Notes`. Sheets are addressed as `worksheets[0]` — never by name. Trip files
and `config/rates_history.json` are gitignored (real personal data).

All tunables live in `config.py`: `BASE_CURRENCY`, `EXCHANGE_RATES`, `CATEGORIES`,
`MONITORED_CATEGORIES`. `MONITORED_CATEGORIES` is validated against `CATEGORIES` at import
time, so a typo raises on startup rather than silently dropping a gauge.

There are **two frontends**. `static/` is the one FastAPI mounts. `static-gsheets/` is an
independent single-file rebuild backed by Google Sheets instead of the Python server,
intended for GitHub Pages; its one-time Google Cloud setup is documented in the comment
block at the top of that file. Editing one does not update the other.

## Conventions across the suite

Every app is a single self-contained HTML file where possible — no bundler, no framework,
no npm install to run anything. The root `package.json` (framer-motion) is vestigial and
not used by any app.

All three apps share the same theme model: an inline `<script>` in `<head>` sets
`data-theme` before first paint to avoid a flash of the wrong theme, defaulting to dark,
with the explicit choice remembered in that app's own `localStorage` key.

Work happens on feature branches named after the feature (`Investments`,
`Monthly_Planning`, `travel-UI-fix`) and merges into `main`.

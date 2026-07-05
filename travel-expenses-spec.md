# Travel Expenses Tracker — Build Specification (Revision 1.0)

## 0. Purpose & audience

Build an application for **tracking expenses during a trip**. This is a sibling to my
existing personal finance tracker, but this one is different in several deliberate ways:

- **Expenses only** — no income, no loans, no savings goals. Every row is money going out.
- **Multiple trips** — one Excel file per trip. The user picks the active trip from a list.
- **A single fixed base currency plus a live conversion rate** — the user can enter an
  expense in another currency, and it's converted to base and stored converted.
- **A visual design given up front** — the "Felt" style tokens (attached as
  `DESIGN-travel-mode.md`) define the entire look and feel. Follow it strictly.
- **A drop-in replacement for the user's current Excel-based workflow** — the DB schema
  matches their existing Excel files exactly, so their existing files migrate in one click.
- **Built as a small local server from day one**, in anticipation of hosting this on the
  web later (see §3, §14). This is a *deliberate architectural choice* different from the
  earlier project.

---

## 1. Overview at a glance

- User launches a small local server (single command, or double-click a start script).
- Server serves an HTML/JS frontend at `http://localhost:8000`.
- Frontend lets the user pick a trip → view its dashboard → add expenses → see charts.
- Data lives in per-trip `.xlsx` files in a `trips/` folder next to the code.
- The `.xlsx` schema is **identical to the user's existing Excel files** so migration is
  literally "drop the file into the `trips/` folder".
- The visual language follows the Felt design system attached in `DESIGN-travel-mode.md`.

---

## 2. ⭐ Golden Rule — the Excel file is a permanent contract

**Same principle as in the personal-finance project.** The `.xlsx` files are effectively our
only backend. A file created by any version of the app must keep working in any other
version, and the user's existing pre-app files must continue to work.

- **Never rename** an existing column header (see §5.2 for the exact locked names).
- **Never remove** an existing column.
- **Never reorder** existing columns.
- **Never change the type or meaning** of an existing column.
- New fields may only be added as **new optional columns at the end**; older files without
  them must still load correctly.
- **Read columns by header name, not by position.** Manual edits, added columns, or column
  reordering in Excel must never break parsing.
- **Preserve unknown / extra columns and rows on write.** Read the sheet, append/edit,
  write back — never discard anything the app didn't create.
- **Rows are append-only from the app** (edit/delete are not features here — see §12).
- **Keep app/UI state OUT of the DB.** Theme, active-trip pointer, exchange rate, etc. live
  in the server config / localStorage, never in the Excel file.

---

## 3. Architecture (chosen for the future web migration)

The user has stated the intent to eventually host this on the internet with a naive
email+password login. **Design for that from day one**, but keep everything runnable
locally right now with zero cloud dependencies.

**Chosen stack:**

- **Backend:** Python + **FastAPI** (small, modern, async-ready, auto Swagger docs at
  `/docs`, and standard patterns for adding auth middleware later).
- **Data access:** `openpyxl` for reading/writing `.xlsx`.
- **Frontend:** plain HTML + vanilla JavaScript + one lightweight charting library
  (**Chart.js**). No build step, no framework. Served as static files by FastAPI itself.
- **HTTP contract:** all data flows over a small JSON REST API (see §11). The frontend
  never touches the filesystem; only the backend does. This is what makes the web
  migration a matter of *hosting* rather than *rewriting*.

**Why not the browser-only approach used in the personal-finance project?** Three reasons
converge to make a backend the right call here (and not there):

1. Web migration is planned → any browser-side logic would need to be rewritten server-side.
2. "One file per trip" is much cleaner when the server can just list the `trips/` folder,
   compared to asking the browser for repeated directory permissions.
3. Email+password login is planned → requires a backend regardless.

**What must be avoided in the code architecture**, to keep the web migration cheap:

- No filesystem I/O in the frontend.
- No hardcoded `localhost` in the frontend; all API calls use relative URLs (`/api/...`).
- Authentication is not implemented yet, but the API layer must be structured so that
  adding a single FastAPI dependency (`Depends(current_user)`) to protect all `/api/*`
  routes later is a one-line change. Concretely: put a single `require_auth` dependency
  stub in place now that returns `True` unconditionally, and apply it to the router now.
  Switching it on later means editing that one function.
- All configuration (exchange rate, currency labels, categories, etc.) lives in a single
  `config.py` at the project root, so a future deployment can override with env vars.

---

## 4. Running the app locally

The user is technical enough to install Python once, but the day-to-day experience should
be a single click.

- **Prerequisite (one time):** Python 3.11+ installed.
- **First run:** double-click `start.bat` (Windows) or `start.sh` (macOS/Linux).
  - The script creates a venv, installs `requirements.txt` if missing, and starts the server.
  - It then opens `http://localhost:8000` in the default browser.
- **Subsequent runs:** same script — it detects the venv exists and just starts the server.
- **Stopping:** close the terminal window, or Ctrl+C.
- Provide a short `README.md` at the project root with these steps and the location of
  the `trips/` folder.

---

## 5. Data model — Excel schema (matches the user's existing files exactly)

### 5.1 File layout

- Trips folder: `./trips/` at the project root.
- One file per trip: `./trips/<Trip Name>.xlsx`.
- The **filename (without extension) IS the trip name.** No trip metadata inside the file.
  Renaming a trip = renaming the file.
- The sheet inside the file is the first sheet (index 0). Do not hard-code a sheet name;
  the user's existing files may use any name.

### 5.2 Columns (locked — must match the user's existing files verbatim)

The first row is headers. Columns, in this order, with these exact English header names:

| Column | Type | Notes |
|---|---|---|
| `Date` | date | Excel date cell. Displayed in the UI in a friendly format. |
| `Amount` | number | Positive. **Stored in the base currency** — see §7 for the conversion rule. Numeric cell (not text). |
| `Category` | text | English, from the fixed list (§6). |
| `Notes` | text | **The only field where non-English (e.g. Hebrew) text is expected and fully supported.** Free text. |

That's the whole schema. No `Type` column, no `Classification` column, no `Currency`
column — this is deliberate, to match the user's existing files exactly and enable
one-click migration.

### 5.3 Migration from the user's existing Excel files

The user's current files have Hebrew category values (e.g. `ארוחות`, `מלון`, `הוצאות חובה`).
The application UI is English (§8), so category values must be English in the file too.

Provide a **one-time migration script** at `scripts/migrate_categories.py` that:
- Takes an input `.xlsx` path and an output path.
- Reads the file, translates known Hebrew category values to their English equivalents
  using a hard-coded mapping table at the top of the script (list below).
- Preserves everything else exactly — `Date`, `Amount`, `Notes` (Notes stays in Hebrew!),
  formatting, extra columns.
- Any unknown category value is left as-is and printed as a warning at the end, so the user
  can fix it manually.
- **Only the `Category` column is translated. Nothing else.**

**Hebrew → English category mapping** (the visible categories in the user's data — extend
this list if the user's actual files contain more):

| Hebrew | English |
|---|---|
| ארוחות | Meals |
| מלון | Lodging |
| תחבורה | Transport |
| טיסות | Flights |
| הוצאות חובה | Essentials |
| פנאי | Leisure |
| בגדים לעצמי | Clothing |
| בגדים | Clothing |
| משיכת מזומן | Cash Withdrawal |
| מתנות לאחרים | Gifts for Others |
| מתנות לעצמי | Gifts for Self |
| פאן | Fun |
| מאי | Category MAI |
| UNKNOWN | Uncategorized |

*(The last three appeared in the sample data. "פאן" / "מאי" seem to be trip-specific
labels; keep them exactly as the user wants them named in English — this table is a
starting point, easy to edit at the top of the migration script.)*

---

## 6. Categories

### 6.1 Base fixed list (English, in the UI and in the file)

`Meals`, `Lodging`, `Transport`, `Flights`, `Essentials`, `Leisure`, `Clothing`,
`Cash Withdrawal`, `Gifts for Others`, `Gifts for Self`, `Fun`, `Category MAI`,
`Uncategorized`

- Kept as an **editable constant `CATEGORIES` at the top of `config.py`** so the user can
  add/remove without hunting through code.

### 6.2 "Monitored" categories (the special-bar feature)

The user marks certain categories as **monitored** — these get their own dedicated gauge/bar
in the dashboard so the user can watch them closely (in the reference screenshots these were
`פאן`, `מאי`, and one more).

- Kept as an editable constant `MONITORED_CATEGORIES` in `config.py` — a subset of
  `CATEGORIES` (values must exist in `CATEGORIES`, validate at startup).
- **No new column in the Excel file** — this is a UI-only distinction, driven entirely by
  `config.py`. This preserves the Golden Rule and keeps the DB schema identical to the
  user's existing files.

---

## 7. Currency, base currency, and conversion

### 7.1 Base currency

- The Excel `Amount` column always stores values **in the base currency** (default `ILS`,
  i.e. shekel). This is a deliberate choice: it keeps historical trip data comparable and
  matches the user's existing files.
- The base currency is a config constant `BASE_CURRENCY` in `config.py` (default `"ILS"`).
- Amounts are shown as **plain numbers with the base-currency symbol/code** (e.g.
  `₪ 1,234.50`). Just the base symbol; no per-row currency label anywhere in the UI.

### 7.2 Live conversion when adding an expense

The user often pays in a foreign currency (euros, yen, etc.) and wants the app to convert
on entry. In the Add Expense form:

- A **currency selector** dropdown next to the Amount input, defaulting to the base currency.
- When the user picks a non-base currency and types an amount, the UI shows the converted
  amount live (e.g. "€ 50.00 = ₪ 195.00 at rate 3.90") before saving.
- On save, **only the converted base-currency amount is written to the Excel file** — the
  foreign amount and the rate are NOT stored in the row. Rationale: preserves the existing
  file schema exactly (Golden Rule), and matches the user's existing habit.

### 7.3 Where rates live

- Rates live **outside** the Excel file, in `config.py` as an editable dict:
  ```python
  EXCHANGE_RATES = {
      "EUR": 3.90,   # 1 EUR = 3.90 ILS
      "USD": 3.65,
      "JPY": 0.024,
      # add as needed
  }
  ```
- The base currency is not in this dict (its rate is implicitly 1).

### 7.4 Rate history — separate from the trip file

The user noted rates can change mid-trip and wanted history preserved **without** touching
the trip file. Store rate history in `./config/rates_history.json`:

```json
[
  {"date": "2026-05-01", "currency": "EUR", "rate": 3.90},
  {"date": "2026-06-15", "currency": "EUR", "rate": 3.95}
]
```

- Whenever `EXCHANGE_RATES` is edited and the server restarts, append a snapshot of any
  changed rate with today's date.
- The trip files themselves are **never** touched — Golden Rule preserved.
- A small "Rate history" view in the UI (§9.7) reads this file so the user can audit which
  rate applied when, without polluting the trip files.

---

## 8. Language & internationalization

- **UI language: English.** All labels, buttons, headings, tooltips, aria-labels.
- **Categories: English** (§6.1) — matches the migrated Excel files.
- **The `Notes` column supports any language, especially Hebrew.** Rendering must handle
  RTL text correctly inside notes cells and tooltips: use `dir="auto"` on the notes
  container so mixed LTR/RTL notes display naturally. Do not force a global `dir` on the
  page.

---

## 9. UI — screen layout

Single page. Follows the Felt design system in `DESIGN-travel-mode.md` (§13). Top to
bottom:

### 9.1 Header
- App wordmark on the left (GT Alpina Standard serif, `--color-bone-white`).
- On the right: the **active trip selector** (§9.2) and the "+ Add Expense" button (amber
  compass CTA styling per the design system).

### 9.2 Active trip selector
- A dropdown listing every `.xlsx` file in `./trips/` (by name, sans extension).
- A "**+ New trip**" entry at the bottom that opens a small modal asking for a name,
  then creates `./trips/<name>.xlsx` with just the header row and switches to it.
- The active-trip choice persists **in localStorage** (§2 — never in the file).
- All sections below (summary, charts, list) reflect the active trip.

### 9.3 Time range selector
- Options: **All trip** (default), **This week**, **Last 7 days**, **Custom** (from/to
  dates). Note: "This month" is less meaningful for a trip; keep the options trip-centric.
- Drives every card, chart, gauge, and the expense list below.

### 9.4 Summary card
- One big number: **Total spent** for the selected range.
- Below it, secondary line: number of expenses in the range and average per day (total ÷
  number of days in the range).

### 9.5 Monitored categories gauges
- One gauge per category in `MONITORED_CATEGORIES` (§6.2), rendered as compact horizontal
  bars or arc gauges, side by side (matching the reference screenshot's stacked mini
  gauges on the right).
- Each gauge shows the category name, its total spend for the selected range as a large
  number, and a scale from 0 to the largest per-category total across the whole trip
  (so a monitored category can be visually compared to its own historical peak).
- Uses `--color-amber-compass` sparingly as the filled portion of the gauge, per the Felt
  design system's "single warm accent" discipline.

### 9.6 Charts
Three charts, styled per §13 (dark Moss Canvas backgrounds, light content on `--color-fern`
cards where appropriate, amber accent used only as a highlight):

- **Spend over time by category** — one line per category, x-axis = date. This is the main
  chart from the reference screenshot. Legend is a wrapping row of small badges; clicking a
  legend entry toggles that category on/off.
- **Total spend over time** — single line, total across all categories per day. This is the
  bottom-left chart from the reference. Filled area under the line in amber at low opacity
  for visual weight.
- **Spend by category — donut** — a donut chart of the range totals by category, with a
  clear legend showing category, absolute amount, and percentage. Mirrors the reference
  screenshot's pie on the bottom right, but rendered as a **donut** (see §13.2 — no true
  pie shapes, to align with the design system's editorial rhythm and readable center label
  showing the range total).

### 9.7 Expense list
- Table of expenses in the selected range, newest first.
- Columns: Date, Amount (base currency), Category, Notes.
- **Notes column uses `dir="auto"`** so Hebrew (or any other RTL) text displays correctly
  (§8).
- Read-only, matching the personal-finance project — edits are done in Excel (§12).

### 9.8 Rate history footer link
- Small link in the footer: "Exchange rate history" → opens a modal reading
  `config/rates_history.json` (§7.4) as a simple table (date, currency, rate). Purely for
  audit; not editable from the UI.

---

## 10. Add Expense flow

The primary interaction. Modal dialog, opened by the "+ Add Expense" button:

| Field | Control | Notes |
|---|---|---|
| Date | date picker | Defaults to **today**. Always editable. |
| Category | dropdown | From `CATEGORIES` (§6.1). Required. |
| Currency | dropdown | Base currency (default) or any key in `EXCHANGE_RATES`. |
| Amount | number input | Positive, up to 2 decimals. Required. Interpreted in the chosen currency. |
| Notes | text input | Optional. RTL-friendly (`dir="auto"`). |

**Live conversion display (§7.2):** if a non-base currency is chosen, immediately below
the Amount field show a line like `€ 50.00 → ₪ 195.00 (rate 3.90)`. Recompute on every
keystroke and every currency change.

**Divide helper** (same idea as the personal-finance project): a small "Divide" button
next to Amount opens an inline mini-panel with `Total ÷ Divide by = Result`. The result
is what fills the Amount input. Divide-by must be > 0.

**Save behavior:**
- Convert the amount to base currency using the current rate for the chosen currency.
- POST the row to the backend, which appends it to the active trip's Excel file per §5,
  preserving any extra columns/rows the app doesn't know about (Golden Rule).
- The row written contains only: `Date`, `Amount` (converted to base), `Category`, `Notes`.
- On success: close the modal, refresh the dashboard, and briefly highlight the new row in
  the list.

Guardrails: Amount and Divide-by must be > 0; block save otherwise with an inline message.

---

## 11. HTTP API contract

All frontend ↔ backend communication is JSON over relative URLs. This is the same contract
the future hosted version will use — no code changes needed there beyond enabling auth.

```
GET  /api/trips
     → { "trips": ["Greece 2026", "Japan 2025"] }

POST /api/trips
     { "name": "Portugal 2027" }
     → { "name": "Portugal 2027" }   # 201 on create, 409 on duplicate

GET  /api/trips/{name}/expenses
     → { "expenses": [
           { "date": "2026-03-20", "amount": 277,
             "category": "Lodging", "notes": "מלון עם בר" },
           ...
       ] }

POST /api/trips/{name}/expenses
     { "date": "2026-03-20", "amount_base": 277,
       "category": "Lodging", "notes": "מלון עם בר" }
     → { "ok": true }

GET  /api/config
     → { "base_currency": "ILS",
         "exchange_rates": { "EUR": 3.90, "USD": 3.65 },
         "categories": ["Meals", "Lodging", ...],
         "monitored_categories": ["Fun", "Category MAI", ...] }

GET  /api/rates/history
     → { "history": [ {"date":"2026-05-01","currency":"EUR","rate":3.90}, ... ] }
```

- Every route is wrapped in the `require_auth` dependency stub (§3), which returns True
  today and will enforce a login later.
- Errors return standard JSON: `{ "error": "message" }` with the right HTTP status.
- Conversion from a foreign currency is done **on the frontend** (using rates from
  `/api/config`) and posted as `amount_base`. The backend does not re-convert — this keeps
  the source of truth for the conversion event visible to the user at write time.

---

## 12. Non-goals (out of scope for now)

- No editing or deleting expenses from the app UI (matches the personal-finance project;
  the user edits Excel directly if needed).
- No income tracking, no loans module, no savings goals.
- No authentication yet (but the code is structured to enable it as a one-line change, §3).
- No multi-user data separation (again, one-line change when auth arrives).
- No cloud sync or external integrations.
- No per-expense currency stored — the file stores base currency only (§5.2, §7.2).

---

## 13. Visual design — the Felt style

**Follow `DESIGN-travel-mode.md` strictly.** That file is the source of truth for every
color, font, radius, spacing value, and component pattern. Do not invent new tokens or
introduce colors outside its palette. Concretely:

### 13.1 What to import from the design file (verbatim)
- **Colors** — inject all CSS custom properties from the "Quick Start → CSS Custom
  Properties" block into `:root` at the top of the stylesheet.
- **Typography scale, weights, spacing, radii, shadow** — all as CSS variables.

### 13.2 How to apply them here
- **Page canvas:** `--color-moss-canvas`. Never black.
- **Cards / elevated panels:** `--color-fern` for primary cards, `--color-lichen` only for
  subtle borders/dividers. **Elevation via color-stepping, not shadow stacks** — the
  design file is emphatic about this.
- **Card radius: 6px.** Buttons pill-radius 20px. Nothing above 6px on cards/images.
- **Serif for hero/section headings:** GT Alpina Standard, weight 300, tight line-height
  (< 1.0), negative letter-spacing per the type scale. Substitutes if the font isn't
  available: Fraunces / Tiempos Headline / Playfair Display.
- **Sans for everything else:** Atlas Grotesk (substitutes: Inter / Söhne / Helvetica
  Neue), weight 400 for body, weight 500 for buttons and small caps navigation labels.
- **Amber (`--color-amber-compass`) is the only accent.** Use it for: the primary CTA
  ("+ Add Expense"), the map-marker-style highlight on the currently active trip in the
  selector, and the filled portion of monitored-category gauges. **Never** for body
  backgrounds, chart fills at high opacity, or as a page-scale color wash.
- **Numbers** in tabular-figures for alignment in the summary and the list.
- **Layout:** centered, magazine-style, `--page-max-width: 1200px`, `--section-gap: 80px`.
- **Chart styling:** apply the palette meaningfully. Category lines can use tints of green
  from the palette (`--color-fern`, `--color-lichen`) with **amber** used for the currently
  hovered/highlighted line only. The total-spend area chart uses a low-opacity amber fill.
  The donut is single-color-per-slice using palette tints, with the currently hovered
  slice tinted amber. No introducing new hues.
- **Do not** create pies; the donut per §9.6 is the correct form here.

### 13.3 Do's and Don'ts (from the design file — reproduced for emphasis)
- Do use elevation-by-color-stepping, not shadow stacks.
- Do use amber exclusively for accent moments.
- Don't use `#000000` as page background.
- Don't apply multiple shadow layers.
- Don't use border-radius above 6px on cards.
- Don't introduce new accent hues — the palette is green monochrome + one amber.

---

## 14. Preparing for the future web hosting (concrete checklist)

The user will later host this on the internet with a simple email+password login. Every
item below is small work now that saves a rewrite later.

- All frontend URLs are relative (`/api/...`), never `http://localhost:8000/...`.
- No secrets in the frontend. `config.py` on the server holds everything sensitive.
- A `require_auth` FastAPI dependency exists today and returns True. It is already applied
  to every `/api/*` route. Flipping the switch later means changing this one function's
  body to actually check a session.
- `config.py` reads sensitive values (future `USERS`, `SESSION_SECRET`) from environment
  variables when present, with local defaults for dev. Add commented placeholders now:
  ```python
  # Future:
  # USERS = json.loads(os.environ.get("USERS_JSON", '{"me@example.com": "hunter2"}'))
  # SESSION_SECRET = os.environ["SESSION_SECRET"]
  ```
- CORS is not needed today (same-origin), but leave a commented example in the FastAPI app
  setup showing the exact call to add later if the frontend is ever served from a
  different origin.
- Trip files live under `./trips/`, and the path is a config constant so it can be pointed
  at a mounted volume in a deployment.

---

## 15. Configuration constants (at the top of `config.py`)

Expose these as clearly named constants:

- `BASE_CURRENCY` — default `"ILS"`.
- `BASE_CURRENCY_SYMBOL` — default `"₪"`.
- `EXCHANGE_RATES` — dict of code → rate to base (§7.3).
- `TRIPS_DIR` — default `"./trips"`.
- `CATEGORIES` — list (§6.1).
- `MONITORED_CATEGORIES` — subset of `CATEGORIES` (§6.2).
- `RATES_HISTORY_PATH` — default `"./config/rates_history.json"`.
- `DEFAULT_TIME_RANGE` — default `"All trip"`.
- Future auth placeholders per §14.

---

## 16. Acceptance criteria / test scenarios

1. **First run:** `start.sh` / `start.bat` sets up the venv, starts the server, opens
   the browser at `http://localhost:8000` showing an empty state (no trips yet) with a
   "+ New trip" button.
2. **New trip:** creating "Greece 2026" produces `./trips/Greece 2026.xlsx` with just the
   four locked headers `Date, Amount, Category, Notes` and switches to it.
3. **Migration script:** running `python scripts/migrate_categories.py <old>.xlsx <new>.xlsx`
   on a real user file produces an output file where Hebrew categories are English,
   Notes are unchanged (still Hebrew), and the exact column order is preserved. Any
   unknown category prints a warning at the end and is left untouched.
4. **Drop-in migration:** placing a migrated `.xlsx` into `./trips/` makes it appear in
   the selector; opening it loads all rows and renders all charts correctly.
5. **Add expense in base currency:** amount 100, category Meals, saved → row appears in
   the Excel file exactly as `<today>, 100, Meals, ""` (blank notes) and the dashboard
   updates.
6. **Add expense with conversion:** amount 50 EUR at rate 3.90 → live UI shows `€ 50.00 →
   ₪ 195.00`; on save, the file gets `<today>, 195, Meals, ""` — no currency stored per row.
7. **Divide helper:** total 2000 ÷ 4 → Amount becomes 500 → saved as 500.
8. **Golden Rule preserved:** opening an existing file with an extra unknown column (e.g.
   `Tag`) still loads; adding a row via the API preserves that `Tag` column and any values
   already in it.
9. **Monitored categories:** with `MONITORED_CATEGORIES = ["Fun", "Category MAI"]`, the
   dashboard shows a dedicated gauge for each in the top-right area, matching the design
   system's amber-accent treatment; changing the config and restarting reflects the change.
10. **Notes RTL:** a row whose Notes is Hebrew (e.g. `מלון עם בר`) displays right-aligned
    inside the notes cell without affecting the surrounding LTR layout.
11. **Rate history:** editing `EXCHANGE_RATES["EUR"]` from 3.90 to 3.95 and restarting
    appends a new entry to `rates_history.json` with today's date; the trip files are
    unchanged; the footer link's modal shows both entries.
12. **Charts:** the three charts (spend-over-time by category, total spend over time,
    category donut) all use only palette colors and amber for accent, and correctly
    refresh when the time range or trip changes.
13. **Design fidelity:** the running app matches `DESIGN-travel-mode.md` — Moss Canvas
    background, Fern cards, no shadow stacks, no radius > 6px on cards, GT Alpina Standard
    (or substitute) serif for hero/section headings, amber used only for accents. No new
    colors introduced.
14. **Web-migration readiness:** grepping the frontend finds zero occurrences of
    `localhost`; every `/api/*` route in the backend has `require_auth` applied; flipping
    the body of `require_auth` to raise 401 blocks all API calls.
15. **Language:** every UI string is English; the categories are English; only the Notes
    field and its rendered values contain non-English text.

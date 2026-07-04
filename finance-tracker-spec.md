# Personal Finance Tracker — Build Specification (Revision 1.3)

## 0. Purpose & audience

Build a **single, self-contained HTML file** that lets a person track income and
expenses. The finished product will be handed to a **non-technical user**, so the
overriding design principle is: **dead simple, obvious, and impossible to break.**

- No installation, no backend, no server, no Python.
- The user double-clicks one file, it opens in the browser, and it just works.
- The "database" is a real **Excel (`.xlsx`) file** stored locally on the user's machine.

---

## 1. What's new in this revision

The app already exists and I'm happy with it — this is an **incremental update**. Read the
whole file, but do **not** regress anything that already works.

**Already in place (revision 1.1–1.2) — keep exactly as-is:**
- Golden Rule / DB compatibility (§2) — still the highest-priority rule.
- Light / dark mode toggle (§10).
- "Mom Bills" expense category (§8.1).
- The "calm modern fintech" visual design (§17).
- Savings-goal side panel (§21).

**New in revision 1.3 — the only thing to add now:**
- Two more expense categories (§8.1): **"Subscriptions"** and **"Sister Bills"**. Same pattern
  as "Mom Bills" — plain additions to the fixed category list, no DB structure change
  (Golden Rule fully preserved).

Everything not mentioned here stays exactly as it already is.

---

## 2. ⭐ Golden Rule — the Excel file is a permanent contract

**This is the most important rule in this document.** The `.xlsx` file is effectively our
**only backend**. A file created by **any** version of the app must keep working in **any**
other version. The database structure must **never** break — ever.

Concretely, and permanently:

- **Never rename** an existing column header.
- **Never remove** an existing column.
- **Never reorder** existing columns.
- **Never change the type or meaning** of an existing column.
- New fields may only be **added as new columns at the end**, and must be **optional** —
  the app must work correctly when they are absent (i.e. when opening older files).
- **Read columns by header name, not by position.** Locate each field by its header
  string so that manual edits, added columns, or reordering in Excel never break parsing.
- **Tolerate missing newer columns** on read (treat them as blank / default).
- **Preserve unknown / extra columns and rows** on write. Read the existing sheet, append,
  and write it back **without discarding anything** the app didn't create.
- **Rows are append-only.** Never rewrite, reorder, or delete existing rows.
- **Keep app/UI state OUT of the DB.** Things like the theme preference live in the
  browser (localStorage) — **never** in the Excel file. The DB holds transaction records only.
- If a schema version marker is ever genuinely needed in the future, put it in a
  **separate metadata sheet** — never by altering the `Transactions` sheet's columns.

**Result:** any file opens correctly in any version; cross-version compatibility never breaks.

---

## 3. Product summary

A **single-screen** dashboard that:

1. Shows income vs. expenses over a selected time range (chart).
2. Shows category breakdowns for expenses and for income (charts).
3. Shows a special breakdown of expenses by **classification**: Regular, Loan, Investment/Savings.
4. Lets the user **add** a new expense or a new income entry.
5. Reads previous history back from the Excel file and displays it.

There is **no edit or delete inside the app**. If the user needs to change or remove a
record, they open the Excel file directly. This is intentional.

---

## 4. Hard constraints & target platform

| Constraint | Requirement |
|---|---|
| Delivery | **One self-contained `index.html`** file. All JS/CSS **inlined**. No external CDN calls — it must work **fully offline**. |
| Backend | **None.** All logic runs in the browser (vanilla JS). |
| Install | **None.** Double-click the file → opens in browser. |
| OS | Works identically on **Windows and macOS**. |
| Browser | Primary target **Chrome / Edge** (needed for writing to the local file). Graceful fallback for Safari/Firefox (see §7.4). |
| Language | **UI in English**, left-to-right. |
| Database | Local **`.xlsx`** file (see §6, §7), governed by the Golden Rule (§2). |

> Vendoring note: embed the two libraries (SheetJS and a charting lib) **inline** inside
> `index.html` so there are zero network dependencies. If a single file becomes unwieldy,
> an acceptable fallback is one folder containing `index.html` plus a local `/lib` folder —
> but the strong preference is a single file.

---

## 5. Tech stack

- **HTML + CSS + vanilla JavaScript** (no build step, no framework required).
- **SheetJS (xlsx)** — read and write `.xlsx` entirely in the browser. Embed inline.
- **Chart.js** (or equivalent lightweight lib) — render the charts. Embed inline.
- **File System Access API** — read/write the real local Excel file (see §7).

---

## 6. Data model (Excel schema)

A single worksheet named **`Transactions`**. First row = headers. Columns, in order:

| Column | Type | Values / Notes |
|---|---|---|
| `Date` | date | Stored as ISO `YYYY-MM-DD` for reliable sorting/parsing. Displayed in a friendly format in the UI. |
| `Type` | text | `Income` or `Expense`. |
| `Category` | text | One value from the fixed category list for that type (see §8). |
| `Classification` | text | For expenses: `Regular`, `Loan`, or `Investment`. For income: leave blank / `—`. |
| `Amount` | number | Positive number, 2 decimals. Stored as a numeric cell (not text). |
| `Description` | text | Optional free text. |

Rules:
- **This schema is governed by the Golden Rule (§2)** — match by header name, additive-only,
  never break it.
- New entries are **appended** as a new row.
- On load, **all rows are read** and used to populate the dashboard and the history table.
- The app never rewrites/reorders existing rows (append-only), so the file stays friendly
  to manual editing in Excel.

---

## 7. File storage & lifecycle (the important part)

Because a browser cannot silently create a file on disk, the flow is designed around a
**one-time folder choice**, after which everything is seamless.

### 7.1 First run (no file linked yet)
1. Show a friendly welcome/empty state with one primary button: **"Choose data folder"**.
2. On click, call `showDirectoryPicker()` → user selects the folder where the data should
   live (ideally the same folder as `index.html`).
3. In that folder, create `finances.xlsx` via `getFileHandle('finances.xlsx', { create: true })`,
   write an empty workbook with the header row (§6), and immediately show the (empty) dashboard.
4. Persist the **directory handle** in IndexedDB so it can be reused on future runs.

### 7.2 Subsequent runs
1. On startup, retrieve the saved directory handle from IndexedDB.
2. Call `queryPermission` / `requestPermission`. If granted, open `finances.xlsx`, read all
   rows, and render the dashboard **automatically**.
3. If the handle can't be restored or permission is denied, show an **"Open data folder"**
   button so the user re-links with a single click. (Never crash; always offer this path.)
4. If `finances.xlsx` doesn't exist in the chosen folder, recreate it with headers.

### 7.3 Saving a new entry
1. Read current workbook → append the new row → write the workbook back to the **same file**
   using `fileHandle.createWritable()`.
2. Preserve any existing columns/rows/data (Golden Rule, §2). Refresh the dashboard and
   history table from the updated data.

### 7.4 Fallback for unsupported browsers (Safari / Firefox)
Feature-detect `window.showDirectoryPicker`. If missing:
- **Load:** show an **"Import Excel file"** button (standard `<input type="file">`) so the
  user can load their existing `finances.xlsx`.
- **Save:** after each add, regenerate the workbook and trigger a **download** of the updated
  `finances.xlsx` (Blob + anchor).
- Show a non-blocking notice: *"For automatic saving to the same file, open this app in
  Chrome or Edge."*
- This guarantees no data is ever lost, even on unsupported browsers.

### 7.5 Notes for the implementer
- `file://` is a secure context in Chromium, so the File System Access API works from a
  double-clicked local file in Chrome/Edge. Handle permission re-prompts gracefully.
- Wrap all file operations in try/catch with clear, human-readable error messages
  (e.g., *"Couldn't open your finances file — click 'Open data folder' to reconnect."*).

---

## 8. Categories & classification

### 8.1 Expense categories (fixed list)
`Food & Groceries`, `Restaurants & Cafés`, `Housing (Rent/Mortgage)`, `Bills & Utilities`,
`Mom Bills`, `Sister Bills`, `Subscriptions`, `Transportation`, `Health`, `Insurance`,
`Education`, `Leisure & Entertainment`, `Shopping & Clothing`, `Other`

*(New in this revision: **`Mom Bills`** (1.1), and now **`Sister Bills`** and
**`Subscriptions`** (1.3), placed near `Bills & Utilities`. `Subscriptions` is for recurring
services — streaming, cloud storage, gym, etc. — so they can be tracked as a group instead of
scattering across other categories.)*

### 8.2 Income categories (fixed list)
`Salary`, `Freelance / Self-employment`, `Bonus`, `Refunds`, `Rental income`,
`Investment / Interest income`, `Gifts`, `Other`

### 8.3 Expense classification (separate dimension)
Every **expense** also carries a **Classification**, chosen in the add-expense form. This is
independent of the category (e.g., a mortgage payment is category *Housing* **and**
classification *Loan*).

- **Regular** — ordinary spending/consumption. *(Default.)*
- **Loan** — loan/debt repayment. **Treated as the most severe** — must be visually
  emphasized on the dashboard (e.g., red / warning styling).
- **Investment** — a deposit into a capital-market fund, savings fund, or deposit ("pikadon").
  Money set aside, not consumed. Styled distinctly (calm/positive tone).

Income entries have **no classification** (leave blank / `—`).

> Keep all three lists (§8.1–§8.3) as **editable constants at the top of the file** so a
> non-technical owner can adjust them later without hunting through the code.

---

## 9. Screen layout (single screen)

One clean, uncluttered screen. On wide screens, use a **main content column** plus a
**narrow side panel** — the savings-goal panel (§21) — docked to the side; on narrow screens
the side panel stacks with the rest of the content. The main column, top-to-bottom:

1. **Header** — app title, a **theme toggle** (light/dark, §10), and two prominent buttons:
   **"+ Add Expense"** and **"+ Add Income"**.
2. **Time range selector** — options: **This Month** (default), **Last Month**, **This Year**,
   **Custom** (reveals a *from* date and *to* date). All charts, cards, and the table respond
   to this selection.
3. **Summary cards** — three cards:
   - **Total Income** (for the range)
   - **Total Expenses** (for the range)
   - **Net Balance** = Income − Expenses (green if ≥ 0, red if < 0)
4. **Expense classification breakdown** — a panel showing, for the range, how expenses split
   across **Regular / Loan / Investment** (amount + % of total expenses). **Loan is emphasized
   as most severe** (warning color). Consider a horizontal stacked bar plus the three figures.
5. **Chart — Income vs. Expenses over time** — grouped bar chart (two series). Granularity
   auto-selected by range span (see §13.1).
6. **Chart — Expenses by category** — donut chart (range-filtered).
7. **Chart — Income by category** — donut chart (range-filtered).
8. **History table** — range-filtered transactions, newest first. Columns: Date, Type,
   Category, Classification, Amount, Description. **Read-only.** Include a subtle note:
   *"To edit or delete an entry, open the Excel file directly."*

---

## 10. Theme: light / dark mode

- Add a **theme toggle** in the header (a sun/moon-style switch) — clearly visible but not dominant.
- **Behavior:** on first load, default to the OS setting (`prefers-color-scheme`). The toggle
  switches Light ⇄ Dark, and the user's choice is **remembered** for next time.
- **Persistence:** store the preference in **localStorage** (fine for a locally-run file).
  **Never** store it in the Excel file (Golden Rule, §2).
- **Implementation:** use CSS variables/tokens. Define the neutral surface/text/border colors
  as variables and swap them for dark mode. The **semantic accents (blue/green/red) keep the
  same identity in both modes**, adjusted only as needed for contrast on dark backgrounds
  (keep them WCAG-legible).
- **Dark mode must stay serious:** deep neutral slate backgrounds (not pure black), with the
  same disciplined accent usage as light mode.
- The transition between modes should be **smooth** (see §17 motion).

---

## 11. Add Expense flow

Clicking **"+ Add Expense"** opens a modal dialog with these fields:

| Field | Control | Notes |
|---|---|---|
| Date | date picker | **Defaults to today.** Always editable. |
| Category | dropdown | From the fixed **expense** list (§8.1). Required. |
| Classification | dropdown | `Regular` (default) / `Loan` / `Investment`. Required. |
| Amount | number input | Positive, up to 2 decimals. Required. |
| Description | text input | Optional. |

Buttons: **Cancel** and **Save**. On Save → append row (`Type = Expense`) per §6, §7.3, close
the modal, refresh dashboard + table.

### 11.1 The "Divide" helper (inside Add Expense)
Next to the **Amount** field, a small **"Divide"** button/link.

- Clicking it reveals an inline mini-panel with two inputs and a live result:
  **`Total`** ÷ **`Divide by`** = **`Result`** (computed, read-only).
- The computed result = `Total / DivideBy`, **rounded to 2 decimals**.
- Applying it **sets the Amount field to the Result**, which is what gets saved.
- The user can still edit the Amount manually afterward.

**Worked example:** Electricity bill is 2000, split 4 ways → user enters Total `2000`,
Divide by `4` → Result `500` → Amount becomes `500` → saved to the file as
`Expense · Bills & Utilities · 500`.

Guardrails: if `Divide by` is empty or `0`, show an inline message and don't compute (never
write `Infinity`/`NaN`).

> Divide is an **expense-only** helper (as specified). It is trivial to extend to income later.

---

## 12. Add Income flow

Clicking **"+ Add Income"** opens a modal dialog:

| Field | Control | Notes |
|---|---|---|
| Date | date picker | **Defaults to today.** Always editable. |
| Category | dropdown | From the fixed **income** list (§8.2). Required. |
| Amount | number input | Positive, up to 2 decimals. Required. |
| Description | text input | Optional. |

No Classification field, no Divide button. On Save → append row (`Type = Income`,
`Classification` blank) per §6, §7.3, refresh dashboard + table.

---

## 13. Charts & calculations

All figures are computed from the rows **within the selected time range**.

### 13.1 Income vs. Expenses over time (grouped bar)
- Two series per time bucket: total Income and total Expenses.
- Bucket granularity by range span:
  - span ≤ ~62 days → **daily** buckets
  - span ≤ ~24 months → **monthly** buckets
  - larger → **yearly** buckets
- (This Month / Last Month → daily; This Year → monthly.)

### 13.2 Expenses by category (donut)
- Sum of `Amount` grouped by `Category` for `Type = Expense`.

### 13.3 Income by category (donut)
- Sum of `Amount` grouped by `Category` for `Type = Income`.

### 13.4 Classification breakdown (panel in §9.4)
- Sum of expense `Amount` grouped by `Classification` (Regular / Loan / Investment), each
  with its share of total expenses.

### 13.5 Summary numbers
- Total Income = Σ Income amounts in range.
- Total Expenses = Σ Expense amounts in range.
- Net Balance = Total Income − Total Expenses.

### 13.6 Savings goal (feeds the side panel, §21)
- **Saved (this range)** = Σ `Amount` where `Type = Expense` and `Classification = Investment`.
- **Target (this range)** = `SAVINGS_TARGET_PERCENT`% of Total Income in the range (default 10%).
- **Progress %** = Saved ÷ Target × 100. Guard `Target = 0` → show 0% / neutral state (never
  divide by zero).
- **Total saved to date** (optional secondary figure) = Σ `Investment` amounts across the
  **whole file**, ignoring the range.

> Amounts include the **loan** and **investment** classifications as expenses (they are
> outflows). The classification panel is what tells the user how "severe" vs. "wealth-building"
> their outflows are — surface this clearly.

---

## 14. Validation & edge cases

- **Amount** must be numeric and **> 0**; block save otherwise with an inline message.
- **Category** and **Date** are required.
- **Divide by** must be **> 0**.
- **No currency symbol:** amounts are shown as **plain, unit-less numbers** — no `₪`, `$`, or
  any currency sign anywhere in the app. The number is intentionally just a number; each user
  knows their own currency. Thousands separators for readability are fine (e.g. `2,000`); a
  currency symbol is not.
- **Empty state (no file linked):** show the "Choose data folder" welcome (§7.1).
- **File linked but no rows:** friendly message *"No transactions yet — add your first one
  above."* Charts show an empty/neutral state rather than breaking.
- **Unsupported browser:** fallback per §7.4, with a clear notice.
- **File/permission errors:** never crash; always offer a one-click "Open data folder".

---

## 15. Non-goals (explicitly out of scope)

- Editing or deleting entries inside the app (done only in Excel directly).
- Multiple users / accounts / login.
- Recurring transactions.
- Currency conversion or multi-currency (there is no currency at all — just numbers).
- Cloud sync. (The file is purely local.)

---

## 16. Browser limitations to surface in the app

Add a small, friendly **first-run notice** and a runtime check:

- If the browser supports the File System Access API (Chrome/Edge): proceed normally.
- If not (Safari/Firefox): show *"You're in [browser]. The app works, but for automatic saving
  to the same file, use Chrome or Edge. Otherwise, saving will download an updated copy of your
  file."*

Keep the wording plain and non-alarming — the audience is non-technical.

---

## 17. Visual design direction (recommended)

**The problem:** right now the app feels flat and a bit lifeless. **The goal:** make it feel
**alive, polished, and intentional** while staying **serious and trustworthy** — it's a
money-management tool. **Keep the existing color choices** (blue, green, red) and do **not**
make it more colorful. The "life" should come from **hierarchy, depth, typography, and subtle
motion** — not from adding hues.

**Recommended style: "calm modern fintech."** Reference points: the dashboards of Stripe,
Linear, and Mercury — neutral-dominant, spacious, crafted, confident with numbers, disciplined
with color. This direction is recommended precisely because it satisfies "alive but serious,
keep the palette, not too colorful."

Concrete guidance:

**Color usage (keep existing hues, use with discipline)**
- Keep: **blue = primary/interactive accent and neutral data**, **green = income / positive /
  positive balance**, **red = expense / negative / and the "Loan" severe emphasis**.
- Investment classification: a **calm** tone drawn from the existing palette (e.g. a muted
  teal/blue or muted green) — not a loud new color.
- Surfaces are mostly **neutral grays** (a proper neutral scale), so color only appears where
  it carries meaning. This is what keeps it "not too colorful" and serious.
- Use **tints/shades** of the existing accents for subtle fills (e.g. a faint blue wash behind
  a highlighted figure) instead of introducing new colors.

**Depth & surfaces**
- Card-based layout with a consistent corner radius (~12–16px).
- Soft, low shadows and/or a subtle 1px border to lift cards off the page. Make the page
  background slightly distinct from card surfaces so the layout has real depth.

**Spacing & layout**
- A consistent 4/8-based spacing scale. Generous padding inside cards, clear gaps between
  sections, aligned to a tidy grid. Let it breathe.

**Typography (a major source of "life")**
- A clean modern sans (system UI stack, or Inter if bundled inline).
- Strong hierarchy: small, muted, slightly-tracked **labels** for card titles; **large, bold
  hero numerals** for the key figures (Income / Expenses / Balance).
- Use **tabular (monospaced) figures** so numbers align cleanly in cards and the table.

**Motion & micro-interactions (this is what removes the "dead" feeling — keep it subtle/professional)**
- 150–250ms transitions on hover, focus, and the theme switch.
- Subtle hover elevation/tint on cards and buttons; clear press feedback.
- Charts animate in on load and when the time range changes.
- Modals fade/slide in gently. **No** bouncy or playful motion — it must stay serious.

**Icons**
- Small, consistent **line icons** (inline SVG so the file stays offline/single-file):
  add-expense / add-income, income vs. expense direction, theme toggle, and optionally
  per-category. Monochrome and subtle — they aid scanning and add life without adding color.

**Charts**
- Modern and clean: rounded bar tops, thin muted gridlines (or none), good spacing, donuts with
  a clean total label in the center, tidy consistent legends. No 3D, no heavy borders.

**Empty states**
- Friendly-but-professional copy with a subtle icon — never a blank void.

**Restraint = seriousness**
- Mostly neutral surfaces; color earns its place. If it starts to look colorful, it has gone
  too far. "Alive" comes from crafted depth, type, and motion.

All of the above applies in **both** light and dark themes; only the neutral surface/text values
change between them (see §10). Semantic accents stay recognizable in both, tuned for contrast.

---

## 18. Acceptance criteria / test scenarios

1. **First run:** open `index.html` in Chrome → "Choose data folder" → pick a folder →
   `finances.xlsx` is created there with the header row → empty dashboard appears.
2. **Add expense:** add an expense (Housing / Loan / 3500 / today) → row appears in the Excel
   file → history table and charts update.
3. **Divide:** in Add Expense, Total `2000` ÷ `4` → Amount becomes `500` → saved as `500`.
4. **Add income:** add income (Salary / 12000 / today) → Net Balance updates correctly.
5. **Reopen:** close the browser, reopen `index.html` → after one permission click at most,
   previous history loads automatically from the file.
6. **Time range:** switching This Month / Last Month / This Year / Custom updates every card,
   chart, and the table consistently.
7. **Classification panel:** loan expenses are visually emphasized as most severe; investment
   expenses are shown distinctly.
8. **Offline:** disconnect the internet → the app still fully works (libraries are inlined).
9. **Fallback:** open in Safari/Firefox → import works; saving downloads an updated file; the
   notice is shown.
10. **Manual edit:** edit a value directly in Excel, reopen the app → the change is reflected.
11. **Theme toggle:** switching light/dark restyles the whole UI, persists across reloads, and
    is **not** written to the Excel file.
12. **New categories:** "Mom Bills", "Sister Bills", and "Subscriptions" all appear in the Add
    Expense dropdown and show up correctly in the expense-by-category breakdown when used.
13. **DB compatibility (Golden Rule):** open a file that lacks a hypothetical future column, or
    that has an extra unknown column → the app still loads, reads columns **by header name**,
    and on save **preserves all existing columns and rows** without dropping anything. Existing
    headers are never renamed, removed, or reordered.
14. **Visual:** in both light and dark themes the UI looks polished and "alive" while keeping
    only the blue/green/red palette (neutral-dominant); loans remain emphasized as most severe.
15. **Savings goal:** the side panel shows Saved vs. Target where Target = 10% of income for the
    selected range — e.g. income 10,000 with 800 classified as `Investment` → target 1,000,
    progress 80%. Income 0 → no divide-by-zero (neutral state). Saving more than the target
    caps the bar at 100% but still shows the true percentage. The panel adds **no** new DB column.

---

## 19. Configuration constants (put at top of the file)

Expose these as clearly labeled constants so a non-technical owner can tweak them:

- *(No currency constant — amounts are plain, unit-less numbers with **no** currency symbol.)*
- `DATA_FILENAME` — default `"finances.xlsx"`.
- `EXPENSE_CATEGORIES` — array (§8.1), now including `"Mom Bills"`, `"Sister Bills"`, and
  `"Subscriptions"`.
- `INCOME_CATEGORIES` — array (§8.2).
- `CLASSIFICATIONS` — `["Regular", "Loan", "Investment"]`.
- `DEFAULT_TIME_RANGE` — default `"This Month"`.
- `DEFAULT_THEME` — follow the OS (`prefers-color-scheme`) on first load, then remember the
  user's toggle in localStorage (never in the DB).
- `SAVINGS_TARGET_PERCENT` — default `10`. The savings target as a % of income, feeding the
  savings-goal side panel (§21).

---

## 20. Design & UX guidance (summary)

- Clean, modern, uncluttered. Generous spacing. Large, obvious buttons.
- The two primary actions (Add Expense, Add Income) should be the most visible elements.
- Use color meaningfully: expenses/negative in red tones, income/positive in green tones,
  **loans emphasized in a strong warning color** (most severe), investments in a calm
  positive/neutral tone. No new colors beyond the existing palette (§17).
- Everything on one screen; no navigation, no menus.
- All copy in plain English aimed at someone who has never used a finance app.

---

## 21. Savings-goal side panel (capital market / deposits)

A dedicated **side panel** that tracks and motivates saving into the capital market, funds, or
deposits — i.e. expenses with `Classification = Investment` (§8.3). It reuses existing data
only; **no DB change** (Golden Rule, §2).

**What it shows (for the selected time range):**
- A clear **progress bar** of **Saved vs. Target**.
- **Target = 10% of income** in the range (`SAVINGS_TARGET_PERCENT`, §19). For the default
  "This Month" range this reads exactly as the monthly goal = 10% of this month's income.
- **Saved** = total of `Investment`-classified expenses in the range.
- The **percentage of the goal reached** (e.g. "80% of your goal").
- Optionally, a smaller secondary line: **Total saved to date** (all-time investment total).

**Placement & style:**
- Dock it to the **side** (e.g. a narrow right-hand column on wide screens); on narrow screens
  it stacks with the rest of the content. A vertical fill bar is a nice touch, but a labeled
  horizontal progress bar is perfectly fine.
- Use the **Investment** calm/positive tone from §17 — **not** a new color. Keep it serious,
  clean, and consistent with the rest of the dashboard, and correct in both light and dark themes.

**Behavior & edge cases:**
- The panel **follows the time-range selector**, with a label that reflects the active range
  (e.g. "This month" / "Selected range"). Its target is always 10% of income for whatever range
  is active. (For the default This Month view, this is exactly the monthly goal.)
- If income in the range is 0 → target is 0; show a neutral empty state, never divide by zero.
- If Saved ≥ Target → the bar caps at 100%, but the label still shows the true percentage
  (e.g. "130% — goal reached") as gentle, still-serious positive reinforcement.
- Percentages shown as whole numbers; amounts as plain numbers (no currency symbol, §14).

> This is the same "Investment" concept already used in the expense classification breakdown
> (§9 item 4, §13.4). The side panel is simply a goal-oriented view of it, measured against the
> 10%-of-income target.

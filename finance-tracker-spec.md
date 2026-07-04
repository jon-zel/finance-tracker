# Personal Finance Tracker — Build Specification (Revision 2.2)

## 0. Purpose & audience

Build a **single, self-contained HTML file** that lets a person track income and
expenses. The finished product will be handed to a **non-technical user**, so the
overriding design principle is: **dead simple, obvious, and impossible to break.**

- No installation, no backend, no server, no Python.
- The user double-clicks one file, it opens in the browser, and it just works.
- The "database" is a real **Excel (`.xlsx`) file** stored locally on the user's machine.

---

## 1. What's new in this revision

The app already exists and I'm happy with it — this is an **additive update**. Read the
whole file, but do **not** regress anything that already works.

**Already in place (revisions 1.1–1.3) — keep exactly as-is:**
- Golden Rule / DB compatibility (§2) — still the highest-priority rule.
- Light / dark mode toggle (§10).
- "Mom Bills", "Sister Bills", "Subscriptions" expense categories (§8.1).
- The "calm modern fintech" visual design (§17).
- Savings-goal side panel (§21).

**New in revision 2.0 — a whole new module, the biggest addition so far:**
- **Loans module (§22–§27).** A new section on the **same page**, placed **below** everything
  above (below the history table and the savings panel area). It lets the user track multiple
  loans (amount owed, monthly payment, interest rate), see them ranked from worst to best,
  and view charts/figures projecting their payoff. Unlike the rest of the app, **loan entries
  are editable and deletable**. It lives in its **own new sheet** in the same `.xlsx` file, so
  the existing `Transactions` sheet and the Golden Rule (§2) are completely unaffected. It must
  reuse the **exact same visual language** already defined (§17) — no new design style.

**Refinement in revision 2.1 — corrects the loan severity metric:**
- The "worst loan" ranking now uses **Annual Effective Interest Rate (APR-style, §24.3)** —
  the true per-year cost of each loan given its current balance and payment. This answers the
  real question ("which of my loans is the least worthwhile *right now*?") much better than the
  original total-interest-÷-balance ratio, which unfairly punished long loans with reasonable
  rates. Only the severity metric and its wording change — the module, its UI, its charts, and
  its two summary bars all stay exactly as designed in §22–§27.

**Polish in revision 2.2 — clarity fixes visible on the current build:**
- **Replace jargon with plain English.** The word "APR" is not obvious to non-finance users
  and should be **removed from the UI entirely**. Use plain "**per year**" (or "/yr") instead.
  Same number, clearer label. (§26.1, §28.1)
- **Clarify the "What the interest costs you" bar.** The bar's inline label currently just
  reads "Interest", which is ambiguous. Change it to make explicit that this is the **total
  interest that will be paid to the lender over the remaining life of the loan(s)** — i.e.
  the lender's total future earnings on this debt. (§26.4, §28.2)
- **Fix the Debt & Interest Over Time chart hover.** The tooltip currently doesn't show the
  value(s) at the hovered point. It must show, on hover of any month on the x-axis, both the
  remaining balance and the cumulative interest paid so far, with clear labels and formatted
  numbers. (§26.5, §28.3)

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
16. **Add a loan:** add a loan (Balance 1000 / Monthly Payment 100 / Rate 12%) → it appears in a
    new `Loans` sheet in the same `.xlsx` file → the `Transactions` sheet is untouched.
17. **Amortization math:** for the loan above (1000 balance, 100/month, 12%/yr → 1%/month), the
    app computes remaining months, total remaining payments, and total remaining interest that
    are internally consistent (Total Remaining Payments − Current Balance = Total Remaining
    Interest), and a 0% loan uses simple division with no divide-by-zero error.
18. **Severity ranking (Effective Annual Rate):** given two loans — Loan A: a payday-style loan
    at 15% annual rate, small balance, short term; Loan B: a mortgage-style loan at 4.5% annual
    rate, large balance, long term — Loan A ranks **worse** than Loan B (higher on the list,
    colored more intensely red), because effective annual rate governs ranking regardless of
    loan size or remaining term. The Interest-to-Balance Ratio may show Loan B with a larger
    total-cost figure; that's the diagnostic line, not the ranking metric.
19. **Negative amortization guard:** a loan whose monthly payment doesn't cover its monthly
    interest is detected, shown with a clear distinct warning, pinned at the top of the ranking
    regardless of computed ratio, and excluded (with a visible note) from any summed "total"
    figures that would otherwise be misleading.
20. **Edit a loan:** editing any single field of an existing loan (e.g. updating Current Balance
    after a bank statement) updates that same row in the `Loans` sheet (matched by its stable ID,
    not by position) and refreshes all loan figures/charts/ranking.
21. **Delete a loan:** deleting a loan asks for confirmation, then removes it from the `Loans`
    sheet and from every chart, bar, and ranking — with no impact on the `Transactions` sheet.
22. **Loan selector:** choosing "All Loans" aggregates the chart and the two bars across every
    loan; choosing one specific loan filters everything in the module to that loan alone.
23. **Loans chart & bars:** the debt+interest-over-time chart shows a declining balance line and
    a rising cumulative-interest line through projected payoff; the two bars correctly show
    (a) Current Balance vs. Total Remaining Payments, and (b) the bank's Total Remaining Interest.
24. **Loans visual consistency:** the Loans module uses the same card style, spacing, typography,
    color tokens, and animation timing as the rest of the app (§17) — it must not look like a
    bolted-on, differently-styled section — and works correctly in both light and dark themes.
25. **No "APR" in the UI (§28.1):** the string "APR" does not appear in any user-visible label,
    tooltip, or aria-label anywhere in the app. Every place a rate is shown reads as e.g.
    `28.1% per year` or `28.1%/yr`. The underlying numbers are unchanged.
26. **"Interest" bar label is self-explanatory (§28.2):** the inline label on the "What the
    interest costs you" bar reads "Total interest you'll pay" (or the longer alternative in
    §28.2), not just "Interest". Applies to both single-loan and All-Loans views.
27. **Chart hover works (§28.3):** hovering anywhere on the plot area of the Debt & Interest
    Over Time chart reveals a tooltip showing the time label, the Remaining balance, and the
    Cumulative interest paid at that x-position — with clear labels, plain-number formatting,
    and correct rendering in both light and dark themes, in both single-loan and All-Loans
    selector states.

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
- `LOANS_SHEET_NAME` — default `"Loans"`. The separate worksheet holding loan records (§23).
- `SEVERITY_BANDS` — thresholds mapping the **Annual Effective Interest Rate** (§24.3) to a
  red-intensity tier. Defaults tuned to consumer/mortgage lending realities:
  `[{max: 5, tier: "mild"}, {max: 10, tier: "moderate"}, {max: 20, tier: "high"},
  {max: Infinity, tier: "severe"}]` (percent per year). Kept as an editable constant so the
  thresholds can be tuned without touching the calculation logic.

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

---

## 22. Loans Module — overview & placement

A **second module on the same page**, placed **below** the entire existing dashboard (below
the history table and the savings-goal panel area). Same file, same tab, just further down the
scroll — the user never navigates away.

**What it's for:** tracking the loans a person owes (mortgage, car loan, personal loan, etc.) —
their current standing, what they'll cost in total, and which ones are the worst deals — as a
distinct concern from day-to-day income/expense logging above.

**Relationship to the existing expense Classification = "Loan" (§8.3):** these stay
**independent and loosely related by concept only** — this spec does **not** add any
auto-sync between them. The user keeps manually logging a monthly payment as an `Expense`
(`Classification = Loan`) up in the main dashboard as they already do, exactly as before. The
Loans module is a separate, periodically-updated record of each loan's terms and current
balance. (Practically: the user edits a loan's Current Balance here every so often — e.g. after
checking a bank statement — independent of logging that month's payment as an expense above.)

**Key differences from the rest of the app (intentional):**
- Loan records are **editable** (§25) — every field can be changed after creation.
- Loan records are **deletable** (§25.3) — with a confirmation step first.
- Loans live in their **own worksheet** (§23), not in `Transactions`.

**Visual consistency (important):** this module must look like it was built by the same hand as
everything above it. Reuse the exact same card style, corner radius, shadows, spacing scale,
typography (including tabular numerals), color tokens, icon style, and animation timing defined
in §17. **Do not introduce a new visual style, a new accent color, or different component
patterns.** The red used here for loan severity is the same red family already established for
expenses / the "Loan" classification (§8.3, §17) — this module simply uses more of its range
(from a mild tint up to the most saturated/darkest shade for the worst loan).

---

## 23. Loans data model (new worksheet)

A second worksheet, named **`Loans`** (constant `LOANS_SHEET_NAME`, §19), in the **same**
`.xlsx` file as `Transactions`. First row = headers, matched **by header name** (same discipline
as §2, extended to this sheet — see §23.2).

### 23.1 Columns

| Column | Type | Notes |
|---|---|---|
| `Loan ID` | text | Stable unique identifier generated when the loan is created (e.g. timestamp + random suffix). **Never changes.** Used to find the correct row on edit/delete — never match by row position or by name. |
| `Name` | text | User-facing label (e.g. "Mortgage", "Car Loan"). Required. Used in the loan selector (§26.2) and the ranked list (§26.1). |
| `Current Balance` | number | The amount **currently outstanding** (not the original loan amount) — see §24.1 for why. Positive number. Updated by editing (§25.2) as the real-world balance changes. |
| `Monthly Payment` | number | The fixed monthly payment amount. Positive number. |
| `Payment Day` | number | Day of month (1–31) the payment recurs. **Reference/display only** — does not feed the calculations in §24, since there's no loan start date in this model. |
| `Annual Interest Rate` | number | Percent, e.g. `4.5` for 4.5%/year. Can be `0` (interest-free loan). |
| `Last Updated` | date | Auto-set whenever the loan is created or edited. Shown in the UI as "as of [date]" next to the loan's figures, so projections are transparently understood as based on the balance as of that date, not necessarily today. |
| `Notes` | text | Optional free text, same spirit as `Description` on transactions. |

### 23.2 This sheet is now also a permanent contract

From this revision onward, `Loans` follows the **same discipline as the Golden Rule (§2)**:
read columns by header name, add future fields only as new optional columns at the end, and
never rename / remove / reorder / repurpose an existing column. The difference from
`Transactions` is only that **rows** here are mutable and deletable (§25) — the **column
structure** is just as permanent a contract as `Transactions`' is.

### 23.3 Row lifecycle (unlike Transactions' append-only rows)

- **Create:** append a new row with a freshly generated `Loan ID`.
- **Edit:** locate the row by `Loan ID`, update the changed field(s) and `Last Updated`, write
  the sheet back.
- **Delete:** locate the row by `Loan ID`, remove that row entirely, write the sheet back.
- In all cases, read the whole sheet first and write back everything **including any columns
  this app version doesn't know about** (same preserve-the-unknown principle as §2).

---

## 24. Loans calculations

All figures below are computed **fresh, starting from today**, using each loan's currently
stored `Current Balance`, `Monthly Payment`, and `Annual Interest Rate`. There is no loan start
date in this model (see §24.1), so nothing here depends on loan history — only on where things
stand right now and where they're headed.

### 24.1 Why "Current Balance" instead of original principal

This spec deliberately models `Current Balance` as **today's outstanding balance**, not the
original amount borrowed. That's a conscious choice: it needs no extra "loan start date" field,
and it stays accurate simply by the user occasionally editing it (§25.2) after checking a
statement — which the module already supports. All projections below run **forward** from this
balance, not backward into history.

### 24.2 Amortization (the core projection)

Given a loan with balance `P`, monthly payment `M`, and annual rate `r` (percent):

- Monthly interest rate: `i = r / 100 / 12`
- Step the balance forward month by month, starting at month 0 = today:
  - `interest_this_month = balance × i`
  - `principal_this_month = M − interest_this_month`
  - `balance_next_month = balance − principal_this_month`
  - Stop when `balance_next_month ≤ 0`. The final month's payment is capped at whatever
    clears the remaining balance (it will be smaller than `M`) — don't overshoot into a
    negative balance.
- **Special case `r = 0`:** skip the formula below; remaining months = `ceil(P / M)`, and total
  remaining interest = `0`.
- **Special case — negative amortization:** if `M ≤ P × i`, the payment doesn't even cover the
  interest accruing this month, so the balance will never go down (or will grow) as configured.
  Do **not** attempt to compute a finite payoff. Instead:
  - Flag this loan distinctly (e.g. a "growing debt" warning badge), separate from normal
    severity coloring.
  - Pin it at the **very top** of the ranked list (§26.1) regardless of any computed ratio,
    since an unpayable loan is definitionally the worst case.
  - **Exclude** it from any summed "total" figures (aggregate bars/chart in §24.5, §26.3–26.4)
    and show a visible note when this happens (e.g. "1 loan excluded from totals — its payment
    doesn't cover its interest; edit it to fix this").
- Otherwise, the closed-form number of remaining months is:
  `n = ceil( −ln(1 − (P × i) / M) / ln(1 + i) )`
  (This is the standard loan amortization formula; running the month-by-month steps above to
  completion gives the same answer and is a fine implementation choice too.)

### 24.3 Derived figures (per loan)

- **Total Remaining Payments** — the sum of every future payment until payoff (principal +
  interest combined). This is "how much will actually go out in practice" from here on.
- **Total Remaining Interest** = `Total Remaining Payments − Current Balance`. This is what the
  lender still stands to earn on this loan — feeds the "bank's interest" bar (§26.4).
- **Annual Effective Interest Rate** — **the severity metric used for ranking (§24.4).**
  This is the true annualized cost of the loan given its current standing. In this model, since
  the user provides `Annual Interest Rate` directly and payments are monthly, the effective
  annual rate is derived by compounding the monthly rate:
  `Effective Annual Rate = ((1 + i)^12 − 1) × 100`  where  `i = r / 100 / 12`  (the same `i`
  used in the amortization loop, §24.2).
  For a `0%` loan, this evaluates to `0%` naturally. Round to one decimal for display
  (e.g. `15.4%`).
  *Why this metric:* it directly answers "which of my loans is the least worthwhile right
  now?" A 15% loan is **always** worse than a 4.5% loan, regardless of size or remaining term.
  Small precision note: because the user enters a nominal APR and payments compound monthly,
  the displayed effective rate can be slightly higher than the number they entered (e.g. `12%`
  nominal → about `12.7%` effective) — that's correct and intentional, and mirrors how banks
  disclose an APR alongside an effective APR.

- **(Diagnostic figure — shown, not used for ranking)** **Interest-to-Balance Ratio**
  = `Total Remaining Interest ÷ Current Balance`, as a percentage. Shown as a plain-language
  line on each loan card (e.g. "will cost about +23% in interest over its remaining life") so
  the user can still see the *total* cost of a loan — this is useful for a long loan even at a
  low rate. It is **not** the ranking metric.

### 24.4 Severity ranking (worst → best)

- Sort all loans by **Annual Effective Interest Rate**, descending (highest rate = worst = shown
  first/top). This means a 15% loan is always ranked above a 4.5% loan, regardless of size or
  remaining term — the "which is least worthwhile right now?" question, answered directly.
- Any loan flagged as negative-amortization (§24.2) is pinned above all others regardless of
  rate.
- Map the effective rate to a color intensity using `SEVERITY_BANDS` (§19) — mild tint for a low
  rate, increasingly saturated/darker red as the rate rises, most intense for the worst band
  (and for the negative-amortization warning state).

### 24.5 Aggregation for "All Loans"

When the module's selector (§26.2) is set to "All Loans":
- **Debt-over-time chart:** for each month offset from today, sum the projected remaining
  balance across all loans still outstanding at that point (a loan that finishes early simply
  contributes 0 afterward), and separately sum cumulative interest paid across all loans at
  that point. Chart out to whichever loan pays off last.
- **The two bars (§26.3, §26.4):** sum Current Balance, Total Remaining Payments, and Total
  Remaining Interest across all loans.
- Loans in negative amortization are **excluded** from these sums (§24.2) with a visible note,
  since including an undefined/infinite figure would make the totals meaningless.

---

## 25. Add / Edit / Delete loan flow

### 25.1 Add a loan
A modal (reusing the same modal styling as Add Expense/Add Income, §17) with:

| Field | Control | Notes |
|---|---|---|
| Name | text input | Required. |
| Current Balance | number input | Required, `> 0`. |
| Monthly Payment | number input | Required, `> 0`. |
| Payment Day | number input (1–31) | Required. Defaults to today's day-of-month for convenience. |
| Annual Interest Rate | number input | Required, `≥ 0`. `0` is allowed (interest-free loan). |
| Notes | text input | Optional. |

Buttons: **Cancel** / **Save**. On Save, if `Monthly Payment ≤ Current Balance × monthly rate`
(negative amortization, §24.2), show a clear inline warning **but still allow saving** — this
can be a real situation (e.g. an intentional interest-only period) and the module already
handles it gracefully downstream (flagged, pinned top, excluded from totals). Set `Last Updated`
to today and append the row (§23.3).

### 25.2 Edit a loan
Clicking a loan (from the ranked list, §26.1) opens the **same modal**, pre-filled with its
current values, identified internally by its `Loan ID`. Saving updates that row in place and
refreshes `Last Updated` to today. This is the mechanism by which the user keeps `Current
Balance` accurate over time (e.g., after checking a statement).

### 25.3 Delete a loan
A delete control on each loan (e.g. a small trash icon in the ranked list, §26.1). Clicking it
asks for confirmation first (e.g. "Delete '[Name]'? This can't be undone.") before removing the
row. No effect on `Transactions` or any other loan.

---

## 26. Loans module — UI layout

Within the module (below everything else on the page, §22), suggested top-to-bottom order:

1. **Section header** — title (e.g. "Loans"), plus a **"+ Add Loan"** button.
2. **Ranked list of loans** (§26.1).
3. **Loan selector** (§26.2) — "All Loans" (default) or one specific loan by name.
4. **Two summary bars** (§26.3, §26.4), reflecting the current selector state.
5. **Debt + interest over time chart** (§26.5), reflecting the current selector state.

### 26.1 Ranked list
- One row/card per loan, sorted worst → best by severity (§24.4).
- Each row shows: Name, Current Balance, Monthly Payment, Annual Rate (the nominal rate the
  user entered), and "as of [Last Updated]". The **Annual Effective Interest Rate** (§24.3) is
  displayed prominently — this is the number that determines the row's color and ranking, so it
  should be the visually strongest figure on the card (large tabular numeral). **Label it in the
  UI as `per year` (or `/yr`)** — **not** "APR". E.g. show `15.4% per year`. Underneath, in
  secondary weight, show the diagnostic **Interest-to-Balance Ratio** in plain language (e.g.
  "will cost about +23% in interest over its remaining life") so the user sees the total cost
  too, without confusing it with the ranking metric.
- Background/accent colored by severity tier (§24.4) — worst loan at the top, most intense red.
- A negative-amortization loan gets a distinct warning badge in addition to (not instead of) its
  top position.
- Edit and Delete controls on each row (§25.2, §25.3). Clicking a row (outside those controls)
  can also set the selector (§26.2) to that loan, as a convenience.

### 26.2 Loan selector
- A dropdown or segmented control: **"All Loans"** (default) plus one entry per loan (by Name).
- Drives the two bars and the chart below it. The ranked list above always shows every loan
  regardless of this selector.

### 26.3 Bar — Current Balance vs. Total Remaining Payments
- A simple, clearly-labeled comparison: **"Debt today"** (Current Balance, or the sum across
  loans if "All Loans") next to **"Total you'll actually pay"** (Total Remaining Payments). The
  gap between them **is** the interest — this bar sets up the next one.

### 26.4 Bar — the lender's Total Remaining Interest
- **Card title:** "What the interest costs you".
- **Inline bar label:** must be self-explanatory — do **not** just say "Interest". Use
  something like **"Total interest you'll pay"** (or **"Interest paid to lender over the
  loan's life"**), so that at a glance the user understands this is the *lifetime* total
  interest that will still be paid to the lender on this debt — not "interest paid so far"
  and not "this month's interest".
- Value = Total Remaining Interest for the selected loan, or the sum across all loans if
  "All Loans" is selected.
- Styled in the same warning-red family as loan severity (§17, §24.4) — this number is a cost.

### 26.5 Chart — debt + interest over time
- Two series, month by month, from today until payoff:
  - **Remaining balance** (declining line) — "the debt amount."
  - **Cumulative interest paid so far in the projection** (rising line) — "the interest amount."
- Under "All Loans," both series are the aggregate across every (non-negative-amortization)
  loan (§24.5); under a single loan, they reflect that loan alone.
- **Hover behavior (must work).** Hovering any point on the x-axis shows a tooltip that
  displays: the time label of that point (month/year), the **Remaining balance** at that
  point, and the **Cumulative interest paid** by that point — each with a clear label and
  formatted as a plain number (no currency symbol, §14). The tooltip must appear anywhere
  on the plot area, not only exactly on a data point (use an "index"/nearest-x hover mode),
  and must work in both light and dark themes. **This is currently broken and must be
  fixed in this revision.**
- Style consistent with the existing charts (§17): clean lines, muted gridlines, no 3D, animates
  in on load and when the selector changes.

---

## 27. Loans-specific validation & edge cases

- `Current Balance`, `Monthly Payment` must be numeric and **> 0**.
- `Annual Interest Rate` must be numeric and **≥ 0**.
- `Payment Day` must be an integer **1–31**.
- `Name` is required (used everywhere as the loan's identity in the UI).
- **Negative amortization** (`Monthly Payment` doesn't cover monthly interest): allowed to save,
  but flagged, pinned top of the ranking, and excluded from summed totals with a visible note
  (§24.2, §24.5, §25.1) — never silently produces `Infinity`/`NaN` in a chart or bar.
- **Zero loans:** friendly empty state ("No loans yet — add one above.") instead of an empty or
  broken chart/bars.
- **Zero-interest loan (`r = 0`):** handled by the simple-division special case (§24.2) — never
  divides by zero from the `ln(1+i)` term.
- **Deleting the loan currently selected** in §26.2 resets the selector back to "All Loans."
- No currency symbol here either (§14) — all amounts are plain numbers.

---

## 28. Revision 2.2 clarity & polish fixes (targeted)

Three targeted fixes on the shipped Loans module. None of them change the math, the DB, or the
overall design — only visible UI wording and one bug fix on chart interaction.

### 28.1 Remove "APR" from the UI
- "APR" is finance jargon many users don't parse. Everywhere it appears in the UI right now,
  replace it with **"per year"** (or the compact form **"/yr"** if space is tight).
- The number itself is unchanged (it is still the Annual Effective Interest Rate, §24.3).
- Example: a card that currently shows `28.1% APR` must show `28.1% per year` after this fix.
- Applies to the ranked list card (§26.1) and anywhere else "APR" surfaces (tooltips,
  aria-labels, empty states, etc.). The word "APR" should not remain in any user-visible string.

### 28.2 Rename the "Interest" bar label to something self-explanatory
- The horizontal bar under "What the interest costs you" (§26.4) currently uses the inline
  label **"Interest"**, which is ambiguous — a reader can't tell whether it's interest paid so
  far, interest this month, or lifetime interest.
- Replace that inline label with **"Total interest you'll pay"** (or, if a longer form is
  preferred, **"Interest paid to lender over the loan's life"**). Same value, same styling —
  only the label text changes.
- Applies both to the single-loan view and the "All Loans" aggregate view.

### 28.3 Fix the Debt & Interest Over Time chart hover
- Bug: hovering over the chart currently does not display the values at the hovered point.
- Fix: enable a nearest-x / index-mode tooltip so that hovering **anywhere on the plot area**
  reveals a tooltip containing:
  - the time label of that x-position (month, e.g. "Aug 2027");
  - **Remaining balance** at that point, labeled clearly, formatted as a plain number;
  - **Cumulative interest paid** by that point, labeled clearly, formatted as a plain number.
- The tooltip must be readable in both light and dark themes (use the same tokens as other
  chart tooltips in the app — do not introduce a new tooltip style).
- The tooltip must work under both "All Loans" and single-loan selector states (§26.2).

# Personal Finance Tracker

A single, self-contained `index.html` for tracking income and expenses — no install,
no backend, no server. Double-click the file, it opens in the browser, and it just works.

## Running it

- **Windows/macOS:** double-click `index.html` (Chrome or Edge recommended).
- On first run, click **"Choose data folder"** and pick a folder — the app creates
  `finances.xlsx` there and uses it as its database from then on.
- On later runs, the app reconnects to that folder automatically (one permission click
  at most).

Safari/Firefox don't support the file-linking API the app relies on; there you'll get an
**"Import Excel file"** button instead, and saving downloads an updated copy of
`finances.xlsx` rather than writing it in place.

## Your data

Everything lives in the `finances.xlsx` file you chose a folder for — there's no
database, account, or cloud sync. The `Transactions` sheet holds every income/expense
row (append-only — the app never edits or deletes a row); the `Loans` sheet holds the
Loans module's records, which unlike transactions can be edited or deleted from the UI.

To fix or remove a transaction, edit the Excel file directly. Loans can be edited or
deleted from within the app itself.

## What it tracks

- Income vs. expenses over a selectable time range, with category breakdowns for each.
- An expense **classification** dimension (Regular / Loan / Investment) — loan spending
  is flagged as most severe, investment spending counts toward the savings goal.
- A savings-goal side panel (target = 10% of income for the selected range, by default).
- A **Loans module** below the main dashboard: track multiple loans, see them ranked
  worst-to-best by effective annual rate, and view payoff/interest projections.

## Configuration

Editable constants live at the top of `index.html` — category lists, the default
savings target percentage, the data filename, and the severity thresholds used to color
the loan ranking. See `finance-tracker-spec.md` for the full design and behavior spec.

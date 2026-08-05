# Personal Finance Tracker

A single, self-contained `index.html` for tracking income, expenses, and loans — no
install, no backend, no server. Double-click the file, it opens in the browser, and it
just works.

## Running it

- **Windows/macOS:** double-click `index.html` (Chrome or Edge recommended).
- On first run, click **"Choose data folder"** and pick a folder — the app creates
  `finances.xlsx` there and uses it as its database from then on.
- On later runs, the app reconnects to that folder automatically (one permission click
  at most).

Safari/Firefox don't support the file-linking API the app relies on; there you'll get an
**"Import Excel file"** button instead, and saving downloads an updated copy of
`finances.xlsx` rather than writing it in place.

## The three tabs

The app is one page with three tabs, switched from the bar under the header:

- **Income & Expenses** — the main dashboard: add income/expense entries, see totals,
  category and classification breakdowns, the income-vs-expense trend, the savings goal,
  and the transaction history table.
- **Loans** — track the loans you owe, ranked worst-to-best, with payoff/interest
  projections and a real, dated **payment history** you can log against each loan.
- **Monthly Planning** — a forward-looking cash-flow planner. An editable, multi-month
  grid of your planned outgoings in three groups (**Fixed / Committed**, **Credit Cards**
  with a minimum-vs-planned-pay distinction, and **Can Wait**), plus an estimated income
  per month, so you can see what's **left after bills** for each month at a glance. Loan
  payments can be pulled straight from the Loans tab into **Credit Cards & Loans**, and
  **Import fixed expenses** totals last month's real spending in a few set categories
  (Subscriptions, Housing, Mom Bills) into **Can Wait** — both still editable afterwards.
  You can drag any row between sections. A side "Advisor" panel flags shortfalls,
  minimum-only cards, how much of your income is already committed, and where a surplus
  could go. It's all estimates — it never touches your recorded income, expenses, or loans.

Your tab choice is remembered in the browser (localStorage), never in the Excel file.

## Your data

Everything lives in the `finances.xlsx` file you chose a folder for — there's no
database, account, or cloud sync. The workbook has **six sheets**:

- **`Transactions`** — every income/expense row (Date, Type, Category, Classification,
  Amount, Description, plus `Loan ID`/`Payment ID` used only to link loan-payment
  expenses). Ordinary entries are append-only. See the note below on the exception.
- **`Loans`** — the Loans tab's records (balance, monthly payment, rate, etc.). Unlike
  transactions, loan rows are **editable and deletable** from the app.
- **`LoanPayments`** — the dated ledger of real payments logged against a loan. Also
  editable/deletable; editing it recomputes the loan's balance from that history.
- **`MonthlyPlan`** — the Monthly Planning tab's line items (group, label, a card's
  minimum, and an optional `Loan ID` linking a row back to a loan).
- **`MonthlyPlanCells`** — the planned amount for each item in each month, stored one
  row per item-and-month so the sheet stays easy to read in Excel.
- **`MonthlyPlanIncome`** — the estimated income for each planned month.

  The three planning sheets are estimates only; they're written with the same
  read-before-write safety as the rest, and a plan save never rewrites the
  Transactions/Loans/LoanPayments sheets.

The app reads columns **by header name**, tolerates older files that lack newer columns,
and preserves any extra columns/sheets it doesn't recognize when it writes back.

### Editing and deleting

- **Ordinary income/expense rows:** there is no edit/delete for these inside the app — to
  fix or remove one, edit the `finances.xlsx` file directly, then reopen/refresh the app.
- **Loans and loan payments:** edit and delete these from within the app (Loans tab).
- **One important exception to "Transactions is append-only":** a loan payment and its
  matching expense row are two views of the same real payment, linked by a shared
  `Payment ID`. So **deleting a loan, or deleting/editing one of its logged payments, will
  also delete or edit the linked expense row in `Transactions`.** Deleting a loan with
  logged history therefore changes past expense totals. The app warns you before doing
  this, but it cannot be undone — so keep your own copy of `finances.xlsx` if in doubt.

## What it tracks

- **Income vs. expenses** over a selectable time range (This Month / Last Month / This
  Year / Custom), with category breakdowns (donuts) for each and a trend chart.
- An expense **classification** dimension (Regular / Loan / Investment) — loan spending is
  flagged as most severe, investment spending counts toward the savings goal.
- Two special expense categories that auto-set their classification:
  - **`Investment / Savings Deposit`** → locks classification to *Investment* and feeds the
    savings goal.
  - **`Loan Payments`** → locks classification to *Loan*, asks which loan the payment is
    for, and records a real payment against that loan (the same action as the Loans tab's
    "Log Payment"). Use this instead of logging loan payments as ordinary expenses, so the
    expense and the loan never disagree.
- A **savings-goal panel** (target = 10% of income for the selected range, by default),
  showing progress this range and total saved to date.
- A **Loans module**: track multiple loans, see them ranked worst-to-best by effective
  annual rate, view payoff/interest projections and a debt-over-time chart, and log/edit a
  dated payment history that keeps each loan's balance accurate over time.

## What it does not do (by design)

No accounts/login, no cloud sync, no multi-currency (amounts are plain, unit-less
numbers — you know your own currency), no recurring/automatic entries, no in-app budgets,
and no mobile app. It is a private, offline, single-file, desktop tool.

## Configuration

Editable constants live at the top of `index.html` (the config `<script>` block):
category lists, `SAVINGS_TARGET_PERCENT`, `DATA_FILENAME`, the sheet names, the default
theme (dark), and `SEVERITY_BANDS` (the effective-annual-rate thresholds that color the
loan ranking). See `finance-tracker-spec.md` for the fuller design and behavior spec.

> Note: the spec (`finance-tracker-spec.md`) documents revisions up to 2.2 and predates
> the payment-history ledger, the Loan Payments / Investment locked categories, and the
> two-tab layout described above. Where the spec and this README disagree, this README
> reflects the current build.

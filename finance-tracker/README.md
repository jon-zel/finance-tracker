# Personal Finance Tracker

A single, self-contained `index.html` for tracking income, expenses, loans, and
investments — no install, no backend, no server. Double-click the file, it opens in the
browser, and it just works.

## Running it

- **Windows/macOS:** double-click `index.html` (Chrome or Edge recommended).
- On first run, click **"Choose data folder"** and pick a folder — the app creates
  `finances.xlsx` there and uses it as its database from then on.
- On later runs, the app reconnects to that folder automatically (one permission click
  at most).

Safari/Firefox don't support the file-linking API the app relies on; there you'll get an
**"Import Excel file"** button instead, and saving downloads an updated copy of
`finances.xlsx` rather than writing it in place.

## The four tabs

The app is one page with four tabs, switched from the bar under the header:

- **Income & Expenses** — the main dashboard: add income/expense entries, see totals,
  category and classification breakdowns, the income-vs-expense trend, the savings goal,
  and the transaction history table.
- **Loans** — track the loans you owe, ranked worst-to-best, with payoff/interest
  projections and a real, dated **payment history** you can log against each loan.
- **Investments** — the mirror image of Loans, for money working *for* you. Register an
  investment with an expected annual return, log **deposits and withdrawals** (partial or
  full), and periodically record **what it's worth now**. From those two ledgers the tab
  works out your real profit, ranks everything best-to-worst by actual annualized return,
  charts portfolio value against what you put in, and projects where today's value lands
  in 1 / 3 / 5 years. Cashing out **closes** an investment: it keeps its full history and
  final profit but drops out of your active list and totals. **Nothing here touches
  Income & Expenses** — see below.
Both the Loans and Investments tabs are scoped by the **"Show" filter** at the top. Pick
from the dropdown and that loan/investment **pins beside it as a chip**; pick again to
add another, so the filter is a **multi-selection**. Click a chip (or its row in the
ranked list) to remove it, or **Clear** to drop the lot. The dropdown always offers
what isn't already pinned, so it answers "what can I add?" while the chips show "what am
I filtering by?". The scope drives the **whole tab** — ranked list, totals, bars, every
chart, and the payment/activity history — not just the graphs.

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
database, account, or cloud sync. The workbook has **nine sheets**:

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
- **`Investments`** — one row per investment (name, type, expected annual return, start
  date, and whether it's Active or Closed).
- **`InvestmentFlows`** — the dated ledger of money moved in or out. `Amount` is always
  positive; the `Direction` column (`Deposit` / `Withdrawal`) carries the sign.
- **`InvestmentValuations`** — the dated ledger of "what it's worth now" readings.

  The three planning sheets are estimates only; they're written with the same
  read-before-write safety as the rest, and a plan save never rewrites the
  Transactions/Loans/LoanPayments sheets. The three investment sheets are real records
  and get the same protection: if the `Investments` sheet goes missing from a file that
  used to have it, the app refuses to save rather than writing an empty one over it.

The app reads columns **by header name**, tolerates older files that lack newer columns,
and preserves any extra columns/sheets it doesn't recognize when it writes back.

### Editing and deleting

- **Ordinary income/expense rows:** there is no edit/delete for these inside the app — to
  fix or remove one, edit the `finances.xlsx` file directly, then reopen/refresh the app.
- **Loans and loan payments:** edit and delete these from within the app (Loans tab).
- **Investments and their entries:** edit and delete these from within the app
  (Investments tab). Deleting an investment also deletes its deposits, withdrawals, and
  recorded values — if you've simply cashed it out, use **Close** instead, which keeps
  everything.
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
- An **Investments module** (see below).

## How the Investments tab works out your profit

Two separate ledgers per investment, because they're two different kinds of fact:

- **Flows** — money you moved, and know exactly. Deposits and withdrawals, any size.
- **Valuations** — what a statement says it's worth on a given day.

Profit is the gap between them: *worth now, plus anything already withdrawn, minus
everything deposited*. Written that way it stays right for an investment you've partly or
fully cashed out.

Between valuations the value **moves with your flows**: deposit 1,000 into something last
valued at 5,000 and it shows 6,000 straight away, tagged **Estimated** with a reminder of
when it was last really valued. The next value you record replaces the estimate outright.

Other things worth knowing:

- **Money on this tab is whole numbers only.** Every amount field rejects decimals
  outright (you'll get "Enter a whole amount… — no decimals" rather than a silent
  round), and every figure displays without cents: `13,500`, not `13,500.00`. Any
  fractional amount already sitting in an older file is read as the nearest whole number,
  so a total always equals the sum of the rows above it. The rest of the app is
  unaffected: income, expenses, and loan payments are still tracked to the cent.
- **Expected annual return takes up to 4 decimals** — `3.6125` for a figure straight off
  a factsheet. It's shown at its own natural precision wherever *that* rate appears (on
  the card and in the chart legend), with no padding: `8` stays `8`, `5.5000` shows as
  `5.5`, `3.6125` shows in full. More than four decimals is rejected rather than silently
  rounded. Derived percentages deliberately stay at one decimal — a realized return of
  "12.4% per year" is as precise as that figure honestly is. (The Loans tab's interest
  rate is unchanged, still 2 decimals.)

- **Return per year** is a money-weighted return (XIRR), so a deposit made just before a
  good stretch counts for more than one made at the end. It reads "—" rather than
  guessing when there's under a month of history. The ranking falls back to plain total
  return in that case, and labels it "so far" instead of "per year".
- **Estimated Profit Ahead** compounds each investment's *own* expected annual return
  separately and sums the results. Pure illustration — nothing from it is ever saved.
- **You can't withdraw more than an investment is worth** on the date you pick; the
  modal tells you the ceiling before you submit.
- **Same-day entries are applied in the order you logged them.** Record a value and then
  withdraw on the same day and the withdrawal comes off that value; deposit and then
  record a value and the value wins. (A row typed straight into Excel has no log time, so
  there the valuation is treated as the day's closing figure.)
- **Nothing on this tab touches Income & Expenses.** Investment money is deliberately not
  written to the Transactions sheet, so moving money in or out can never change a past
  income or expense total. If you also want a deposit to count toward your savings goal,
  log it separately as an expense under `Investment / Savings Deposit`.

## What it does not do (by design)

No accounts/login, no cloud sync, no multi-currency (amounts are plain, unit-less
numbers — you know your own currency), no recurring/automatic entries, no in-app budgets,
and no mobile app. It is a private, offline, single-file, desktop tool.

## Configuration

Editable constants live at the top of `index.html` (the config `<script>` block):
category lists, `SAVINGS_TARGET_PERCENT`, `DATA_FILENAME`, the sheet names, the default
theme (dark), `SEVERITY_BANDS` (the effective-annual-rate thresholds that color the loan
ranking), and for the Investments tab `INVESTMENT_TYPES`, `RETURN_BANDS` (the return
thresholds that color the investment ranking), `INVESTMENT_PROJECTION_YEARS`, and
`RATE_DECIMALS` (how many decimals an expected return may carry). See `finance-tracker-spec.md` for the fuller design and behavior spec.

> Note: the spec (`finance-tracker-spec.md`) documents revisions up to 2.2 and predates
> the payment-history ledger, the Loan Payments / Investment locked categories, and the
> two-tab layout described above. Where the spec and this README disagree, this README
> reflects the current build.

# Finance Tracker — QA / UX / Product Audit

_Audit date: 2026-07-25 · Scope: `finance-tracker/index.html` (single-file app), reviewed against `finance-tracker-spec.md` (rev 2.2) and `README.md`._

Reviewed as three roles at once: **senior QA** (bugs, edge cases, data safety), **UI/UX** (clarity, flow, friction), and **product manager** (does each feature fit the customer and the product's founding promise).

---

## 1. Who is the customer, and what did we promise them?

The spec is unusually explicit about this, so it's the right yardstick:

> "The finished product will be handed to a **non-technical user**, so the overriding design principle is: **dead simple, obvious, and impossible to break.**" — spec §0
>
> "A **single-screen** dashboard… There is **no edit or delete inside the app**." — spec §3
>
> "The `.xlsx` file is effectively our only backend. The database structure must **never** break — ever." — Golden Rule, §2

The customer is one person tracking their own money, where **the `.xlsx` file is the only copy of irreplaceable data** — no backend, no cloud, no undo. For this class of app, silent data loss is the single worst possible bug.

### 1.1 Who this person actually is (read from the product itself)

The categories and features are a fingerprint. Reading them back:

- **They financially support family.** `Mom Bills` and `Sister Bills` are first-class expense categories sitting right next to `Bills & Utilities`. This is not a generic budgeting app — it's built for someone carrying **other people's** recurring costs, likely a primary or partial breadwinner for a mother and a sister.
- **They're in an Israeli/₪ context.** The spec's "pikadon" (deposit) wording and the deliberate no-currency-symbol decision ("each user knows their own currency") point to a single-currency shekel user who finds `$`/`₪` clutter, not clarity.
- **Their money is heavily recurring.** Look at the category list: Rent/Mortgage, Bills & Utilities, Mom Bills, Sister Bills, Subscriptions, Insurance, plus Salary on the income side. The overwhelming majority of this person's real financial life is **the same handful of amounts, every single month.**
- **They carry debt and are trying to build wealth at the same time.** The Loans module (mortgage/car/personal) and the `Investment / Savings Deposit` category + 10%-of-income savings goal tell you this is someone juggling **paying down loans while trying to save** — the classic squeezed-middle financial situation.
- **They value privacy and ownership over convenience.** No account, no cloud, a local Excel file they can open themselves. They chose (or were given) a tool that trades sync/mobile for "my data is mine and lives on my machine."

### 1.2 What they actually get today

A private, offline, no-subscription dashboard over a file they own, that answers **"where did my money go this month, how bad are my loans, and am I saving?"** — with a genuinely strong debt module. That's real value, and nothing here is fake.

### 1.3 What the same fingerprint says they *need* but don't get

Here's the gap the code review missed: **the category list is a confession that this customer's finances are ~80% identical month to month — yet the app has no way to not re-type them, and forbids fixing them in-app.** The product maximizes exactly the friction its own customer feels most. That tension drives most of the UX and business gaps in §4–§5 below.

**The directional product finding:** the shipped app has grown well past "single screen, dead simple, no edit/delete" (two tabs, three worksheets, editable loans, a payment ledger, auto-linked expenses, derived balances) — but all of that growth went into **depth on the debt module**, while the customer's highest-frequency, highest-friction job (logging the same recurring income/expenses and correcting mistakes) got *no* investment and is in some ways actively hostile. The app got more sophisticated for the 20% and stayed painful for the 80%.

---

## 2. What works correctly (verified by reading the code paths)

These are implemented well and match intent:

- **Core income/expense capture** — add-expense/add-income modals, required-field and positive-amount validation ([index.html:2705](index.html#L2705), [index.html:2755](index.html#L2755)), append-only writes for ordinary rows.
- **Golden-Rule read/write discipline** for the columns it knows about — reads by header name, preserves unknown columns/rows via `rawRows`/`sourceHeader`, appends new columns only at the end ([computeFinalHeader index.html:1508](index.html#L1508)).
- **Data-safety merge net** — every save re-reads the file from disk first and merges one change onto the freshest state (`saveWithFreshMerge`, [index.html:1666](index.html#L1666)); the two-tab overwrite incident that motivated the global rule is genuinely addressed for the sheets it guards.
- **Excel date handling** — decodes serials in integer day-space to dodge timezone drift ([normalizeDateValue index.html:1454](index.html#L1454)).
- **Time-range engine** — This Month / Last Month / This Year / Custom, with sensible daily/monthly/yearly granularity auto-selection ([determineGranularity index.html:2849](index.html#L2849)).
- **Loan severity ranking** by effective annual rate, negative-amortization loans pinned to top and excluded from totals, paid-off loans sunk to the bottom ([sortedLoansForRanking index.html:3204](index.html#L3204)) — matches spec §24 including the tricky edge cases.
- **Amortization math** is internally consistent (`Total Remaining Payments − Balance = Total Remaining Interest` holds exactly by deriving interest from payments, [index.html:2564](index.html#L2564)); zero-interest and negative-amortization special cases handled without divide-by-zero or `Infinity`/`NaN`.
- **Overpayment guard** — a payment can't clear more than the loan owes at that point in its history, checked both client-side and again against fresh disk state ([checkLoanPaymentFits index.html:2347](index.html#L2347)).
- **Chart hover** (the rev 2.2 bug) is fixed — index-mode tooltips show balance + cumulative interest anywhere on the plot ([index.html:3486](index.html#L3486)).
- **"APR" jargon removed** — UI reads "per year"; the interest bar reads "Total interest you'll pay" (spec §28.1/28.2 satisfied).
- **XSS safety** — all user text (categories, names, notes, descriptions) routed through `escapeHtml` before `innerHTML` ([index.html:3185](index.html#L3185)).
- **Theme** persists in localStorage only, applied pre-paint to avoid flash, never written to the DB (Golden Rule respected).

---

## 3. What does NOT work correctly / needs attention

Ranked by severity, with data-loss issues first per the standing rule for this app.

### 🔴 CRITICAL / HIGH — data integrity & safety

**3.1 The Transactions sheet has no "sheet missing → refuse save" guard, unlike Loans/LoanPayments.**
`saveWithFreshMerge` refuses to save if the Loans or LoanPayments sheet is missing while the session holds such records ([index.html:1679-1690](index.html#L1679)), but the **Transactions sheet gets no equivalent guard**. `parseSheetFromWorkbook` returns a `found` flag, but `parseWorkbookBuffer` surfaces `loanSheetFound`/`paymentSheetFound` and **discards the transactions `found` flag** ([index.html:1541-1545](index.html#L1541)). If a fresh read ever yields zero transaction rows where the sheet is genuinely absent/unreadable, an add-expense will happily write a file containing only the new row and adopt that as truth — the exact "not found silently becomes empty" failure the global rule warns against. The Transactions sheet is the *primary* ledger; it deserves at least the same protection the loan sheets already have.

**3.2 `fallbackToFirstSheet` for Transactions is now dangerous with 3 sheets present.**
When "Transactions" isn't found by name, the parser falls back to `wb.SheetNames[0]` ([index.html:1520](index.html#L1520)). This was safe when the file had one sheet. Now, if a user deletes the Transactions sheet or reorders sheets so Loans is physically first, the app will **silently parse the Loans sheet as transactions**, then write that garbage back into the Transactions sheet on the next save — corrupting data. Combined with 3.1, a renamed/removed Transactions sheet is a realistic path to silent corruption.

**3.3 Deleting a loan (or a payment) now deletes rows from the Transactions ledger — contradicting the spec, the README, and the app's own promise.**
Spec acceptance §21 states deleting a loan has "**no impact on the `Transactions` sheet**," and the README says "the app never edits or deletes a [transaction] row." The shipped code does the opposite: `deleteLoan` filters out every linked `Loan Payments` expense row ([index.html:2222](index.html#L2222)), and `deleteLoanPayment`/`updateLoanPayment` splice/edit Transactions rows ([index.html:2498](index.html#L2498), [index.html:2459](index.html#L2459)). Deleting one loan therefore **retroactively rewrites the user's expense history** — past months' Total Expenses, Net Balance, and the classification/savings figures all silently change. The confirm dialog does warn ("will also remove its logged payment history and their matching expense entries"), which is good, but this is a genuine, irreversible, spec-violating mutation of the ledger the whole dashboard is built on. Decision needed: either (a) accept it and update the spec/README to match, or (b) preserve the expense rows and only unlink them.

**3.4 The README is now factually wrong about append-only behavior.**
README §"Your data": _"The `Transactions` sheet holds every income/expense row (append-only — the app never edits or deletes a row)."_ This is no longer true (see 3.3). For a non-technical owner relying on the README to understand where their data is safe, stale safety documentation is itself a risk.

### 🟠 MEDIUM — correctness / accuracy that can mislead

**3.5 The historical portion of the Debt & Interest chart is a fabricated model drawn as if it were real data.**
For a loan with a `Date Recorded` in the past but no logged payments, `loanActualStateAtMonth` discounts the balance *backward* by compounding interest ([index.html:3367](index.html#L3367)), producing a rising debt curve from the recorded date up to today. It's drawn as a **solid** line (dashing only applies to the future beyond "Today", [index.html:3466](index.html#L3466)), so it reads as "actual history." In reality the user was almost certainly making payments during that time — the model assumes zero payments and pure compounding. The math is defensible as a "no seam" convenience, but presenting a hypothesis as solid history can mislead. Consider dashing/labeling the pre-payment historical segment as an estimate.

**3.6 "Net Balance" labels saving and principal repayment as if the money is lost.**
Net Balance = Income − *all* expenses, including `Investment / Savings Deposit` and `Loan Payments` outflows ([renderSummaryCards index.html:2909](index.html#L2909)). A disciplined user who invests 2,000 and pays down 3,000 of principal sees a **red, negative Net Balance** even though their net worth went up. This is per the spec's "outflows are expenses" stance and is mitigated by the classification panel and savings goal — but the single most prominent card on the screen still frames wealth-building as a loss. Worth a product decision on labeling (e.g. "Cash flow") or excluding Investment from the headline.

**3.7 The "Debt today" bar mixes "paid off" into a track labeled as debt.**
`renderLoanBars` renders a split track with a `paid` segment + a `balance` segment inside the row labeled **"Debt today"** ([index.html:3319-3325](index.html#L3319), HTML "Debt today" label). Money already paid is not "debt today," so the label and the segment fight each other. The paid split is also derived from the auto-backfilled `Original Loan Amount`, which for pre-existing loans equals the current balance (so it shows 0% progress regardless of reality). Clarify the label or move the progress split to its own clearly-labeled element.

**3.8 Feature drift from the spec's independence promise creates a double-counting trap.**
Spec §22 was explicit: the Loans module and the expense "Loan" classification stay **independent, no auto-sync** — the user keeps logging monthly payments as ordinary expenses "exactly as before." The shipped app instead introduced a `Loan Payments` expense category that auto-records a real loan payment. A returning user following the original documented workflow (log the mortgage as a Housing/Loan expense) **and** using the new Log-Payment flow will double-count outflows, and their "Loan" classification total becomes a mix of two different things. The unification is arguably better than the spec — but the transition path silently punishes existing habits and isn't explained anywhere in-app.

### 🟡 LOW — validation, edge cases, UX polish

- **3.9 Custom range accepts `from > to` with no feedback.** An inverted custom range silently shows empty charts/table ([computeRangeBounds index.html:2819](index.html#L2819)) with no hint the dates are backwards. Add a validation message.
- **3.10 Manually-typed non-ISO text dates in Excel are not normalized.** `normalizeDateValue` only `.trim()`s strings ([index.html:1465](index.html#L1465)); a cell like `05/06/2024` won't match ISO range comparisons and will `NaN` in `dateFromISO`, so the row silently vanishes from every range/chart. Excel usually stores serials, so this is edge-case, but it fails invisibly (no "N rows couldn't be read" notice).
- **3.11 A paid-off loan can't be edited at all.** Both Edit and Log-Payment icons are disabled when balance ≤ 0 ([index.html:3273-3276](index.html#L3273)), so you can't correct a paid-off loan's name, rate, or notes — you must delete a payment to reopen it. Minor dead-end.
- **3.12 Percentage formatting is inconsistent.** Savings % is rounded to a whole number ([index.html:2967](index.html#L2967)) but classification-panel percentages use `formatNumber` and can show decimals ([index.html:2934](index.html#L2934)). Pick one.
- **3.13 Modals lack `role="dialog"`/`aria-modal`, focus trapping, and autofocus.** Esc and overlay-click close work, but keyboard/screen-reader users get no focus management, and an overlay-click discards a half-filled form with no confirm. Low priority for a single non-technical user, but cheap polish.
- **3.14 Divide helper accepts a negative Total.** `updateDivideResult`/`applyDivideResult` only guard `divBy > 0`, not `total` sign ([index.html:2681](index.html#L2681)); a negative result is produced and only caught later by the amount>0 check. Harmless but sloppy.
- **3.15 Third chart series ("Balance if 0% interest") is undocumented scope creep.** Not in the spec's two-series design ([index.html:3477](index.html#L3477)); fine, but adds cognitive load to a chart meant to be clean.

---

## 4. UX gaps (friction the customer feels, not code bugs)

These are places where the app *works* but doesn't *serve*. Ordered by how often the customer hits them.

**4.1 🔴 Every recurring entry must be re-typed by hand, every month.** This is the biggest UX gap in the app and the code review missed it entirely. Salary, rent, each Mom/Sister bill, each subscription, insurance — a dozen-plus identical entries, re-keyed monthly. There is no "repeat last month," no templates, no recurring entries (`recurring` is a spec non-goal, but non-goals written for v1 shouldn't outlive the customer's reality). The one friction-reducer that exists — the **Divide** helper — optimizes a rare case (splitting a bill 4 ways) while the constant case (re-entering the same rent) gets nothing. For a "dead simple" app, the single most repeated task is the least supported.

**4.2 🔴 A typo in an ordinary transaction sends a non-technical user to hand-edit Excel.** There is no in-app edit/delete for income/expense rows — the app's own empty-state and history note say "to edit or delete, open the Excel file directly." Telling the *explicitly non-technical* target user to open the xlsx, find the right row among hundreds, edit a cell without corrupting the header, save, and refresh is a usability cliff that flatly contradicts "impossible to break." And it's **internally inconsistent**: loans and loan *payments* are fully editable in-app, so the app teaches the user that data is editable, then refuses for the data they touch most. At minimum, an in-app "correct last entry" / delete-row affordance would remove the single scariest moment in the product.

**4.3 🟠 The history table is a viewer, not a finder.** No free-text search and no amount/description filter — only category toggles and a 10-row window. "What did I pay the vet in spring?" means scrolling or leaving for Excel. For a ledger that grows for years, findability is a real gap.

**4.4 🟠 Time ranges omit the two most useful review windows.** This Month / Last Month / This Year / Custom — but no **"Last 12 months"** (the standard way to see a full recurring cycle and smooth out one-off months) and no **"All time"** (lifetime totals / net worth trajectory), both of which require manually fiddling Custom dates. A savings-and-debt customer thinks in trailing-year and lifetime terms; the app makes those the hardest views to reach.

**4.5 🟠 "This Month" trend chart visibly falls to zero mid-month.** Daily buckets span the whole calendar month, so today onward renders as empty bars. A non-technical user reads a cliff-to-zero as "my income/spending stopped," not "the month isn't over." Clip the trend to today (or mark future days) so the chart never lies at a glance.

**4.6 🟡 No first-run guidance or trust signals.** First run is a bare "Choose data folder" with no explanation of *where the file goes, that it's safe to close the tab, or that nothing is uploaded.* There's no "last saved" indicator, no visible confirmation that a save succeeded, and no sample data to explore. For a privacy-motivated non-technical user handing their whole financial life to a double-clicked HTML file, the absence of reassurance is itself friction.

**4.7 🟡 The two prominent Add buttons don't cover the highest-value action.** Header shows "+ Add Expense" / "+ Add Income," but logging a **loan payment** — arguably this customer's most consequential recurring action — is buried behind a tiny icon inside a loan row on the other tab (or a non-obvious "Loan Payments" category inside Add Expense). The information architecture underweights the thing the debt-carrying customer most needs to do routinely.

---

## 5. Business / product-strategy gaps (does the product win for this customer?)

**5.1 🔴 Desktop-and-file-only architecture excludes the actual moment of spending.** Expenses happen at the café, the shop, the gas station — on a phone, away from the desktop file. This app requires a computer, a double-clicked local file, and the File System Access API (Chrome/Edge). There is **no mobile story at all**, and the architecture (one local xlsx, no sync) precludes one. For a tool whose headline verb is "track expenses," being unusable at the point of purchase is the largest adoption/retention risk of all — it forces batch data-entry sessions, which is precisely what makes people quit finance trackers.

**5.2 🔴 The promised safety net (rolling backup) is scaffolded but never actually written.** Given this app's own data-loss history, the global rule calls for "a rolling backup of the previous file version, taken before every overwrite." The code goes halfway: `peekFreshWorkbookState` captures the pre-write `bytes` and a comment says a backup "can be taken from the exact content about to be replaced" ([index.html:1591](index.html#L1591)) — **but nothing ever writes that snapshot anywhere.** The one cheap insurance policy against the exact class of incident that shaped this app is stubbed out. Any future save bug is still "unrecoverable" instead of "one file away from fixed."

**5.3 🟠 It's a rear-view mirror, not a steering wheel — no budgets, no forecast.** The app tells the customer what already happened; it never tells them whether they're on track. There are no per-category budgets/limits and no "at this rate you'll spend X by month-end." The only forward-looking figure is the 10% savings goal. For someone supporting family on a finite income, "am I about to overspend on Restaurants?" is the question that changes behavior — and it isn't asked.

**5.4 🟠 The debt module and the savings goal never talk to each other — the core advice is missing.** This customer's central financial question is *"should my spare shekel go to the 15%/yr loan or into savings?"* The app has both halves — it even computes each loan's effective annual rate and pins the worst one — yet it recommends investing 10% of income while a high-rate loan sits unaddressed two clicks away, and never connects them. A single line ("your worst loan costs 15%/yr — paying it beats saving") would deliver more value than most of the charts. Right now the two most sophisticated features are strangers.

**5.5 🟠 Supporting family is a headline use case with no first-class support.** `Mom Bills` / `Sister Bills` exist as categories, but the person carrying them likely wants a per-person view ("what did I spend on Mom this year," "is it growing"), and possibly a notion of money expected back. Today that's only reachable by manually filtering one category + This Year. The app acknowledges the use case in its category list but doesn't actually serve it.

**5.6 🟡 No shareable/exportable summary.** There's no "here's my month" report to print, save, or hand to a partner/accountant. The raw xlsx exists, but a normal person can't turn it into a clean monthly snapshot. For someone managing a household's money, a shareable summary is a natural, low-cost value-add.

**5.7 🟡 "Net Balance" as the hero number arguably misframes success.** (Also noted at 3.6.) The most prominent figure counts saving and principal repayment as losses, so a financially *healthy* month can show red. The headline metric subtly discourages the exact behavior — saving, deleveraging — the rest of the app is trying to encourage.

---

## 6. Product manager's summary judgment

**Does each feature fulfill its purpose?** Individually, yes — capture, dashboard, savings goal, and especially the loans engine all do what they claim, and the hard math is correct and well-guarded.

**Does the *product* serve *this customer*?** Partially, and lopsidedly. It's excellent at analyzing debt and honest about the past, but it under-serves the customer's real daily life: it makes the ~80% of finances that repeat every month painful to enter and impossible to correct in-app (§4.1, §4.2), can't be used where money is actually spent (§5.1), never tells them if they're on track or which debt to kill first (§5.3, §5.4), and — despite a data-loss history — leaves its cheapest safety net unbuilt (§5.2).

**Does it still meet its founding requirements?** The two the spec ranked highest are the two most at risk:
1. **"Impossible to break / never lose data"** — strong in the common path, but the Transactions sheet is the least-protected sheet (§3.1, §3.2), loan/payment deletion silently rewrites the primary ledger (§3.3), and the rolling backup is stubbed (§5.2).
2. **"Dead simple, obvious to a non-technical user"** — undermined more by the *missing* basics (recurring entry, in-app correction) than by the added complexity. Depth went to the 20%; the 80% stayed hard.

**Top 5 things I'd fix/build, in priority order:**
1. **Ship the rolling backup that's already stubbed** (§5.2) and give the Transactions sheet the same missing-sheet guard the loan sheets have (§3.1, §3.2). Cheapest, highest-stakes.
2. **In-app edit/delete + "repeat last month" for ordinary transactions** (§4.2, §4.1) — this removes the customer's two biggest daily pains at once.
3. **Connect debt and savings into one recommendation, and add simple per-category budgets** (§5.4, §5.3) — turn the rear-view mirror into a steering wheel.
4. **Decide & document the loan-deletion contract** (§3.3, §3.4) — stop silently rewriting the ledger, or make it loudly explicit.
5. **Add "Last 12 months"/"All time" ranges and clip the This-Month trend to today** (§4.4, §4.5) — small, high-leverage clarity wins.

_The README has been updated to match the current build. No application code was changed by this audit — findings only._

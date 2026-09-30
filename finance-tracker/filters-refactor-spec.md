# Filters Refactor — Income & Expenses tab (Revision 3.0)

> **For the implementer (Claude Code):** this is a UI-only refactor of the filtering
> system on the **Income & Expenses** tab of `index.html`. Read `README.md` and the
> existing `index.html` first. Before changing anything, locate and list every
> existing filter mechanism (see §2) so none is left behind. Do **not** regress any
> other feature.

---

## 0. Why

Filtering today is scattered and inconsistent:

- The date filter is in the top panel. Category filters are chips above the history table.
  More filtering is hidden inside chart legends.
- Gestures are overloaded and can't be discovered: click hides a category, double-click
  isolates it, and clicking the "Expense"/"Income" label selects only that type.
- Some panels react to a filter and others don't, and nothing on screen says which.
- There is no single place to see what is active, and no one-click reset.

The target model follows the one used by Kibana/Elastic, Power BI, and Monarch:

- **One global filter bar.** Every filter is visible as a removable chip, with one Clear action.
- **One gesture per meaning.** Clicking a chart adds a chip to the bar.
- **An explicit, visible scope.** Headline totals are stable anchors. Exploration views react
  to everything.

---

## 1. Hard constraints (unchanged from the main spec)

- **Golden Rule stands.** No change to any sheet, column, or row in `finances.xlsx`.
  Filter state is **UI state only**.
- Still one self-contained `index.html`: offline, vanilla JS, same libraries.
- Reuse the existing visual language (cards, tokens, chips, radius, motion, light and dark
  themes). No new colors or component styles.
- The **Loans** and **Investments** tabs keep their own "Show" multi-select filter. They are
  **out of scope**. Do not touch them.
- The **table free-text search** stays exactly as it is: local to the table only.

---

## 2. Remove (after inventorying them in code)

Remove all of these existing behaviors:

1. Legend-click hide/show on the expense and income donuts, and on any other chart.
2. Double-click-to-isolate on any legend, chip, or slice.
3. Click on the "Expense" / "Income" label that selects a type.
4. The **"Filter by expense category"** and **"Filter by income category"** chip rows above the
   history table. Their function moves to the global bar (§3).
5. Any other per-chart or per-table filter state you find, **except** the table's free-text
   search.

Chart.js legends must be non-interactive (`legend.onClick = null` or a no-op), or be wired to
the new behavior in §4. They must not hide datasets or slices.

---

## 3. The global filter bar

### 3.1 Placement

- Replace the current top date panel with a single **filter bar** card at the top of the
  Income & Expenses tab, in the same position.
- Make it **sticky** (`position: sticky; top: 0`) with the card background, so it stays
  visible while scrolling the long page. Keep a z-index below modals.

### 3.2 Layout

```
Row 1 (controls):
[This Month][Last Month][Last 12 Months][This Year][All Time][Custom: from – to]
[ All | Income | Expense ]   [ Categories ▾ ]   [ Classification ▾ ]

Row 2 (only when a non-date filter is active):
Active:  (Expense ×) (Mom Bills ×) (Subscriptions ×) (Loan ×)          Clear filters
```

### 3.3 Controls

**Date.** Keep the existing presets and the Custom range exactly as they work today. Moving
them into the bar must not change their behavior.

**Type.** A 3-way segmented control: `All` (default) / `Income` / `Expense`.

**Categories.** A dropdown that opens a popover with a checkbox list.
- The list is grouped under two headings, **Expense** and **Income**. Use the existing category
  constants and their existing colour dots.
- Each row has a checkbox (toggle) and a small **"only"** link on hover. "Only" selects that
  category alone, replacing double-click.
- The popover footer has **Select none** (clears the category selection).
- When Type = `Income`, show only the Income group. When Type = `Expense`, show only the
  Expense group.
- When Type changes, **silently drop** any selected categories that don't belong to the new
  type.
- The button label reflects the state: `Categories` (none selected), `Mom Bills`
  (one selected), `3 categories` (several selected).

**Classification.** A dropdown with checkboxes for `Regular` / `Loan` / `Investment`.
- The label behaves the same way as the Categories label.
- The existing `CLASSIFICATIONS` constant drives the options.

All controls apply **immediately**, with no Apply button, because the dataset is small and
local.

### 3.4 Active chips and Clear

- Row 2 shows one removable chip per active non-date filter value: the type (if not `All`),
  each selected category, and each selected classification.
- Use the existing chip style. Category chips keep their colour dot. Each chip has an `×`.
- Clicking `×` removes that value.
- **Clear filters** resets Type, Categories, and Classification. It does **not** reset the date,
  because date is context, not a filter to clear.
- Hide row 2 entirely when there are no non-date filters.

---

## 4. Chart interactions (click-to-filter)

- **Donut slices and donut legend items:** a single click **toggles** that category in the
  global Categories filter, and the chip appears in or disappears from the bar. Show a pointer
  cursor on hover.
- **Income vs Expenses over time:** clicking a legend item ("Income" / "Expenses") sets Type to
  that value. Clicking it again sets Type back to `All`. Clicking bars does nothing.
- There are no other chart gestures. Every state created from a chart must be visible, and
  removable, in the bar.

---

## 5. Scope matrix — which panel reacts to what

"Explore filters" means Type + Categories + Classification.

| Panel | Date | Explore filters | Behavior when explore filters are active |
|---|---|---|---|
| Total Income card | ✔ | ✘ | Main number unchanged. Add a secondary line (§5.1). |
| Total Expenses card | ✔ | ✘ | Main number unchanged. Add a secondary line (§5.1). |
| Current Balance card | ✘ | ✘ | Unchanged. All-time, up to today, as now. |
| Expense Classification panel | ✔ | ✘ | Unchanged. |
| 50/30/20 breakdown | ✔ | ✘ | Unchanged. |
| Day-to-day spending vs 3-month average | ✔ | ✘ | Unchanged. |
| Income vs Expenses over time | ✔ | ✔ **filter** | Plot only matching rows. If Type ≠ All, show only that series. |
| Expenses by category (donut) | ✔ | ✔ **highlight** | Keep all slices. Dim non-matching ones (§5.2). |
| Income by category (donut) | ✔ | ✔ **highlight** | Same as the expense donut. |
| Transaction history table | ✔ | ✔ **filter** | Show only matching rows, then apply the local text search on top. |
| Savings-goal panel (if on this tab) | ✔ | ✘ | Unchanged. |

**The rule, in one line: totals and benchmarks follow the date only; exploration views follow
everything.**

### 5.1 "Selected" line on the Total Income / Total Expenses cards

This line appears only when explore filters are active. It sits in small, muted text under the
big number:

- Format: `Selected: 4,210.50 · 28%`, where the percentage is of that card's range total. Use
  plain numbers with no currency, matching the existing number formatter.
- If the filter excludes that type entirely (for example, Type = Expense on the Income card),
  show `Not in current filter` in muted text instead.
- The big number never changes because of explore filters.

### 5.2 Donut highlight

- Matching slices keep full colour. Non-matching slices drop to about 25% opacity. Use the
  existing colour with alpha, not a new colour.
- The centre label shows the matching sum. Underneath it, in small muted text, show
  `of 14,805.07`.
- With no explore filters, the donut looks exactly like today.
- A Classification or Type filter that excludes a whole donut dims all of that donut's slices,
  and its centre shows `0` with the `of …` line.

### 5.3 Matching logic (one predicate, used everywhere)

A row matches the explore filters when **all** of the following hold:

- **Type:** `All`, or `row.Type === type`.
- **Categories:** none selected, or `row.Category` is in the selection. Categories are
  type-scoped; `Other` exists in both lists, so compare on `(Type, Category)` pairs.
- **Classification:** none selected, or `row.Classification` is in the selection. Income rows
  have no classification, so **income rows do not match** while any classification is
  selected. Show a small note under the chips in this case: *"Classification applies to
  expenses only."*

---

## 6. Making scope visible

- When explore filters are active, every panel marked ✔ **filter** or ✔ **highlight** in §5
  shows a small funnel icon badge next to its title, with the tooltip *"Affected by filters"*.
  Panels marked ✘ show no badge.
- Use the existing line-icon style (inline SVG) and the muted accent token.
- The Total Income and Total Expenses cards gain a muted sub-label under their title showing the
  active date preset, e.g. `This Month` or `Sep 1 – Sep 30, 2026`. This makes it explicit that
  they follow the date only.

---

## 7. State & persistence

- Keep a single state object as the only source of truth:
  ```js
  const filterState = {
    datePreset, dateFrom, dateTo,   // existing
    type: 'All',                    // 'All' | 'Income' | 'Expense'
    categories: [],                 // [{type, category}]
    classifications: []             // ['Regular','Loan','Investment']
  };
  ```
- Mutate it only through small setters (`setType`, `toggleCategory`, `onlyCategory`,
  `toggleClassification`, `clearExploreFilters`, `setDateRange`). Every setter triggers one
  `render()`.
- Use pure selectors:
  - `rowsInDate()` feeds the ✘ panels.
  - `rowsInDate().filter(matchesExplore)` feeds the ✔ panels.
- The date preset keeps whatever persistence it has today.
- **Type, Categories, and Classification are NOT persisted.** They reset on reload, so the app
  never opens with a stale hidden filter. Never write any of this to Excel.

---

## 8. Empty states

- If the date range plus explore filters leave **zero** matching rows, the trend chart and the
  table show the existing empty-state style with the text *"Nothing matches these filters."*
  and a **Clear filters** button.
- The donuts in this case follow §5.2: all slices dimmed and a `0` centre.

---

## 9. Accessibility

- The segmented control and dropdowns are keyboard-operable (Tab, arrow keys, Enter/Space,
  and Esc to close a popover).
- Chip `×` buttons have `aria-label="Remove filter: Mom Bills"`.
- The funnel badge has an `aria-label`.

---

## 10. Acceptance criteria

1. The old filter UI is gone: there are no category chip rows above the table, legend clicks
   never hide data, double-click does nothing, and clicking a type label does nothing.
2. The filter bar sits at the top, stays sticky while scrolling, and works in light and dark
   themes.
3. Selecting `Mom Bills` from the Categories dropdown adds a chip. The trend chart and table
   show only Mom Bills. Both donuts dim every other slice. The Total Expenses big number is
   unchanged and shows `Selected: <sum> · <pct>%`. The Classification, 50/30/20, and day-to-day
   panels are unchanged.
4. Clicking the Mom Bills slice in the expense donut has the same effect as step 3. Clicking the
   slice again, or the chip's `×`, removes the filter.
5. The "only" link replaces the whole category selection with that single category.
6. Switching Type to `Income` drops any selected expense categories. The dropdown then lists
   income categories only, and the expense donut is fully dimmed.
7. Selecting Classification = `Loan` excludes income rows and shows the "applies to expenses
   only" note.
8. **Clear filters** removes every explore filter and keeps the date range.
9. Funnel badges appear only on the ✔ panels, and only while explore filters are active.
10. Reloading the page keeps the date preset (as today) and resets all explore filters.
11. A combination that matches no rows shows the empty state with a working Clear button.
    Nothing throws an error, and no `NaN` appears.
12. The table's free-text search still works and combines with the global filters.
13. The Loans, Investments, and Monthly Planning tabs behave exactly as before, and the
    `.xlsx` file is byte-for-byte unaffected by any filter interaction.

---

## 11. Docs

Update `README.md`: add a short **"Filtering"** subsection under *The four tabs → Income &
Expenses* describing the bar, click-to-filter, the scope rule (§5), and the fact that explore
filters are not saved.

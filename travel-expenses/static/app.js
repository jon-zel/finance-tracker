/* Travel Expenses Tracker — frontend.
 * All backend calls go through relative /api/... URLs (never localhost),
 * so this file works unchanged once the app is hosted on the web.
 */
(function () {
  "use strict";

  const CURRENCY_SYMBOLS = { EUR: "€", USD: "$", JPY: "¥", GBP: "£" };
  const HIGHLIGHT = getVar("--chart-highlight");

  // A distinct, stable color per category (assigned once from appConfig.categories'
  // order, not from whatever happens to have data in the current filter) so a
  // category reads as the same color everywhere — chart, legend, donut — no
  // matter which time range or trip is active.
  const CATEGORY_PALETTE = [
    "#130e30", "#e261e5", "#59e25d", "#3b6fd6", "#e2833b", "#8a3bd6", "#2f9e8f",
    "#d63b64", "#5f5c6e", "#c9a13b", "#3bb3d6", "#8fae3b", "#d63b3b", "#8a5a2b",
  ];
  let categoryColorMap = {};

  function categoryColor(cat) {
    if (categoryColorMap[cat]) return categoryColorMap[cat];
    // Fallback for a category not in appConfig.categories (e.g. a stray value
    // in the file) — deterministic so it stays the same color across renders.
    let hash = 0;
    for (let i = 0; i < cat.length; i++) hash = (hash * 31 + cat.charCodeAt(i)) | 0;
    return CATEGORY_PALETTE[Math.abs(hash) % CATEGORY_PALETTE.length];
  }

  function getVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ---- Global state ----
  let appConfig = null;       // GET /api/config response
  let activeTrip = null;      // string trip name
  let allExpenses = [];       // every expense for the active trip (unfiltered)
  let currentRangeKey = "all";
  let charts = { byCategory: null, total: null, donut: null };
  let categoryVisibility = {}; // category -> bool (shown in the by-category chart)
  let pinnedCategories = [];   // user-chosen categories shown as dashboard gauges

  const el = (id) => document.getElementById(id);

  // ---- Formatting helpers ----

  function formatBase(amount) {
    const n = Number(amount) || 0;
    return `${appConfig.base_currency_symbol} ${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  function currencySymbol(code) {
    if (code === appConfig.base_currency) return appConfig.base_currency_symbol;
    return CURRENCY_SYMBOLS[code] || code + " ";
  }

  function toISODate(d) {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${yr}-${mo}-${day}`;
  }

  function todayISO() { return toISODate(new Date()); }

  // ---- API ----

  async function api(path, options) {
    const res = await fetch(path, options);
    let body = null;
    try { body = await res.json(); } catch (e) { /* no body */ }
    if (!res.ok) {
      const message = (body && body.error) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return body;
  }

  const getConfig = () => api("/api/config");
  const getTrips = () => api("/api/trips");
  const createTripApi = (name) =>
    api("/api/trips", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
  const getExpenses = (trip) => api(`/api/trips/${encodeURIComponent(trip)}/expenses`);
  const postExpense = (trip, expense) =>
    api(`/api/trips/${encodeURIComponent(trip)}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expense),
    });
  const getRateHistory = () => api("/api/rates/history");

  // ---- Init ----

  async function init() {
    appConfig = await getConfig();
    categoryColorMap = {};
    appConfig.categories.forEach((cat, i) => {
      categoryColorMap[cat] = CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
    });
    pinnedCategories = loadPinnedCategories();
    populateCategorySelect();
    populateCurrencySelect();
    wireStaticEvents();
    await refreshTripList();
  }

  function loadPinnedCategories() {
    const raw = localStorage.getItem("travel_expenses_pinned_categories");
    if (raw === null) return [...appConfig.monitored_categories]; // first run: use config.py's default
    try {
      const stored = JSON.parse(raw);
      if (Array.isArray(stored)) return stored.filter((c) => appConfig.categories.includes(c));
    } catch (e) { /* fall through */ }
    return [...appConfig.monitored_categories];
  }

  function savePinnedCategories(list) {
    pinnedCategories = list;
    localStorage.setItem("travel_expenses_pinned_categories", JSON.stringify(list));
  }

  function populateCategorySelect() {
    const sel = el("expense-category");
    sel.innerHTML = "";
    for (const cat of appConfig.categories) {
      const opt = document.createElement("option");
      opt.value = cat;
      opt.textContent = cat;
      sel.appendChild(opt);
    }
  }

  function populateCurrencySelect() {
    const sel = el("expense-currency");
    sel.innerHTML = "";
    const baseOpt = document.createElement("option");
    baseOpt.value = appConfig.base_currency;
    baseOpt.textContent = appConfig.base_currency;
    sel.appendChild(baseOpt);
    for (const code of Object.keys(appConfig.exchange_rates)) {
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = code;
      sel.appendChild(opt);
    }
  }

  async function refreshTripList() {
    const { trips } = await getTrips();
    const sel = el("trip-select");
    sel.innerHTML = "";
    for (const name of trips) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      sel.appendChild(opt);
    }
    const newOpt = document.createElement("option");
    newOpt.value = "__new__";
    newOpt.textContent = "+ New trip";
    sel.appendChild(newOpt);

    if (trips.length === 0) {
      el("empty-state").hidden = false;
      el("dashboard").hidden = true;
      el("add-expense-btn").hidden = true;
      return;
    }

    el("empty-state").hidden = true;
    el("add-expense-btn").hidden = false;

    const stored = localStorage.getItem("travel_expenses_active_trip");
    const toSelect = trips.includes(stored) ? stored : trips[0];
    sel.value = toSelect;
    await selectTrip(toSelect);
  }

  async function selectTrip(name) {
    activeTrip = name;
    localStorage.setItem("travel_expenses_active_trip", name);
    el("trip-select").value = name;
    allExpenses = (await getExpenses(name)).expenses;
    categoryVisibility = {};
    const allCats = new Set(appConfig.categories);
    allExpenses.forEach((e) => allCats.add(e.category));
    for (const cat of allCats) categoryVisibility[cat] = true;
    el("dashboard").hidden = false;
    renderAll();
  }

  // ---- Time range ----

  function startOfISOWeek(d) {
    const day = (d.getDay() + 6) % 7; // Monday=0 .. Sunday=6
    const monday = new Date(d);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(d.getDate() - day);
    return monday;
  }

  function currentRangeBounds() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (currentRangeKey === "week") {
      const from = startOfISOWeek(today);
      const to = new Date(from);
      to.setDate(from.getDate() + 6);
      return { from: toISODate(from), to: toISODate(to) };
    }
    if (currentRangeKey === "last7") {
      const from = new Date(today);
      from.setDate(today.getDate() - 6);
      return { from: toISODate(from), to: toISODate(today) };
    }
    if (currentRangeKey === "custom") {
      const from = el("custom-from").value || null;
      const to = el("custom-to").value || null;
      return { from, to };
    }
    return { from: null, to: null }; // "all"
  }

  function filteredExpenses() {
    const { from, to } = currentRangeBounds();
    return allExpenses.filter((e) => {
      if (from && e.date < from) return false;
      if (to && e.date > to) return false;
      return true;
    });
  }

  function rangeDayCount(expenses) {
    const { from, to } = currentRangeBounds();
    if (from && to) {
      const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
      return Math.max(days, 1);
    }
    if (expenses.length === 0) return 1;
    const dates = expenses.map((e) => e.date).sort();
    const span = Math.round((new Date(dates[dates.length - 1]) - new Date(dates[0])) / 86400000) + 1;
    return Math.max(span, 1);
  }

  // ---- Aggregation helpers ----

  function totalsByCategory(expenses) {
    const totals = {};
    for (const e of expenses) {
      totals[e.category] = (totals[e.category] || 0) + e.amount;
    }
    return totals;
  }

  function dailyTotalsByCategory(expenses) {
    const dates = Array.from(new Set(expenses.map((e) => e.date))).sort();
    const categories = Array.from(new Set(expenses.map((e) => e.category)));
    const series = {};
    for (const cat of categories) series[cat] = dates.map(() => 0);
    expenses.forEach((e) => {
      const idx = dates.indexOf(e.date);
      series[e.category][idx] += e.amount;
    });
    return { dates, series };
  }

  // ---- Rendering ----

  function renderAll() {
    const dateFiltered = filteredExpenses();
    const visible = dateFiltered.filter((e) => categoryVisibility[e.category] !== false);
    renderCategoryFilterPills(el("legend-by-category"));
    renderCategoryFilterPills(el("table-category-filter"));
    renderSummary(visible);
    renderGauges(visible);
    renderCharts(dateFiltered, visible);
    renderTable(visible);
  }

  // Every category the trip has ever used (config order first, then any
  // stray values found in the file) — stable regardless of the current time
  // range, so a category never disappears from the filter just because it
  // has no rows in the selected window.
  function categoryFilterList() {
    const extras = Object.keys(categoryVisibility)
      .filter((c) => !appConfig.categories.includes(c))
      .sort();
    return [...appConfig.categories, ...extras];
  }

  // Shared by both the chart legend and the expense-table filter row — they
  // toggle the same categoryVisibility state, so acting on either stays in
  // sync with the other and re-renders the whole dashboard (table, totals,
  // donut, gauges), not just the one chart.
  function renderCategoryFilterPills(container) {
    container.innerHTML = "";
    categoryFilterList().forEach((cat) => {
      const badge = document.createElement("button");
      badge.type = "button";
      badge.className = "legend-badge" + (categoryVisibility[cat] !== false ? "" : " disabled");
      badge.innerHTML = `<span class="swatch" style="background:${categoryColor(cat)}"></span>${escapeHtml(cat)}`;
      badge.addEventListener("click", () => {
        categoryVisibility[cat] = categoryVisibility[cat] === false ? true : false;
        renderAll();
      });
      container.appendChild(badge);
    });
  }

  function renderSummary(expenses) {
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const days = rangeDayCount(expenses);
    el("summary-total").textContent = formatBase(total);
    el("summary-count").textContent = `${expenses.length} expense${expenses.length === 1 ? "" : "s"}`;
    el("summary-avg").textContent = `${formatBase(total / days)} / day`;
  }

  function renderGauges(expenses) {
    const grid = el("gauges-grid");
    grid.innerHTML = "";

    if (pinnedCategories.length === 0) {
      grid.innerHTML = `<div class="gauges-empty">No categories pinned yet — click "Pin categories" to choose some.</div>`;
      return;
    }

    const rangeTotals = totalsByCategory(expenses);
    const allTimeTotals = totalsByCategory(allExpenses);

    for (const cat of pinnedCategories) {
      const value = rangeTotals[cat] || 0;
      const max = Math.max(
        allTimeTotals[cat] || 0,
        ...pinnedCategories.map((c) => allTimeTotals[c] || 0)
      ) || 1;
      const pct = Math.min(100, (value / max) * 100);

      const wrap = document.createElement("div");
      wrap.innerHTML = `
        <div class="gauge-name">${escapeHtml(cat)}</div>
        <div class="gauge-value tabular-nums">${formatBase(value)}</div>
        <div class="gauge-track"><div class="gauge-fill" style="width:${pct}%;"></div></div>
      `;
      grid.appendChild(wrap);
    }
  }

  function destroyChart(key) {
    if (charts[key]) { charts[key].destroy(); charts[key] = null; }
  }

  // dateFiltered: date-range-only, used for the by-category chart so every
  // category with data in the current range keeps a toggleable line (Chart.js
  // `hidden` handles show/hide). visible: date range + category filter
  // applied, used for everything that should actually react to the filter.
  function renderCharts(dateFiltered, visible) {
    renderByCategoryChart(dateFiltered);
    renderTotalChart(visible);
    renderDonutChart(visible);
  }

  function renderByCategoryChart(expenses) {
    const { dates, series } = dailyTotalsByCategory(expenses);
    const categories = Object.keys(series);

    destroyChart("byCategory");
    const ctx = el("chart-by-category").getContext("2d");
    charts.byCategory = new Chart(ctx, {
      type: "line",
      data: {
        labels: dates,
        datasets: categories.map((cat) => ({
          label: cat,
          data: series[cat],
          borderColor: categoryColor(cat),
          backgroundColor: "transparent",
          hoverBorderColor: HIGHLIGHT,
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.25,
          hidden: categoryVisibility[cat] === false,
        })),
      },
      options: baseChartOptions(),
    });
  }

  function renderTotalChart(expenses) {
    const dates = Array.from(new Set(expenses.map((e) => e.date))).sort();
    const totals = dates.map((d) => expenses.filter((e) => e.date === d).reduce((s, e) => s + e.amount, 0));

    destroyChart("total");
    const ctx = el("chart-total").getContext("2d");
    charts.total = new Chart(ctx, {
      type: "line",
      data: {
        labels: dates,
        datasets: [{
          label: "Total",
          data: totals,
          borderColor: HIGHLIGHT,
          backgroundColor: "rgba(255, 226, 40, 0.35)",
          fill: true,
          borderWidth: 2,
          pointRadius: 2,
          tension: 0.25,
        }],
      },
      options: baseChartOptions(),
    });
  }

  // Draws the center "total" text directly on the canvas at Chart.js's own
  // computed chartArea center — unlike an absolutely-positioned HTML overlay,
  // this is always exactly centered on the ring no matter the card's aspect
  // ratio (narrow mobile widths made the old HTML overlay drift off-center).
  function makeDonutCenterPlugin(amountText, captionText) {
    return {
      id: "donutCenterText",
      afterDraw(chart) {
        const { ctx, chartArea } = chart;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = getVar("--color-deep-ink");
        ctx.font = `700 20px ${getVar("--font-display")}`;
        ctx.fillText(amountText, cx, cy - 10);
        ctx.fillStyle = getVar("--color-slate");
        ctx.font = `400 11px ${getVar("--font-sans")}`;
        ctx.fillText(captionText, cx, cy + 14);
        ctx.restore();
      },
    };
  }

  function renderDonutChart(expenses) {
    const totals = totalsByCategory(expenses);
    const categories = Object.keys(totals);
    const values = categories.map((c) => totals[c]);
    const grandTotal = values.reduce((a, b) => a + b, 0);

    destroyChart("donut");
    const ctx = el("chart-donut").getContext("2d");
    charts.donut = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: categories,
        datasets: [{
          data: values,
          backgroundColor: categories.map((cat) => categoryColor(cat)),
          hoverBackgroundColor: HIGHLIGHT,
          borderWidth: 0,
        }],
      },
      options: {
        cutout: "65%",
        animation: false,
        plugins: { legend: { display: false } },
      },
      plugins: [makeDonutCenterPlugin(formatBase(grandTotal), "total")],
    });

    // Rendered as plain HTML below the canvas (not Chart.js's built-in
    // legend) so the number of visible categories never changes the
    // canvas's own layout — the ring stays a fixed size no matter how many
    // categories are toggled, instead of resizing/"popping" on every toggle.
    // Each row is also a filter toggle, same categoryVisibility state as the
    // other two filter rows, so filtering works from here too.
    const legendEl = el("donut-legend");
    legendEl.innerHTML = "";
    categoryFilterList().forEach((cat) => {
      const value = totals[cat] || 0;
      const pct = grandTotal ? ((value / grandTotal) * 100).toFixed(1) : "0.0";
      const row = document.createElement("button");
      row.type = "button";
      row.className = "donut-legend-row" + (categoryVisibility[cat] !== false ? "" : " disabled");
      row.innerHTML = `
        <span class="swatch" style="background:${categoryColor(cat)}"></span>
        <span class="donut-legend-label">${escapeHtml(cat)}</span>
        <span class="donut-legend-value tabular-nums">${formatBase(value)} (${pct}%)</span>
      `;
      row.addEventListener("click", () => {
        categoryVisibility[cat] = categoryVisibility[cat] === false ? true : false;
        renderAll();
      });
      legendEl.appendChild(row);
    });
  }

  function baseChartOptions() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "nearest", intersect: false },
      scales: {
        x: { ticks: { color: getVar("--color-slate") }, grid: { color: "rgba(0,0,0,0.08)" } },
        y: { ticks: { color: getVar("--color-slate") }, grid: { color: "rgba(0,0,0,0.08)" } },
      },
      plugins: { legend: { display: false } },
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function renderTable(expenses) {
    const body = el("expense-table-body");
    body.innerHTML = "";
    const sorted = [...expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    for (const e of sorted) {
      const tr = document.createElement("tr");
      if (window.__newlyAddedRowKey === rowKey(e)) {
        tr.classList.add("row-new");
      }
      tr.innerHTML = `
        <td>${escapeHtml(e.date)}</td>
        <td class="amount-col tabular-nums">${formatBase(e.amount)}</td>
        <td>${escapeHtml(e.category)}</td>
        <td class="notes-col" dir="auto">${escapeHtml(e.notes)}</td>
      `;
      body.appendChild(tr);
    }
  }

  function rowKey(e) { return `${e.date}|${e.amount}|${e.category}|${e.notes}`; }

  // ---- Modal plumbing ----

  function openModal(id) { el(id).hidden = false; }
  function closeModal(id) { el(id).hidden = true; }

  function wireStaticEvents() {
    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(btn.dataset.closeModal));
    });
    document.querySelectorAll(".modal-overlay").forEach((overlay) => {
      overlay.addEventListener("click", (evt) => {
        if (evt.target === overlay) overlay.hidden = true;
      });
    });

    // Trip selector
    el("trip-select").addEventListener("change", async (evt) => {
      const value = evt.target.value;
      if (value === "__new__") {
        el("trip-select").value = activeTrip || "";
        openModal("new-trip-modal");
        el("new-trip-name").value = "";
        el("new-trip-error").classList.remove("visible");
        el("new-trip-name").focus();
        return;
      }
      await selectTrip(value);
    });

    el("empty-new-trip-btn").addEventListener("click", () => {
      openModal("new-trip-modal");
      el("new-trip-name").value = "";
      el("new-trip-error").classList.remove("visible");
    });

    el("create-trip-btn").addEventListener("click", onCreateTrip);
    el("new-trip-name").addEventListener("keydown", (e) => { if (e.key === "Enter") onCreateTrip(); });

    // Range selector
    document.querySelectorAll(".range-pill").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".range-pill").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        currentRangeKey = btn.dataset.range;
        el("custom-range-fields").classList.toggle("visible", currentRangeKey === "custom");
        renderAll();
      });
    });
    document.querySelector('.range-pill[data-range="all"]').classList.add("active");
    el("custom-from").addEventListener("change", () => { if (currentRangeKey === "custom") renderAll(); });
    el("custom-to").addEventListener("change", () => { if (currentRangeKey === "custom") renderAll(); });

    // Add expense
    el("add-expense-btn").addEventListener("click", openAddExpenseModal);
    el("expense-currency").addEventListener("change", updateConversionLine);
    el("expense-amount").addEventListener("input", updateConversionLine);
    el("save-expense-btn").addEventListener("click", onSaveExpense);

    el("divide-toggle-btn").addEventListener("click", () => {
      el("divide-panel").classList.toggle("visible");
    });
    el("divide-total").addEventListener("input", updateDivideResult);
    el("divide-by").addEventListener("input", updateDivideResult);

    // Rate history
    el("rate-history-link").addEventListener("click", async () => {
      const { history } = await getRateHistory();
      const body = el("rate-history-body");
      body.innerHTML = "";
      [...history].reverse().forEach((entry) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${escapeHtml(entry.date)}</td><td>${escapeHtml(entry.currency)}</td><td class="tabular-nums">${entry.rate}</td>`;
        body.appendChild(tr);
      });
      openModal("rate-history-modal");
    });

    // Pin categories
    el("pin-categories-btn").addEventListener("click", openPinCategoriesModal);
    el("save-pinned-categories-btn").addEventListener("click", onSavePinnedCategories);
  }

  function openPinCategoriesModal() {
    const list = el("pin-categories-list");
    list.innerHTML = "";
    for (const cat of appConfig.categories) {
      const id = `pin-cat-${cat.replace(/\W+/g, "-")}`;
      const label = document.createElement("label");
      label.className = "checkbox-pill";
      label.htmlFor = id;
      label.innerHTML = `
        <input type="checkbox" id="${id}" value="${escapeHtml(cat)}" ${pinnedCategories.includes(cat) ? "checked" : ""}>
        <span class="swatch" style="background:${categoryColor(cat)}"></span>
        ${escapeHtml(cat)}
      `;
      list.appendChild(label);
    }
    openModal("pin-categories-modal");
  }

  function onSavePinnedCategories() {
    const checked = Array.from(el("pin-categories-list").querySelectorAll("input:checked")).map((cb) => cb.value);
    savePinnedCategories(checked);
    closeModal("pin-categories-modal");
    renderAll();
  }

  async function onCreateTrip() {
    const name = el("new-trip-name").value.trim();
    const errorEl = el("new-trip-error");
    if (!name) {
      errorEl.textContent = "Trip name is required.";
      errorEl.classList.add("visible");
      return;
    }
    try {
      await createTripApi(name);
      closeModal("new-trip-modal");
      await refreshTripList();
      await selectTrip(name);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.classList.add("visible");
    }
  }

  function openAddExpenseModal() {
    el("expense-date").value = todayISO();
    el("expense-category").value = appConfig.categories[0];
    el("expense-currency").value = appConfig.base_currency;
    el("expense-amount").value = "";
    el("expense-notes").value = "";
    el("divide-panel").classList.remove("visible");
    el("divide-total").value = "";
    el("divide-by").value = "";
    el("divide-result").textContent = "—";
    el("expense-error").classList.remove("visible");
    updateConversionLine();
    openModal("add-expense-modal");
    el("expense-amount").focus();
  }

  function updateConversionLine() {
    const currency = el("expense-currency").value;
    const amount = parseFloat(el("expense-amount").value);
    const line = el("conversion-line");
    if (currency === appConfig.base_currency || isNaN(amount)) {
      line.hidden = true;
      return;
    }
    const rate = appConfig.exchange_rates[currency];
    const converted = amount * rate;
    line.hidden = false;
    line.textContent = `${currencySymbol(currency)}${amount.toFixed(2)} → ${formatBase(converted)} (rate ${rate})`;
  }

  function updateDivideResult() {
    const total = parseFloat(el("divide-total").value);
    const by = parseFloat(el("divide-by").value);
    const resultEl = el("divide-result");
    if (isNaN(total) || isNaN(by) || by <= 0) {
      resultEl.textContent = "—";
      return;
    }
    const result = total / by;
    resultEl.textContent = result.toFixed(2);
    el("expense-amount").value = result.toFixed(2);
    updateConversionLine();
  }

  async function onSaveExpense() {
    const errorEl = el("expense-error");
    errorEl.classList.remove("visible");

    const date = el("expense-date").value;
    const category = el("expense-category").value;
    const currency = el("expense-currency").value;
    const amount = parseFloat(el("expense-amount").value);
    const notes = el("expense-notes").value.trim();

    if (!date) { return showError(errorEl, "Date is required."); }
    if (!(amount > 0)) { return showError(errorEl, "Amount must be greater than 0."); }

    const rate = currency === appConfig.base_currency ? 1 : appConfig.exchange_rates[currency];
    const amountBase = Math.round(amount * rate * 100) / 100;

    try {
      await postExpense(activeTrip, { date, amount_base: amountBase, category, notes });
      window.__newlyAddedRowKey = rowKey({ date, amount: amountBase, category, notes });
      closeModal("add-expense-modal");
      allExpenses = (await getExpenses(activeTrip)).expenses;
      renderAll();
      setTimeout(() => { window.__newlyAddedRowKey = null; }, 1600);
    } catch (err) {
      showError(errorEl, err.message);
    }
  }

  function showError(errorEl, message) {
    errorEl.textContent = message;
    errorEl.classList.add("visible");
  }

  init();
})();

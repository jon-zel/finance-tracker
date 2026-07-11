/* Custom date input — replaces native <input type="date">.
 *
 * Chromium renders a native date input's placeholder and month names using
 * the browser's own UI language, ignoring the page's `lang` attribute. On a
 * Hebrew-language browser this showed the month segment as "מ"מ" even
 * though the rest of this app is English-only (spec §8). This widget is
 * entirely self-drawn so the displayed format never depends on the
 * visitor's browser or OS locale.
 *
 * attachDatePicker(inputId) turns the <input id="inputId"> into a hidden
 * ISO (yyyy-mm-dd) value holder and adds a visible dd/mm/yyyy text field +
 * calendar dropdown next to it. The element keeps its id and `.value`
 * still reads/writes the ISO string, and still fires a native "change"
 * event on selection — so existing code that does el(id).value or
 * el(id).addEventListener("change", ...) keeps working unchanged.
 */
(function () {
  "use strict";

  const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  function pad2(n) { return String(n).padStart(2, "0"); }

  function toISO(year, month, day) {
    return `${year}-${pad2(month + 1)}-${pad2(day)}`;
  }

  function parseISO(iso) {
    if (!iso) return null;
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return null;
    return { year: y, month: m - 1, day: d };
  }

  function isoToDisplay(iso) {
    const parsed = parseISO(iso);
    if (!parsed) return "";
    return `${pad2(parsed.day)}/${pad2(parsed.month + 1)}/${parsed.year}`;
  }

  // Accepts "d/m/yyyy" or 8 bare digits ("ddmmyyyy"); returns an ISO string
  // or null if it isn't a real calendar date.
  function displayToISO(text) {
    let day, month, year;
    if (text.includes("/")) {
      const parts = text.split("/").map((p) => p.trim());
      if (parts.length !== 3) return null;
      [day, month, year] = parts.map(Number);
    } else {
      const digits = text.replace(/\D/g, "");
      if (digits.length !== 8) return null;
      day = Number(digits.slice(0, 2));
      month = Number(digits.slice(2, 4));
      year = Number(digits.slice(4, 8));
    }
    if (!day || !month || !year || year < 100) return null;
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return toISO(year, month - 1, day);
  }

  function attachDatePicker(inputId) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    const getRaw = () => nativeValue.get.call(input);
    const setRaw = (v) => nativeValue.set.call(input, v);

    input.type = "hidden";

    const wrap = document.createElement("div");
    wrap.className = "date-picker";

    const display = document.createElement("input");
    display.type = "text";
    display.className = "date-picker-display";
    display.placeholder = "dd/mm/yyyy";
    display.autocomplete = "off";
    display.inputMode = "numeric";

    const panel = document.createElement("div");
    panel.className = "date-picker-panel";
    panel.hidden = true;

    const header = document.createElement("div");
    header.className = "date-picker-header";
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "date-picker-nav";
    prevBtn.textContent = "‹";
    prevBtn.setAttribute("aria-label", "Previous month");
    const label = document.createElement("span");
    label.className = "date-picker-label";
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "date-picker-nav";
    nextBtn.textContent = "›";
    nextBtn.setAttribute("aria-label", "Next month");
    header.append(prevBtn, label, nextBtn);

    const weekdays = document.createElement("div");
    weekdays.className = "date-picker-weekdays";
    for (const w of WEEKDAY_LABELS) {
      const cell = document.createElement("span");
      cell.textContent = w;
      weekdays.appendChild(cell);
    }

    const grid = document.createElement("div");
    grid.className = "date-picker-grid";

    panel.append(header, weekdays, grid);
    wrap.append(display, panel);
    input.insertAdjacentElement("afterend", wrap);

    let viewYear, viewMonth; // month currently shown in the open panel

    function updateDisplay() {
      display.value = isoToDisplay(getRaw());
    }

    function setValue(iso, opts) {
      opts = opts || {};
      setRaw(iso || "");
      updateDisplay();
      if (!opts.silent) input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Preserve el(id).value get/set semantics for callers that never
    // touch the picker UI (e.g. `el("expense-date").value = todayISO()`).
    Object.defineProperty(input, "value", {
      get: getRaw,
      set(v) { setRaw(v); updateDisplay(); },
      configurable: true,
    });

    function renderGrid() {
      label.textContent = `${MONTH_NAMES[viewMonth]} ${viewYear}`;
      grid.innerHTML = "";
      const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const selected = parseISO(getRaw());
      const today = new Date();

      for (let i = 0; i < firstWeekday; i++) {
        grid.appendChild(document.createElement("span"));
      }
      for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "date-picker-day";
        cell.textContent = String(day);
        if (selected && selected.year === viewYear && selected.month === viewMonth && selected.day === day) {
          cell.classList.add("selected");
        }
        if (today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === day) {
          cell.classList.add("today");
        }
        cell.addEventListener("click", () => {
          setValue(toISO(viewYear, viewMonth, day));
          closePanel();
        });
        grid.appendChild(cell);
      }
    }

    function openPanel() {
      const parsed = parseISO(getRaw()) || { year: new Date().getFullYear(), month: new Date().getMonth() };
      viewYear = parsed.year;
      viewMonth = parsed.month;
      renderGrid();
      panel.hidden = false;
      document.addEventListener("click", onOutsideClick, true);
    }

    function closePanel() {
      panel.hidden = true;
      document.removeEventListener("click", onOutsideClick, true);
    }

    function onOutsideClick(e) {
      if (!wrap.contains(e.target)) closePanel();
    }

    prevBtn.addEventListener("click", () => {
      viewMonth -= 1;
      if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
      renderGrid();
    });
    nextBtn.addEventListener("click", () => {
      viewMonth += 1;
      if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
      renderGrid();
    });

    function commitDisplay() {
      const text = display.value.trim();
      if (text === "") { setValue(""); return; }
      const iso = displayToISO(text);
      if (iso) setValue(iso);
      else updateDisplay(); // invalid — revert to the last good value
    }

    display.addEventListener("focus", () => { if (panel.hidden) openPanel(); });
    display.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); commitDisplay(); closePanel(); }
      if (e.key === "Escape") { closePanel(); }
    });
    display.addEventListener("blur", commitDisplay);

    updateDisplay();
  }

  window.attachDatePicker = attachDatePicker;
})();

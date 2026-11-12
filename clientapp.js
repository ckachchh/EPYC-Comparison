(function () {
  "use strict";

  const MAX_COMPARE = 4;

  const state = {
    all: [],
    filtered: [],
    sortKey: "name",
    sortDir: "asc",
    selected: new Set(),
    ranks: {},
  };

  const els = {
    search: document.getElementById("search-input"),
    vendorChecks: Array.from(document.querySelectorAll("#filter-vendor input[type=\"checkbox\"]")),
    platformChecks: Array.from(document.querySelectorAll("#filter-platform input[type=\"checkbox\"]")),
    generationWrap: document.getElementById("filter-generation"),
    generationToggle: document.querySelector("#filter-generation .multiselect-toggle"),
    generationPanel: document.querySelector("#filter-generation .multiselect-panel"),
    generationCount: document.querySelector("#filter-generation .ms-count"),
    cores: document.getElementById("filter-cores"),
    reset: document.getElementById("reset-filters"),
    rowCount: document.getElementById("row-count"),
    tbody: document.getElementById("cpu-table-body"),
    headerCells: Array.from(document.querySelectorAll("#cpu-table thead th[data-key]")),
    compareBtn: document.getElementById("compare-btn"),
    comparePanel: document.getElementById("compare-panel"),
    compareTableWrap: document.getElementById("compare-table-wrap"),
    compareClose: document.getElementById("compare-close"),
    table: document.getElementById("cpu-table"),
    heatToggle: document.getElementById("heat-toggle"),
    themeToggle: document.getElementById("theme-toggle"),
    copyLink: document.getElementById("copy-link"),
  };

  const COLUMNS = els.headerCells.map((th) => ({
    key: th.dataset.key,
    type: th.dataset.type,
    group: th.dataset.group || null,
    el: th,
  }));

  const GROUP_OF = {};
  for (const col of COLUMNS) {
    if (col.group) GROUP_OF[col.key] = col.group;
  }

  // For each numeric column, the sorted list of distinct values across ALL rows.
  // A cell's shade is its position in that list (0 = lowest, 1 = highest), so the
  // colour stays the same for a CPU no matter which filters are active.
  function buildRanks(data) {
    for (const col of COLUMNS) {
      if (col.type !== "num" || !col.group) continue;
      const vals = Array.from(new Set(data.map((r) => r[col.key]).filter((v) => typeof v === "number"))).sort((a, b) => a - b);
      state.ranks[col.key] = vals;
    }
  }

  function heatLevel(key, val) {
    const vals = state.ranks[key];
    if (!vals || typeof val !== "number") return null;
    if (vals.length < 2) return 1;
    return vals.indexOf(val) / (vals.length - 1);
  }

  function applyHeat(td, key, val) {
    const group = GROUP_OF[key];
    if (!group) return;
    td.classList.add("grp", `g-${group}`);
    const t = heatLevel(key, val);
    if (t === null) return;
    td.classList.add("heat-cell");
    td.style.setProperty("--a", (0.05 + 0.4 * t).toFixed(3));
    if (t >= 0.85) td.classList.add("heat-top");
  }

  // Fields shown in the side-by-side comparison panel, in order.
  const COMPARE_FIELDS = [
    { key: "vendor", label: "Vendor" },
    { key: "platform", label: "Platform" },
    { key: "generation", label: "Generation" },
    { key: "npuTops", label: "NPU TOPS" },
    { key: "pCores", label: "Performance Cores" },
    { key: "eCores", label: "Efficiency Cores" },
    { key: "lpECores", label: "Low Power Efficient Core" },
    { key: "threads", label: "Threads" },
    { key: "baseFreqGHz", label: "Base Frequency (GHz)" },
    { key: "boostFreqGHz", label: "Boost Frequency (GHz)" },
    { key: "cacheMB", label: "Cache Memory (MB)" },
    { key: "graphicsModel", label: "Graphics" },
    { key: "graphicsFreqGHz", label: "Graphics Frequency (GHz, up to)" },
    { key: "lithography", label: "Processor Technology" },
    { key: "tdpW", label: "TDP (W, Intel: base\u2013max turbo)" },
  ];

  function rowId(row) {
    return row.__id;
  }

  function displayName(row) {
    return row.name || "—";
  }

  function fmt(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "number") {
      return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
    }
    return value;
  }

  // Text for one field of a row. Intel TDP is shown as
  // "Processor Base Power–Maximum Turbo Power" (e.g. 15–57) when ARK lists both.
  function fieldText(row, key) {
    if (key === "tdpW" && typeof row.tdpW === "number" && typeof row.tdpMaxW === "number" && row.tdpMaxW !== row.tdpW) {
      return `${fmt(row.tdpW)}\u2013${fmt(row.tdpMaxW)}`;
    }
    return fmt(row[key]);
  }

  // Renders a cell's value as text, or as a link to its official source page when
  // the row has a sourceUrl and the column is the Model/name column.
  function renderCellValue(td, row, key) {
    const val = row[key];
    if (key === "name" && row.sourceUrl) {
      const link = document.createElement("a");
      link.href = row.sourceUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "spec-link";
      link.textContent = fmt(val);
      link.title = "View official spec page";
      td.appendChild(link);
    } else {
      td.textContent = fieldText(row, key);
      if (key === "tdpW" && typeof row.tdpMaxW === "number") {
        td.title = `Processor Base Power ${row.tdpW} W, Maximum Turbo Power ${row.tdpMaxW} W`;
      }
    }
  }

  function selectedVendors() {
    return els.vendorChecks.filter((c) => c.checked).map((c) => c.value);
  }

  function selectedPlatforms() {
    return els.platformChecks.filter((c) => c.checked).map((c) => c.value);
  }

  function selectedGenerations() {
    return Array.from(els.generationPanel.querySelectorAll("input[type=\"checkbox\"]:checked")).map((c) => c.value);
  }

  function applyFilters() {
    const q = els.search.value.trim().toLowerCase();
    const vendors = selectedVendors();
    const platforms = selectedPlatforms();
    const generations = selectedGenerations();
    const cores = els.cores.value ? Number(els.cores.value) : null;

    state.filtered = state.all.filter((row) => {
      if (vendors.length > 0 && !vendors.includes(row.vendor)) return false;
      if (platforms.length > 0 && !platforms.includes(row.platform)) return false;
      if (generations.length > 0 && !generations.includes(row.generation)) return false;
      if (cores !== null && totalCores(row) !== cores) return false;
      if (q) {
        const haystack = `${displayName(row)} ${row.generation || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    updateGenerationToggleLabel();
    sortRows();
    render();
  }

  function totalCores(row) {
    const p = typeof row.pCores === "number" ? row.pCores : 0;
    const e = typeof row.eCores === "number" ? row.eCores : 0;
    const lp = typeof row.lpECores === "number" ? row.lpECores : 0;
    const total = p + e + lp;
    return total > 0 ? total : null;
  }

  function updateGenerationToggleLabel() {
    const checked = selectedGenerations().length;
    els.generationCount.textContent = checked === 0 ? "(All)" : `(${checked})`;
  }

  function sortRows() {
    const { sortKey, sortDir } = state;
    const col = COLUMNS.find((c) => c.key === sortKey);
    const type = col ? col.type : "text";
    const dir = sortDir === "asc" ? 1 : -1;

    state.filtered.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];

      const aNull = av === null || av === undefined || av === "";
      const bNull = bv === null || bv === undefined || bv === "";
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;

      if (type === "num") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }

  function render() {
    els.tbody.innerHTML = "";

    if (state.filtered.length === 0) {
      const tr = document.createElement("tr");
      tr.className = "no-results";
      const td = document.createElement("td");
      td.colSpan = COLUMNS.length + 1;
      td.textContent = "No processors match the current filters.";
      tr.appendChild(td);
      els.tbody.appendChild(tr);
    } else {
      const fragment = document.createDocumentFragment();
      for (const row of state.filtered) {
        const tr = document.createElement("tr");
        tr.className = row.vendor === "AMD" ? "vendor-amd" : row.vendor === "Intel" ? "vendor-intel" : "";

        const selectTd = document.createElement("td");
        selectTd.className = "col-select";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = state.selected.has(rowId(row));
        checkbox.setAttribute("aria-label", `Select ${displayName(row)} for comparison`);
        checkbox.addEventListener("change", () => toggleSelection(row, checkbox));
        selectTd.appendChild(checkbox);
        tr.appendChild(selectTd);

        for (const col of COLUMNS) {
          const td = document.createElement("td");
          if (col.key === "vendor") {
            const badge = document.createElement("span");
            badge.className = `vendor-badge vendor-badge--${row.vendor.toLowerCase()}`;
            badge.textContent = row.vendor;
            td.appendChild(badge);
          } else {
            const val = row[col.key];
            renderCellValue(td, row, col.key);
            if (val === null || val === undefined || val === "") {
              td.classList.add("cell-muted");
            }
            applyHeat(td, col.key, val);
          }
          tr.appendChild(td);
        }
        fragment.appendChild(tr);
      }
      els.tbody.appendChild(fragment);
    }

    els.rowCount.textContent = `Showing ${state.filtered.length.toLocaleString()} of ${state.all.length.toLocaleString()} SKUs`;
    updateSortIndicators();
    updateCompareButton();
    writeUrlState();
  }

  function toggleSelection(row, checkbox) {
    const id = rowId(row);
    if (checkbox.checked) {
      if (state.selected.size >= MAX_COMPARE) {
        checkbox.checked = false;
        window.alert(`You can compare up to ${MAX_COMPARE} processors at a time.`);
        return;
      }
      state.selected.add(id);
    } else {
      state.selected.delete(id);
    }
    updateCompareButton();
    if (!els.comparePanel.hidden) {
      renderComparePanel();
    }
    writeUrlState();
  }

  function updateCompareButton() {
    const n = state.selected.size;
    els.compareBtn.textContent = `Compare Selected (${n})`;
    els.compareBtn.disabled = n < 2;
  }

  function renderComparePanel() {
    const rows = state.all.filter((r) => state.selected.has(rowId(r)));
    els.compareTableWrap.innerHTML = "";

    if (rows.length < 2) {
      els.comparePanel.hidden = true;
      return;
    }

    const table = document.createElement("table");
    table.className = "compare-table";

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const cornerTh = document.createElement("th");
    cornerTh.textContent = "Spec";
    headRow.appendChild(cornerTh);
    for (const row of rows) {
      const th = document.createElement("th");
      th.className = row.vendor === "AMD" ? "vendor-amd" : "vendor-intel";
      const nameDiv = document.createElement("div");
      nameDiv.className = "compare-col-name";
      nameDiv.textContent = displayName(row);
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "compare-remove";
      removeBtn.textContent = "×";
      removeBtn.setAttribute("aria-label", `Remove ${displayName(row)} from comparison`);
      removeBtn.addEventListener("click", () => {
        state.selected.delete(rowId(row));
        updateCompareButton();
        renderComparePanel();
        render();
      });
      th.appendChild(nameDiv);
      th.appendChild(removeBtn);
      headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const field of COMPARE_FIELDS) {
      const tr = document.createElement("tr");
      const labelTd = document.createElement("td");
      labelTd.className = "compare-label";
      if (GROUP_OF[field.key]) labelTd.classList.add(`g-${GROUP_OF[field.key]}`);
      labelTd.textContent = field.label;
      tr.appendChild(labelTd);

      const values = rows.map((r) => r[field.key]);
      const numericValues = values.filter((v) => typeof v === "number");
      const best = numericValues.length === rows.length ? Math.max(...numericValues) : null;

      rows.forEach((row, i) => {
        const td = document.createElement("td");
        const val = row[field.key];
        if (field.key === "vendor") {
          const badge = document.createElement("span");
          badge.className = `vendor-badge vendor-badge--${val.toLowerCase()}`;
          badge.textContent = val;
          td.appendChild(badge);
        } else {
          td.textContent = fieldText(row, field.key);
        }
        if (val === null || val === undefined || val === "") {
          td.classList.add("cell-muted");
        }
        if (best !== null && val === best) {
          td.classList.add("compare-best");
          if (GROUP_OF[field.key]) td.classList.add(`g-${GROUP_OF[field.key]}`);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    els.compareTableWrap.appendChild(table);
    els.comparePanel.hidden = false;
    writeUrlState();
  }

  function updateSortIndicators() {
    for (const col of COLUMNS) {
      col.el.classList.remove("sorted");
      const existing = col.el.querySelector(".sort-indicator");
      if (existing) existing.remove();
    }
    const activeCol = COLUMNS.find((c) => c.key === state.sortKey);
    if (activeCol) {
      activeCol.el.classList.add("sorted");
      const span = document.createElement("span");
      span.className = "sort-indicator";
      span.textContent = state.sortDir === "asc" ? "▲" : "▼";
      activeCol.el.appendChild(span);
    }
  }

  function initSortHandlers() {
    for (const col of COLUMNS) {
      col.el.addEventListener("click", () => {
        if (state.sortKey === col.key) {
          state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
        } else {
          state.sortKey = col.key;
          state.sortDir = "asc";
        }
        sortRows();
        render();
      });
    }
  }

  function populateGenerationPanel(generations) {
    els.generationPanel.innerHTML = "";
    for (const gen of generations) {
      const label = document.createElement("label");
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = gen;
      checkbox.checked = false;
      checkbox.addEventListener("change", applyFilters);
      label.appendChild(checkbox);
      label.appendChild(document.createTextNode(" " + gen));
      els.generationPanel.appendChild(label);
    }
    updateGenerationToggleLabel();
  }

  function populateCoresSelect(coreCounts) {
    els.cores.innerHTML = "<option value=\"\">All</option>";
    for (const c of coreCounts) {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c;
      els.cores.appendChild(opt);
    }
  }

  function initGenerationMultiselect() {
    els.generationToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      els.generationPanel.hidden = !els.generationPanel.hidden;
    });
    document.addEventListener("click", (e) => {
      if (!els.generationWrap.contains(e.target)) {
        els.generationPanel.hidden = true;
      }
    });
  }

  function initFilterHandlers() {
    els.search.addEventListener("input", applyFilters);
    els.cores.addEventListener("change", applyFilters);
    for (const el of els.vendorChecks) {
      el.addEventListener("change", applyFilters);
    }
    for (const el of els.platformChecks) {
      el.addEventListener("change", applyFilters);
    }

    els.reset.addEventListener("click", () => {
      els.search.value = "";
      els.cores.value = "";
      for (const el of els.vendorChecks) el.checked = true;
      for (const el of els.platformChecks) el.checked = true;
      for (const el of els.generationPanel.querySelectorAll("input[type=\"checkbox\"]")) el.checked = false;
      applyFilters();
    });
  }

  function initHeatToggle() {
    const sync = () => {
      els.table.classList.toggle("heat", els.heatToggle.checked);
      writeUrlState();
    };
    els.heatToggle.addEventListener("change", sync);
    sync();
  }

  function initCompareHandlers() {
    els.compareBtn.addEventListener("click", renderComparePanel);
    els.compareClose.addEventListener("click", () => {
      els.comparePanel.hidden = true;
      writeUrlState();
    });
  }

  // ---------- Dark mode ----------
  // The initial theme is set by a tiny script in <head> (saved choice, else system setting).
  function initThemeToggle() {
    if (!els.themeToggle) return;
    const root = document.documentElement;
    const sync = () => {
      const dark = root.getAttribute("data-theme") === "dark";
      els.themeToggle.textContent = dark ? "Light mode" : "Dark mode";
      els.themeToggle.setAttribute("aria-pressed", dark ? "true" : "false");
    };
    els.themeToggle.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("cpu-theme", next); } catch (e) { /* storage blocked: theme lasts for this visit */ }
      sync();
    });
    sync();
  }

  // ---------- Shareable links ----------
  // The current view is kept in the page address, e.g.
  //   clientindex.html?q=ryzen&vendor=AMD&cores=8&sort=boostFreqGHz&dir=desc&compare=Ryzen+7+9700X,Core+Ultra+7+265K
  // Only non-default settings are written, so the plain page keeps a clean address.
  let urlReady = false; // don't overwrite the incoming address until it has been read

  function writeUrlState() {
    if (!urlReady || !window.history || !window.history.replaceState) return;
    const p = new URLSearchParams();
    const q = els.search.value.trim();
    if (q) p.set("q", q);
    const vendors = selectedVendors();
    if (vendors.length > 0 && vendors.length < els.vendorChecks.length) p.set("vendor", vendors.join(","));
    const platforms = selectedPlatforms();
    if (platforms.length > 0 && platforms.length < els.platformChecks.length) p.set("platform", platforms.join(","));
    const gens = selectedGenerations();
    if (gens.length > 0) p.set("gen", gens.join(","));
    if (els.cores.value) p.set("cores", els.cores.value);
    if (state.sortKey !== "name") p.set("sort", state.sortKey);
    if (state.sortDir !== "asc") p.set("dir", state.sortDir);
    if (!els.heatToggle.checked) p.set("shade", "off");
    if (state.selected.size > 0) {
      const names = state.all.filter((r) => state.selected.has(rowId(r))).map((r) => r.name);
      p.set("compare", names.join(","));
      if (els.comparePanel.hidden) p.set("panel", "closed");
    }
    const qs = p.toString().replace(/%2C/g, ","); // keep commas readable in shared links
    const url = window.location.pathname + (qs ? "?" + qs : "") + window.location.hash;
    try { window.history.replaceState(null, "", url); } catch (e) { /* e.g. opened from a file preview */ }
  }

  function readUrlState() {
    const p = new URLSearchParams(window.location.search);
    const list = (key) => (p.get(key) || "").split(",").map((s) => s.trim()).filter(Boolean);

    if (p.has("q")) els.search.value = p.get("q");

    const vendors = list("vendor");
    if (vendors.length) for (const el of els.vendorChecks) el.checked = vendors.includes(el.value);

    const platforms = list("platform");
    if (platforms.length) for (const el of els.platformChecks) el.checked = platforms.includes(el.value);

    const gens = list("gen");
    for (const el of els.generationPanel.querySelectorAll("input[type=\"checkbox\"]")) {
      el.checked = gens.includes(el.value);
    }

    const cores = p.get("cores");
    if (cores && Array.from(els.cores.options).some((o) => o.value === cores)) els.cores.value = cores;

    const sort = p.get("sort");
    if (sort && COLUMNS.some((c) => c.key === sort)) state.sortKey = sort;
    if (p.get("dir") === "desc") state.sortDir = "desc";

    if (p.get("shade") === "off") els.heatToggle.checked = false;

    const names = list("compare");
    for (const row of state.all) {
      if (names.includes(row.name) && state.selected.size < MAX_COMPARE) state.selected.add(rowId(row));
    }
    return state.selected.size >= 2 && p.get("panel") !== "closed";
  }

  function initCopyLink() {
    if (!els.copyLink) return;
    let timer = null;
    const done = (ok) => {
      els.copyLink.textContent = ok ? "Link copied" : "Copy failed";
      els.copyLink.classList.toggle("copied", ok);
      clearTimeout(timer);
      timer = setTimeout(() => {
        els.copyLink.textContent = "Copy link";
        els.copyLink.classList.remove("copied");
      }, 2000);
    };
    els.copyLink.addEventListener("click", () => {
      writeUrlState();
      const url = window.location.href;
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(url).then(() => done(true), () => {
          window.prompt("Copy this link:", url);
        });
      } else {
        window.prompt("Copy this link:", url);
      }
    });
  }

  function init(data) {
    data.forEach((row, i) => {
      row.__id = i;
    });
    state.all = data;
    state.filtered = data.slice();

    const generations = Array.from(new Set(data.map((r) => r.generation).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    populateGenerationPanel(generations);

    const coreCounts = Array.from(new Set(data.map((r) => totalCores(r)).filter((c) => typeof c === "number"))).sort((a, b) => a - b);
    populateCoresSelect(coreCounts);
    buildRanks(data);
    const openCompare = readUrlState();
    urlReady = true;
    initHeatToggle();
    initCopyLink();

    initSortHandlers();
    initGenerationMultiselect();
    initFilterHandlers();
    initCompareHandlers();
    applyFilters();
    if (openCompare) renderComparePanel();
  }

  initThemeToggle();

  if (!window.CPU_DATA) {
    els.rowCount.textContent = "Failed to load CPU data (clientcpus.js missing or failed to load).";
  } else {
    init(window.CPU_DATA);
  }
})();

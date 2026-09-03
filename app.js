(function () {
  "use strict";

  const MAX_COMPARE = 4;

  const state = {
    all: [],
    filtered: [],
    sortKey: "listPriceUSD",
    sortDir: "asc",
    selected: new Set(),
  };

  const els = {
    search: document.getElementById("search-input"),
    vendorChecks: Array.from(document.querySelectorAll("#filter-vendor input[type=\"checkbox\"]")),
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
  };

  const COLUMNS = els.headerCells.map((th) => ({
    key: th.dataset.key,
    type: th.dataset.type,
    el: th,
  }));

  // Fields shown in the side-by-side comparison panel, in order.
  const COMPARE_FIELDS = [
    { key: "vendor", label: "Vendor" },
    { key: "generation", label: "Generation" },
    { key: "codename", label: "Codename" },
    { key: "cores", label: "Cores" },
    { key: "threads", label: "Threads" },
    { key: "baseFreqGHz", label: "Base Freq. (GHz)" },
    { key: "maxBoostGHz", label: "Max Boost (GHz)" },
    { key: "l3CacheMB", label: "L3 Cache (MB)" },
    { key: "lithography", label: "Lithography" },
    { key: "tdpW", label: "TDP (W)" },
    { key: "ddrFreqMTs", label: "DDR Freq. (MT/s)" },
    { key: "maxMemTB", label: "Max Mem (TB)" },
    { key: "memoryChannels", label: "Memory Channels" },
    { key: "pciLanes", label: "PCI Lanes" },
    { key: "scalability", label: "Scalability" },
    { key: "socketType", label: "Socket Type" },
    { key: "listPriceUSD", label: "List Price (US$)" },
    { key: "specrate2017Int", label: "SPECrate2017 Int" },
    { key: "specfp2017", label: "SPECfp2017" },
    { key: "specrate2026Int", label: "SPECrate2026 Int" },
    { key: "specrate2026Fp", label: "SPECrate2026 FP" },
    { key: "perfPerDollar", label: "Perf/$" },
  ];

  // Numeric fields that may carry a source link (e.g. to a SPEC.org result PDF),
  // mapped to the row property holding that URL.
  const LINK_URL_KEYS = {
    specrate2017Int: "specrate2017IntUrl",
    specfp2017: "specfp2017Url",
    specrate2026Int: "specrate2026IntUrl",
    specrate2026Fp: "specrate2026FpUrl",
  };

  function rowId(row) {
    return row.__id;
  }

  function displayName(row) {
    if (row.vendor === "AMD" && !/^amd/i.test(row.name || "")) {
      return `AMD EPYC ${row.name}`;
    }
    return row.name || "—";
  }

  function fmt(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "number") {
      return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 3 });
    }
    return value;
  }

  // Renders a cell's value as text, or as a link to its SPEC.org source when the
  // column has an associated URL field (see LINK_URL_KEYS) and the row has one set.
  function renderCellValue(td, row, key) {
    const val = row[key];
    const urlKey = LINK_URL_KEYS[key];
    const url = urlKey ? row[urlKey] : null;
    if (url && val !== null && val !== undefined && val !== "") {
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.className = "spec-link";
      link.textContent = fmt(val);
      link.title = "View SPEC.org result";
      td.appendChild(link);
    } else {
      td.textContent = fmt(val);
    }
  }

  function selectedVendors() {
    return els.vendorChecks.filter((c) => c.checked).map((c) => c.value);
  }

  function selectedGenerations() {
    return Array.from(els.generationPanel.querySelectorAll("input[type=\"checkbox\"]:checked")).map((c) => c.value);
  }

  function applyFilters() {
    const q = els.search.value.trim().toLowerCase();
    const vendors = selectedVendors();
    const generations = selectedGenerations();
    const cores = els.cores.value ? Number(els.cores.value) : null;

    state.filtered = state.all.filter((row) => {
      if (vendors.length > 0 && !vendors.includes(row.vendor)) return false;
      if (generations.length > 0 && !generations.includes(row.generation)) return false;
      if (cores !== null && row.cores !== cores) return false;
      if (q) {
        const haystack = `${displayName(row)} ${row.generation || ""} ${row.codename || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });

    updateGenerationToggleLabel();
    sortRows();
    render();
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
      let av = sortKey === "name" ? displayName(a) : a[sortKey];
      let bv = sortKey === "name" ? displayName(b) : b[sortKey];

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
          } else if (col.key === "name") {
            td.textContent = displayName(row);
          } else {
            const val = row[col.key];
            renderCellValue(td, row, col.key);
            if (val === null || val === undefined || val === "") {
              td.classList.add("cell-muted");
            }
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
          renderCellValue(td, row, field.key);
        }
        if (val === null || val === undefined || val === "") {
          td.classList.add("cell-muted");
        }
        if (best !== null && val === best) {
          td.classList.add("compare-best");
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    els.compareTableWrap.appendChild(table);
    els.comparePanel.hidden = false;
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

    els.reset.addEventListener("click", () => {
      els.search.value = "";
      els.cores.value = "";
      for (const el of els.vendorChecks) el.checked = true;
      for (const el of els.generationPanel.querySelectorAll("input[type=\"checkbox\"]")) el.checked = false;
      applyFilters();
    });
  }

  function initCompareHandlers() {
    els.compareBtn.addEventListener("click", renderComparePanel);
    els.compareClose.addEventListener("click", () => {
      els.comparePanel.hidden = true;
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

    const coreCounts = Array.from(new Set(data.map((r) => r.cores).filter((c) => typeof c === "number"))).sort((a, b) => a - b);
    populateCoresSelect(coreCounts);

    initSortHandlers();
    initGenerationMultiselect();
    initFilterHandlers();
    initCompareHandlers();
    applyFilters();
  }

  if (!window.CPU_DATA) {
    els.rowCount.textContent = "Failed to load CPU data (data/cpus.js missing or failed to load).";
  } else {
    init(window.CPU_DATA);
  }
})();

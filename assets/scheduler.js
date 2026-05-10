const state = {
  sourceName: "",
  rows: [],
  shifts: [],
  employees: new Map(),
  dayNotes: new Map(),
  warnings: [],
};

const $ = (selector) => document.querySelector(selector);
const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];
const offWords = /休|公休|店休|補休|請假|特休/;
const datePattern = /(\d{1,2})\s*\/\s*(\d{1,2})/;

const els = {
  dropZone: $("#dropZone"),
  fileInput: $("#fileInput"),
  pickFile: $("#pickFile"),
  statusLine: $("#statusLine"),
  monthFilter: $("#monthFilter"),
  employeeFilter: $("#employeeFilter"),
  viewFilter: $("#viewFilter"),
  exportCsv: $("#exportCsv"),
  metricShifts: $("#metricShifts"),
  metricEmployees: $("#metricEmployees"),
  metricHours: $("#metricHours"),
  metricNotes: $("#metricNotes"),
  calendarTitle: $("#calendarTitle"),
  parseMeta: $("#parseMeta"),
  calendarGrid: $("#calendarGrid"),
  shiftTable: $("#shiftTable"),
  messageEmployee: $("#messageEmployee"),
  messageText: $("#messageText"),
  copyMessage: $("#copyMessage"),
  staffBars: $("#staffBars"),
  emptyState: $("#emptyState"),
};

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

els.pickFile.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) handleFile(file);
});

["dragenter", "dragover"].forEach((type) => {
  els.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((type) => {
  els.dropZone.addEventListener(type, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("is-dragging");
  });
});

els.dropZone.addEventListener("drop", (event) => {
  const [file] = event.dataTransfer.files;
  if (file) handleFile(file);
});

[els.monthFilter, els.employeeFilter, els.viewFilter].forEach((el) => {
  el.addEventListener("change", render);
});

els.messageEmployee.addEventListener("change", renderMessage);
els.copyMessage.addEventListener("click", async () => {
  await navigator.clipboard.writeText(els.messageText.value);
  els.copyMessage.textContent = "已複製";
  setTimeout(() => {
    els.copyMessage.textContent = "複製";
  }, 1200);
});

els.exportCsv.addEventListener("click", () => {
  const rows = getFilteredShifts();
  const header = ["date", "weekday", "employee", "start", "end", "hours", "status", "note", "sheet"];
  const csv = [header, ...rows.map((shift) => [
    shift.date,
    shift.weekday,
    shift.employee,
    shift.start || "",
    shift.end || "",
    shift.hours || "",
    shift.status,
    shift.note || "",
    shift.sheet || "",
  ])].map((line) => line.map(csvEscape).join(",")).join("\n");
  downloadText(`birth-roster-${currentMonthKey() || "export"}.csv`, csv);
});

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function downloadText(filename, text) {
  const blob = new Blob([`\uFEFF${text}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function handleFile(file) {
  resetData(file.name);
  setStatus("讀取中...");
  try {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".pdf") || file.type === "application/pdf") {
      await parsePdf(file);
    } else {
      await parseWorkbook(file);
    }
    normalizeCollections();
    populateFilters();
    render();
    setStatus(`完成：${state.shifts.length} 筆紀錄、${state.employees.size} 位員工`);
  } catch (error) {
    console.error(error);
    setStatus(`解析失敗：${error.message}`);
  }
}

function resetData(sourceName) {
  state.sourceName = sourceName;
  state.rows = [];
  state.shifts = [];
  state.employees = new Map();
  state.dayNotes = new Map();
  state.warnings = [];
  els.fileInput.value = "";
}

function setStatus(message) {
  els.statusLine.textContent = message;
}

async function parseWorkbook(file) {
  if (!window.XLSX) throw new Error("Excel 解析套件尚未載入，請確認網路連線後重試。");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const year = findYear(file.name) || new Date().getFullYear();

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
    parseGridRows(rows, {
      sheetName,
      year: findYear(sheetName) || year,
      sheetMonth: findSheetMonth(sheetName),
      source: "excel",
    });
  });
}

async function parsePdf(file) {
  if (!window.pdfjsLib) throw new Error("PDF 解析套件尚未載入，請確認網路連線後重試。");
  const buffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buffer }).promise;
  const year = findYear(file.name) || new Date().getFullYear();

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const rows = textItemsToRows(content.items);
    parseGridRows(rows, { sheetName: `PDF 第 ${pageIndex} 頁`, year, source: "pdf" });
  }
  state.warnings.push("PDF 解析依文字位置推估欄位；若匯出結果不準，建議優先上傳 Excel。");
}

function textItemsToRows(items) {
  const buckets = [];
  items.forEach((item) => {
    const text = String(item.str || "").trim();
    if (!text) return;
    const x = item.transform[4];
    const y = item.transform[5];
    let bucket = buckets.find((row) => Math.abs(row.y - y) < 4);
    if (!bucket) {
      bucket = { y, cells: [] };
      buckets.push(bucket);
    }
    bucket.cells.push({ x, text });
  });

  return buckets
    .sort((a, b) => b.y - a.y)
    .map((row) => row.cells.sort((a, b) => a.x - b.x).map((cell) => cell.text));
}

function parseGridRows(rows, context) {
  const dateRows = [];
  rows.forEach((row, index) => {
    const dateCells = getDateCells(row);
    const hasMonthLead = /月/.test(clean(row[0] || ""));
    if (dateCells.length >= 2 || (hasMonthLead && dateCells.length >= 1)) {
      dateRows.push({ rowIndex: index, dateCells });
    }
  });

  dateRows.forEach((dateRow, dateRowIndex) => {
    const nextDateRowIndex = dateRows[dateRowIndex + 1]?.rowIndex ?? rows.length;
    const compactPdfRow = context.source === "pdf" && isCompactDateRow(dateRow.dateCells);
    const dates = dateRow.dateCells.map((cell, index) => parseDateHeader(cell, {
      year: context.year,
      monthOverride: context.sheetMonth,
      fallbackColumn: cell.column,
      nextColumn: dateRow.dateCells[index + 1]?.column,
      compactPdfRow,
      index,
    })).filter(Boolean);

    dates.forEach((day) => {
      if (day.note) state.dayNotes.set(day.iso, day.note);
    });

    for (let rowIndex = dateRow.rowIndex + 1; rowIndex < nextDateRowIndex; rowIndex += 1) {
      const row = rows[rowIndex] || [];
      const employee = normalizeName(row[0]);
      if (!employee || !looksLikeEmployee(employee)) continue;
      captureEmployeeMeta(employee, row);

      if (compactPdfRow) {
        parseCompactEmployeeRow(employee, row, dates, context);
      } else {
        dates.forEach((day) => {
          const cells = row.slice(day.startColumn, day.endColumn);
          addShiftFromCells(employee, day, cells, context);
        });
      }
    }
  });
}

function getDateCells(row) {
  return row
    .map((value, column) => ({ value: clean(value), column }))
    .filter((cell) => datePattern.test(cell.value));
}

function isCompactDateRow(dateCells) {
  if (dateCells.length < 2) return false;
  return dateCells.every((cell, index) => index === 0 || cell.column - dateCells[index - 1].column <= 2);
}

function parseDateHeader(cell, options) {
  const match = clean(cell.value).match(datePattern);
  if (!match) return null;
  const month = options.monthOverride || Number(match[1]);
  const day = Number(match[2]);
  const date = new Date(options.year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;

  const label = clean(cell.value);
  const weekday = weekdayNames[date.getDay()];
  const note = label
    .replace(datePattern, "")
    .replace(/[()（）日一二三四五六ㄧ]/g, "")
    .trim();

  return {
    iso: toIso(date),
    monthKey: `${options.year}-${String(month).padStart(2, "0")}`,
    day,
    weekday,
    label,
    note,
    startColumn: options.compactPdfRow ? options.index + 1 : cell.column,
    endColumn: options.compactPdfRow ? options.index + 2 : (options.nextColumn ?? cell.column + 3),
  };
}

function parseCompactEmployeeRow(employee, row, dates, context) {
  let cursor = 1;
  dates.forEach((day) => {
    const remaining = row.slice(cursor).map(clean).filter(Boolean);
    const consumed = consumeShiftTokens(remaining);
    if (consumed.cells.length) addShiftFromCells(employee, day, consumed.cells, context);
    cursor += Math.max(consumed.count, 1);
  });
}

function consumeShiftTokens(tokens) {
  if (!tokens.length) return { cells: [], count: 0 };
  const first = tokens[0];
  if (offWords.test(first)) return { cells: [first], count: 1 };
  if (isTimeToken(first)) {
    if (tokens[1] === "-" && isTimeToken(tokens[2])) return { cells: tokens.slice(0, 3), count: 3 };
    if (isTimeToken(tokens[1])) return { cells: tokens.slice(0, 2), count: 2 };
    return { cells: [first], count: 1 };
  }
  return { cells: [first], count: 1 };
}

function addShiftFromCells(employee, day, cells, context) {
  const values = cells.map(clean).filter(Boolean);
  const meaningful = values.filter((value) => value !== "-");
  if (!meaningful.length) return;

  const text = meaningful.join(" ");
  const times = values.filter(isTimeToken).map(Number);
  const isOff = offWords.test(text);
  const isWork = times.length >= 2 && !/^[休公店補請特]+$/.test(text);
  if (!isWork && !isOff) return;

  const start = isWork ? formatHour(times[0]) : "";
  const end = isWork ? formatHour(times[times.length - 1]) : "";
  const hours = isWork ? roundHours(times[times.length - 1] - times[0]) : 0;
  const note = [day.note, sanitizeShiftNote(text)]
    .filter(Boolean)
    .join(" / ");

  state.shifts.push({
    date: day.iso,
    monthKey: day.monthKey,
    day: day.day,
    weekday: day.weekday,
    employee,
    start,
    end,
    hours,
    status: isWork ? "work" : "off",
    note,
    sheet: context.sheetName,
  });
}

function captureEmployeeMeta(employee, row) {
  if (!state.employees.has(employee)) {
    state.employees.set(employee, { name: employee, role: "", shifts: 0, hours: 0 });
  }
  const role = row.map(clean).find((value) => /正職|兼職|工讀/.test(value));
  if (role) state.employees.get(employee).role = role;
}

function normalizeCollections() {
  state.shifts.sort((a, b) => a.date.localeCompare(b.date) || a.employee.localeCompare(b.employee, "zh-Hant"));
  const seen = new Set();
  state.shifts = state.shifts.filter((shift) => {
    const key = [shift.date, shift.employee, shift.start, shift.end, shift.status, shift.note].join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  state.employees.forEach((employee) => {
    employee.shifts = 0;
    employee.hours = 0;
  });

  state.shifts.forEach((shift) => {
    if (!state.employees.has(shift.employee)) {
      state.employees.set(shift.employee, { name: shift.employee, role: "", shifts: 0, hours: 0 });
    }
    if (shift.status === "work") {
      const employee = state.employees.get(shift.employee);
      employee.shifts += 1;
      employee.hours += shift.hours;
    }
  });
}

function populateFilters() {
  const months = unique(state.shifts.map((shift) => shift.monthKey)).sort();
  const employees = Array.from(state.employees.keys()).sort((a, b) => a.localeCompare(b, "zh-Hant"));
  fillSelect(els.monthFilter, months.map((month) => [month, formatMonth(month)]));
  fillSelect(els.employeeFilter, [["all", "全部員工"], ...employees.map((name) => [name, name])]);
  fillSelect(els.messageEmployee, employees.map((name) => [name, name]));
  els.exportCsv.disabled = state.shifts.length === 0;
  els.copyMessage.disabled = employees.length === 0;
}

function fillSelect(select, options) {
  select.innerHTML = "";
  options.forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.append(option);
  });
}

function render() {
  const shifts = getFilteredShifts();
  renderMetrics(shifts);
  renderCalendar(shifts);
  renderTable(shifts);
  renderStaffBars(shifts);
  renderMessage();
  els.parseMeta.textContent = state.sourceName
    ? `${state.sourceName}${state.warnings.length ? " / PDF 可能需人工複核" : ""}`
    : "等待檔案";
}

function getFilteredShifts() {
  const month = currentMonthKey();
  const employee = els.employeeFilter.value;
  const view = els.viewFilter.value;
  return state.shifts.filter((shift) => {
    if (month && shift.monthKey !== month) return false;
    if (employee && employee !== "all" && shift.employee !== employee) return false;
    if (view !== "all" && shift.status !== view) return false;
    return true;
  });
}

function currentMonthKey() {
  return els.monthFilter.value || "";
}

function renderMetrics(shifts) {
  const work = shifts.filter((shift) => shift.status === "work");
  els.metricShifts.textContent = work.length.toLocaleString("zh-Hant");
  els.metricEmployees.textContent = unique(work.map((shift) => shift.employee)).length.toLocaleString("zh-Hant");
  els.metricHours.textContent = work.reduce((sum, shift) => sum + shift.hours, 0).toFixed(1);
  els.metricNotes.textContent = unique(shifts.filter((shift) => shift.note).map((shift) => shift.date)).length.toLocaleString("zh-Hant");
}

function renderCalendar(shifts) {
  const month = currentMonthKey();
  els.calendarTitle.textContent = month ? `${formatMonth(month)} 月曆視覺化` : "月曆視覺化";
  els.calendarGrid.innerHTML = "";
  if (!month) {
    els.calendarGrid.append(els.emptyState.content.cloneNode(true));
    return;
  }

  weekdayNames.forEach((name) => {
    const item = document.createElement("div");
    item.className = "weekday";
    item.textContent = name;
    els.calendarGrid.append(item);
  });

  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const totalDays = new Date(year, monthNumber, 0).getDate();
  for (let i = 0; i < first.getDay(); i += 1) {
    const blank = document.createElement("div");
    blank.className = "day-card is-empty";
    els.calendarGrid.append(blank);
  }

  for (let day = 1; day <= totalDays; day += 1) {
    const iso = `${month}-${String(day).padStart(2, "0")}`;
    const dayShifts = shifts.filter((shift) => shift.date === iso);
    const work = dayShifts.filter((shift) => shift.status === "work");
    const note = state.dayNotes.get(iso) || dayShifts.find((shift) => shift.note)?.note || "";
    const card = document.createElement("article");
    card.className = `day-card ${offWords.test(note) ? "is-closed" : ""}`;
    card.innerHTML = `
      <div class="day-top">
        <span class="day-number">${day}</span>
        <span class="coverage">${work.length} 人</span>
      </div>
      ${note ? `<div class="event-note">${escapeHtml(note)}</div>` : ""}
    `;
    dayShifts.slice(0, 5).forEach((shift) => {
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = `shift-pill ${shift.status}`;
      pill.textContent = shift.status === "work"
        ? `${shift.employee} ${shift.start}-${shift.end}`
        : `${shift.employee} ${shift.note || "休"}`;
      pill.addEventListener("click", () => {
        els.employeeFilter.value = shift.employee;
        els.messageEmployee.value = shift.employee;
        render();
      });
      card.append(pill);
    });
    if (dayShifts.length > 5) {
      const more = document.createElement("div");
      more.className = "coverage";
      more.textContent = `另 ${dayShifts.length - 5} 筆`;
      card.append(more);
    }
    els.calendarGrid.append(card);
  }
}

function renderTable(shifts) {
  els.shiftTable.innerHTML = "";
  if (!shifts.length) {
    els.shiftTable.innerHTML = `<tr><td colspan="5">沒有符合條件的班表資料。</td></tr>`;
    return;
  }

  shifts.forEach((shift) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${shift.date}（${shift.weekday}）</td>
      <td>${escapeHtml(shift.employee)}</td>
      <td>${shift.status === "work" ? `${shift.start} - ${shift.end}` : "休假"}</td>
      <td>${shift.hours ? shift.hours.toFixed(1) : ""}</td>
      <td>${escapeHtml(shift.note || "")}</td>
    `;
    els.shiftTable.append(row);
  });
}

function renderStaffBars(shifts) {
  const summary = new Map();
  shifts.filter((shift) => shift.status === "work").forEach((shift) => {
    const current = summary.get(shift.employee) || { name: shift.employee, hours: 0, shifts: 0 };
    current.hours += shift.hours;
    current.shifts += 1;
    summary.set(shift.employee, current);
  });
  const employees = Array.from(summary.values())
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 12);
  const max = Math.max(1, ...employees.map((employee) => employee.hours));
  els.staffBars.innerHTML = employees.map((employee) => `
    <div class="staff-row">
      <strong>${escapeHtml(employee.name)}</strong>
      <span class="bar-track"><span class="bar-fill" style="width:${Math.round(employee.hours / max * 100)}%"></span></span>
      <span>${employee.hours.toFixed(1)}h</span>
    </div>
  `).join("");
}

function renderMessage() {
  const employee = els.messageEmployee.value;
  if (!employee) {
    els.messageText.value = "";
    return;
  }
  const month = currentMonthKey();
  const shifts = state.shifts
    .filter((shift) => shift.employee === employee && (!month || shift.monthKey === month) && shift.status === "work")
    .sort((a, b) => a.date.localeCompare(b.date));
  const employeeMeta = state.employees.get(employee);
  const role = employeeMeta?.role ? `（${employeeMeta.role}）` : "";
  const lines = shifts.map((shift) => `- ${Number(shift.date.slice(-2))}日（${shift.weekday}）${shift.start}-${shift.end}${shift.note ? `｜${shift.note}` : ""}`);
  els.messageText.value = [
    `${employee}${role} 你好，以下是 ${month ? formatMonth(month) : "本月"} 班表：`,
    "",
    lines.length ? lines.join("\n") : "目前沒有排到上班班次。",
    "",
    `合計：${shifts.length} 班，${shifts.reduce((sum, shift) => sum + shift.hours, 0).toFixed(1)} 小時。`,
    "若班表有異動，請以店內最新公告為準。",
  ].join("\n");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeName(value) {
  return clean(value).replace(/^[\d.、\s]+/, "");
}

function looksLikeEmployee(value) {
  if (!value || value.length > 12) return false;
  if (/月|合計|備註|小計|總計|正職|兼職|公休|薪資|國定/.test(value)) return false;
  return /[\u4e00-\u9fffA-Za-z]/.test(value);
}

function isTimeToken(value) {
  const text = clean(value);
  if (!/^\d{1,2}(\.\d+)?$/.test(text)) return false;
  const number = Number(text);
  return number >= 5 && number <= 24;
}

function formatHour(value) {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function roundHours(value) {
  if (value < 0) return 0;
  return Math.round(value * 10) / 10;
}

function findYear(text) {
  const match = String(text).match(/20\d{2}/);
  return match ? Number(match[0]) : null;
}

function findSheetMonth(text) {
  const match = String(text).match(/(?:^|年|\s)(\d{1,2})月/);
  if (!match) return null;
  const month = Number(match[1]);
  return month >= 1 && month <= 12 ? month : null;
}

function sanitizeShiftNote(text) {
  return clean(text)
    .replace(/\b\d+(\.\d+)?\b/g, "")
    .replaceAll("-", "")
    .replace(/[\/｜|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toIso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonth(monthKey) {
  if (!monthKey) return "";
  const [year, month] = monthKey.split("-");
  return `${year} 年 ${Number(month)} 月`;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

populateFilters();
render();

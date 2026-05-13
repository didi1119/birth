const state = {
  sourceName: "",
  rows: [],
  shifts: [],
  employees: new Map(),
  dayNotes: new Map(),
  warnings: [],
  adminAuthenticated: false,
};

const $ = (selector) => document.querySelector(selector);
const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];
const offWords = /休|公休|店休|補休|請假|特休/;
const datePattern = /(\d{1,2})\s*\/\s*(\d{1,2})/;
const LAST_EMPLOYEE_KEY = "birth-roster.last-employee";

function readSavedEmployee() {
  try {
    return localStorage.getItem(LAST_EMPLOYEE_KEY) || "";
  } catch {
    return "";
  }
}

function writeSavedEmployee(value) {
  try {
    if (value) localStorage.setItem(LAST_EMPLOYEE_KEY, value);
  } catch {
    /* localStorage unavailable, ignore */
  }
}

const els = {
  dropZone: $("#dropZone"),
  fileInput: $("#fileInput"),
  pickFile: $("#pickFile"),
  adminPassword: $("#adminPassword"),
  adminLogin: $("#adminLogin"),
  publishRoster: $("#publishRoster"),
  statusLine: $("#statusLine"),
  adminStatus: $("#adminStatus"),
  monthFilter: $("#monthFilter"),
  employeeFilter: $("#employeeFilter"),
  viewFilter: $("#viewFilter"),
  exportCsv: $("#exportCsv"),
  employeeChips: $("#employeeChips"),
  metricShifts: $("#metricShifts"),
  metricEmployees: $("#metricEmployees"),
  metricHours: $("#metricHours"),
  metricNotes: $("#metricNotes"),
  personalName: $("#personalName"),
  personalRole: $("#personalRole"),
  personalWorkCount: $("#personalWorkCount"),
  personalHours: $("#personalHours"),
  personalOffCount: $("#personalOffCount"),
  personalNext: $("#personalNext"),
  personalShiftList: $("#personalShiftList"),
  calendarTitle: $("#calendarTitle"),
  parseMeta: $("#parseMeta"),
  calendarGrid: $("#calendarGrid"),
  shiftTable: $("#shiftTable"),
  messageEmployee: $("#messageEmployee"),
  messageText: $("#messageText"),
  copyMessage: $("#copyMessage"),
  staffBars: $("#staffBars"),
  emptyState: $("#emptyState"),
  openAdminPanel: $("#openAdminPanel"),
  adminPanel: $("#adminPanel"),
  adminPanelClose: $("#adminPanelClose"),
  dayDetail: $("#dayDetail"),
  dayDetailTitle: $("#dayDetailTitle"),
  dayDetailWeekday: $("#dayDetailWeekday"),
  dayDetailNote: $("#dayDetailNote"),
  dayDetailWorkSection: $("#dayDetailWorkSection"),
  dayDetailWorkList: $("#dayDetailWorkList"),
  dayDetailOffSection: $("#dayDetailOffSection"),
  dayDetailOffList: $("#dayDetailOffList"),
  dayDetailClose: $("#dayDetailClose"),
};

if (els.openAdminPanel) {
  els.openAdminPanel.addEventListener("click", () => {
    if (els.adminPanel && typeof els.adminPanel.showModal === "function") {
      els.adminPanel.showModal();
      setTimeout(() => els.adminPassword?.focus(), 50);
    }
  });
}
if (els.adminPanelClose) {
  els.adminPanelClose.addEventListener("click", () => els.adminPanel?.close());
}
if (els.adminPanel) {
  els.adminPanel.addEventListener("click", (event) => {
    if (event.target === els.adminPanel) els.adminPanel.close();
  });
}

if (els.dayDetailClose) {
  els.dayDetailClose.addEventListener("click", () => closeDayDetail());
}
if (els.dayDetail) {
  els.dayDetail.addEventListener("click", (event) => {
    if (event.target === els.dayDetail) closeDayDetail();
  });
}

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

els.pickFile.addEventListener("click", () => {
  if (!isAdminAuthenticated()) {
    setAdminStatus("請先完成主管登入。", "error");
    return;
  }
  els.fileInput.click();
});
els.fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) handleFile(file);
});

els.adminLogin.addEventListener("click", verifyAdminLogin);
els.adminPassword.addEventListener("input", () => {
  state.adminAuthenticated = false;
  updateAdminControls();
});
els.adminPassword.addEventListener("keydown", (event) => {
  if (event.key === "Enter") verifyAdminLogin();
});
els.publishRoster.addEventListener("click", publishRoster);

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
  if (!isAdminAuthenticated()) {
    setAdminStatus("請先完成主管登入再上傳。", "error");
    return;
  }
  const [file] = event.dataTransfer.files;
  if (file) handleFile(file);
});

[els.monthFilter, els.employeeFilter, els.viewFilter].forEach((el) => {
  el.addEventListener("change", render);
});

els.messageEmployee.addEventListener("change", () => {
  if (els.messageEmployee.value) els.employeeFilter.value = els.messageEmployee.value;
  render();
});
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
    els.publishRoster.disabled = !state.shifts.length || !isAdminAuthenticated();
    setAdminStatus("解析完成，確認內容後可發布給員工。", "ready");
  } catch (error) {
    console.error(error);
    setStatus(`解析失敗：${error.message}`);
  }
}

async function loadPublishedRoster() {
  setStatus("正在讀取最新班表...");
  try {
    const response = await fetch("/api/roster", { cache: "no-store" });
    if (!response.ok) throw new Error("目前沒有雲端班表 API。");
    const data = await response.json();
    if (!data.hasRoster) {
      setStatus("尚未發布班表");
      populateFilters();
      render();
      return;
    }
    applyRosterPayload(data.roster);
    populateFilters();
    render();
    setStatus(`已載入最新班表：${state.sourceName || "未命名班表"}`);
  } catch (error) {
    console.info(error);
    setStatus("尚未載入雲端班表；請主管點右上角「主管」上傳。");
    populateFilters();
    render();
  }
}

async function publishRoster() {
  if (!state.shifts.length) {
    setAdminStatus("沒有可發布的班表，請先上傳檔案。", "error");
    return;
  }
  if (!isAdminAuthenticated()) {
    setAdminStatus("請先完成主管登入。", "error");
    return;
  }

  els.publishRoster.disabled = true;
  setAdminStatus("發布中...", "ready");

  try {
    const payload = buildRosterPayload();
    const response = await fetch("/api/roster", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        password: els.adminPassword.value,
        payload,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "發布失敗。");
    setAdminStatus("已發布，員工重新整理網頁就會看到最新班表。", "ready");
    setStatus(`已發布：${state.shifts.length} 筆紀錄、${state.employees.size} 位員工`);
  } catch (error) {
    setAdminStatus(error.message, "error");
    els.publishRoster.disabled = false;
  }
}

async function verifyAdminLogin() {
  if (!hasAdminPassword()) {
    state.adminAuthenticated = false;
    updateAdminControls();
    setAdminStatus("請輸入主管密碼。", "error");
    return;
  }

  els.adminLogin.disabled = true;
  setAdminStatus("登入驗證中...", "ready");
  try {
    const response = await fetch("/api/admin-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: els.adminPassword.value }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || "主管登入失敗。");
    state.adminAuthenticated = true;
    updateAdminControls();
    setAdminStatus("主管登入成功，可上傳班表。", "ready");
  } catch (error) {
    state.adminAuthenticated = false;
    updateAdminControls();
    setAdminStatus(error.message, "error");
  } finally {
    els.adminLogin.disabled = false;
  }
}

function buildRosterPayload() {
  return {
    version: 1,
    sourceName: state.sourceName,
    publishedAt: new Date().toISOString(),
    shifts: state.shifts,
    employees: Array.from(state.employees.values()),
    dayNotes: Object.fromEntries(state.dayNotes),
    warnings: state.warnings,
  };
}

function applyRosterPayload(payload) {
  state.sourceName = payload.sourceName || "已發布班表";
  state.shifts = Array.isArray(payload.shifts) ? payload.shifts : [];
  state.employees = new Map((payload.employees || []).map((employee) => [employee.name, employee]));
  state.dayNotes = new Map(Object.entries(payload.dayNotes || {}));
  state.warnings = payload.warnings || [];
  normalizeCollections();
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

function setAdminStatus(message, type = "") {
  els.adminStatus.textContent = message;
  els.adminStatus.classList.toggle("is-ready", type === "ready");
  els.adminStatus.classList.toggle("is-error", type === "error");
}

function hasAdminPassword() {
  return els.adminPassword.value.trim().length > 0;
}

function isAdminAuthenticated() {
  return state.adminAuthenticated && hasAdminPassword();
}

function updateAdminControls() {
  const ready = isAdminAuthenticated();
  els.adminLogin.disabled = !hasAdminPassword();
  els.pickFile.disabled = !ready;
  els.publishRoster.disabled = !ready || !state.shifts.length;
  els.dropZone.classList.toggle("is-admin-ready", ready);
  if (ready) {
    setAdminStatus("主管登入成功，可上傳班表。", "ready");
  } else if (hasAdminPassword()) {
    setAdminStatus("請按主管登入驗證密碼。", "");
  } else {
    setAdminStatus("尚未登入主管模式", "");
  }
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
  const role = row.map(clean).find((value) => /^(正職|兼職|工讀)$/.test(value));
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
  document.querySelector(".toolbar")?.toggleAttribute("data-single-month", months.length <= 1);
  els.employeeFilter.value = "all";
  if (employees.length) {
    els.messageEmployee.value = employees[0];
  }
  const savedEmployee = readSavedEmployee();
  if (savedEmployee === "all" || (savedEmployee && employees.includes(savedEmployee))) {
    els.employeeFilter.value = savedEmployee;
  }
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
  const focus = getFocusEmployee();
  if (state.employees.size > 0) writeSavedEmployee(els.employeeFilter.value);
  document.body.dataset.focused = focus ? "personal" : "all";
  document.querySelector(".personal-focus")?.classList.toggle("is-hidden", !focus);
  renderMetrics(shifts);
  renderEmployeeChips();
  renderPersonalFocus();
  renderCalendar(getMonthShifts());
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

function getMonthShifts() {
  const month = currentMonthKey();
  return state.shifts.filter((shift) => !month || shift.monthKey === month);
}

function getFocusEmployee() {
  return els.employeeFilter.value && els.employeeFilter.value !== "all"
    ? els.employeeFilter.value
    : "";
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

function renderEmployeeChips() {
  const monthShifts = getMonthShifts();
  const focus = getFocusEmployee();
  const employees = Array.from(state.employees.keys())
    .map((name) => ({
      name,
      count: monthShifts.filter((shift) => shift.employee === name && shift.status === "work").length,
    }))
    .filter((employee) => employee.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hant"));

  if (!employees.length) {
    els.employeeChips.innerHTML = "";
    return;
  }

  els.employeeChips.innerHTML = employees.map((employee) => `
    <button class="employee-chip ${employee.name === focus ? "is-active" : ""}" type="button" data-employee="${escapeHtml(employee.name)}">
      ${escapeHtml(employee.name)} · ${employee.count} 班
    </button>
  `).join("");

  els.employeeChips.querySelectorAll(".employee-chip").forEach((button) => {
    button.addEventListener("click", () => {
      const employee = button.dataset.employee;
      els.employeeFilter.value = employee;
      els.messageEmployee.value = employee;
      render();
    });
  });
}

function renderPersonalFocus() {
  const employee = getFocusEmployee();
  if (!employee) return;
  const month = currentMonthKey();
  const employeeMeta = state.employees.get(employee);
  const monthShifts = getMonthShifts().filter((shift) => shift.employee === employee);
  const work = monthShifts.filter((shift) => shift.status === "work");
  const off = monthShifts.filter((shift) => shift.status === "off");
  const totalHours = work.reduce((sum, shift) => sum + shift.hours, 0);

  els.personalName.textContent = employee || "選擇員工";
  els.personalRole.textContent = employeeMeta?.role
    ? `${employeeMeta.role}｜${month ? formatMonth(month) : "全部月份"}`
    : `${month ? formatMonth(month) : "全部月份"} 個人班表`;
  els.personalWorkCount.textContent = work.length;
  els.personalHours.textContent = totalHours.toFixed(1);
  els.personalOffCount.textContent = off.length;

  const upcoming = findUpcomingShift(work);
  els.personalNext.textContent = upcoming
    ? `下次上班：${formatShortDate(upcoming)} ${upcoming.start}-${upcoming.end}${upcoming.note ? `｜${upcoming.note}` : ""}`
    : work.length
      ? `本月最後一班：${formatShortDate(work[work.length - 1])} ${work[work.length - 1].start}-${work[work.length - 1].end}`
      : "這個月份沒有排到上班班次";

  const visible = [...work, ...off]
    .sort((a, b) => a.date.localeCompare(b.date) || (b.status === "work" ? 1 : -1));

  if (!visible.length) {
    els.personalShiftList.innerHTML = `
      <div class="empty-state">
        <strong>沒有個人班表</strong>
        <p>換一個月份或員工看看。</p>
      </div>
    `;
    return;
  }

  const todayIso = toIso(new Date());
  els.personalShiftList.innerHTML = visible.map((shift) => {
    const classes = ["personal-day"];
    if (shift.status === "off") classes.push("is-off");
    if (shift.date === todayIso) classes.push("is-today");
    return `
      <article class="${classes.join(" ")}" data-date="${shift.date}">
        <div class="personal-date">
          <span>${formatMonthDay(shift)}</span>
          <span>${shift.weekday}</span>
        </div>
        <div class="personal-time">${shift.status === "work" ? `${shift.start}-${shift.end}` : "休假"}</div>
        <div class="personal-note">${shift.status === "work" ? `${shift.hours.toFixed(1)} 小時` : "不上班"}${shift.note ? `｜${escapeHtml(shift.note)}` : ""}</div>
      </article>
    `;
  }).join("");

  scrollPersonalListToToday(todayIso);
}

function scrollPersonalListToToday(todayIso) {
  const list = els.personalShiftList;
  if (!list) return;
  const cards = list.querySelectorAll(".personal-day");
  if (!cards.length) return;
  let target = list.querySelector(`.personal-day[data-date="${todayIso}"]`);
  if (!target) {
    target = [...cards].find((card) => card.dataset.date >= todayIso) || cards[0];
  }
  if (!target) return;
  const isMobile = window.matchMedia("(max-width: 720px)").matches;
  if (isMobile) {
    list.scrollLeft = Math.max(0, target.offsetLeft - list.offsetLeft - 12);
  } else {
    list.scrollTop = Math.max(0, target.offsetTop - list.offsetTop - 12);
  }
}

function findUpcomingShift(work) {
  const today = toIso(new Date());
  return work.find((shift) => shift.date >= today) || null;
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
  const focus = getFocusEmployee();
  const first = new Date(year, monthNumber - 1, 1);
  const totalDays = new Date(year, monthNumber, 0).getDate();
  for (let i = 0; i < first.getDay(); i += 1) {
    const blank = document.createElement("div");
    blank.className = "day-card is-empty";
    els.calendarGrid.append(blank);
  }

  const todayIso = toIso(new Date());
  const isAllEmployees = !focus || focus === "all" || els.employeeFilter.value === "all";
  for (let day = 1; day <= totalDays; day += 1) {
    const iso = `${month}-${String(day).padStart(2, "0")}`;
    const dayShifts = shifts.filter((shift) => shift.date === iso);
    const work = dayShifts.filter((shift) => shift.status === "work");
    const dayNote = state.dayNotes.get(iso) || "";
    const storeClosed = /公休|店休/.test(dayNote);

    let stateClass = "";
    let labelText = "";
    let ariaLabel = "";
    if (!isAllEmployees) {
      const myShift = dayShifts.find((shift) => shift.employee === focus);
      if (myShift && myShift.status === "work") {
        stateClass = "is-mine-work";
        labelText = `${myShift.start.slice(0, 2)}-${myShift.end.slice(0, 2)}`;
        ariaLabel = `${day} 日，我上班 ${myShift.start}-${myShift.end}`;
      } else if (myShift && myShift.status === "off") {
        stateClass = "is-mine-off";
        labelText = "休";
        ariaLabel = `${day} 日，我休假`;
      } else {
        labelText = work.length ? `${work.length} 人` : "";
        ariaLabel = `${day} 日，無個人班次`;
      }
    } else {
      if (work.length > 0) stateClass = "has-shifts";
      labelText = `${work.length} 人`;
      ariaLabel = `${day} 日，${work.length} 人上班`;
    }

    const card = document.createElement("button");
    card.type = "button";
    const classes = ["day-card"];
    if (stateClass) classes.push(stateClass);
    if (storeClosed) classes.push("is-store-closed");
    if (iso === todayIso) classes.push("is-today");
    card.className = classes.join(" ");
    card.setAttribute("aria-label", ariaLabel);
    card.innerHTML = `
      <div class="day-top">
        <span class="day-number">${day}</span>
        <span class="coverage">${labelText}</span>
      </div>
      ${dayNote ? `<div class="event-note">${escapeHtml(dayNote)}</div>` : ""}
    `;
    dayShifts
      .slice()
      .sort((a, b) => (a.employee === focus ? -1 : 0) - (b.employee === focus ? -1 : 0))
      .slice(0, 5)
      .forEach((shift) => {
      const pill = document.createElement("span");
      pill.className = `shift-pill ${shift.status} ${focus && shift.employee !== focus && els.employeeFilter.value === "all" ? "is-muted" : ""}`;
      pill.textContent = shift.status === "work"
        ? `${shift.employee} ${shift.start}-${shift.end}`
        : `${shift.employee} ${shift.note || "休"}`;
      pill.dataset.employee = shift.employee;
      card.append(pill);
    });
    if (dayShifts.length > 5) {
      const more = document.createElement("div");
      more.className = "coverage";
      more.textContent = `另 ${dayShifts.length - 5} 筆`;
      card.append(more);
    }
    card.addEventListener("click", (event) => {
      const pill = event.target.closest(".shift-pill");
      if (pill && pill.dataset.employee) {
        els.employeeFilter.value = pill.dataset.employee;
        els.messageEmployee.value = pill.dataset.employee;
        render();
        return;
      }
      openDayDetail(iso, day, dayShifts, dayNote);
    });
    els.calendarGrid.append(card);
  }
}

function openDayDetail(iso, day, dayShifts, note) {
  if (!els.dayDetail || typeof els.dayDetail.showModal !== "function") return;
  const [year, monthNumber] = iso.split("-").map(Number);
  const weekday = weekdayNames[new Date(year, monthNumber - 1, day).getDay()];
  const focus = getFocusEmployee();

  els.dayDetailTitle.textContent = `${monthNumber}/${day}`;
  els.dayDetailWeekday.textContent = `星期${weekday}`;

  if (note) {
    els.dayDetailNote.innerHTML = `<div class="day-detail-note">${escapeHtml(note)}</div>`;
  } else {
    els.dayDetailNote.innerHTML = "";
  }

  const work = dayShifts
    .filter((shift) => shift.status === "work")
    .slice()
    .sort((a, b) => (a.start || "").localeCompare(b.start || "") || a.employee.localeCompare(b.employee, "zh-Hant"));
  const off = dayShifts
    .filter((shift) => shift.status === "off")
    .slice()
    .sort((a, b) => a.employee.localeCompare(b.employee, "zh-Hant"));

  els.dayDetailWorkList.innerHTML = work.length
    ? work.map((shift) => renderDayDetailItem(shift, focus)).join("")
    : `<li class="day-detail-empty">沒有人上班</li>`;
  els.dayDetailOffList.innerHTML = off.length
    ? off.map((shift) => renderDayDetailItem(shift, focus)).join("")
    : `<li class="day-detail-empty">沒有休假紀錄</li>`;

  els.dayDetailOffSection.style.display = off.length ? "" : "none";

  els.dayDetail.showModal();
}

function renderDayDetailItem(shift, focus) {
  const isFocus = focus && shift.employee === focus;
  const classes = ["day-detail-item"];
  if (shift.status === "off") classes.push("is-off");
  if (isFocus) classes.push("is-focus");
  const time = shift.status === "work"
    ? `${shift.start}-${shift.end}`
    : "休假";
  const meta = [
    shift.status === "work" && shift.hours ? `${shift.hours.toFixed(1)} 小時` : "",
    shift.note ? escapeHtml(shift.note) : "",
  ].filter(Boolean).join("｜");
  return `
    <li class="${classes.join(" ")}">
      <span class="day-detail-name">${escapeHtml(shift.employee)}</span>
      <span class="day-detail-time">${time}</span>
      ${meta ? `<span class="day-detail-meta">${meta}</span>` : ""}
    </li>
  `;
}

function closeDayDetail() {
  if (els.dayDetail && els.dayDetail.open) els.dayDetail.close();
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
      <td data-label="日期">${shift.date}（${shift.weekday}）</td>
      <td data-label="員工">${escapeHtml(shift.employee)}</td>
      <td data-label="班次">${shift.status === "work" ? `${shift.start} - ${shift.end}` : "休假"}</td>
      <td data-label="工時">${shift.hours ? shift.hours.toFixed(1) : ""}</td>
      <td data-label="備註">${escapeHtml(shift.note || "")}</td>
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

function formatShortDate(shift) {
  return `${Number(shift.date.slice(5, 7))}/${Number(shift.date.slice(8, 10))}（${shift.weekday}）`;
}

function formatMonthDay(shift) {
  return `${Number(shift.date.slice(5, 7))}/${Number(shift.date.slice(8, 10))}`;
}

function escapeHtml(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

updateAdminControls();
loadPublishedRoster();

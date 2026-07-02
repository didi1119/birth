import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const inputPath = process.argv.find((arg) => !arg.startsWith("--") && arg.endsWith(".xlsx"));
const summaryOnly = process.argv.includes("--summary-only");
const expectedMonth = process.argv
  .find((arg) => arg.startsWith("--expect-month="))
  ?.split("=")[1];
const fromDate = process.argv.find((arg) => arg.startsWith("--from="))?.split("=")[1];
const toDate = process.argv.find((arg) => arg.startsWith("--to="))?.split("=")[1];
if (!inputPath) {
  throw new Error("Usage: node scripts/test-roster-parser.mjs [--summary-only] <workbook.xlsx>");
}

function fakeElement() {
  return {
    value: "",
    disabled: false,
    textContent: "",
    innerHTML: "",
    classList: {
      add() {},
      remove() {},
      toggle() {},
    },
    addEventListener() {},
    append() {},
    close() {},
    querySelectorAll() {
      return [];
    },
    toggleAttribute() {},
  };
}

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  document: {
    body: { dataset: {} },
    querySelector() {
      return fakeElement();
    },
  },
  localStorage: {
    getItem() {
      return "";
    },
    setItem() {},
  },
};
sandbox.window = sandbox;
vm.createContext(sandbox);

const xlsxResponse = await fetch("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
if (!xlsxResponse.ok) throw new Error(`Unable to load SheetJS: ${xlsxResponse.status}`);
vm.runInContext(await xlsxResponse.text(), sandbox);

const schedulerSource = await fs.readFile(path.join(process.cwd(), "assets", "scheduler.js"), "utf8");
const testableSource = schedulerSource
  .replace(/\r?\nupdateAdminControls\(\);\r?\nloadPublishedRoster\(\);\s*$/, "")
  .concat("\nglobalThis.__test = { state, parseWorkbook, normalizeCollections, resetData };\n");
vm.runInContext(testableSource, sandbox);

const workbookBytes = await fs.readFile(inputPath);
sandbox.inputBytes = Array.from(workbookBytes);
vm.runInContext("globalThis.inputBuffer = new Uint8Array(globalThis.inputBytes).buffer;", sandbox);
await sandbox.__test.parseWorkbook({
  name: path.basename(inputPath),
  async arrayBuffer() {
    return sandbox.inputBuffer;
  },
});
sandbox.__test.normalizeCollections();

const shifts = sandbox.__test.state.shifts;
function findShift(date, employee) {
  return shifts.find((shift) => shift.date === date && shift.employee === employee);
}

const suspicious = shifts.filter((shift) => (
  shift.status === "work" && (shift.end < shift.start || shift.hours <= 0)
));
const outsideExpectedMonth = expectedMonth
  ? shifts.filter((shift) => shift.monthKey !== expectedMonth)
  : [];

if (!summaryOnly) {
  assert.equal(suspicious.length, 0);
}
if (expectedMonth) {
  assert.equal(outsideExpectedMonth.length, 0);
}
if (expectedMonth === "2026-07") {
  assert.equal(
    shifts.filter((shift) => shift.date === "2026-07-05" && shift.status === "work").length,
    7,
  );
  assert.equal(findShift("2026-07-05", "Bei").hours, 8);
  assert.equal(findShift("2026-07-05", "潘奕勤").hours, 5.5);
}

if (!summaryOnly) {
  assert.deepEqual(
    JSON.parse(JSON.stringify(findShift("2026-06-01", "Bei"))),
    {
      date: "2026-06-01",
      monthKey: "2026-06",
      day: 1,
      weekday: "一",
      employee: "Bei",
      start: "11:00",
      end: "20:00",
      hours: 8,
      status: "work",
      note: "",
      sheet: "工作表1",
    },
  );
  assert.equal(findShift("2026-06-01", "吳佳蓁").hours, 5.5);
  assert.equal(findShift("2026-06-01", "潘奕勤").end, "23:30");
  assert.equal(shifts.some((shift) => shift.end === "24:30"), true);
}

const summary = {
  shifts: shifts.length,
  employees: sandbox.__test.state.employees.size,
  work: shifts.filter((shift) => shift.status === "work").length,
  off: shifts.filter((shift) => shift.status === "off").length,
  hours: shifts.filter((shift) => shift.status === "work").reduce((sum, shift) => sum + shift.hours, 0),
};
console.log(JSON.stringify(summary, null, 2));
if (summaryOnly) {
  console.log(JSON.stringify({ suspicious, outsideExpectedMonth }, null, 2));
  const visibleShifts = fromDate || toDate
    ? shifts.filter((shift) => (!fromDate || shift.date >= fromDate) && (!toDate || shift.date <= toDate))
    : shifts.slice(0, 20);
  console.log(JSON.stringify(visibleShifts, null, 2));
}

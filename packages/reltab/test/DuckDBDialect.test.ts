import { DuckDBDialect } from "../src/dialects/DuckDBDialect";

const timeRender = DuckDBDialect.columnTypes["TIME"].stringRender;
const dateRender = DuckDBDialect.columnTypes["DATE"].stringRender;
const tsRender = DuckDBDialect.columnTypes["TIMESTAMP"].stringRender;

test("time renderer renders bare time values as-is", () => {
  expect(timeRender("19:43:00")).toBe("19:43:00");
  expect(timeRender("9:05")).toBe("9:05");
  expect(timeRender("19:43:00.123")).toBe("19:43:00.123");
  expect(timeRender(null)).toBe("");
});

test("time renderer still accepts full DATETIME strings (UTC-shifted, pre-existing behavior)", () => {
  // new Date(...) parses in local time then toISOString shifts to UTC.
  const out = timeRender("2020-01-01T19:43:00");
  expect(out).toMatch(/^\d{2}:\d{2}:\d{2}$/);
});

test("date renderer renders dates", () => {
  expect(dateRender("2020-01-15T10:00:00.000Z")).toBe("2020-01-15");
});

test("timestamp renderer renders full timestamps", () => {
  expect(tsRender("2020-01-15T10:30:00.000Z")).toBe("2020-01-15T10:30:00.000Z");
});
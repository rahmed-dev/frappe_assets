/**
 * @vitest-environment happy-dom
 *
 * One case per panel type, asserting the two things the gallery cannot: that
 * every value reaches the page escaped, and that the markup a consuming page's
 * CSS keys on is the markup `CONTRACT.md` §3 promises.
 *
 * The gallery remains mandatory and this does not replace it — half the defects
 * in this repo are visual and only exist in one theme. What this catches is the
 * other half: the ones that look fine and are wrong.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render_to_string } from "../../dashboard/render.js";
import { setHost, resetHost, TestHost } from "../../core/host.js";

beforeEach(() => {
	resetHost();
	setHost(new TestHost());
});

/** A spec with one panel in it — every case here is about a single panel. */
const one = (panel) => render_to_string({ title: "T", blocks: [panel] }).html;

/** The string a value becomes if nothing escapes it. */
const XSS = '<img src=x onerror="alert(1)">';

describe("kpis", () => {
	it("draws a card per item with the label, value and sub", () => {
		const html = one({
			type: "kpis",
			columns: 3,
			items: [{ label: "Orders", value: "1,204", sub: "last 30 days" }],
		});
		expect(html).toContain("dd-grid-3");
		expect(html).toContain("dd-kpi-label");
		expect(html).toContain("1,204");
		expect(html).toContain("last 30 days");
	});

	it("renders the delta from a reading rather than from markup", () => {
		// Until v0.3.0 the spec carried the HTML string and the panel interpolated
		// it raw — the only value in the whole renderer that skipped `esc`.
		const html = one({
			type: "kpis",
			items: [{ label: "L", value: "1", delta: { value: 12, good: "up", unit: "%" } }],
		});
		expect(html).toContain("dd-delta-up");
		expect(html).toContain("12");
	});

	it("slugs the dot into its class instead of interpolating it", () => {
		// A space in a class attribute is a second class, not a broken one, so it
		// silently applies whatever that other name happens to style.
		const html = one({ type: "kpis", items: [{ label: "L", value: "1", dot: "very bad" }] });
		expect(html).toContain("dd-kpi-dot-very-bad");
		expect(html).not.toContain("dd-kpi-dot-very bad");
	});

	it("clamps the column count to what the stylesheet actually defines", () => {
		const html = one({ type: "kpis", columns: 99, items: [{ label: "L", value: "1" }] });
		expect(html).toContain("dd-grid-5");
	});

	it("escapes every value", () => {
		const html = one({ type: "kpis", items: [{ label: XSS, value: XSS, sub: XSS }] });
		expect(html).not.toContain("<img");
	});
});

describe("fields", () => {
	it("tints a value that is itself a finding", () => {
		const html = one({
			type: "fields",
			items: [{ label: "Reading", value: "-31 dBm", tone: "danger" }],
		});
		expect(html).toContain("dd-cell-danger");
	});

	it("paints nothing for an ungraded value", () => {
		// `quiet` is the absence of a verdict: a value nobody graded must not read
		// as "fine".
		const html = one({ type: "fields", items: [{ label: "L", value: "V" }] });
		expect(html).not.toContain("dd-cell-");
	});
});

describe("bars", () => {
	it("scales every row against ONE number, not against its own", () => {
		// Scaling each row to its own value draws a column of identical full-width
		// bars and hides the very drop the panel exists to show.
		const html = one({
			type: "bars",
			scale: 100,
			items: [
				{ label: "A", kept: 50, lost: 10, count: 60 },
				{ label: "B", kept: 25, lost: 5, count: 30 },
			],
		});
		expect(html).toContain("width: 50%");
		expect(html).toContain("width: 25%");
	});

	it("survives an empty range without dividing by zero", () => {
		const html = one({ type: "bars", scale: 0, items: [{ label: "A", kept: 0, count: 0 }] });
		expect(html).toContain("width: 0%");
		expect(html).not.toContain("NaN");
	});

	it("adds the hover tip only when a legend names the two segments", () => {
		const withLegend = one({
			type: "bars",
			legend: ["Kept", "Lost"],
			items: [{ label: "A", kept: 5, lost: 1, count: 6 }],
		});
		const without = one({ type: "bars", items: [{ label: "A", kept: 5, lost: 1, count: 6 }] });
		expect(withLegend).toContain("dd-bar-tip");
		expect(without).not.toContain("dd-bar-tip");
	});
});

describe("rows", () => {
	it("lets the trend decide the tone when none is given", () => {
		const html = one({ type: "rows", items: [{ name: "N", count: 3, series: [1, 1, 5, 5] }] });
		expect(html).toContain("dd-row-danger"); // rising
		expect(html).toContain("Rising");
	});

	it("claims a mount slot only for a series with something in it", () => {
		// A flat series draws nothing rather than a straight line implying a
		// measurement was taken and was zero — so it claims no slot at all, and an
		// element with no `data-dd-mount` is one the mount phase never looks at.
		const flat = render_to_string({
			title: "T",
			blocks: [{ type: "rows", items: [{ name: "N", count: 0, series: [0, 0, 0] }] }],
		});
		expect(flat.html).toContain('<div class="dd-spark">');
		expect(flat.mounts).toHaveLength(0);

		const live = render_to_string({
			title: "T",
			blocks: [{ type: "rows", items: [{ name: "N", count: 5, series: [1, 2, 5] }] }],
		});
		expect(live.html).toContain('data-dd-mount="0"');
		expect(live.mounts[0].panel).toBe("rows");
	});

	it("takes a tone name as readily as a direction", () => {
		const html = one({ type: "rows", items: [{ name: "N", count: 1, tone: "warning" }] });
		expect(html).toContain("dd-row-warning");
	});
});

describe("table", () => {
	it("renders a bare cell value exactly as it always has", () => {
		const html = one({
			type: "table",
			columns: [{ label: "Name", key: "name" }],
			rows: [{ name: "Alpha" }],
		});
		expect(html).toContain("<table class=\"dd-table\">");
		expect(html).toContain("<th");
		expect(html).toContain("Alpha");
	});

	it("supports the toned, pilled and tagged cell without raw HTML", () => {
		// The alternative was three tables on one page rebuilt as `{type: "html"}`
		// for colour alone, hand-escaping per call site.
		const html = one({
			type: "table",
			columns: [{ label: "State", key: "state" }],
			rows: [{ state: { value: "Suspended", tone: "warning", pill: true, tag: "DS+US" } }],
		});
		expect(html).toContain("dd-pill-warning");
		expect(html).toContain("dd-tag");
	});

	it("escapes a cell value, a pill value and a tag", () => {
		const html = one({
			type: "table",
			columns: [{ label: "A", key: "a" }, { label: "B", key: "b" }],
			rows: [{ a: XSS, b: { value: XSS, pill: true, tag: XSS } }],
		});
		expect(html).not.toContain("<img");
	});

	it("marks a numeric column so the figures line up", () => {
		const html = one({
			type: "table",
			columns: [{ label: "N", key: "n", numeric: true }],
			rows: [{ n: 1 }],
		});
		expect(html).toContain("dd-num");
	});
});

describe("chart", () => {
	it("reserves a slot rather than drawing, because a canvas needs layout first", () => {
		const pass = render_to_string({
			title: "T",
			blocks: [{ type: "chart", height: 240, option: { series: [] } }],
		});
		expect(pass.mounts).toHaveLength(1);
		expect(pass.mounts[0].panel).toBe("chart");
		expect(pass.html).toContain('data-dd-mount="0"');
		expect(pass.html).toContain("--dd-chart-height: 240px");
	});
});

describe("layout panels", () => {
	it("card wraps any panel and carries its own explainer", () => {
		const html = render_to_string({
			title: "T",
			explain: { why: ["Title", "Body"] },
			blocks: [{ type: "card", title: "C", explain: "why", body: { type: "text", text: "x" } }],
		}).html;
		expect(html).toContain("dd-card-title");
		expect(html).toContain('id="dd-explain-why"');
	});

	it("split stacks an array within one column", () => {
		const html = one({
			type: "split",
			columns: [[{ type: "text", text: "a" }, { type: "text", text: "b" }], { type: "text", text: "c" }],
		});
		expect(html.match(/dd-stack/g)).toHaveLength(2);
	});

	it("html is the escape hatch and is NOT escaped, by definition", () => {
		expect(one({ type: "html", html: "<b>raw</b>" })).toContain("<b>raw</b>");
	});
});

describe("the pass itself", () => {
	it("throws on an unknown panel type rather than skipping it", () => {
		// A silently skipped panel looks exactly like a backend that returned no
		// data for it, and the wrong half of the stack gets debugged.
		expect(() => one({ type: "tabel" })).toThrow(/unknown panel type/);
	});

	it("slugs an explainer key so the id stays a usable selector", () => {
		const html = render_to_string({
			title: "T",
			explain: { "net revenue": ["T", "B"] },
			blocks: [{ type: "section", title: "S", explain: "net revenue" }],
		}).html;
		expect(html).toContain('id="dd-explain-net-revenue"');
	});

	it("escapes the title, the caveat and the footer links", () => {
		const html = render_to_string({
			title: XSS,
			caveat: XSS,
			footer: [{ label: XSS, href: XSS }],
			blocks: [],
		}).html;
		expect(html).not.toContain("<img");
	});

	it("registers a drill per drillable element and keeps it keyboard-reachable", () => {
		// Without role and tabindex, drill-down silently becomes a mouse-only
		// feature — on a page people work in all day that is the difference between
		// a feature and a demo.
		const pass = render_to_string({
			title: "T",
			blocks: [
				{
					type: "kpis",
					items: [{ label: "L", value: "1", drill: { doctype: "Sales Order" } }],
				},
			],
		});
		expect(pass.drills).toHaveLength(1);
		expect(pass.html).toContain('role="link"');
		expect(pass.html).toContain('tabindex="0"');
	});
});

describe("per-panel states", () => {
	it("renders a skeleton instead of the panel while it is loading", () => {
		const html = one({ type: "table", state: "loading", columns: [], rows: [] });
		expect(html).toContain("dd-state-loading");
		expect(html).toContain('aria-busy="true"');
		expect(html).not.toContain("<table");
	});

	it("says empty and error differently", () => {
		// Both are an absence of numbers, and a page that paints them alike teaches
		// its readers to read a failed query as a quiet month. That misreading is
		// the expensive one, and nobody reports it, because the page looks fine.
		expect(one({ type: "kpis", state: "empty", items: [] })).toContain("dd-state-empty");
		const failed = one({ type: "kpis", state: "error", items: [] });
		expect(failed).toContain("dd-state-error");
		expect(failed).toContain('role="alert"');
	});

	it("carries the panel's own message, escaped", () => {
		const html = one({ type: "kpis", state: "error", message: XSS, label: XSS, items: [] });
		expect(html).not.toContain("<img");
		expect(html).toContain("&lt;img");
	});

	it("reads an unrecognised state as empty rather than throwing", () => {
		// A state usually arrives from a backend, where an unexpected value is
		// ordinary — the same split as an unknown tone against an unknown panel type.
		expect(one({ type: "kpis", state: "whatever", items: [] })).toContain("dd-state-empty");
	});

	it("lets `ready` through to the panel, so a spec can say so explicitly", () => {
		const html = one({ type: "kpis", state: "ready", items: [{ label: "L", value: "1" }] });
		expect(html).toContain("dd-kpi");
		expect(html).not.toContain("dd-state");
	});

	it("claims no mount slot, so nothing tries to draw into a placeholder", () => {
		const pass = render_to_string({
			title: "T",
			blocks: [{ type: "chart", state: "loading", option: {} }],
		});
		expect(pass.mounts).toEqual([]);
	});
});

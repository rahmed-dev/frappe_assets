/**
 * @vitest-environment happy-dom
 *
 * What a dashboard does when no charting engine was imported.
 *
 * This file deliberately imports nothing from `charts/echarts.js`, and it must
 * stay that way — vitest isolates per file, so this is the only place the
 * absence can be observed. It is also the test that would fail if an engine ever
 * leaked back into the barrel, which is the whole saving v0.4.0 bought: 30 KB
 * minified rather than 727 KB, for the dashboards made of KPIs and a table.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { render_to_string } from "../../dashboard/render.js";
import { panels } from "../../core/spec.js";
import { has_engine, engine } from "../../charts/adapter.js";
import { setHost, resetHost, TestHost } from "../../core/host.js";

beforeEach(() => {
	resetHost();
	setHost(new TestHost());
});

describe("with no engine loaded", () => {
	it("has none, which is what keeps the barrel small", () => {
		expect(has_engine()).toBe(false);
	});

	it("still renders every panel, charts included — the markup is not the picture", () => {
		const pass = render_to_string({
			title: "T",
			blocks: [
				{ type: "kpis", items: [{ label: "L", value: "1" }] },
				{ type: "rows", items: [{ name: "N", count: 3, series: [1, 2, 5] }] },
				{ type: "chart", option: { series: [] } },
			],
		});
		expect(pass.html).toContain("dd-kpi");
		expect(pass.mounts.map((entry) => entry.panel)).toEqual(["rows", "chart"]);
	});

	it("skips a sparkline rather than throwing", () => {
		// An ornament on a row whose number is already printed beside it. A
		// dashboard that never asked for charts should still get its `rows` panel.
		const el = document.createElement("div");
		expect(panels.get("rows").mount(el, { item: { series: [1, 2] }, token: "--dd-danger" })).toBeNull();
	});

	it("throws on a chart panel, with the import line in the message", () => {
		// The opposite call, and on purpose: a chart panel is nothing but the
		// picture, so failing silently would leave an empty box that reads as a
		// backend returning no data.
		const el = document.createElement("div");
		let thrown;
		try {
			panels.get("chart").mount(el, { option: {} }, { range: () => ({}), follow: () => {} });
		} catch (error) {
			thrown = error;
		}
		expect(thrown.code).toBe("no_chart_engine");
		expect(thrown.message).toContain("frappe-assets/charts/echarts");
	});

	it("engine() is the thing that throws, not importing the barrel", () => {
		expect(() => engine()).toThrow(/no engine/i);
	});
});

/**
 * The render kernel: the panel registry and the mount queue.
 *
 * These are the two things that make the package a framework rather than a
 * renderer with twelve hard-coded shapes, so they are tested from the outside —
 * as a consuming app would use them, by defining a panel nobody here wrote.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Pass, panels } from "../../core/spec.js";
import { setHost, resetHost, TestHost } from "../../core/host.js";
import "../../dashboard/panels/index.js";

const added = [];

/** Define a panel for one test and take it out again afterwards. */
function define(name, panel) {
	panels.define(name, panel);
	added.push(name);
}

beforeEach(() => {
	resetHost();
	setHost(new TestHost());
});

afterEach(() => {
	for (const name of added.splice(0)) {
		panels.entries.delete(name);
	}
});

describe("the panel registry", () => {
	it("has the built-in twelve, and they are the same kind of thing as an added one", () => {
		for (const name of ["kpis", "fields", "card", "bars", "rows", "table", "chart", "text", "section", "split", "grid", "html"]) {
			expect(panels.has(name)).toBe(true);
		}
		expect(panels.get("kpis").render).toBeTypeOf("function");
	});

	it("renders a panel a consuming app defined", () => {
		// The point of the whole release: this used to require forking render.js or
		// falling back to `{type: "html"}`, which is documented as unescaped.
		define("callout", (node) => `<div class="my-callout">${node.text}</div>`);

		const pass = new Pass({});
		expect(pass.node({ type: "callout", text: "hi" })).toBe('<div class="my-callout">hi</div>');
	});

	it("refuses to take a name twice, naming the collision", () => {
		// Silent last-one-wins is how an app shadows `table` for every other page in
		// the same Desk session and finds out somewhere the definition is not.
		define("callout", () => "");
		expect(() => panels.define("callout", () => "")).toThrow(/already defined/);
	});

	it("throws on an unknown type rather than rendering nothing", () => {
		// A silently skipped panel looks exactly like a backend that returned no
		// data for it, and the wrong half of the stack gets debugged.
		const pass = new Pass({});
		let thrown;
		try {
			pass.node({ type: "nosuch" });
		} catch (error) {
			thrown = error;
		}
		expect(thrown.code).toBe("unknown_panel");
		expect(thrown.message).toContain("kpis");
	});

	it("refuses a panel with no render function", () => {
		expect(() => panels.define("broken", { mount: () => {} })).toThrow(/no render function/);
	});
});

describe("the mount phase", () => {
	it("records which panel claimed each slot, so the controller need not know", () => {
		define("live", {
			render: (node, pass) => `<div data-dd-mount="${pass.defer("live", node)}"></div>`,
			mount: () => () => {},
		});

		const pass = new Pass({});
		const html = pass.node([{ type: "live", id: "a" }, { type: "live", id: "b" }]);

		expect(html).toContain('data-dd-mount="0"');
		expect(html).toContain('data-dd-mount="1"');
		expect(pass.mounts.map((entry) => entry.panel)).toEqual(["live", "live"]);
		expect(pass.mounts[1].data.id).toBe("b");
	});

	it("starts empty per pass, so two dashboards cannot collide", () => {
		define("live", {
			render: (node, pass) => `<i data-dd-mount="${pass.defer("live", node)}"></i>`,
		});
		const first = new Pass({});
		first.node({ type: "live" });
		const second = new Pass({});

		expect(first.mounts).toHaveLength(1);
		expect(second.mounts).toHaveLength(0);
	});
});

describe("Pass", () => {
	it("writes no drill attributes when nothing was injected", () => {
		// A spec is legitimately renderable — to a string, for a printed digest —
		// with no way to open a list.
		const pass = new Pass({});
		expect(pass.drill({ doctype: "X" }, {})).toBe("");
	});

	it("slugs an explainer key into its id", () => {
		// `#dd-explain-net revenue` parses as a descendant combinator, matches
		// nothing, and the ⓘ button then opens no panel with nothing reporting it.
		const pass = new Pass({ explain: { "net revenue": ["Net revenue", "Sales less returns"] } });
		const html = pass.explainer("net revenue");
		expect(html).toContain('id="dd-explain-net-revenue"');
		expect(html).not.toContain('id="dd-explain-net revenue"');
	});
});

/**
 * @vitest-environment happy-dom
 *
 * `dd.page()` — the one call a Desk page file makes.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { page } from "../../desk/page.js";
import { setHost, resetHost, TestHost } from "../../core/host.js";

beforeEach(() => {
	document.body.innerHTML = "";
	resetHost();
	setHost(new TestHost());
});

function wrapper() {
	const el = document.createElement("div");
	document.body.appendChild(el);
	return el;
}

const options = {
	title: "My Dashboard",
	dated: false,
	fetch: () => Promise.resolve({ n: 1 }),
	spec: (data) => ({ title: "T", blocks: [{ type: "text", text: String(data.n) }] }),
};

describe("dd.page", () => {
	it("builds the Desk page, the state, the resource and the dashboard", async () => {
		const dash = page(wrapper(), options);
		await Promise.resolve();
		await Promise.resolve();
		expect(dash.page.title).toBe("My Dashboard");
		expect(dash.body.textContent).toContain("1");
	});

	it("does not stack a second controller on a re-entered page", () => {
		// Desk calls `on_page_load` once per route entry. Two controllers on one
		// wrapper means two sets of delegated handlers, two fetches per date change,
		// and one of the two drawing into an element the other owns.
		const el = wrapper();
		const first = page(el, options);
		const second = page(el, options);
		expect(second).toBe(first);
		expect(el.querySelectorAll(".dd-page").length).toBe(1);
	});

	it("lets the page be entered afresh after a destroy", () => {
		const el = wrapper();
		const first = page(el, options);
		first.destroy();
		expect(page(el, options)).not.toBe(first);
	});
});

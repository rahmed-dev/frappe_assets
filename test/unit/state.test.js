/**
 * `data/state.js` — the date window, the declared filters, and the URL.
 *
 * Node environment on purpose: `State` holds no DOM and reads the query string
 * through the host, so if any of this needs a document, that is the bug.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { State } from "../../data/state.js";
import { setHost, resetHost, TestHost } from "../../core/host.js";

let test_host;

beforeEach(() => {
	resetHost();
	test_host = new TestHost({ today: "2026-03-01" });
	setHost(test_host);
});

describe("the default window", () => {
	it("is a trailing 30 days ending today", () => {
		expect(new State().range()).toEqual({ from_date: "2026-01-30", to_date: "2026-03-01" });
	});

	it("is `default_days` wide when asked", () => {
		expect(new State({ default_days: 7 }).range().from_date).toBe("2026-02-22");
	});

	it("is absent entirely for an undated dashboard", () => {
		const state = new State({ dated: false });
		expect(state.range()).toEqual({});
		expect(state.get()).toEqual({});
	});
});

describe("declared filters", () => {
	const filters = [
		{ fieldname: "company", fieldtype: "Link", options: "Company" },
		{ fieldname: "status", fieldtype: "Select", options: ["Open", "Closed"], default: "Open" },
	];

	it("start at their declared default, and unset ones are simply absent", () => {
		const state = new State({ filters, dated: false });
		expect(state.get()).toEqual({ status: "Open" });
	});

	it("separate cleanly from the range", () => {
		const state = new State({ filters });
		state.set({ company: "Acme" });
		expect(state.filters()).toEqual({ status: "Open", company: "Acme" });
		expect(Object.keys(state.range())).toEqual(["from_date", "to_date"]);
	});

	it("treat null, undefined and the empty string alike as cleared", () => {
		// Frappe's Link control reports an unset value as "" and a cleared one as
		// null depending on how it was cleared. Distinguishing them here would make
		// a filter that behaves differently depending on how the reader emptied it.
		const state = new State({ filters, dated: false });
		for (const nothing of ["", null, undefined]) {
			state.set({ status: "Open" });
			state.set({ status: nothing });
			expect(state.get()).toEqual({});
		}
	});
});

describe("change notification", () => {
	it("is one event per patch, not one per key", () => {
		// A preset moves two dates. Two events would fetch twice and render the
		// first answer against the second window — the bug the controller used to
		// carry a `suspended` flag to avoid.
		const state = new State();
		let calls = 0;
		state.on(() => (calls += 1));
		state.set_preset(7);
		expect(calls).toBe(1);
		expect(state.range()).toEqual({ from_date: "2026-02-22", to_date: "2026-03-01" });
	});

	it("says nothing when nothing changed", () => {
		const state = new State({ dated: false, filters: [{ fieldname: "company" }] });
		state.set({ company: "Acme" });
		let calls = 0;
		state.on(() => (calls += 1));
		state.set({ company: "Acme" });
		expect(calls).toBe(0);
	});

	it("releases its handler when the unbinder is called", () => {
		const state = new State();
		let calls = 0;
		const off = state.on(() => (calls += 1));
		off();
		state.set_preset(7);
		expect(calls).toBe(0);
	});
});

describe("the preset a window matches", () => {
	it("is the one whose trailing window is on screen", () => {
		const state = new State();
		state.set_preset(30);
		expect(state.preset([7, 30, 90])).toBe(30);
	});

	it("is null for a hand-typed range, so no chip lights", () => {
		const state = new State();
		state.set({ from_date: "2026-02-11", to_date: "2026-02-19" });
		expect(state.preset([7, 30, 90])).toBeNull();
	});

	it("is null for a window that does not end today", () => {
		const state = new State();
		state.set({ from_date: "2026-01-01", to_date: "2026-01-31" });
		expect(state.preset([7, 30, 90])).toBeNull();
	});
});

describe("the URL", () => {
	it("carries the active state, so a filtered dashboard is a shareable link", () => {
		const state = new State({ filters: [{ fieldname: "company" }] });
		state.set({ company: "Acme" });
		expect(test_host.params).toEqual({
			from_date: "2026-01-30",
			to_date: "2026-03-01",
			company: "Acme",
		});
	});

	it("drops a cleared filter rather than leaving it behind", () => {
		// A link still carrying `company=Acme` after the reader cleared it is worse
		// than one carrying nothing: it reproduces a view nobody was looking at.
		const state = new State({ filters: [{ fieldname: "company" }] });
		state.set({ company: "Acme" });
		state.set({ company: "" });
		expect(test_host.params.company).toBeUndefined();
	});

	it("is restored on arrival", () => {
		test_host.params = { company: "Acme", from_date: "2026-02-01" };
		const state = new State({ filters: [{ fieldname: "company" }] });
		expect(state.get().company).toBe("Acme");
		expect(state.range().from_date).toBe("2026-02-01");
	});

	it("reads only declared keys", () => {
		// The object built here is handed to a whitelisted server method. A query
		// string that could add arguments to that call would let a link decide what
		// the backend receives, which is a different and much worse bug than a
		// filter that fails to apply.
		test_host.params = { company: "Acme", doctype: "User", limit_page_length: "0" };
		const state = new State({ filters: [{ fieldname: "company" }] });
		expect(state.get().doctype).toBeUndefined();
		expect(state.get().limit_page_length).toBeUndefined();
	});

	it("leaves out a value that cannot survive the round trip", () => {
		// `?status=Open,Closed` comes back as a string, and guessing whether it was
		// an array is how a MultiSelect quietly becomes a Data filter.
		const state = new State({ filters: [{ fieldname: "status" }], dated: false });
		state.set({ status: ["Open", "Closed"] });
		expect(state.get().status).toEqual(["Open", "Closed"]);
		expect(test_host.params.status).toBeUndefined();
	});

	it("is left alone entirely when sync is off", () => {
		const state = new State({ sync: false, filters: [{ fieldname: "company" }] });
		state.set({ company: "Acme" });
		expect(test_host.params).toEqual({});
	});
});

describe("route options", () => {
	it("beat the query string, being the more deliberate of the two", () => {
		test_host.params = { company: "FromUrl" };
		test_host.route_options = { company: "FromLink" };
		expect(new State({ filters: [{ fieldname: "company" }] }).get().company).toBe("FromLink");
	});

	it("are consumed, so the next page opened does not inherit them", () => {
		test_host.route_options = { company: "Acme", something_else: "kept" };
		new State({ filters: [{ fieldname: "company" }] });
		expect(test_host.route_options).toEqual({ something_else: "kept" });
	});
});

describe("reset", () => {
	it("clears the filters and puts the window back", () => {
		const state = new State({ filters: [{ fieldname: "company" }] });
		state.set({ company: "Acme", from_date: "2020-01-01" });
		state.reset();
		expect(state.get()).toEqual({ from_date: "2026-01-30", to_date: "2026-03-01" });
	});
});

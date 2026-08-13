/**
 * `dashboard/drill.js` — what a figure opens, and with which filters.
 *
 * Node environment: `follow` builds a route and hands it to the host, and the
 * host records it. Nothing here needs a document.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { follow } from "../../dashboard/drill.js";
import { setHost, resetHost, TestHost } from "../../core/host.js";

let test_host;

beforeEach(() => {
	resetHost();
	test_host = new TestHost();
	setHost(test_host);
});

/** The filter object of the single list route that was followed. */
const filters_of = () => test_host.routes[0][2];

describe("a list drill", () => {
	it("opens the doctype with the descriptor's own filters", () => {
		follow({ doctype: "Sales Order", filters: { docstatus: 1 } }, { range: {} });
		expect(test_host.routes[0].slice(0, 2)).toEqual(["List", "Sales Order"]);
		expect(filters_of()).toEqual({ docstatus: 1 });
	});

	it("adds the date window only when a `date_field` was named", () => {
		const range = { from_date: "2026-01-01", to_date: "2026-01-31" };
		follow({ doctype: "Sales Order" }, { range });
		expect(filters_of().transaction_date).toBeUndefined();

		test_host.routes = [];
		follow({ doctype: "Sales Order", date_field: "transaction_date" }, { range });
		expect(filters_of().transaction_date).toEqual([
			"Between",
			["2026-01-01", "2026-01-31"],
		]);
	});
});

describe("inheriting the page's filters", () => {
	const context = { range: {}, filters: { company: "Acme", warehouse: "Main" } };

	it("takes nothing unless the descriptor asked", () => {
		// Opt-in, and this is the decision in the file worth arguing about: a
		// dashboard filter is a fieldname on whatever the backend aggregates, and
		// the list a figure opens is often a different doctype. Passing `warehouse`
		// to a list of Sales Invoices is a list view that errors on an unknown
		// field — every drill on the page dying because somebody added a filter.
		follow({ doctype: "Sales Invoice" }, context);
		expect(filters_of()).toEqual({});
	});

	it("takes the named ones", () => {
		follow({ doctype: "Sales Invoice", inherit: ["company"] }, context);
		expect(filters_of()).toEqual({ company: "Acme" });
	});

	it("takes all of them for `inherit: true`", () => {
		follow({ doctype: "Sales Invoice", inherit: true }, context);
		expect(filters_of()).toEqual({ company: "Acme", warehouse: "Main" });
	});

	it("skips a named filter the page has not set", () => {
		follow({ doctype: "Sales Invoice", inherit: ["company", "project"] }, context);
		expect(filters_of()).toEqual({ company: "Acme" });
	});

	it("lets the descriptor's own filter win", () => {
		// The panel knows something more specific than the page does. A page filter
		// that overwrote it would open a list of rows the figure did not count.
		follow({ doctype: "Sales Invoice", inherit: true, filters: { company: "Beta" } }, context);
		expect(filters_of().company).toBe("Beta");
	});
});

describe("the other two descriptor shapes", () => {
	it("follows a bare route", () => {
		follow({ route: ["Form", "Sales Order", "SO-0001"] }, { range: {} });
		expect(test_host.routes[0][0]).toEqual(["Form", "Sales Order", "SO-0001"]);
	});

	it("calls a function with the context, and routes nothing itself", () => {
		let seen = null;
		follow((context) => (seen = context), { range: { from_date: "2026-01-01" } });
		expect(seen.range.from_date).toBe("2026-01-01");
		expect(test_host.routes).toEqual([]);
	});
});

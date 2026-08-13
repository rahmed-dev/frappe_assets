/**
 * The host adapter — the one place in this package that knows Desk exists.
 *
 * Before this, `frappe`, `__` and `$` were reached for directly from five
 * modules. That is fine right up until you want to do anything with the renderer
 * other than run it inside a logged-in Desk session: a test needs a stub, the
 * gallery needs a stub, a printed or emailed dashboard needs a stub, and each of
 * them ends up being a slightly different stub that drifts from the real thing.
 * The bug that finds you is always the same shape — something works in the
 * gallery and not on the page, or the reverse — and it is never where you look.
 *
 * So everything environmental goes behind one object with one interface:
 * translation, routing, dates, server calls, realtime, and the "after the
 * browser has painted" hook. `DeskHost` implements it against Frappe.
 * `TestHost` implements it against nothing.
 *
 * WHAT IS DELIBERATELY *NOT* HERE
 * Escaping. `core/escape.js` has no host and never will. The function that
 * decides whether a supplier's product name can close an attribute must not be
 * swappable, must not be stubbed, and must not be missing because something
 * loaded in an order nobody predicted. It is the bottom of the stack on purpose.
 *
 * WHY RESOLUTION IS LAZY
 * Nothing is installed at import time. `host()` resolves on first use and
 * installs `DeskHost` if `frappe` is there. That keeps this module free of load
 * side effects — which is what `package.json` `sideEffects` claims of the whole
 * package — and it means import order against Frappe's own bootstrap cannot
 * matter.
 */

import { NoHostError } from "./errors.js";

let current = null;

/**
 * The installed host, resolving one on first use.
 *
 * @param {string} [what]  what wanted it, for the error message when there is
 *   nothing to resolve. Only reachable outside Desk, so the message is written
 *   for the case that actually produces it: a test or a build script.
 */
export function host(what = "this") {
	if (current) {
		return current;
	}
	if (typeof frappe !== "undefined" && frappe) {
		current = new DeskHost();
		return current;
	}
	throw new NoHostError(what);
}

/** Install a host. Returns the previous one, so a test can put it back. */
export function setHost(next) {
	const previous = current;
	current = next;
	return previous;
}

/** Forget the installed host, so the next `host()` resolves afresh. */
export function resetHost() {
	current = null;
}

// ============================================================================
// DESK
// ============================================================================

/**
 * The real one: Frappe's globals, behind the interface.
 *
 * Every method here is a one-liner, and that is the point — this file is the
 * complete inventory of what this package needs from Desk. When Frappe changes
 * something, this is the only place that has to move, and the list is short
 * enough to audit against a new version in a couple of minutes.
 */
export class DeskHost {
	get name() {
		return "desk";
	}

	/** Translation. `args` fills `{0}`, `{1}` … exactly as Frappe's `__` does. */
	t(text, args) {
		return __(text, args);
	}

	/**
	 * Navigate. Takes either `route(["Form", "Sales Order", "SO-0001"])` or
	 * `route("List", "Sales Order", {status: "Open"})` — both are shapes the
	 * existing drill descriptors produce, and Frappe accepts both.
	 */
	route(...args) {
		return frappe.set_route(...args);
	}

	/**
	 * The route options Frappe carries between pages, used to put the active
	 * range and filters in a shareable link.
	 */
	get route_options() {
		return frappe.route_options || {};
	}

	set route_options(value) {
		frappe.route_options = value;
	}

	/**
	 * The query string of the page currently on screen, as a plain object.
	 *
	 * Desk routes look like `/app/my-dashboard?company=Acme`, and the part after
	 * the `?` survives a copy-paste of the address bar where `frappe.route_options`
	 * does not — route options are an in-memory hand-off between two Desk pages and
	 * are consumed on arrival. A shareable filtered dashboard therefore needs both:
	 * route options for "opened from a workspace link", the query string for
	 * "somebody sent me this URL".
	 */
	query() {
		const out = {};
		for (const [key, value] of new URLSearchParams(window.location.search)) {
			out[key] = value;
		}
		return out;
	}

	/**
	 * Rewrite the query string without adding a history entry.
	 *
	 * `replaceState` rather than `pushState`: a filter change is not a navigation,
	 * and making it one turns the browser Back button into "undo my last filter",
	 * which means leaving the dashboard takes as many presses as filters touched.
	 */
	set_query(params) {
		const search = new URLSearchParams(params).toString();
		const url = window.location.pathname + (search ? `?${search}` : "") + window.location.hash;
		window.history.replaceState(window.history.state, "", url);
	}

	/** Desk's page scaffolding — the title bar, the head, the body container. */
	make_page(wrapper, options) {
		return frappe.ui.make_app_page({
			parent: wrapper,
			single_column: true,
			...options,
		});
	}

	today() {
		return frappe.datetime.get_today();
	}

	add_days(date, days) {
		return frappe.datetime.add_days(date, days);
	}

	/** A stored date in the reader's format, not the database's. */
	format_date(value) {
		return frappe.datetime.str_to_user(value);
	}

	/**
	 * Call a whitelisted method, resolving to its `message`.
	 *
	 * Resolving to `message` rather than the envelope because every caller wants
	 * it and unwrapping by hand at each call site is how one of them eventually
	 * forgets. The envelope is available on the rejection for the cases that need
	 * to see a server exception.
	 *
	 * `signal` is honoured by aborting the underlying request. Frappe returns the
	 * jqXHR from `frappe.call`, which carries `.abort()`; without this a range
	 * change leaves the previous query running to completion on the server for
	 * nothing.
	 */
	call(method, args, options = {}) {
		const request = frappe.call({ method, args, ...options.frappe });
		const promise = Promise.resolve(request).then((response) => response.message);
		if (options.signal) {
			if (options.signal.aborted) {
				request.abort?.();
			} else {
				options.signal.addEventListener("abort", () => request.abort?.(), { once: true });
			}
		}
		return promise;
	}

	on_realtime(event, handler) {
		frappe.realtime.on(event, handler);
		return () => frappe.realtime.off(event, handler);
	}

	/**
	 * Run after the markup written this tick has been laid out.
	 *
	 * `frappe.after_ajax` is what the controller has always used, and it is load
	 * bearing rather than cosmetic: ECharts measures its container once at init,
	 * so a chart built in the same tick as the markup it lives in sizes to 0px
	 * and renders nothing — silently.
	 */
	after_paint(callback) {
		frappe.after_ajax(callback);
	}

	warn(message) {
		console.warn(message); // eslint-disable-line no-console
	}

	error(error) {
		console.error(error); // eslint-disable-line no-console
	}
}

// ============================================================================
// TEST / HEADLESS
// ============================================================================

const DAY = 86400000;

/** `YYYY-MM-DD` in UTC — no timezone shifting, because a bare date has none. */
function iso(date) {
	return date.toISOString().slice(0, 10);
}

/**
 * A host with no Frappe behind it: tests, the gallery, and anything rendering a
 * dashboard outside a browser session.
 *
 * The date arithmetic is real rather than stubbed, because a test asserting on a
 * `bars` panel wants the same window boundaries the page would compute. `today`
 * is injectable and defaults to a **fixed** date rather than the clock — a
 * snapshot test that quietly depends on what day it is passes for a month and
 * then fails on a machine in another timezone.
 */
export class TestHost {
	constructor(options = {}) {
		this.now = options.today || "2026-01-15";
		this.routes = [];
		this.calls = [];
		this.warnings = [];
		this.route_options = {};
		this.responses = options.responses || {};
		// The query string, as an object rather than a string. A test asserting on
		// URL sync asserts on this; nothing here touches `window.location`, so the
		// same assertions hold in bare Node.
		this.params = options.query || {};
	}

	get name() {
		return "test";
	}

	/** Frappe's `{0}`-style interpolation, reimplemented so tests read the same. */
	t(text, args) {
		if (!args) {
			return text;
		}
		return String(text).replace(/\{(\d+)\}/g, (whole, index) => {
			const value = args[Number(index)];
			return value == null ? whole : String(value);
		});
	}

	/** Recorded, not followed. Assert on `host.routes` instead of on navigation. */
	route(...args) {
		this.routes.push(args);
	}

	query() {
		return { ...this.params };
	}

	set_query(params) {
		this.params = { ...params };
	}

	/**
	 * A page object with the surface the controller uses, and nothing else.
	 *
	 * `add_field` returns a control whose `get_value`/`set_value` are real, because
	 * the range logic reads them back — a stub that forgets what it was set to
	 * would make every preset test vacuous.
	 */
	make_page(wrapper, options = {}) {
		const fields = [];
		return {
			wrapper,
			main: wrapper,
			title: options.title,
			fields,
			add_field(spec) {
				let value = spec.default;
				const control = {
					df: spec,
					get_value: () => value,
					set_value: (next) => {
						value = next;
						return Promise.resolve(next);
					},
				};
				fields.push(control);
				return control;
			},
			set_primary_action(label, action) {
				this.primary_action = { label, action };
			},
			set_title(next) {
				this.title = next;
			},
		};
	}

	today() {
		return this.now;
	}

	add_days(date, days) {
		return iso(new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY));
	}

	format_date(value) {
		return value == null ? "" : String(value);
	}

	/**
	 * Answer from the `responses` map, or reject naming the method.
	 *
	 * Rejecting rather than resolving `undefined` on an unmapped method: a test
	 * whose fixture is missing should fail saying which one, not render a
	 * dashboard full of em dashes that looks like a legitimate empty range.
	 */
	call(method, args) {
		this.calls.push({ method, args });
		if (!(method in this.responses)) {
			return Promise.reject(new Error(`TestHost: no response mapped for "${method}"`));
		}
		const answer = this.responses[method];
		return Promise.resolve(typeof answer === "function" ? answer(args) : answer);
	}

	on_realtime() {
		return () => {};
	}

	/** Synchronous, so a test does not have to await a paint that never happens. */
	after_paint(callback) {
		callback();
	}

	warn(message) {
		this.warnings.push(message);
	}

	error(error) {
		this.warnings.push(error);
	}
}

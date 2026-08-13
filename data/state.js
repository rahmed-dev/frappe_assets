/**
 * What the page is currently asking for: a date window plus declared filters.
 *
 * Before this, "the state" of a dashboard was two `add_field` controls the
 * controller happened to hold references to, and `range()` read them back on
 * demand. That works for exactly two date fields and nothing else. The moment a
 * page wants a Company filter it grows its own control, its own change handler,
 * its own "put it in the URL" code and its own "pass it to the drill" code —
 * which is four places per filter, in every consuming app, written slightly
 * differently each time.
 *
 * So a filter is **declared**, not built:
 *
 *   filters: [
 *     {fieldname: "company", fieldtype: "Link", options: "Company"},
 *     {fieldname: "status", fieldtype: "Select", options: ["Open", "Closed"]},
 *   ]
 *
 * and this object owns the values, the change notification, the URL round trip
 * and the object handed to `fetch`. The controls themselves are still Desk's —
 * `page.add_field` builds them — because a Link field with its awesomplete and
 * its permission-aware search is not something worth reimplementing.
 *
 * WHY THE URL AND NOT ONLY `frappe.route_options`
 * Route options are an in-memory hand-off between two Desk pages: a workspace
 * link sets them, the destination reads them, and they are gone. They cannot
 * survive being copied out of the address bar and pasted into a message, which
 * is the thing people actually do with a filtered dashboard. Both are read on
 * arrival — route options first, since they are the more deliberate of the two —
 * and the query string is what gets written back.
 *
 * State holds no DOM and calls no server. It is a plain observable value, which
 * is what lets `Resource` be driven by it without either knowing about the other.
 */

import { Emitter } from "../core/events.js";
import { host } from "../core/host.js";

const DEFAULT_RANGE_DAYS = 30;

/** The two range keys, named once so nothing has to spell them twice. */
export const RANGE_KEYS = ["from_date", "to_date"];

/**
 * A value that means "no filter": Frappe's Link and Select controls both report
 * an unset value as `""`, and a `null` from a cleared control is common enough
 * that treating the two differently would be a bug waiting for a specific site.
 */
function blank(value) {
	return value === undefined || value === null || value === "";
}

/**
 * Can this value make the round trip through a query string unambiguously?
 *
 * Strings and numbers can. An array or an object cannot: `?status=Open,Closed`
 * and `?status=["Open","Closed"]` both come back as a string, and guessing which
 * one was meant is how a MultiSelect filter silently becomes a Link filter
 * matching a doctype named `["Open","Closed"]`. Such a value stays in memory and
 * is simply left out of the URL — a shorter link is a better failure than a
 * wrong one.
 */
function scalar(value) {
	return typeof value === "string" || typeof value === "number";
}

export class State {
	/**
	 * @param {object} options
	 *   filters       → [{fieldname, fieldtype, options, label, default}]  optional
	 *   dated         → true      optional; false drops the date window entirely
	 *   default_days  → 30        optional; the window width on first load
	 *   sync          → true      optional; false keeps the URL untouched
	 *   values        → {}        optional starting values, below the URL
	 */
	constructor(options = {}) {
		this.declarations = (options.filters || []).map((filter) => ({ ...filter }));
		this.dated = options.dated !== false;
		this.default_days = options.default_days || DEFAULT_RANGE_DAYS;
		this.sync = options.sync !== false;
		this.events = new Emitter();

		this.values = { ...this.defaults(), ...(options.values || {}) };
		this.restore();
	}

	/**
	 * The values a page starts at with nothing in the URL: the trailing window,
	 * plus whatever each declaration named as its own default.
	 */
	defaults() {
		const values = {};
		if (this.dated) {
			const h = host("State");
			const today = h.today();
			values.from_date = h.add_days(today, -this.default_days);
			values.to_date = today;
		}
		for (const filter of this.declarations) {
			if (!blank(filter.default)) {
				values[filter.fieldname] = filter.default;
			}
		}
		return values;
	}

	/** Every key this state is willing to read off a URL. */
	keys() {
		return [
			...(this.dated ? RANGE_KEYS : []),
			...this.declarations.map((filter) => filter.fieldname),
		];
	}

	/**
	 * Take whatever the incoming route and URL said, ignoring everything else.
	 *
	 * Only declared keys are read. A query string is user-supplied input and the
	 * object built here is passed straight to a server method — accepting keys
	 * nobody declared would let a link decide what arguments a whitelisted method
	 * receives, which is a different and much worse bug than a filter that does
	 * not apply.
	 */
	restore() {
		const h = host("State");
		const incoming = { ...h.query(), ...(h.route_options || {}) };
		const allowed = this.keys();
		for (const key of allowed) {
			if (!blank(incoming[key])) {
				this.values[key] = incoming[key];
			}
		}
		// Route options are a hand-off, and Frappe's own pages consume them on
		// arrival. Leaving ours behind means the next page opened from a drill
		// inherits this dashboard's filters as its own.
		if (h.route_options) {
			const rest = { ...h.route_options };
			let touched = false;
			for (const key of allowed) {
				if (key in rest) {
					delete rest[key];
					touched = true;
				}
			}
			if (touched) {
				h.route_options = rest;
			}
		}
		return this;
	}

	// ----------------------------------------------------------------- reading

	/** Every active value — the date window and the filters that are set. */
	get() {
		const out = {};
		for (const key of this.keys()) {
			if (!blank(this.values[key])) {
				out[key] = this.values[key];
			}
		}
		return out;
	}

	/** Just the window, in the shape `fetch` and the drill helpers expect. */
	range() {
		if (!this.dated) {
			return {};
		}
		return { from_date: this.values.from_date, to_date: this.values.to_date };
	}

	/** Just the filters — the range removed, for a drill that adds its own dates. */
	filters() {
		const out = this.get();
		for (const key of RANGE_KEYS) {
			delete out[key];
		}
		return out;
	}

	value(fieldname) {
		return this.values[fieldname];
	}

	/**
	 * The preset window matching what is set, or `null`.
	 *
	 * Derived rather than remembered, so a hand-typed range lights no chip without
	 * anything having to clear one.
	 */
	preset(presets) {
		if (!this.dated) {
			return null;
		}
		const h = host("State");
		const today = h.today();
		if (this.values.to_date !== today) {
			return null;
		}
		return presets.find((days) => h.add_days(today, -days) === this.values.from_date) ?? null;
	}

	// ----------------------------------------------------------------- writing

	/**
	 * Merge values in and tell everyone once.
	 *
	 * One event for the whole patch, not one per key: setting a preset moves two
	 * dates, and a listener that fetches would otherwise fire twice and render the
	 * first answer against the second window. That bug already existed once here,
	 * worked around in the controller with a `suspended` flag; making the patch the
	 * unit of change removes the need for the flag.
	 */
	set(patch, options = {}) {
		let changed = false;
		for (const [key, value] of Object.entries(patch)) {
			const next = blank(value) ? undefined : value;
			if (this.values[key] !== next) {
				if (next === undefined) {
					delete this.values[key];
				} else {
					this.values[key] = next;
				}
				changed = true;
			}
		}
		if (!changed) {
			return this;
		}
		this.publish();
		if (!options.silent) {
			this.events.emit("change", { state: this, values: this.get(), patch });
		}
		return this;
	}

	/** Move to a trailing window of `days`, ending today. */
	set_preset(days) {
		const h = host("State");
		const today = h.today();
		return this.set({ from_date: h.add_days(today, -days), to_date: today });
	}

	/** Back to the starting values, filters cleared. */
	reset() {
		const defaults = this.defaults();
		const patch = {};
		for (const key of this.keys()) {
			patch[key] = defaults[key];
		}
		return this.set(patch);
	}

	/**
	 * Write the active state into the address bar.
	 *
	 * The whole query string is replaced rather than merged, so clearing a filter
	 * clears it from the URL too — a link that still carries `company=Acme` after
	 * the reader cleared it is worse than one that carries nothing.
	 */
	publish() {
		if (!this.sync) {
			return;
		}
		const params = {};
		for (const [key, value] of Object.entries(this.get())) {
			if (scalar(value)) {
				params[key] = String(value);
			}
		}
		host("State").set_query(params);
	}

	// --------------------------------------------------------------- listening

	/** Listen for changes. Returns the unbinder. */
	on(handler) {
		return this.events.on("change", handler);
	}

	off(handler) {
		this.events.off("change", handler);
		return this;
	}

	destroy() {
		this.events.clear();
	}
}

/**
 * Drill-down: turning a number on a dashboard into the rows behind it.
 *
 * A dashboard whose figures cannot be opened is a poster. The whole point of a
 * count is that somebody eventually asks "which ones?", and the answer has to be
 * one click away or they will go and build the filter by hand — and get a
 * different number.
 *
 * A drill descriptor is one of three shapes:
 *
 *   { doctype: "Sales Order", filters: { docstatus: 1 } }   → the filtered list
 *   { route: ["Form", "Sales Order", "SO-0001"] }           → any Desk route
 *   (context) => { ... }                                    → escape hatch
 *
 * Functions cannot survive a trip through an HTML string, so descriptors are
 * kept in a per-render registry and the markup carries only its index. That is
 * also why the registry is rebuilt on every render: a stale index would open the
 * previous range's rows.
 */

import { host } from "../core/host.js";
import { esc } from "../core/escape.js";
import { delegate } from "../core/dom.js";

export const DRILL_ATTR = "data-dd-drill";

/**
 * The attributes that make an element drillable, or "" when it is not.
 *
 * The `role` and `tabindex` are not decoration. Without them the element is
 * invisible to the keyboard and unannounced to a screen reader, and drill-down
 * silently becomes a mouse-only feature — on a page people work in all day, that
 * is the difference between a feature and a demo. `.dd-drillable` supplies the
 * visible affordance; `drill.js` binds the activation.
 */
export function attrs(registry, drill, context) {
	if (!drill) {
		return "";
	}
	const index = registry.push({ descriptor: drill, context: context || {} }) - 1;
	// Deliberately vague unless the spec says otherwise. A dashboard figure is
	// usually an aggregate — distinct sessions, distinct customers — while the
	// list it opens is rows, so "Open these 12" would be a promise the list
	// cannot keep. A descriptor that really does open exactly the counted rows
	// can say so with its own `hint`.
	const hint = drill.hint || host("drill").t("Open the underlying records");
	return `${DRILL_ATTR}="${index}" class="dd-drillable" role="link" tabindex="0" title="${esc(hint)}"`;
}

/**
 * Build the filter object for a list-view drill.
 *
 * The date range is injected ONLY when the descriptor names a `date_field`. It
 * is deliberately opt-in rather than automatic: a list filter compares stored
 * timestamps, and a site whose stored timezone differs from the reader's will
 * open a list that disagrees with the row just clicked. A dashboard that
 * aggregates in the reader's timezone must therefore leave the list unfiltered
 * by date and say so, rather than show two different truths.
 */
function list_filters(drill, context) {
	const range = context && context.range;
	const filters = Object.assign({}, inherited(drill, context), drill.filters);
	if (drill.date_field && range && range.from_date && range.to_date) {
		filters[drill.date_field] = ["Between", [range.from_date, range.to_date]];
	}
	return filters;
}

/**
 * The page's own filters, carried into the list — but only the ones the
 * descriptor asked for.
 *
 * `inherit: ["company"]` names them; `inherit: true` takes every filter the page
 * has set. Opt-in rather than automatic, and this is the one decision in the file
 * worth arguing about, so: a dashboard filter is a fieldname on whatever the
 * backend aggregates, and the list a figure opens is frequently a different
 * doctype. Passing `warehouse` to a list of Sales Invoices produces a list view
 * that errors on an unknown field, which turns every drill on the page into a
 * dead end the moment somebody adds a filter — a failure caused by a change
 * nowhere near the drill.
 *
 * Explicit filters on the descriptor win over inherited ones. A drill that says
 * `filters: {company: "Acme"}` means it, and the page filter must not overwrite
 * an answer the panel already knows.
 */
function inherited(drill, context) {
	const active = (context && context.filters) || {};
	if (drill.inherit === true) {
		return { ...active };
	}
	if (!Array.isArray(drill.inherit)) {
		return {};
	}
	const out = {};
	for (const fieldname of drill.inherit) {
		if (active[fieldname] !== undefined) {
			out[fieldname] = active[fieldname];
		}
	}
	return out;
}

/**
 * Follow a drill descriptor.
 *
 * `context` carries whatever the panel knew about the thing clicked — the datum,
 * its index, the active range — so a function descriptor can decide from it.
 */
export function follow(drill, context) {
	if (typeof drill === "function") {
		drill(context);
		return;
	}
	if (drill.route) {
		host("drill").route(drill.route);
		return;
	}
	if (drill.doctype) {
		// `set_route` with a filter object goes through the list view's own filter
		// area, so the opened list shows the filters as chips the user can edit —
		// a query string would apply them invisibly.
		host("drill").route("List", drill.doctype, list_filters(drill, context));
	}
}

/**
 * Bind activation once, delegated from the page body.
 *
 * Delegated because every refresh replaces the markup wholesale, so a handler
 * bound to an element would be thrown away with it.
 *
 * Enter and Space both activate, matching what `role="link"` and a real button
 * respectively lead a keyboard user to expect. Space is prevented from its
 * default scroll; Enter has none to prevent.
 */
export function bind(root, resolve) {
	const activate = (event, target) => {
		const drill = resolve(Number(target.getAttribute(DRILL_ATTR)));
		if (!drill) {
			return;
		}
		// A drillable row can contain its own links ("Error Log"). Those are real
		// anchors and must win, or the row would swallow every one of them.
		if (event.target.closest("a, button")) {
			return;
		}
		event.preventDefault();
		follow(drill.descriptor, drill.context);
	};

	const off = [
		delegate(root, "click", `[${DRILL_ATTR}]`, activate),
		delegate(root, "keydown", `[${DRILL_ATTR}]`, (event, target) => {
			if (event.key === "Enter" || event.key === " ") {
				activate(event, target);
			}
		}),
	];
	return () => off.forEach((unbind) => unbind());
}

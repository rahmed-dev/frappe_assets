/**
 * One call from a Desk page file to a working dashboard.
 *
 * A Desk page's `on_page_load` is handed a bare wrapper element and nothing
 * else, so every page in every app opens with the same four lines of
 * scaffolding — `make_app_page`, a title, a container, a controller. Four lines
 * is not much, but they are four lines that are subtly different in every app,
 * and they are where the page-level mistakes live: a page that forgets
 * `single_column` and renders inside a form layout, a page that builds its
 * controller twice because Desk calls `on_page_load` once per route entry.
 *
 *   frappe.pages["my-dashboard"].on_page_load = (wrapper) =>
 *     myapp.dash.dd.page(wrapper, {
 *       title: __("My Dashboard"),
 *       filters: [{fieldname: "company", fieldtype: "Link", options: "Company"}],
 *       method: "myapp.api.summary",
 *       spec: (data, state) => ({ ... }),
 *     });
 *
 * Everything it does stays available as a class — `State`, `Resource`,
 * `Dashboard` — because the moment a page wants two dashboards driven by one
 * filter bar, or a resource shared between panels, a single entry point is in
 * the way. This is the short road, not the only one.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * Load the charting engine. That is a static `import "frappe-assets/charts/echarts"`
 * in the app's own bundle file, which is what lets an app with no charts not
 * ship 550 KB of one. A `frappe.require` here would put the decision back in
 * this package and take the saving away from every app at once.
 */

import { host } from "../core/host.js";
import { Dashboard } from "../dashboard/controller.js";

/**
 * Build the Desk page and its dashboard.
 *
 * @param {HTMLElement|object} wrapper  what `on_page_load` was handed
 * @param {object} options              a `Dashboard`'s options, plus `title`
 * @returns {Dashboard}
 */
export function page(wrapper, options = {}) {
	const target = wrapper;

	// Desk calls `on_page_load` once per route entry, but a page kept in the DOM
	// and re-entered would otherwise stack a second controller on the same
	// wrapper — two sets of delegated handlers, two fetches per date change, and
	// one of the two drawing into an element the other owns.
	if (target.__dd_dashboard) {
		target.__dd_dashboard.refresh();
		return target.__dd_dashboard;
	}

	const desk_page =
		options.page ||
		host("page").make_page(target, {
			title: options.title,
			single_column: options.single_column !== false,
			card_layout: options.card_layout,
		});

	const dashboard = new Dashboard(desk_page, options);
	target.__dd_dashboard = dashboard;

	const destroy = dashboard.destroy.bind(dashboard);
	dashboard.destroy = () => {
		delete target.__dd_dashboard;
		destroy();
	};
	return dashboard;
}

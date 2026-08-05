/**
 * The page controller: everything a dashboard has that is not its own data.
 *
 * Date fields, preset chips, refresh, loading and error states, the theme
 * watcher, ⓘ popovers, drill binding, chart mounting. None of it is specific to
 * any one dashboard, and every one of them got rewritten from scratch on the two
 * pages this toolkit was extracted from.
 *
 * A consumer supplies two things:
 *
 *   fetch(range)  → a promise of whatever the backend returns
 *   spec(data, range) → the render spec for that data
 *
 * and gets a working page. The split is the point: `spec` is a pure function of
 * data, so it can be read and reasoned about without tracing a request, and
 * `fetch` is the only place that knows a server exists.
 */

import { render } from "./render.js";
import { bind as bind_drills, follow } from "./drill.js";
import { chart, sparkline, token } from "./charts.js";

const DEFAULT_PRESETS = [7, 30, 90];
const DEFAULT_RANGE_DAYS = 30;

export class Dashboard {
	/**
	 * @param {object} page  the Frappe page object (`wrapper.page`)
	 * @param {object} options
	 *   fetch(range)        → Promise<data>       required
	 *   spec(data, range)   → render spec         required
	 *   presets             → [7, 30, 90]         optional, [] to omit the strip
	 *   default_days        → 30                  optional
	 *   dated               → true                optional; false drops the date fields
	 *   namespace           → "dd"                optional; only matters if two
	 *                                               dashboards can be open at once
	 *   page_class          → ""                  optional hook for page-local CSS
	 */
	constructor(page, options) {
		this.page = page;
		this.options = options;
		this.presets = options.presets || DEFAULT_PRESETS;
		this.namespace = options.namespace || "dd";
		// `page_class` is the seam for the genuinely page-local rule — a label
		// column sized for one dashboard's stage names, say. It exists so that such
		// a rule has somewhere to go other than the shared stylesheet.
		this.body = $(`<div class="dd-page ${options.page_class || ""}">`).appendTo(
			page.main,
		);

		// The measure (§2) is applied to the page WRAPPER, because the date fields
		// and the Refresh button live in Desk's page head — outside `.dd-page`.
		// Capping only our own element would centre the dashboard and leave its own
		// controls against the left edge.
		page.wrapper.addClass("dd-host");

		if (options.dated !== false) {
			this.setup_dates();
		}
		this.bind();
		this.refresh();
	}

	// ------------------------------------------------------------------ range

	setup_dates() {
		const today = frappe.datetime.get_today();
		const days = this.options.default_days || DEFAULT_RANGE_DAYS;

		this.from_date = this.page.add_field({
			fieldtype: "Date",
			fieldname: "from_date",
			label: __("From Date"),
			default: frappe.datetime.add_days(today, -days),
			change: () => this.refresh(),
		});
		this.to_date = this.page.add_field({
			fieldtype: "Date",
			fieldname: "to_date",
			label: __("To Date"),
			default: today,
			change: () => this.refresh(),
		});
		this.page.set_primary_action(
			__("Refresh"),
			() => this.refresh(),
			"refresh",
		);
	}

	range() {
		if (!this.from_date) {
			return {};
		}
		return {
			from_date: this.from_date.get_value(),
			to_date: this.to_date.get_value(),
		};
	}

	/**
	 * Move to a preset window.
	 *
	 * A control's `set_value` fires that field's own `change`, so setting the pair
	 * unguarded fetches twice and renders the first result against the second
	 * window. Suspended until both have landed, then one refresh.
	 */
	apply_range(days) {
		const today = frappe.datetime.get_today();
		this.suspended = true;
		Promise.all([
			this.from_date.set_value(frappe.datetime.add_days(today, -days)),
			this.to_date.set_value(today),
		]).then(() => {
			this.suspended = false;
			this.refresh();
		});
	}

	/**
	 * Light the chip matching the window on screen, if any.
	 *
	 * Derived from the date fields rather than remembered from the last click, so
	 * a hand-typed range lights nothing without having to be told to.
	 */
	sync_presets() {
		this.body.find(".dd-preset").removeClass("is-active");
		if (!this.from_date) {
			return;
		}
		const today = frappe.datetime.get_today();
		const from = this.from_date.get_value();
		const match =
			this.to_date.get_value() === today
				? this.presets.find(
						(days) => frappe.datetime.add_days(today, -days) === from,
					)
				: null;

		if (match) {
			this.body.find(`.dd-preset[data-days="${match}"]`).addClass("is-active");
		}
	}

	// --------------------------------------------------------------- handlers

	/**
	 * Bind once, delegated from the page body.
	 *
	 * Every refresh replaces the body's markup, so a handler bound to a chip or an
	 * ⓘ button would be discarded with it.
	 */
	bind() {
		this.body.on("click", ".dd-preset", (e) =>
			this.apply_range(Number($(e.currentTarget).data("days"))),
		);
		this.body.on("click", ".dd-info", (e) => {
			e.stopPropagation();
			this.toggle_explainer($(e.currentTarget));
		});

		bind_drills(this.body, (index) => {
			const entry = this.drills && this.drills[index];
			if (!entry) {
				return null;
			}
			// The active range is merged in at follow time, not at render time: a
			// descriptor captured mid-render would carry the window it was drawn
			// for, which is right, but the range fields are the live truth and the
			// two can only disagree if something has gone wrong upstream.
			return {
				descriptor: entry.descriptor,
				context: Object.assign({ range: this.range() }, entry.context),
			};
		});

		// Outside-click and Escape close whatever popover is open. These are the
		// only two handlers that cannot live on the body — an outside click is by
		// definition not inside it. Namespaced and cleared first, so re-entering the
		// page cannot stack a second copy on the document.
		$(document)
			.off(`.${this.namespace}`)
			.on(`click.${this.namespace}`, () => this.close_explainers())
			.on(`keydown.${this.namespace}`, (e) => {
				if (e.key === "Escape") {
					this.close_explainers();
				}
			});
	}

	/**
	 * Open one panel and close every other — only one is ever open.
	 *
	 * The flip class is decided from the measured rect rather than from which
	 * column the card sits in: the panel is a fixed width and the rail can be five
	 * cards across, so on a narrow window even a middle card can overflow.
	 */
	toggle_explainer(button) {
		const panel = this.body.find(`#${button.attr("aria-controls")}`);
		const opening = panel.prop("hidden");
		this.close_explainers();
		if (!opening) {
			return;
		}
		panel.prop("hidden", false);
		button.attr("aria-expanded", "true");
		panel.toggleClass(
			"dd-info-pop-flip",
			panel.get(0).getBoundingClientRect().right > window.innerWidth,
		);
	}

	close_explainers() {
		this.body.find(".dd-info-pop").prop("hidden", true);
		this.body.find(".dd-info").attr("aria-expanded", "false");
	}

	// ---------------------------------------------------------------- refresh

	refresh() {
		if (this.suspended) {
			return;
		}
		const range = this.range();
		// Only skeleton the FIRST load. Replacing a populated page with grey blocks
		// on every date change makes a fast refresh look like a slow one.
		if (!this.loaded) {
			this.skeleton();
		}

		this.options
			.fetch(range)
			.then((data) => {
				this.loaded = true;
				this.draw(this.options.spec(data, range));
			})
			.catch((error) => this.fail(error));
	}

	/**
	 * Write a spec to the page.
	 *
	 * `dd-enter` has to be on the page BEFORE the markup is written, because the
	 * entrance animation is keyed to the elements being created, and off again
	 * before the second render, because otherwise every date change replays it —
	 * which would read as the page reloading rather than the numbers updating.
	 */
	draw(spec) {
		this.body.toggleClass("dd-enter", !this.entered);
		this.entered = true;

		const pass = render(this.body, spec);
		this.drills = pass.drills;
		this.sync_presets();
		this.mount_charts(pass.charts);
	}

	skeleton() {
		this.body.html(
			`<div class="dd-grid dd-grid-4">${'<div class="dd-skeleton"></div>'.repeat(4)}</div>`,
		);
	}

	/**
	 * A failed fetch says so on the page.
	 *
	 * Frappe shows its own error dialog for a server exception, but a network drop
	 * or a rejected promise leaves the last render on screen looking current —
	 * which is the worst of the three outcomes, because nothing tells the reader
	 * the numbers are stale.
	 */
	fail(error) {
		console.error(error); // eslint-disable-line no-console
		this.body.html(
			`<div class="dd-error">${frappe.utils.escape_html(
				__("Could not load this dashboard. {0}", [
					(error && error.message) || "",
				]),
			)}</div>`,
		);
	}

	/**
	 * Mount every chart the render pass queued.
	 *
	 * Deferred a frame: ECharts measures its container, and the markup above has
	 * only just been written, so a chart built synchronously sizes to 0px and
	 * renders nothing — silently, which is what makes it worth a comment.
	 */
	mount_charts(queue) {
		if (!queue.length) {
			return;
		}
		frappe.after_ajax(() => {
			this.body.find("[data-dd-chart]").each((_, el) => {
				const slot = $(el).attr("data-dd-chart");
				if (slot === "") {
					return;
				}
				const entry = queue[Number(slot)];
				if (entry.kind === "spark") {
					sparkline(el, {
						values: entry.item.series,
						labels: entry.item.labels || entry.item.series.map((_, i) => i + 1),
						color: token(entry.token, "#a1a1aa"),
					});
					return;
				}
				chart(el, entry.node.option, this.chart_click(entry.node));
			});
		});
	}

	/**
	 * Turn an ECharts click into a drill.
	 *
	 * The chart's `drill` may be a descriptor or a function; either way it is
	 * handed the clicked datum, which is what a chart drill is for — "these 14
	 * failures on the 3rd" is a different query from "all failures".
	 */
	chart_click(node) {
		if (!node.drill) {
			return null;
		}
		return (params) =>
			follow(node.drill, {
				range: this.range(),
				point: params,
				item: params.data,
			});
	}
}

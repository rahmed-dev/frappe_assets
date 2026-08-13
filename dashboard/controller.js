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
 *   fetch(range, {signal})  → a promise of whatever the backend returns
 *   spec(data, range)       → the render spec for that data
 *
 * and gets a working page. The split is the point: `spec` is a pure function of
 * data, so it can be read and reasoned about without tracing a request, and
 * `fetch` is the only place that knows a server exists.
 *
 * Desk hands us jQuery objects for `page.main` and `page.wrapper`; they are
 * unwrapped at the boundary and everything inside this file is native. That is
 * not tidiness — it is what lets the same code run under a `TestHost` with no
 * jQuery, no Frappe and no Desk page at all.
 */

import { render } from "./render.js";
import { bind as bind_drills, follow } from "./drill.js";
import { panels } from "../core/spec.js";
import { Emitter } from "../core/events.js";
import { VERSION } from "../core/version.js";
import { host } from "../core/host.js";
import { esc } from "../core/escape.js";
import { unwrap, delegate, listen, fill } from "../core/dom.js";
import { State } from "../data/state.js";
import { Resource } from "../data/resource.js";

const DEFAULT_PRESETS = [7, 30, 90];

/**
 * The document-level handlers currently installed, by namespace.
 *
 * Outside-click and Escape are the only two listeners that cannot live on the
 * page body — an outside click is by definition not inside it. Under jQuery
 * these were namespaced and `.off()`-ed before binding, so re-entering a page
 * could not stack a second copy. Without jQuery namespaces the same guarantee
 * needs somewhere to remember the previous unbinders, and this is it.
 */
const document_handlers = new Map();

export class Dashboard {
	/**
	 * @param {object} page  the Frappe page object (`wrapper.page`)
	 * @param {object} options
	 *   fetch(state, {signal}) → Promise<data>   required unless `method` is given
	 *   method                 → "app.api.thing" alternative to `fetch`
	 *   spec(data, state)      → render spec     required
	 *   filters                → []              optional filter declarations, see
	 *                                              `data/state.js`
	 *   presets                → [7, 30, 90]     optional, [] to omit the strip
	 *   default_days           → 30              optional
	 *   dated                  → true            optional; false drops the date fields
	 *   sync                   → true            optional; false leaves the URL alone
	 *   cache / poll / realtime                  optional, passed to the Resource
	 *   namespace              → "dd"            optional; only matters if two
	 *                                              dashboards can be open at once
	 *   page_class             → ""              optional hook for page-local CSS
	 *   on                     → {}              optional lifecycle handlers, by
	 *                                              event name — the same six
	 *                                              `dashboard.on(...)` takes
	 */
	constructor(page, options) {
		this.page = page;
		this.options = options;
		this.presets = options.presets || DEFAULT_PRESETS;
		this.namespace = options.namespace || "dd";
		this.unbinders = [];

		// What the page is asking for, and the thing that answers it. Both are
		// ordinary public objects a consumer can build and pass in — `options.state`
		// and `options.resource` — because a page with two dashboards driven by one
		// filter bar is a real layout and it cannot be expressed if the controller
		// insists on owning them.
		this.state =
			options.state ||
			new State({
				filters: options.filters,
				dated: options.dated !== false,
				default_days: options.default_days,
				sync: options.sync,
			});
		this.resource =
			options.resource ||
			new Resource({
				fetch: options.fetch,
				method: options.method,
				cache: options.cache,
				poll: options.poll,
				realtime: options.realtime,
			});

		// The teardown functions the current render's mounted panels handed back.
		// Emptied and re-filled on every draw — see `release_mounts`.
		this.mounted = [];

		// The lifecycle seam. A consumer who needs to time a fetch, log an error or
		// touch the markup after a render has somewhere to do it that is not
		// wrapping `fetch` or mutating `spec`.
		this.events = new Emitter();
		for (const [event, handler] of Object.entries(options.on || {})) {
			this.events.on(event, handler);
		}

		// The sequence guard, the abort and the dedupe all live on the Resource
		// now. They are the same guard the controller carried before v0.5.0 — moved
		// rather than rewritten, because it is the piece a hand-written page always
		// leaves out and its absence is invisible until the network is slow.
		this.unbinders.push(
			this.resource.on("before_fetch", ({ params }) =>
				this.events.emit("before_fetch", { range: params, state: params }),
			),
			this.resource.on("after_fetch", ({ data, params }) => {
				this.events.emit("after_fetch", { range: params, state: params, data });
				this.draw(this.options.spec(data, params));
			}),
			this.resource.on("error", ({ error }) => this.fail(error)),
			this.state.on(() => this.on_state_change()),
		);

		const main = unwrap(page.main);
		// `page_class` is the seam for the genuinely page-local rule — a label
		// column sized for one dashboard's stage names, say. It exists so that such
		// a rule has somewhere to go other than the shared stylesheet.
		this.body = document.createElement("div");
		this.body.className = `dd-page ${options.page_class || ""}`.trim();
		main.appendChild(this.body);

		// The measure (§2) is applied to the page WRAPPER, because the date fields
		// and the Refresh button live in Desk's page head — outside `.dd-page`.
		// Capping only our own element would centre the dashboard and leave its own
		// controls against the left edge.
		this.wrapper = unwrap(page.wrapper);
		this.wrapper.classList.add("dd-host");

		// A site builds this toolkit from source, out of whatever was in
		// `node_modules` at build time, and records the version nowhere. Stamping it
		// makes "which toolkit is this page running" answerable by inspecting the
		// element, without bench access.
		this.wrapper.setAttribute("data-dd-version", VERSION);

		this.setup_controls();
		this.bind();
		this.refresh();
		if (options.poll) {
			this.resource.start_polling();
		}
	}

	// ----------------------------------------------------------------- controls

	/**
	 * Build a Desk control for the date window and for every declared filter.
	 *
	 * The controls are Desk's, deliberately: a Link field with its awesomplete,
	 * its permission-aware search and its "create a new one" footer is not worth
	 * reimplementing, and a reimplementation would look subtly unlike every other
	 * field in the product.
	 *
	 * They render in the page HEAD, which is outside `.dd-page` — so no `--dd-*`
	 * token resolves there and no rule in `dash.scss` reaches them. That is a
	 * constraint rather than an oversight: controls that need this design system
	 * have to render inside the body, and these ones look like Desk because they
	 * are Desk.
	 *
	 * Every control writes into `State` and nothing else. Nothing here calls
	 * `refresh` — the state change does that, once, however many fields moved.
	 */
	setup_controls() {
		const h = host("Dashboard");
		this.controls = {};

		if (this.state.dated) {
			const range = this.state.range();
			this.controls.from_date = this.page.add_field({
				fieldtype: "Date",
				fieldname: "from_date",
				label: h.t("From Date"),
				default: range.from_date,
				change: () => this.read_controls(),
			});
			this.controls.to_date = this.page.add_field({
				fieldtype: "Date",
				fieldname: "to_date",
				label: h.t("To Date"),
				default: range.to_date,
				change: () => this.read_controls(),
			});
		}

		for (const filter of this.state.declarations) {
			this.controls[filter.fieldname] = this.page.add_field({
				fieldtype: filter.fieldtype || "Data",
				fieldname: filter.fieldname,
				label: filter.label || filter.fieldname,
				options: filter.options,
				default: this.state.value(filter.fieldname),
				change: () => this.read_controls(),
			});
		}

		this.page.set_primary_action(h.t("Refresh"), () => this.refresh(true), "refresh");
	}

	/** Every control's current value, pushed into the state as one patch. */
	read_controls() {
		const patch = {};
		for (const [fieldname, control] of Object.entries(this.controls || {})) {
			patch[fieldname] = control.get_value();
		}
		this.state.set(patch);
	}

	/**
	 * Push the state back into the controls.
	 *
	 * Needed because the state can move without a control moving: a preset chip,
	 * a filter restored off the URL, a programmatic `dashboard.state.set(...)`.
	 * `set_value` fires the control's own `change`, which reads every control back
	 * into the state — that terminates rather than loops, because a `set` of
	 * values already held changes nothing and emits nothing.
	 */
	sync_controls() {
		for (const [fieldname, control] of Object.entries(this.controls || {})) {
			const value = this.state.value(fieldname);
			if (control.get_value() !== value) {
				control.set_value(value == null ? "" : value);
			}
		}
	}

	/** The active date window. */
	range() {
		return this.state.range();
	}

	/** The active filters, without the date window. */
	filters() {
		return this.state.filters();
	}

	/** Move to a preset window. One state change, therefore one fetch. */
	apply_range(days) {
		this.state.set_preset(days);
	}

	/** A state change is a new question: put it in the controls, then ask it. */
	on_state_change() {
		this.sync_controls();
		this.refresh();
	}

	/**
	 * Light the chip matching the window on screen, if any.
	 *
	 * Derived from the state rather than remembered from the last click, so a
	 * hand-typed range lights nothing without having to be told to.
	 */
	sync_presets() {
		for (const chip of this.body.querySelectorAll(".dd-preset")) {
			chip.classList.remove("is-active");
		}
		const match = this.state.preset(this.presets);
		if (match) {
			const chip = this.body.querySelector(`.dd-preset[data-days="${Number(match)}"]`);
			chip?.classList.add("is-active");
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
		this.unbinders.push(
			delegate(this.body, "click", ".dd-preset", (event, target) =>
				this.apply_range(Number(target.getAttribute("data-days"))),
			),
			delegate(this.body, "click", ".dd-info", (event, target) => {
				event.stopPropagation();
				this.toggle_explainer(target);
			}),
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
					context: Object.assign(this.drill_context(), entry.context),
				};
			}),
		);

		// Outside-click and Escape close whatever popover is open. Cleared first, so
		// re-entering the page cannot stack a second copy on the document.
		document_handlers.get(this.namespace)?.();
		const off = [
			listen(document, "click", () => this.close_explainers()),
			listen(document, "keydown", (event) => {
				if (event.key === "Escape") {
					this.close_explainers();
				}
			}),
		];
		const release = () => off.forEach((unbind) => unbind());
		document_handlers.set(this.namespace, release);
		this.unbinders.push(() => {
			// Only release the document handlers if they are still ours — a second
			// dashboard on the same namespace has already taken them over.
			if (document_handlers.get(this.namespace) === release) {
				release();
				document_handlers.delete(this.namespace);
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
		const panel = this.body.querySelector(`#${button.getAttribute("aria-controls")}`);
		if (!panel) {
			return;
		}
		const opening = panel.hidden;
		this.close_explainers();
		if (!opening) {
			return;
		}
		panel.hidden = false;
		button.setAttribute("aria-expanded", "true");
		panel.classList.toggle(
			"dd-info-pop-flip",
			panel.getBoundingClientRect().right > window.innerWidth,
		);
	}

	close_explainers() {
		for (const panel of this.body.querySelectorAll(".dd-info-pop")) {
			panel.hidden = true;
		}
		for (const button of this.body.querySelectorAll(".dd-info")) {
			button.setAttribute("aria-expanded", "false");
		}
	}

	// ---------------------------------------------------------------- refresh

	/**
	 * Fetch, then draw.
	 *
	 * THE SEQUENCE GUARD IS NOT OPTIONAL. Responses land in the order the network
	 * returns them, not the order they were asked for, so clicking 7d → 30d → 90d
	 * on a page whose queries take unequal time can finish showing the 7d numbers
	 * under a lit 90d chip. Nothing on screen says so, which is what makes it
	 * worse than an error. Only the newest request may write to the page.
	 *
	 * The previous request is also aborted rather than left running: the answer is
	 * about to be discarded either way, and on a dashboard whose aggregation is
	 * expensive, a reader clicking through four presets otherwise leaves four
	 * queries competing for the same database.
	 */
	refresh(force = false) {
		// Only skeleton the FIRST load. Replacing a populated page with grey blocks
		// on every date change makes a fast refresh look like a slow one.
		if (!this.resource.loaded) {
			this.skeleton();
		}
		const params = this.state.get();
		// The Refresh button means "ask again", so it has to defeat the cache. A
		// button that can return the answer already on screen is a button that
		// teaches people to press it twice.
		const asking = this.resource.reload(force ? this.resource.invalidate(params) : params);
		// The draw and the failure both happen on the Resource's events, wired in
		// the constructor. Swallowed here so a caller that ignores the return value
		// does not produce an unhandled rejection for a failure the page has
		// already reported on screen.
		return asking.catch(() => {});
	}

	/**
	 * What a drill is told about the page it was clicked on.
	 *
	 * Built at follow time rather than captured at render time. The range fields
	 * are the live truth, and a descriptor built mid-render would carry the window
	 * it was drawn for — right in every case except the one where the two have
	 * drifted, which is exactly the case worth getting right.
	 */
	drill_context() {
		return { range: this.range(), filters: this.filters(), state: this.state.get() };
	}

	/** Listen to a lifecycle event. Returns the unbinder. */
	on(event, handler) {
		return this.events.on(event, handler);
	}

	off(event, handler) {
		this.events.off(event, handler);
		return this;
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
		this.events.emit("before_render", { spec });

		// Before the markup goes, not after. A panel that mounted a canvas, an
		// observer or a listener gets its teardown run while its element is still
		// in the document — an observer released after the element is detached has
		// already kept it, its canvas and everything the option closed over alive
		// for the rest of the Desk session.
		this.release_mounts();

		this.body.classList.toggle("dd-enter", !this.entered);
		this.entered = true;

		const pass = render(this.body, spec);
		this.drills = pass.drills;
		this.sync_presets();
		this.run_mounts(pass.mounts);

		this.events.emit("after_render", { spec, body: this.body });
	}

	skeleton() {
		fill(
			this.body,
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
		const h = host("Dashboard");
		h.error(error);
		this.events.emit("error", { error });
		fill(
			this.body,
			`<div class="dd-error">${esc(
				h.t("Could not load this dashboard. {0}", [(error && error.message) || ""]),
			)}</div>`,
		);
	}

	/**
	 * The mount phase: give every panel that claimed a slot its element.
	 *
	 * Deferred a frame. A chart measures its container, and the markup above has
	 * only just been written, so anything built synchronously sizes to 0px and
	 * renders nothing — silently, which is what makes it worth a comment. It is
	 * also the reason this is a phase at all rather than a call inside `render`:
	 * the renderer is pure and a mounted panel is, by definition, not.
	 *
	 * Before v0.4.0 this loop knew the two things it could find — a chart or a
	 * spark — by name. Now it knows neither: the pass records which panel claimed
	 * each slot, and the panel is asked to mount itself. That is what lets a
	 * consuming app's sortable table or map be an ordinary panel rather than
	 * `{type: "html"}`.
	 *
	 * A `mount` may return a teardown function; whatever it returns is kept and
	 * run before the next draw. A panel that returns nothing is assumed to have
	 * nothing to release, which is true of anything that only wrote markup.
	 */
	run_mounts(queue) {
		if (!queue.length) {
			return;
		}
		// Recorded before the callback is scheduled, not after: `after_paint` is
		// synchronous under a `TestHost`, so a callback that reads `this.queue`
		// would see the previous render's.
		this.queue = queue;
		const context = {
			dashboard: this,
			state: this.state,
			range: () => this.range(),
			filters: () => this.filters(),
			// Wrapped rather than passed through, so a panel mounting a clickable
			// chart inherits the page's range and filters without every panel having
			// to remember to merge them in. `extra` still wins — the point clicked is
			// more specific than the page it was clicked on.
			follow: (descriptor, extra) => follow(descriptor, { ...this.drill_context(), ...extra }),
			emit: (event, payload) => this.events.emit(event, payload),
		};

		host("Dashboard").after_paint(() => {
			// The body may have been redrawn or destroyed in the frame between the
			// render and the paint — a preset clicked twice quickly does exactly
			// that. Mounting into detached elements would draw charts nobody can see
			// and leak every one of them.
			if (queue !== this.queue) {
				return;
			}
			for (const el of this.body.querySelectorAll("[data-dd-mount]")) {
				const entry = queue[Number(el.getAttribute("data-dd-mount"))];
				const panel = entry && panels.find(entry.panel);
				if (!panel || !panel.mount) {
					continue;
				}
				try {
					const release = panel.mount(el, entry.data, context);
					if (typeof release === "function") {
						this.mounted.push(release);
					} else if (panel.unmount) {
						this.mounted.push(() => panel.unmount(el, entry.data));
					}
				} catch (error) {
					// One panel failing to mount must not stop the rest. A chart with
					// no engine loaded is the common case, and blanking the other
					// eleven panels over it would be a worse page than the one with a
					// gap in it.
					host("Dashboard").error(error);
					this.events.emit("error", { error, panel: entry.panel });
				}
			}
		});
	}

	/** Run and forget every teardown the last mount phase produced. */
	release_mounts() {
		const mounted = this.mounted;
		this.mounted = [];
		this.queue = null;
		for (const release of mounted) {
			try {
				release();
			} catch (error) {
				host("Dashboard").error(error);
			}
		}
	}

	/**
	 * Release everything this dashboard holds.
	 *
	 * A Desk page's controller normally lives as long as the session, so this is
	 * not on the ordinary path — but a framework that offers no teardown is one
	 * whose consumers leak, because the release path is the one nobody writes
	 * until something is already wrong. Aborting the in-flight request matters
	 * most: without it, a fetch that outlives the page resolves against a body
	 * that is no longer in the document.
	 */
	destroy() {
		// Only if we built them. A state or resource passed in is the caller's, and
		// destroying it would take out the second dashboard sharing it.
		if (!this.options.resource) {
			this.resource.destroy();
		} else {
			this.resource.abort();
		}
		if (!this.options.state) {
			this.state.destroy();
		}
		this.release_mounts();
		this.unbinders.forEach((unbind) => unbind());
		this.unbinders = [];
		this.events.emit("destroy", {});
		this.events.clear();
		this.body.remove();
	}
}

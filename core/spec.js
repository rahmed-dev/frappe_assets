/**
 * The render kernel.
 *
 * A spec is a tree of plain objects, each with a `type`. This file owns the
 * walk: look the type up, hand it the node, collect what it needs afterwards.
 * It knows nothing about kpis, tables or charts — those are in
 * `dashboard/panels/`, and a consuming app's own panel is registered the same
 * way theirs are.
 *
 * Until v0.4.0 the panel table was a `const` object in `render.js`, which meant
 * the only way for an app to add a panel was to fork the file or fall back to
 * `{type: "html"}` — the escape hatch that is documented as unescaped. That is
 * the whole reason this file exists.
 *
 * ## The two phases
 *
 * **Render** is pure. `panel.render(node, pass)` returns an HTML string and
 * touches no DOM, no clock and no network. That is what lets a spec be checked
 * in bare Node, and one day printed or emailed.
 *
 * **Mount** is everything a panel cannot do with a string: measure itself, draw
 * on a canvas, listen. A panel claims a slot with `pass.defer(...)`, stamps the
 * returned index into its markup as `data-dd-mount`, and the controller calls
 * `panel.mount(element, data, context)` once the markup is on the page and has
 * been laid out.
 *
 * Charts had this phase to themselves before v0.4.0 — the pass carried a
 * `charts` array and the controller switched on `kind: "spark"` versus
 * `kind: "chart"`. Generalising it is the change the rest of the framework
 * hangs off: a sortable table, a virtualised list, a map, an inline editor are
 * now ordinary panels rather than raw HTML, and every one of them has somewhere
 * to put its own teardown.
 */

import { Registry } from "./registry.js";
import { UnknownPanelError } from "./errors.js";
import { esc, slug } from "./escape.js";
import { host } from "./host.js";

/**
 * Every panel type the renderer knows, built-in and added.
 *
 * A bare function is accepted as shorthand for a render-only panel, because
 * that is what nine of the twelve built-ins are and a consumer's first one
 * usually is too.
 */
export const panels = new Registry("panel", (name, panel) => {
	const shape = typeof panel === "function" ? { render: panel } : panel;
	if (typeof shape.render !== "function") {
		throw new TypeError(`dd: panel "${name}" has no render function`);
	}
	return { name, ...shape };
});

/**
 * One render pass.
 *
 * Instantiated per render, so the drill registry and the mount queue start
 * empty. Carrying them on the instance rather than in module state is what lets
 * two dashboards live on one Desk without their indices colliding.
 */
export class Pass {
	/**
	 * @param {object} spec
	 * @param {object} [options]
	 *   `drill(registry, descriptor, context)` → the attributes to put on a
	 *   drillable element. Injected rather than imported: the kernel knows a node
	 *   may be drillable and knows nothing about Desk routes, and `core/` may not
	 *   import from `dashboard/`. A pass without one writes no attributes rather
	 *   than throwing, because a spec is legitimately renderable — to a string,
	 *   for a printed digest — with no way to open a list.
	 */
	constructor(spec, options = {}) {
		this.spec = spec;
		this.explain = spec.explain || {};
		this.drills = [];
		this.mounts = [];
		this.write_drill = options.drill || (() => "");
	}

	/**
	 * Claim a mount slot. Returns the index to stamp into `data-dd-mount`.
	 *
	 * `data` is whatever the panel wants back at mount time — the node itself,
	 * usually, but a `rows` panel defers one slot per row and hands over just
	 * that row.
	 */
	defer(panel, data) {
		return this.mounts.push({ panel, data }) - 1;
	}

	/** Register a drill descriptor. Returns the attributes to put on the element. */
	drill(descriptor, context) {
		return this.write_drill(this.drills, descriptor, context);
	}

	/**
	 * The ⓘ button and its panel, for one key in `spec.explain`.
	 *
	 * Every number on a dashboard should be able to explain itself on the screen
	 * it appears on. A figure whose derivation lives in a document somewhere gets
	 * read as whatever the reader assumed it meant.
	 *
	 * Hover is deliberately not a trigger — this has to work on touch. It is a
	 * real `<button>`, so focus and Enter/Space come for free.
	 *
	 * The key is slugged into the id rather than interpolated. `explain: {"net
	 * revenue": [...]}` is a reasonable thing to write and produces
	 * `id="dd-explain-net revenue"`, which is valid HTML and a broken selector —
	 * `#dd-explain-net revenue` parses as a descendant combinator, matches
	 * nothing, and the ⓘ button then opens no panel with nothing reporting a
	 * fault anywhere.
	 */
	explainer(key) {
		const entry = this.explain[key];
		if (!entry) {
			return "";
		}
		const [title, body] = entry;
		const id = `dd-explain-${slug(key)}`;
		return `
			<span class="dd-info-wrap">
				<button type="button" class="dd-info" aria-expanded="false" aria-controls="${id}"
					aria-label="${esc(host("explain").t("How this is calculated: {0}", [title]))}">
					<span class="dd-info-glyph" aria-hidden="true">i</span>
				</button>
				<span class="dd-info-pop" id="${id}" role="note" hidden>
					<span class="dd-info-pop-title">${esc(title)}</span>
					<span class="dd-info-pop-body">${esc(body)}</span>
				</span>
			</span>`;
	}

	/**
	 * A panel that has nothing to draw yet, or nothing to draw at all.
	 *
	 * `{type: "table", state: "loading"}` renders the placeholder instead of the
	 * panel, and the panel never sees the node. Handled here rather than in each
	 * panel for the reason the mount phase is here: twelve panels would otherwise
	 * carry twelve slightly different versions of the same three states, and a
	 * consumer's thirteenth would carry none.
	 *
	 * The distinction that earns this its place is `empty` versus `error`. Both
	 * are "no numbers on the screen", and a page that renders them the same way
	 * teaches its readers to read a failed query as a quiet month. That is the
	 * expensive misreading, and it is the one nobody reports, because the page
	 * looks fine.
	 *
	 * A `loading` state is a skeleton, not a spinner: it holds the space the panel
	 * will take, so the page does not jump when the answer lands.
	 */
	state(node) {
		const kind = node.state;
		if (!kind || kind === "ready") {
			return null;
		}
		const t = (text) => esc(host("state").t(text));
		const message = node.message ? esc(node.message) : "";
		const label = node.label ? `<div class="dd-state-label">${esc(node.label)}</div>` : "";
		const height = node.height ? ` style="--dd-state-height: ${Number(node.height)}px"` : "";

		if (kind === "loading") {
			return `<div class="dd-state dd-state-loading"${height} aria-busy="true">
				${label}<div class="dd-skeleton"></div><div class="dd-skeleton"></div>
			</div>`;
		}
		if (kind === "error") {
			return `<div class="dd-state dd-state-error"${height} role="alert">
				${label}<div class="dd-state-text">${message || t("Could not load this panel.")}</div>
			</div>`;
		}
		// Anything else is read as "empty" rather than thrown on: this value
		// usually arrives from a backend, and the panel types are the vocabulary
		// where a typo is a bug — the same split as an unknown tone.
		return `<div class="dd-state dd-state-empty"${height}>
			${label}<div class="dd-state-text">${message || t("Nothing in this range.")}</div>
		</div>`;
	}

	/** Render one node, or an array of them. */
	node(node) {
		if (!node) {
			return "";
		}
		if (Array.isArray(node)) {
			return node.map((child) => this.node(child)).join("");
		}
		const placeholder = this.state(node);
		if (placeholder !== null) {
			return placeholder;
		}
		// Loud on purpose, and `get` rather than `find`: a panel type is
		// hand-written, so a name nobody registered is a typo. A silently skipped
		// panel looks like a backend that returned nothing, and the wrong half of
		// the stack gets debugged.
		const panel = panels.find(node.type);
		if (!panel) {
			throw new UnknownPanelError(node.type, panels.names());
		}
		return panel.render(node, this);
	}
}

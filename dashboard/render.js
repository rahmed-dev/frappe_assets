/**
 * The dashboard's own renderer: page furniture plus the kernel walk.
 *
 * A dashboard describes itself as data — `{type: "kpis", items: [...]}` — and
 * this file turns that into markup. Consumers do not write HTML, do not pick
 * class names, and do not decide what a null rate looks like.
 *
 * Since v0.4.0 almost all of it lives elsewhere: the walk is `core/spec.js`, the
 * panels are `dashboard/panels/*.js`. What is left here is the header, the
 * caveat and the footer — the parts that belong to a dashboard page rather than
 * to the spec vocabulary — and the two entry points.
 *
 * Everything here is PURE: a spec goes in, an HTML string comes out. Fetching,
 * ranges, state and event binding live in `controller.js`. Keeping that line
 * sharp is what makes a panel reviewable — you can read a `bars` block and know
 * exactly what it will draw without tracing a request.
 */

import * as fmt from "../ui/format.js";
import { attrs } from "./drill.js";
import { host } from "../core/host.js";
import { esc } from "../core/escape.js";
import { unwrap, fill } from "../core/dom.js";
import { Pass, panels } from "../core/spec.js";
// Side-effect import: this is what puts the twelve built-in panels in the
// registry. Anything that renders a spec goes through this file, so nothing else
// has to remember to do it.
import "./panels/index.js";

export { panels };

function header(spec) {
	const meta = (spec.meta || []).map((entry) => `<span>${fmt.esc(entry)}</span>`).join("");
	// The preset strip renders INSIDE the page body, never in the Desk page head.
	// Frappe's head sits outside `.dd-page`, so a control placed there resolves
	// none of the design tokens and paints with whatever the Desk inherited.
	const presets = (spec.presets || [])
		.map(
			(days) =>
				`<button type="button" class="dd-preset" data-days="${Number(days)}">${esc(
					host("presets").t("{0}d", [Number(days)]),
				)}</button>`,
		)
		.join("");

	return `
		<div class="dd-header">
			<h2>${fmt.esc(spec.title)}</h2>
			<div class="dd-header-meta">
				${meta}
				${presets ? `<div class="dd-presets">${presets}</div>` : ""}
			</div>
		</div>`;
}

function footer(spec) {
	if (!spec.footer || !spec.footer.length) {
		return "";
	}
	const links = spec.footer
		.map(
			(link) => `<a class="dd-footer-link" href="${fmt.esc(link.href)}">${fmt.esc(link.label)}</a>`,
		)
		.join("");
	return `
		<div class="dd-footer">
			<span class="dd-footer-label">${esc(host("footer").t("Underlying data"))}</span>
			${links}
		</div>`;
}

/**
 * Render a spec into `container`.
 *
 * `container` may be an element, a jQuery object or a selector — Desk hands out
 * jQuery for `page.main`, and a consumer composing this by hand will reasonably
 * pass an element.
 *
 * Returns the pass's registries so the controller can bind drills and run the
 * mount phase against the markup that was just written. It does the DOM write
 * itself rather than leaving that to the caller, because the registries are only
 * meaningful paired with the exact markup they were built alongside — handing
 * back both separately invites them being used against different renders.
 */
export function render(container, spec) {
	const { html, drills, mounts } = render_to_string(spec);
	fill(unwrap(container), html);
	return { drills, mounts };
}

/**
 * The same pass, stopping one step short of the DOM.
 *
 * This is the half that is genuinely pure, and separating it is what lets the
 * renderer be exercised with no document at all — a test, a build-time snapshot,
 * a printed or emailed digest. `render()` is this plus one `innerHTML`, and it
 * stays the entry point a page uses because the registries are only meaningful
 * paired with the exact markup they were built alongside.
 */
export function render_to_string(spec) {
	const pass = new Pass(spec, { drill: attrs });
	const body = pass.node(spec.blocks);

	const html = `
		${header(spec)}
		${spec.caveat ? `<div class="dd-caveat">${fmt.esc(spec.caveat)}</div>` : ""}
		${body}
		${footer(spec)}
	`;

	return { html, drills: pass.drills, mounts: pass.mounts };
}

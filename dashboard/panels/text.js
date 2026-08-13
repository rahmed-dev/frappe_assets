/**
 * The two panels that are a paragraph: `text` and `html`.
 *
 * They sit together because the second one exists to be the exception to the
 * first, and reading them apart hides that.
 */

import * as fmt from "../../ui/format.js";

/** `{type: "text", text, style: "caveat" | "empty"}` */
export const text = {
	name: "text",
	render(node) {
		const style = node.style === "empty" ? "dd-empty" : "dd-caveat";
		return `<div class="${style}">${fmt.esc(node.text)}</div>`;
	},
};

/**
 * `{type: "html", html}` — the escape hatch.
 *
 * NOT escaped, by definition. Anything reaching it must already be safe; pass
 * data through a real panel instead of building a string around it.
 *
 * Since v0.4.0 there is a better answer than reaching for this: write a panel
 * and `panels.define()` it in your own app. That is the whole reason the
 * registry exists — the last time a page needed a coloured table cell, three
 * tables were rebuilt as raw HTML with hand-rolled escaping, one of them
 * printing values scraped off a supplier's portal.
 */
export const html = {
	name: "html",
	render(node) {
		return node.html;
	},
};

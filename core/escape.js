/**
 * Escaping, with no dependencies at all.
 *
 * This is the bottom of the stack on purpose. Every other module may reach for
 * the host adapter and get whatever the environment supplies, but the thing that
 * decides whether a supplier's product name can close an attribute and open a
 * `<script>` must not be swappable, must not be stubbed in a test, and must not
 * be absent because a page loaded in an order nobody predicted.
 *
 * The mapping is deliberately identical to `frappe.utils.escape_html`, including
 * the four characters beyond the obvious three. Matching it exactly is what lets
 * a consuming page's rendered HTML be diffed byte-for-byte against the version
 * it was built on — which is the acceptance test for this whole migration.
 */

const HTML = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
	"/": "&#x2F;",
	"`": "&#x60;",
	"=": "&#x3D;",
};

/**
 * Any value, safe to interpolate into HTML text or a quoted attribute.
 *
 * `null` and `undefined` become the empty string rather than the words "null"
 * and "undefined". A missing value is a missing value; printing its JavaScript
 * name puts an internal detail on the page dressed as data. `fmt.blank` is the
 * one that turns absence into an em dash, because that is a *reading* decision
 * and this is not.
 */
export function esc(value) {
	if (value == null) {
		return "";
	}
	return String(value).replace(/[&<>"'`=/]/g, (char) => HTML[char] || char);
}

/**
 * An `id`/`for`/`aria-controls` value that is safe to put in a CSS selector.
 *
 * Escaping is not enough here. `dd-explain-net revenue` is perfectly valid HTML
 * and perfectly broken as `querySelector("#dd-explain-net revenue")` — it parses
 * as a descendant combinator and silently matches nothing, so the ⓘ button opens
 * no panel and nothing anywhere reports an error. Anything outside the safe set
 * collapses to a hyphen, and a leading digit gets a prefix because a CSS
 * identifier may not start with one.
 */
export function slug(value) {
	const text = String(value == null ? "" : value)
		.trim()
		.replace(/[^A-Za-z0-9_-]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!text) {
		return "x";
	}
	return /^[0-9]/.test(text) ? `n${text}` : text;
}

/**
 * A whole attribute, or "" when the value is absent.
 *
 * Saves the `value ? \`name="${esc(value)}"\` : ""` ternary that otherwise
 * appears in every panel, and makes the escaping impossible to forget on the
 * branch that is present.
 */
export function attr(name, value) {
	return value == null || value === "" ? "" : `${name}="${esc(value)}"`;
}

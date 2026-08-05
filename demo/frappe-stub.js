/**
 * The five Frappe globals the toolkit touches, stubbed so the gallery runs in a
 * plain browser tab with no bench behind it.
 *
 * This file MUST be imported before anything under `dashboard/`. Some of them
 * are read at module-evaluation time, not on first call — `render.js` builds its
 * TONES table with `__()` as it loads — so a stub installed inside `main()`
 * would already be too late. ES modules evaluate imports in source order, which
 * is what makes the single `import "./frappe-stub.js"` at the top of gallery.js
 * sufficient and load-bearing.
 *
 * Deliberately thin. The point of the gallery is to exercise the real renderer
 * and the real chart layer; anything reimplemented here is something the gallery
 * is no longer proving. `set_route` logs instead of navigating because there is
 * no Desk to navigate to — a drill target is still worth showing as reachable.
 */

const escape_html = (value) =>
	String(value == null ? "" : value).replace(
		/[&<>"']/g,
		(char) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
	);

globalThis.__ = (text, args) =>
	(args || []).reduce((out, arg, i) => out.split(`{${i}}`).join(arg), text);

globalThis.frappe = {
	utils: { escape_html },
	// The real one returns HTML for a fieldtype. Numbers are all the gallery
	// passes, and grouping them is the whole of what the real one would do here.
	format: (value) => escape_html(Number(value).toLocaleString()),
	datetime: { str_to_user: (value) => value },
	set_route: (...args) => console.log("drill →", ...args), // eslint-disable-line no-console
};

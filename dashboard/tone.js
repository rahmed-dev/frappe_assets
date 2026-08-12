/**
 * The status vocabulary, in one place.
 *
 * Before this file the toolkit named the same four ideas three different ways —
 * `rows` spoke in trend words (`rising`, `easing`), `kpis` took a bare
 * `dd-kpi-dot-danger` with no map behind it, and `charts.js#palette` returned
 * `success`/`danger`/`warning`/`info` for the canvas. Nothing could share a
 * colour with anything else, so a panel that wanted one copied a class name and
 * hoped.
 *
 * The names here are the ones the stylesheet and the palette already use, so
 * adopting them invented nothing: `.dd-pill-success` and `--dd-success` were
 * both already there. A tone is a **fact about the value** — this reading is
 * bad, these two records disagree — and never decoration. `dash.scss` §COLOUR
 * POLICY is the long form of that rule and this map is how a panel obeys it.
 *
 * `quiet` is the absence of a verdict, and it is deliberately not a colour: a
 * value nobody graded must not read as "fine". It carries no classes at all and
 * inherits whatever the surface says.
 */

/**
 * Each tone's classes and tokens.
 *
 * `token` is a CSS custom property for code that needs a literal colour — a
 * canvas cannot resolve `var()`, so `charts.js` reads through it. `palette` is
 * the key the same colour has in `charts.js#palette()`; the two exist because
 * the DOM side resolves lazily and the canvas side has already resolved.
 */
export const TONES = {
	success: {
		pill: "dd-pill-success",
		cell: "dd-cell-success",
		row: "dd-row-success",
		token: "--dd-success",
		palette: "success",
	},
	warning: {
		pill: "dd-pill-warning",
		cell: "dd-cell-warning",
		row: "dd-row-warning",
		token: "--dd-warning",
		palette: "warning",
	},
	danger: {
		pill: "dd-pill-danger",
		cell: "dd-cell-danger",
		row: "dd-row-danger",
		token: "--dd-danger",
		palette: "danger",
	},
	info: {
		pill: "dd-pill-info",
		cell: "dd-cell-info",
		row: "dd-row-info",
		token: "--dd-info",
		palette: "info",
	},
	quiet: {
		pill: "",
		cell: "",
		row: "",
		token: "--dd-text-subtle",
		palette: "muted",
	},
};

/**
 * One tone by name, falling back to `quiet`.
 *
 * Unknown falls back rather than throwing, which is the opposite of what
 * `render.js` does for an unknown panel type — and on purpose. A panel type is
 * written by hand and a typo in one is a bug in the dashboard; a tone usually
 * arrives from a backend, where a value nobody has a rule for yet is an ordinary
 * event. Painting it as "no verdict" is the honest reading of that, and it is
 * the one fallback that cannot make a reader believe something untrue.
 */
export function tone(name) {
	return TONES[name] || TONES.quiet;
}

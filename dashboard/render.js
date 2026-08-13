/**
 * The spec renderer.
 *
 * A dashboard describes itself as data — `{type: "kpis", items: [...]}` — and
 * this file turns that into markup. Consumers do not write HTML, do not pick
 * class names, and do not decide what a null rate looks like.
 *
 * Everything here is PURE: a spec goes in, an HTML string comes out. Fetching,
 * ranges, state and event binding live in `controller.js`. Keeping that line
 * sharp is what makes a panel reviewable — you can read a `bars` block and know
 * exactly what it will draw without tracing a request.
 *
 * Adding a panel type: write `panel_<name>(node)`, add it to PANELS, document
 * its shape in README.md. A panel that only one dashboard could ever want is a
 * sign it should be `{type: "html"}` on that page instead.
 */

import * as fmt from "./format.js";
import { attrs } from "./drill.js";
import { tone as tone_of } from "./tone.js";

/**
 * The direction words a `rows` panel understands, on top of the tones.
 *
 * A trend is not a status: "rising" is only bad news because the panel counts
 * things going wrong, and the word the reader needs is the direction, not the
 * verdict. So these keep their own labels and borrow a tone for the colour.
 *
 * A `rows` item may name either — `tone: "rising"` and `tone: "danger"` both
 * work — because a panel listing failures thinks in directions and a panel
 * listing states does not, and neither should have to translate.
 */
const TRENDS = {
	quiet: { tone: "quiet", label: __("Quiet") },
	rising: { tone: "danger", label: __("Rising") },
	easing: { tone: "success", label: __("Easing") },
	steady: { tone: "warning", label: __("Steady") },
};

/**
 * The classes and the default label for a name that may be a trend or a tone.
 *
 * A tone has no label of its own — `danger` is a colour, not a word for a
 * reader — so one falls back to nothing and the pill is left off. Printing the
 * tone name is the tempting alternative and it is wrong: `DANGER` in a pill
 * where the caller meant to say `Suspended` reads as a system message.
 */
function reading(name) {
	const trend = TRENDS[name];
	return { ...tone_of(trend ? trend.tone : name), label: trend ? trend.label : "" };
}

/**
 * A render pass.
 *
 * Instantiated per render so the drill registry and the sparkline queue start
 * empty. Carrying them on the instance rather than in module state is what lets
 * two dashboards live on one Desk without their indices colliding.
 */
class Pass {
	constructor(spec) {
		this.spec = spec;
		this.explain = spec.explain || {};
		this.drills = [];
		this.charts = [];
	}

	/**
	 * The ⓘ button and its panel, for one key in `spec.explain`.
	 *
	 * Every number on a dashboard should be able to explain itself on the screen
	 * it appears on. A figure whose derivation lives in a document somewhere gets
	 * read as whatever the reader assumed it meant.
	 *
	 * Hover is deliberately not a trigger — this has to work on touch. It is a
	 * real <button>, so focus and Enter/Space come for free.
	 */
	explainer(key) {
		const entry = this.explain[key];
		if (!entry) {
			return "";
		}
		const [title, body] = entry;
		const id = `dd-explain-${key}`;
		return `
			<span class="dd-info-wrap">
				<button type="button" class="dd-info" aria-expanded="false" aria-controls="${id}"
					aria-label="${fmt.esc(__("How this is calculated: {0}", [title]))}">
					<span class="dd-info-glyph" aria-hidden="true">i</span>
				</button>
				<span class="dd-info-pop" id="${id}" role="note" hidden>
					<span class="dd-info-pop-title">${fmt.esc(title)}</span>
					<span class="dd-info-pop-body">${fmt.esc(body)}</span>
				</span>
			</span>`;
	}

	drill(descriptor, context) {
		return attrs(this.drills, descriptor, context);
	}

	/** Render one node, or an array of them. */
	node(node) {
		if (!node) {
			return "";
		}
		if (Array.isArray(node)) {
			return node.map((child) => this.node(child)).join("");
		}
		const panel = PANELS[node.type];
		if (!panel) {
			// Loud on purpose. A silently skipped panel looks like a backend that
			// returned nothing, and the wrong half of the stack gets debugged.
			throw new Error(`dd: unknown panel type "${node.type}"`);
		}
		return panel.call(this, node);
	}
}

// ============================================================================
// PANELS
// ============================================================================

/** `{type: "kpis", columns: 5, items: [{label, value, sub, delta, dot, explain, drill}]}` */
function panel_kpis(node) {
	const columns = node.columns || node.items.length || 1;
	const cards = node.items.map((item) => {
		const dot = item.dot ? `<span class="dd-kpi-dot dd-kpi-dot-${item.dot}"></span>` : "";
		return `
			<div class="dd-kpi" ${this.drill(item.drill, { item })}>
				${dot}
				<div class="dd-kpi-label">${fmt.esc(item.label)}${this.explainer(item.explain)}</div>
				<div class="dd-kpi-value">${fmt.esc(item.value)}${item.delta || ""}</div>
				<div class="dd-kpi-sub">${fmt.esc(item.sub)}</div>
			</div>`;
	});
	return `<div class="dd-grid dd-grid-${columns}">${cards.join("")}</div>`;
}

/**
 * `{type: "fields", columns: 4, items: [{label, value, tone}]}`
 *
 * A label-and-value grid — what a record says about itself. Deliberately not
 * `kpis`: that panel sets its value large and heavy because a KPI is a *figure*
 * a reader is meant to land on, and a serial number rendered at that size reads
 * as the most important thing on the page.
 *
 * `tone` tints the value for a field that is itself a finding.
 */
function panel_fields(node) {
	const columns = node.columns || node.items.length || 1;
	const cells = node.items.map((item) => {
		const painted = tone_of(item.tone);
		return `
			<div class="dd-field">
				<div class="dd-field-label">${fmt.esc(item.label)}</div>
				<div class="dd-field-value ${item.tone ? painted.cell : ""}">${fmt.esc(item.value)}</div>
			</div>`;
	});
	return `<div class="dd-grid dd-grid-${columns}">${cells.join("")}</div>`;
}

/** `{type: "card", title, hint, explain, body: <node|node[]>}` */
function panel_card(node) {
	const hint = node.hint ? `<div class="dd-card-hint">${fmt.esc(node.hint)}</div>` : "";
	return `
		<div class="dd-card">
			<div class="dd-card-head">
				<h5 class="dd-card-title">${fmt.esc(node.title)}${this.explainer(node.explain)}</h5>
				${hint}
			</div>
			${this.node(node.body)}
		</div>`;
}

/**
 * `{type: "bars", items: [{label, kept, lost, count, rate, drill}], scale, legend: [kept, lost]}`
 *
 * `scale` is the value one full-width track represents, and it is ONE number for
 * the whole panel on purpose. Scaling each row to its own value draws a column of
 * identical full-width bars and hides the very drop the panel exists to show.
 * Omitted, it defaults to the largest count — right for a distribution, wrong for
 * a funnel, which should pass its first stage.
 */
/**
 * The hover tip for one bar: what the legend names, counted.
 *
 * Needs the legend, because the legend is what the two segments are called —
 * without it there is a kept number and a lost number and nothing on the page
 * saying which is which, and a tip that has to be decoded is worse than none.
 *
 * Sized to the two segments rather than the row's total on purpose: the total is
 * already printed in the figures column, and repeating it is what makes a
 * tooltip feel like noise.
 */
function bar_tip(legend, kept, lost) {
	if (!legend || kept == null) {
		return "";
	}
	const line = (key, label, value) =>
		`<span><span class="dd-key dd-key-${key}"></span>${fmt.esc(label)}<b>${fmt.count(value)}</b></span>`;

	return `<div class="dd-bar-tip">${line("kept", legend[0], kept)}${line("lost", legend[1], lost)}</div>`;
}

function panel_bars(node) {
	const scale = node.scale != null ? node.scale : Math.max(...node.items.map((i) => i.count), 0);

	const rows = node.items.map((item) => {
		// A zero scale means an empty range, not a division to guard around each
		// row: both widths collapse to 0 and the track shows as its empty self.
		const width = (value) => (scale ? (Math.max(value, 0) / scale) * 100 : 0);
		const rate = item.rate ? `<span class="dd-bar-rate">${fmt.esc(item.rate)}</span>` : "";
		const lost = item.lost || 0;
		return `
			<div class="dd-bar" ${this.drill(item.drill, { item })}>
				<div class="dd-bar-label" title="${fmt.esc(item.label)}">${fmt.esc(item.label)}</div>
				<div class="dd-bar-track">
					<span class="dd-bar-kept" style="width: ${width(item.kept)}%"></span>
					<span class="dd-bar-lost" style="width: ${width(lost)}%"></span>
				</div>
				<div class="dd-bar-figures">
					<span class="dd-bar-count">${fmt.count(item.count)}</span>
					${rate}
				</div>
				${bar_tip(node.legend, item.kept, lost)}
			</div>`;
	});

	const legend = node.legend
		? `<div class="dd-legend">
				<span><span class="dd-key dd-key-kept"></span>${fmt.esc(node.legend[0])}</span>
				<span><span class="dd-key dd-key-lost"></span>${fmt.esc(node.legend[1])}</span>
			</div>`
		: "";

	return `<div class="dd-bars">${rows.join("")}</div>${legend}`;
}

/**
 * `{type: "rows", items: [{name, tone, status, why, links, count, rate, series, drill}]}`
 *
 * A list where each entry carries a state, a reason and a figure — the shape a
 * "what is going wrong" panel keeps arriving at. `tone` is a trend word or a
 * tone name (see TRENDS), or omit it and pass `series` to have the trend decide.
 */
function panel_rows(node) {
	const rows = node.items.map((item) => {
		const tone = reading(item.tone || fmt.trend(item.series));
		const text = item.status || tone.label;
		const status =
			item.status === false || !text
				? ""
				: `<span class="dd-pill ${tone.pill}">${fmt.esc(text)}</span>`;

		const links = (item.links || [])
			.map((link) => `<a href="${fmt.esc(link.href)}">${fmt.esc(link.label)}</a>`)
			.join("");

		const why = item.why
			? `<div class="dd-row-why" title="${fmt.esc(item.why)}">${fmt.esc(item.why)}</div>
				${links ? `<div class="dd-row-links">${links}</div>` : ""}`
			: "";

		const rate = item.rate ? `<div class="dd-row-rate">${fmt.esc(item.rate)}</div>` : "";

		// A flat series has nothing to plot, so the cell is left empty rather than
		// drawing a straight line that implies a measurement was taken and was zero.
		const spark = (item.series || []).some((value) => value > 0);
		const slot = spark ? this.charts.push({ kind: "spark", item, token: tone.token }) - 1 : "";

		return `
			<div class="dd-row ${tone.row}" ${this.drill(item.drill, { item })}>
				<span class="dd-stripe"></span>
				<div class="dd-row-main">
					<div class="dd-row-name">${fmt.esc(item.name)}${status}</div>
					${why}
				</div>
				<div class="dd-spark" data-dd-chart="${slot}"></div>
				<div class="dd-row-figures">
					<div class="dd-row-count">${fmt.count(item.count)}</div>
					${rate}
				</div>
			</div>`;
	});

	return rows.join("");
}

/** `right` and `center` are opt-in; a column says nothing and gets the default. */
const ALIGN = { right: "dd-num", center: "dd-mid" };

function align_class(col) {
	return ALIGN[col.align] || (col.numeric ? "dd-num" : "");
}

/**
 * `{type: "table", columns: [{label, key, numeric, align}], rows: [{..., tone, drill}], drill}`
 *
 * A cell is `row[col.key]`, and it is either a plain value or
 * `{value, tone, pill, tag}`:
 *
 *   `tone`  a name from `tone.js` — the ink shifts to say the value itself is
 *           the finding (out of range, disagreeing with another system)
 *   `pill`  render it as a pill instead of tinted text, for a cell holding a
 *           STATE rather than a reading — `Suspended`, `Learned`
 *   `tag`   a short word after the value, smaller and quieter — what the value
 *           also is, where the cell is still the value: `DS+US` beside a channel
 *           number that carries upstream too
 *
 * A ROW takes `tone` as well, tinting the whole row. That is for a fact about
 * the record rather than about one reading — the four channels out of sixteen
 * that transmit, the rows this import skipped. It is not a second way to say
 * what a cell already says: colouring a row because one cell in it is bad
 * spreads a verdict across six readings that were fine.
 *
 * All of it is optional and a bare value behaves exactly as it always has.
 *
 * This exists because the alternative was worse. Every cell here goes through
 * `fmt.esc`, so a table that needed one coloured cell had no way to say so and
 * had to be rebuilt as `{type: "html"}` — the escape hatch that is "NOT escaped,
 * by definition". Colour was making callers hand-roll their own escaping, and
 * three tables on one page did exactly that, one of them printing values scraped
 * off a supplier's portal. A tone is not worth an XSS, and neither is a tag.
 */
function panel_table(node) {
	const head = node.columns
		.map((col) => `<th class="${align_class(col)}">${fmt.esc(col.label)}</th>`)
		.join("");

	const body = node.rows
		.map((row) => {
			const cells = node.columns
				.map((col) => {
					const raw = row[col.key];
					const cell = raw && typeof raw === "object" ? raw : { value: raw };
					const painted = tone_of(cell.tone);
					const tag = cell.tag
						? `<span class="dd-tag">${fmt.esc(cell.tag)}</span>`
						: "";
					if (cell.pill) {
						return `<td class="${align_class(col)}"><span class="dd-pill ${painted.pill}">${fmt.esc(cell.value)}</span>${tag}</td>`;
					}
					return `<td class="${align_class(col)} ${cell.tone ? painted.cell : ""}">${fmt.esc(cell.value)}${tag}</td>`;
				})
				.join("");
			const painted = tone_of(row.tone);
			return `<tr class="${row.tone ? painted.row : ""}" ${this.drill(row.drill, { item: row })}>${cells}</tr>`;
		})
		.join("");

	return `<table class="dd-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * `{type: "chart", option, height, drill}`
 *
 * `option` is an ECharts option object, passed through untouched — it is already
 * a declarative spec, so wrapping it in a second one of our own would only be a
 * smaller version of the same thing with more to learn and less to reach for.
 * The toolkit supplies the theme, the resize and the drill; the shape of the
 * chart stays the caller's business.
 */
function panel_chart(node) {
	const slot = this.charts.push({ kind: "chart", node }) - 1;
	const style = node.height ? ` style="--dd-chart-height: ${Number(node.height)}px"` : "";
	return `<div class="dd-chart" data-dd-chart="${slot}"${style}></div>`;
}

/** `{type: "text", text, style: "caveat" | "empty"}` */
function panel_text(node) {
	const style = node.style === "empty" ? "dd-empty" : "dd-caveat";
	return `<div class="${style}">${fmt.esc(node.text)}</div>`;
}

/** `{type: "section", title, explain}` — a titled break between groups of panels. */
function panel_section(node) {
	return `<div class="dd-section-title">${fmt.esc(node.title)}${this.explainer(node.explain)}</div>`;
}

/**
 * `{type: "split", columns: [node|node[]]}` — two panels read side by side.
 *
 * An array in a column stacks its members, which is how a tall panel is paired
 * with two short ones without leaving a band of empty card under the shorter
 * side.
 */
function panel_split(node) {
	const columns = node.columns.map(
		(column) =>
			`<div class="dd-stack">${this.node(Array.isArray(column) ? column : [column])}</div>`,
	);
	return `<div class="dd-split">${columns.join("")}</div>`;
}

/** `{type: "grid", columns: n, blocks: [...]}` — equal columns. */
function panel_grid(node) {
	return `<div class="dd-grid dd-grid-${node.columns}">${this.node(node.blocks)}</div>`;
}

/**
 * `{type: "html", html}` — the escape hatch.
 *
 * NOT escaped, by definition. Anything reaching it must already be safe; pass
 * data through a real panel instead of building a string around it.
 */
function panel_html(node) {
	return node.html;
}

const PANELS = {
	kpis: panel_kpis,
	fields: panel_fields,
	card: panel_card,
	bars: panel_bars,
	rows: panel_rows,
	table: panel_table,
	chart: panel_chart,
	text: panel_text,
	section: panel_section,
	split: panel_split,
	grid: panel_grid,
	html: panel_html,
};

// ============================================================================
// PAGE
// ============================================================================

function header(spec) {
	const meta = (spec.meta || []).map((entry) => `<span>${fmt.esc(entry)}</span>`).join("");
	// The preset strip renders INSIDE the page body, never in the Desk page head.
	// Frappe's head sits outside `.dd-page`, so a control placed there resolves
	// none of the design tokens and paints with whatever the Desk inherited.
	const presets = (spec.presets || [])
		.map(
			(days) =>
				`<button type="button" class="dd-preset" data-days="${days}">${fmt.esc(__("{0}d", [days]))}</button>`,
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
			<span class="dd-footer-label">${fmt.esc(__("Underlying data"))}</span>
			${links}
		</div>`;
}

/**
 * Render a spec into `container`.
 *
 * Returns the pass's registries so the controller can bind drills and mount
 * charts against the markup that was just written. It does the DOM write itself
 * rather than returning a string, because the registries are only meaningful
 * paired with the exact markup they were built alongside — handing back both
 * separately invites them being used against different renders.
 */
export function render(container, spec) {
	const pass = new Pass(spec);
	const body = pass.node(spec.blocks);

	container.html(`
		${header(spec)}
		${spec.caveat ? `<div class="dd-caveat">${fmt.esc(spec.caveat)}</div>` : ""}
		${body}
		${footer(spec)}
	`);

	return { drills: pass.drills, charts: pass.charts };
}

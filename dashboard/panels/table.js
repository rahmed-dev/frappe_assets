/**
 * `{type: "table", columns: [{label, key, numeric, align, width, sortable}],
 *   rows: [{..., tone, drill}], caption, sortable, sort, sticky, max_height,
 *   virtual}`
 *
 * A cell is `row[col.key]`, and it is either a plain value or
 * `{value, tone, pill, tag, sort}`:
 *
 *   `tone`  a name from `ui/tone.js` — the ink shifts to say the value itself is
 *           the finding (out of range, disagreeing with another system)
 *   `pill`  render it as a pill instead of tinted text, for a cell holding a
 *           STATE rather than a reading — `Suspended`, `Learned`
 *   `tag`   a short word after the value, smaller and quieter — what the value
 *           also is, where the cell is still the value: `DS+US` beside a channel
 *           number that carries upstream too
 *   `sort`  what this cell is worth when the column is sorted, when the printed
 *           value cannot say. See "Sorting" below.
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
 *
 * ## Sorting
 *
 * `sortable: true` on the table makes every column sortable; a single column
 * opts out with `sortable: false`. `sort: {key, dir}` states the order the table
 * arrives in — it does NOT reorder anything, because the caller's backend
 * already ordered the rows and re-doing that work in the browser would only be a
 * chance to disagree with it. It marks the header so the reader can see which
 * column the order came from, and so the first click on that header reverses it
 * rather than re-applying it.
 *
 * A cell prints a string, by design — `fmt` runs before the spec is built, and
 * the panel has no way to know that `"210 ms"` is a number and `"2 h 10"` is a
 * different one. So the sort key is, in order: `cell.sort` if the caller gave
 * one; the value itself if it is already a number; the first number inside the
 * string on a `numeric` column; the string otherwise. The parse is a
 * convenience for `"1,126"` and `"210 ms"` and nothing more — anything whose
 * order is not its printed order (a date printed `01-07-2026`, a duration, a
 * severity word) wants an explicit `sort`.
 *
 * Blanks sort last in BOTH directions. A missing reading is not the smallest
 * reading, and a column sorted ascending that opens with nine em dashes has
 * buried the answer the reader clicked for.
 *
 * ## Sticky headers, and long tables
 *
 * `max_height` (pixels) puts the table in its own scroller, and `sticky: true`
 * pins the header inside it. Sticky needs that scroller — a header pinned
 * against the page scroll would have to know the height of the Desk navbar,
 * which is not ours — so `sticky` on its own takes a default height rather than
 * quietly doing nothing.
 *
 * `virtual: true` keeps only the visible rows in the DOM. The markup for every
 * row is still built once, in `render`, which is what keeps drill descriptors
 * and escaping identical to a normal table; what virtualisation avoids is the
 * layout and paint cost of ten thousand `<tr>` elements, which is the cost that
 * actually shows up as a locked-up Desk. It implies a scroller and a fixed
 * layout, and it assumes every row is the same height — a `why` that wraps onto
 * a second line in one row and not the next will drift the scrollbar.
 *
 * A virtual table needs its mount phase to show anything at all. That is the
 * trade, and it is why it is opt-in: every other table on this page renders its
 * rows as plain markup and is complete before a line of JavaScript runs.
 */

import * as fmt from "../../ui/format.js";
import { tone as tone_of } from "../../ui/tone.js";
import { host } from "../../core/host.js";

export const name = "table";

/** `right` and `center` are opt-in; a column says nothing and gets the default. */
const ALIGN = { right: "dd-num", center: "dd-mid" };

/** How tall the scroller is when `sticky` was asked for and no height was. */
const DEFAULT_MAX_HEIGHT = 420;

/** Rows drawn above and below the window, so a fast scroll does not show a gap. */
const OVERSCAN = 6;

function align_class(col) {
	return ALIGN[col.align] || (col.numeric ? "dd-num" : "");
}

/** A cell as an object, whichever of the two forms the caller wrote. */
function cell_of(row, col) {
	const raw = row[col.key];
	return raw && typeof raw === "object" ? raw : { value: raw };
}

function is_sortable(node, col) {
	return col.sortable === undefined ? Boolean(node.sortable) : Boolean(col.sortable);
}

/**
 * What one cell is worth when its column is sorted.
 *
 * Returns `null` for anything with no reading in it, which is the value the
 * comparator pushes to the end in both directions.
 */
export function sort_key(row, col) {
	const cell = cell_of(row, col);
	const explicit = cell.sort;
	if (explicit !== undefined && explicit !== null) {
		return explicit;
	}
	const value = cell.value;
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}
	if (typeof value !== "string" || value.trim() === "") {
		return null;
	}
	if (col.numeric) {
		// The first number in the string, commas removed: `"1,126"`, `"210 ms"`,
		// `"-3.4%"`. A column that prints something this cannot read declares its
		// own `sort` — see the note at the top of the file.
		const match = value.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
		return match ? Number(match[0]) : null;
	}
	// `fmt.blank` prints an em dash for a value nobody measured, and a table sorted
	// on that column should treat it as absent rather than as a character that
	// happens to sort after `Z`.
	return value === "—" ? null : value;
}

function compare(a, b) {
	// Blanks last, whichever way the arrow points. Reversing this with the
	// direction is what buries the answer under nine em dashes.
	if (a === null && b === null) {
		return 0;
	}
	if (a === null) {
		return 1;
	}
	if (b === null) {
		return -1;
	}
	if (typeof a === "number" && typeof b === "number") {
		return a - b;
	}
	return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/**
 * The order `rows` should be in for one column and direction.
 *
 * Returns indices rather than rows, because the caller is holding one array of
 * row markup that has to move with them.
 */
export function order_by(rows, col, dir) {
	const keys = rows.map((row) => sort_key(row, col));
	const sign = dir === "desc" ? -1 : 1;
	return rows
		.map((_, index) => index)
		.sort((left, right) => {
			const first = compare(keys[left], keys[right]);
			if (first !== 0) {
				// The blank rule is absolute, so it must not be flipped by `sign`.
				if (keys[left] === null || keys[right] === null) {
					return first;
				}
				return first * sign;
			}
			// A stable tie-break on the original position. `Array#sort` is stable in
			// every engine this runs on, but the rows have already been reordered once
			// by the time a second sort happens, so "original" has to be said out loud.
			return left - right;
		});
}

/** One `<tr>`, as a string. Everything in it is escaped. */
function row_html(node, row, pass) {
	const cells = node.columns
		.map((col) => {
			const cell = cell_of(row, col);
			const painted = tone_of(cell.tone);
			const tag = cell.tag ? `<span class="dd-tag">${fmt.esc(cell.tag)}</span>` : "";
			if (cell.pill) {
				return `<td class="${align_class(col)}"><span class="dd-pill ${painted.pill}">${fmt.esc(cell.value)}</span>${tag}</td>`;
			}
			return `<td class="${align_class(col)} ${cell.tone ? painted.cell : ""}">${fmt.esc(cell.value)}${tag}</td>`;
		})
		.join("");
	const painted = tone_of(row.tone);
	return `<tr class="${row.tone ? painted.row : ""}" ${pass.drill(row.drill, { item: row })}>${cells}</tr>`;
}

/**
 * The header cell.
 *
 * `scope="col"` on every one of them, sortable or not: it is what tells a screen
 * reader which heading belongs to the cell it is currently reading, and a table
 * without it is announced as a list of unlabelled values.
 *
 * A sortable heading is a real `<button>` inside the `<th>` rather than a click
 * handler on the `<th>` itself, so focus, Enter and Space arrive without this
 * file implementing any of them. `aria-sort` goes on the `<th>`, which is where
 * the specification puts it.
 */
function head_html(node, col, index) {
	const sorted = node.sort && node.sort.key === col.key ? node.sort.dir || "asc" : "";
	const aria = sorted ? ` aria-sort="${sorted === "desc" ? "descending" : "ascending"}"` : "";
	const label = fmt.esc(col.label);
	if (!is_sortable(node, col)) {
		return `<th scope="col" class="${align_class(col)}"${aria}>${label}</th>`;
	}
	const t = host("table").t("Sort by {0}", [col.label]);
	return `<th scope="col" class="${align_class(col)} dd-th-sort"${aria}>
		<button type="button" class="dd-sort" data-dd-col="${index}" title="${fmt.esc(t)}">
			<span class="dd-sort-label">${label}</span>
			<span class="dd-sort-arrow" aria-hidden="true"></span>
		</button>
	</th>`;
}

export function render(node, pass) {
	const sortable = node.columns.some((col) => is_sortable(node, col));
	const virtual = Boolean(node.virtual);
	const height = Number(node.max_height) || (node.sticky || virtual ? DEFAULT_MAX_HEIGHT : 0);
	const sticky = Boolean(node.sticky) && height > 0;

	const head = node.columns.map((col, index) => head_html(node, col, index)).join("");
	const rows = node.rows.map((row) => row_html(node, row, pass));

	// A caption is the table's own name, and it is what a screen reader reads
	// before the first cell. Hidden by default, because a table on this toolkit is
	// nearly always already inside a `card` whose title says the same thing, and
	// printing it twice is visual noise the sighted reader did not ask for.
	const caption = node.caption
		? `<caption class="dd-table-caption${node.caption_visible ? "" : " dd-visually-hidden"}">${fmt.esc(node.caption)}</caption>`
		: "";

	// Explicit widths only matter when the layout is fixed, and the layout is
	// fixed only when it has to be: a virtual table swaps its rows out from under
	// the browser, and an auto layout re-measures the columns on every scroll tick.
	const widths = node.columns.some((col) => col.width)
		? `<colgroup>${node.columns
				.map((col) => (col.width ? `<col style="width:${fmt.esc(col.width)}">` : "<col>"))
				.join("")}</colgroup>`
		: "";

	const classes = [
		"dd-table",
		sticky ? "dd-table-sticky" : "",
		virtual ? "dd-table-virtual" : "",
	]
		.filter(Boolean)
		.join(" ");

	// The mount slot is claimed only when there is something for a mount to do.
	// A plain table stays exactly what it was: markup, complete on arrival, with
	// no element the mount phase will even look at.
	const slot =
		sortable || virtual
			? ` data-dd-mount="${pass.defer(name, { node, rows, virtual, sortable })}"`
			: "";

	// A virtual table ships an empty body on purpose. Rendering all ten thousand
	// rows and then hiding them would pay the whole cost this exists to avoid.
	const body = virtual ? "" : rows.join("");

	const table = `<table class="${classes}"${slot}>${caption}${widths}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;

	return height
		? `<div class="dd-table-scroll" style="max-height:${Number(height)}px">${table}</div>`
		: table;
}

/**
 * Sorting and virtualisation. Returns its teardown, like every mount does.
 *
 * The rows are moved as pre-rendered strings rather than re-rendered here.
 * `render` is the only place a value is escaped and the only place a drill
 * descriptor is registered with the pass, and a second row-building path in the
 * mount phase would be a second place for both to go wrong — the escaping
 * silently, which is the one that matters.
 */
export function mount(el, data) {
	const { node, rows } = data;
	const body = el.querySelector("tbody");
	const scroller = el.closest(".dd-table-scroll");
	if (!body) {
		return null;
	}

	// The order rows are currently in, as indices into `rows`. The caller's order
	// to begin with — `sort` describes it, it does not perform it.
	let order = rows.map((_, index) => index);
	let sort = node.sort ? { key: node.sort.key, dir: node.sort.dir || "asc" } : null;
	let row_height = 0;

	const fill_all = () => {
		body.innerHTML = order.map((index) => rows[index]).join("");
	};

	/**
	 * Draw the window that is currently on screen, with a spacer above and below
	 * standing in for the rows that are not.
	 *
	 * The spacers are `<tr>` elements with one `<td colspan>` rather than padding
	 * on the tbody: a table row is the only thing a tbody may contain, and a
	 * browser handed anything else moves it out of the table entirely.
	 */
	const fill_window = () => {
		const total = order.length;
		if (!total) {
			body.innerHTML = "";
			return;
		}
		if (!row_height) {
			// Measured from one real row, once. A hard-coded height would be wrong the
			// first time anybody changed the font size or the cell padding.
			body.innerHTML = rows[order[0]];
			row_height = body.firstElementChild ? body.firstElementChild.offsetHeight : 0;
			if (!row_height) {
				// No layout to measure — the panel is inside a hidden tab, or this is a
				// DOM with no box model at all. Draw everything rather than nothing: a
				// slow table beats an empty one, and the next scroll re-measures.
				fill_all();
				return;
			}
		}
		const view = scroller ? scroller.clientHeight || DEFAULT_MAX_HEIGHT : DEFAULT_MAX_HEIGHT;
		const top = scroller ? scroller.scrollTop : 0;
		const first = Math.max(0, Math.floor(top / row_height) - OVERSCAN);
		const last = Math.min(total, Math.ceil((top + view) / row_height) + OVERSCAN);
		const above = first * row_height;
		const below = (total - last) * row_height;
		const span = node.columns.length;
		const spacer = (px) =>
			px > 0 ? `<tr class="dd-vspacer" aria-hidden="true"><td colspan="${span}" style="height:${px}px;padding:0;border:0"></td></tr>` : "";

		body.innerHTML =
			spacer(above) +
			order
				.slice(first, last)
				.map((index) => rows[index])
				.join("") +
			spacer(below);
	};

	const draw = data.virtual ? fill_window : fill_all;

	/** Repaint the header so the arrow and `aria-sort` say what the body shows. */
	const mark = () => {
		el.querySelectorAll("thead th").forEach((th, index) => {
			const col = node.columns[index];
			const active = sort && col && sort.key === col.key;
			if (active) {
				th.setAttribute("aria-sort", sort.dir === "desc" ? "descending" : "ascending");
			} else {
				th.removeAttribute("aria-sort");
			}
		});
	};

	const on_click = (event) => {
		const button = event.target.closest(".dd-sort");
		if (!button || !el.contains(button)) {
			return;
		}
		const col = node.columns[Number(button.getAttribute("data-dd-col"))];
		if (!col) {
			return;
		}
		// Clicking the column that is already sorted reverses it; clicking any other
		// starts that column ascending. Both are what every table in every other
		// application does, and a table that invents its own rule here is a table
		// nobody trusts the arrow on.
		const dir = sort && sort.key === col.key && sort.dir === "asc" ? "desc" : "asc";
		sort = { key: col.key, dir };
		order = order_by(node.rows, col, dir);
		if (scroller) {
			// Back to the top: the row that was under the cursor means nothing once the
			// order changed, and leaving the scroll where it was lands the reader in
			// the middle of an answer they have not seen the start of.
			scroller.scrollTop = 0;
		}
		mark();
		draw();
	};

	// Not delegated from the page body like the drill handlers are, because this
	// listener belongs to one table and dies with it. The controller runs this
	// teardown while the element is still attached, so removal is enough.
	el.addEventListener("click", on_click);

	let ticking = false;
	const on_scroll = () => {
		if (ticking) {
			return;
		}
		ticking = true;
		// One redraw per frame. A scroll event fires far faster than the screen
		// updates, and rebuilding the body on every one of them is how a
		// virtualisation that was supposed to make the page fast makes it slower.
		requestAnimationFrame(() => {
			ticking = false;
			fill_window();
		});
	};
	if (data.virtual && scroller) {
		scroller.addEventListener("scroll", on_scroll, { passive: true });
	}

	if (data.virtual) {
		fill_window();
	}

	return () => {
		el.removeEventListener("click", on_click);
		if (data.virtual && scroller) {
			scroller.removeEventListener("scroll", on_scroll);
		}
	};
}

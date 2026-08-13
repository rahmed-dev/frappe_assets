/**
 * Taking a panel off the page: CSV from a table, PNG from a chart.
 *
 * Two halves, deliberately separated. `to_csv` is a pure string function with no
 * DOM in it, so the quoting rules — the half that is easy to get wrong and
 * impossible to see wrong — are unit-testable. `save` is the four lines of DOM
 * that hand a browser a file, and there is exactly one copy of them.
 *
 * ## Why this is not `window.open(dataURL)`
 *
 * A Desk page runs inside the user's session. Opening a data URL in a tab is
 * blocked by the popup blocker often enough to look like a broken button, and a
 * navigation loses the page state the reader spent a minute filtering into
 * place. An anchor with `download` neither navigates nor pops.
 *
 * ## Why the CSV carries a byte-order mark
 *
 * Excel on Windows reads a UTF-8 CSV as the system code page unless the file
 * opens with a BOM, so a customer name with an accent in it arrives mangled and
 * the reader concludes the dashboard is wrong about the data. Three bytes is a
 * cheap way not to have that conversation. Every other tool that reads CSV
 * tolerates the BOM.
 */

import { host } from "../core/host.js";
import { esc } from "../core/escape.js";

/**
 * The toolbar a panel hangs its download button in.
 *
 * Markup rather than a component, because every panel in this toolkit builds a
 * string in a pure `render`. Two panels emit this — `table` and `chart` — and a
 * third would be a third place for the class names to drift, which is the
 * failure `CONTRACT.md` exists to catch and the stylesheet cannot.
 *
 * `aria-hidden` is wrong here and the button is not decoration, so it gets a
 * real accessible name from `title`; the visible text is the short one.
 */
export function tools_html(label, title) {
	return `<div class="dd-tools"><button type="button" class="dd-export" title="${esc(title)}" aria-label="${esc(title)}">${esc(label)}</button></div>`;
}

/**
 * One CSV field, quoted if it has to be.
 *
 * RFC 4180: a field containing a comma, a quote or a line break is wrapped in
 * quotes, and each quote inside it is doubled. Nothing else is escaped — a CSV
 * is not markup and the value is not going into a page.
 *
 * The leading-character guard is separate and is not RFC: a value starting `=`,
 * `+`, `-` or `@` is executed as a formula when the file is opened in Excel or
 * Sheets. A cell reading `=1+1` is a curiosity; one reading
 * `=HYPERLINK("http://…"&A1)` is exfiltration of the row next to it, sent by a
 * spreadsheet the reader trusts. Prefixing a tab makes it text and leaves it
 * looking identical.
 */
export function csv_cell(value) {
	if (value === null || value === undefined) {
		return "";
	}
	let text = String(value);
	if (/^[=+\-@\t\r]/.test(text)) {
		text = `\t${text}`;
	}
	return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * A grid of values as CSV text.
 *
 * `\r\n` between records, which is what RFC 4180 says and what Excel wants; a
 * bare `\n` is read as one long field by enough tools to be worth the extra byte.
 */
export function to_csv(grid) {
	return grid.map((row) => row.map(csv_cell).join(",")).join("\r\n");
}

/** Something safe to put in front of a file extension. */
export function slug_name(text) {
	return (
		String(text || "")
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "")
			.slice(0, 60) || "export"
	);
}

/**
 * `nodes-2026-08-13.csv` — the name and the day it was taken.
 *
 * The date is not decoration. A dashboard is exported, mailed, and read a week
 * later by somebody who was not looking at the range control when the button was
 * pressed, and `export.csv` in a downloads folder says nothing about which day
 * it describes. `host().today()` rather than `new Date()`, so a test can pin it
 * and so the day is the one the Desk session is in.
 */
export function stamp(name, extension) {
	return `${slug_name(name)}-${host().today()}.${extension}`;
}

/**
 * Hand the browser a file.
 *
 * The anchor has to be in the document for Firefox to honour the click, and the
 * object URL has to outlive the click, which is why the revoke is deferred
 * rather than run on the next line. Both are old browser facts, and both look
 * like a button that does nothing when they are missing.
 */
export function save(href, filename, revoke) {
	const link = document.createElement("a");
	link.href = href;
	link.download = filename;
	link.rel = "noopener";
	link.style.display = "none";
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	if (revoke) {
		setTimeout(() => URL.revokeObjectURL(href), 0);
	}
}

/** Save CSV text as a file, BOM included. See the note at the top. */
export function save_csv(text, filename) {
	const blob = new Blob([`\uFEFF${text}`], { type: "text/csv;charset=utf-8" });
	save(URL.createObjectURL(blob), filename, true);
}

/** Save a `data:` URL — what a canvas gives back — as a file. */
export function save_data_url(url, filename) {
	if (!url) {
		return false;
	}
	save(url, filename, false);
	return true;
}

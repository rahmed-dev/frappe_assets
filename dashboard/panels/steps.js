/**
 * `{type: "steps", title, subtitle, action: {label, href}, steps: [{label, state, date, note}]}`
 *
 * A stepper strip: where one record is in a fixed sequence of steps. Read-only —
 * it states a position and moves nothing. That is the difference from
 * `run_wizard`, which drives a dialog with Next and Back.
 *
 * The first caller is a Desk FORM, not a dashboard page, so the panel also has a
 * standalone entry, `render_steps(node)`, that wraps the strip in the token
 * anchor itself (`.dd-page.dd-embed`). Inside a dashboard it is an ordinary
 * panel and the page is already the anchor.
 *
 * Reading rules, all decided here rather than per caller:
 *
 * - `state` is `done · current · todo · failed · skipped`. An unknown state reads
 *   as `todo`: a step nobody graded must not read as finished.
 * - At most one step is `current`. A second one reads as `todo` — two "you are
 *   here" markers is a contradiction, and the first is the one the reader meets.
 * - A `failed` step ends the strip. Anything after it is dropped: the sequence
 *   stopped there, and drawing the steps it never reached as "to do" would say
 *   it might still go on.
 * - `date` is a stored date or datetime, shown through `fmt.date`. No date draws
 *   nothing, never a dash: "done, date unknown" is an ordinary state for a
 *   record older than its history.
 * - Every state is also written in text for a screen reader, never by colour
 *   alone, and the current step carries `aria-current="step"`.
 */

import * as fmt from "../../ui/format.js";
import { host } from "../../core/host.js";

export const name = "steps";

/**
 * Each state's class, glyph and screen-reader word.
 *
 * The class names are written out in full rather than built from the state, so
 * the contract test can find each one in the source. The words are stored
 * untranslated and run through the host at read time (see `rows.js#TRENDS`).
 */
const STATES = {
	done: { cls: "dd-step-done", glyph: "check", word: "Done" },
	current: { cls: "dd-step-current", glyph: "", word: "Current step" },
	todo: { cls: "dd-step-todo", glyph: "", word: "Not started" },
	failed: { cls: "dd-step-failed", glyph: "cross", word: "Failed" },
	skipped: { cls: "dd-step-skipped", glyph: "", word: "Skipped" },
};

/** Generated markup, never data: safe to interpolate as is. */
const GLYPHS = {
	check: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M2.5 6.3 5 8.6 9.5 3.6" /></svg>',
	cross: '<svg viewBox="0 0 12 12" aria-hidden="true" focusable="false"><path d="M3.5 3.5 8.5 8.5M8.5 3.5 3.5 8.5" /></svg>',
};

/**
 * The steps as they will be drawn: states normalised, one current at most, and
 * nothing after the first failed step. Exported for the tests and for a caller
 * that wants to know what the strip will say before drawing it.
 */
export function normalise(steps) {
	const out = [];
	let seen_current = false;
	for (const step of steps || []) {
		let state = STATES[step.state] ? step.state : "todo";
		if (state === "current") {
			state = seen_current ? "todo" : "current";
			seen_current = true;
		}
		out.push({ ...step, state });
		if (state === "failed") {
			break;
		}
	}
	return out;
}

/**
 * A link target the strip will print, or `null`.
 *
 * `esc` makes a value safe inside an attribute; it does not make a URL safe to
 * follow. A `javascript:` href survives escaping intact and runs on click, so
 * only a site path, an http(s) URL or a fragment is accepted.
 */
function safe_href(href) {
	const text = String(href == null ? "" : href).trim();
	if (/^(\/(?!\/)|#|https?:\/\/)/i.test(text)) {
		return text;
	}
	return null;
}

function head(node) {
	const action = node.action && safe_href(node.action.href);
	const link = action
		? `<a class="dd-steps-action" href="${fmt.esc(action)}">${fmt.esc(node.action.label || host("steps").t("Open"))}</a>`
		: "";
	if (!node.title && !node.subtitle && !link) {
		return "";
	}
	return `
		<div class="dd-steps-head">
			<span class="dd-steps-title">${fmt.esc(node.title || "")}</span>
			${node.subtitle ? `<span class="dd-steps-subtitle">${fmt.esc(node.subtitle)}</span>` : ""}
			${link}
		</div>`;
}

function item(step) {
	const state = STATES[step.state];
	const glyph = state.glyph ? GLYPHS[state.glyph] : "";
	const date = step.date ? `<span class="dd-step-date">${fmt.esc(fmt.date(step.date))}</span>` : "";
	const note = step.note ? `<span class="dd-step-note">${fmt.esc(step.note)}</span>` : "";
	const current = step.state === "current" ? ' aria-current="step"' : "";
	return `
		<li class="dd-step ${state.cls}"${current}>
			<span class="dd-step-dot">${glyph}</span>
			<span class="dd-step-body">
				<span class="dd-step-label">${fmt.esc(step.label)}</span>
				<span class="dd-visually-hidden">(${fmt.esc(host("steps").t(state.word))})</span>
				${date}
				${note}
			</span>
		</li>`;
}

export function render(node) {
	const steps = normalise(node.steps);
	return `
		<div class="dd-steps">
			${head(node)}
			<ol class="dd-steps-list">${steps.map(item).join("")}</ol>
		</div>`;
}

/**
 * The strip outside a dashboard — on a Desk form, in a dialog, in a list row.
 *
 * Every design token is declared on `.dd-page`, so a strip with no `.dd-page`
 * above it would paint with nothing. `.dd-embed` takes the page gutter back off:
 * the host surface already has its own.
 */
export function render_steps(node) {
	return `<div class="dd-page dd-embed">${render(node)}</div>`;
}

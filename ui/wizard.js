/**
 * A multi-step wizard control for a `frappe.ui.Dialog`.
 *
 * Runs a Dialog's own fields through a fixed step order: one Section Break per
 * step, toggled inline; a Frappe `.progress` bar above the body; Next/Back
 * bound directly onto the dialog's own footer buttons; the last step's Next is
 * the caller's Submit.
 *
 * Extracted from a Frappe app (originally a private `_step_control` on one
 * dialog, then pulled into its own bundle once a second, unrelated wizard in
 * the same app converged on the identical shape) — this is the package's
 * first primitive built directly on `frappe.ui.Dialog` rather than on the
 * dashboard renderer. Unlike the rest of `ui/`, its correctness cannot be
 * exercised under `TestHost`: there is no Dialog to run it against outside a
 * real Desk session. `host()` is still used for the two calls that ARE pure
 * environmental reads — translation, and the msgprint dialog on a failed step
 * gate — so a consumer that installed its own host is honoured for those.
 * `$`, `is_null` and `strip_html` stay direct Desk globals, at the same trust
 * level as the `frappe.ui.Dialog` instance the caller hands in: there is no
 * test double for a Dialog, so wrapping its own dependencies behind an
 * interface buys nothing here.
 *
 * Two Frappe facts make this shape mandatory, both found by the first build
 * shipping without them:
 *   1. `FieldGroup.get_values()` checks `df.reqd` across the WHOLE group and
 *      does not skip hidden fields, so it cannot gate one step on its own —
 *      a later step's conditional, off-screen mandatory field would block
 *      Next on an earlier one. Hence `_missing_required`, narrower and scoped
 *      to the step's own sections, mirroring `get_values()`'s own null test.
 *   2. `Dialog.set_primary_action` WRAPS its callback in a whole-form
 *      `get_values()` call and bails when it returns null — exactly the
 *      validation a wizard must not run between steps. Next is bound to the
 *      button directly; only the last step calls `get_values()`, where
 *      validating everything is what is actually wanted.
 * Sections are toggled with an inline `wrapper.toggle()`, not `Section.hide()`,
 * whose `hide-control` class Frappe strips on every `depends_on` re-evaluation.
 *
 * @param {object} dialog  A `frappe.ui.Dialog`, already constructed with
 *   `fields` (see below) and not yet handed a primary action — `run` owns
 *   the footer for the life of the wizard.
 * @param {Array<{title: string, sections: string[]}>} steps  One entry per
 *   step; `sections` names the Section Break fieldnames shown on that step.
 * @param {Array<object>} fields  The SAME field array passed to
 *   `new frappe.ui.Dialog({ fields })` — used to work out which fields
 *   belong to which section.
 * @param {object} [opts]
 * @param {string} [opts.submitLabel]  Label for the last step's primary button.
 * @param {(values: object) => void} [opts.onSubmit]  Called with the dialog's
 *   full values once the last step's own validation passes.
 * @param {(index: number, dialog: object) => void} [opts.onShow]  Called every
 *   time a step is shown, including the first.
 * @param {(index: number, values: object) => number} [opts.nextIndex]  Decides
 *   which step Next goes to next. Omit for a plain linear wizard
 *   (`index + 1`). Back is a visited-step STACK, not `index - 1`, so it always
 *   undoes whatever `nextIndex` actually did, including a skip.
 */

import { host } from "../core/host.js";

function _fields_by_section(fields) {
	const map = {};
	let current = null;
	for (const df of fields) {
		if (df.fieldtype === "Section Break") {
			current = df.fieldname;
			map[current] = [];
		} else if (current && df.fieldname) {
			map[current].push(df.fieldname);
		}
	}
	return map;
}

function _missing_required(t, dialog, fieldnames) {
	const missing = [];
	for (const fieldname of fieldnames) {
		const field = dialog.fields_dict[fieldname];
		if (!field || !field.df.reqd || !field.get_value) continue;
		const value = field.get_value();
		if (is_null(typeof value === "string" ? strip_html(value) : value)) {
			missing.push(t(field.df.label));
		}
	}
	return missing;
}

// Deliberately NOT dialog.set_primary_action — see the module doc comment.
function _bind_primary(dialog, label, handler) {
	dialog.footer.removeClass("hide");
	dialog.has_primary_action = true;
	dialog.get_primary_btn().removeClass("hide").html(label).off("click").on("click", handler);
}

export function run(dialog, steps, fields, opts) {
	opts = opts || {};
	const h = host("wizard.run");
	const t = (text, args) => h.t(text, args);
	const submitLabel = opts.submitLabel || t("Submit");
	const onSubmit = opts.onSubmit || function () {};
	const onShow = opts.onShow || function () {};
	const nextIndex = opts.nextIndex || ((index) => index + 1);

	const by_section = _fields_by_section(fields);
	const title = dialog.title;
	// Visited-step stack, not index - 1: Back must undo whatever Next did,
	// and Next can skip forward (nextIndex), so the previous step isn't
	// reliably "this index minus one".
	const visited = [0];

	// Sits between the header and the scrolling body, so it stays put.
	//
	// Frappe's own .progress / .progress-bar, NOT a hand-rolled pair of divs.
	// The dark theme flips the fill to var(--light) and the track to
	// var(--gray-700) (desk/dark.scss), because var(--primary) is unreadable on
	// a dark surface. Choosing those two colours by hand gets it exactly
	// backwards in dark mode: the filled step disappears into the header while
	// the unfilled var(--gray-300) reads as a bright bar over the step you have
	// NOT done yet. These classes are theme-managed, so both modes come free.
	const $bar = $(`<div class="progress"><div class="progress-bar"></div></div>`)
		.css({ height: "4px", margin: `0 var(--padding-lg) var(--padding-sm)` })
		.insertBefore(dialog.modal_body);
	const $fill = $bar.find(".progress-bar");

	function show(index) {
		steps.forEach((step, i) => {
			// Toggled inline rather than through Section.hide(), whose class is
			// undone whenever Frappe re-evaluates depends_on on this layout.
			for (const section of step.sections) {
				dialog.fields_dict[section].wrapper.toggle(i === index);
			}
		});
		$fill.css("width", `${((index + 1) / steps.length) * 100}%`);

		dialog.set_title(`${title} — ${t("Step {0} of {1}", [index + 1, steps.length])}: ${steps[index].title}`);

		const last = index === steps.length - 1;
		_bind_primary(dialog, last ? submitLabel : t("Next"), () => {
			if (last) {
				const values = dialog.get_values();
				if (values) onSubmit(values);
				return;
			}
			const missing = steps[index].sections.flatMap((s) => _missing_required(t, dialog, by_section[s] || []));
			if (missing.length) {
				h.notify({
					title: t("Missing Values Required"),
					message: t("Following fields have missing values:") + "<br><br><ul><li>" + missing.join("<li>") + "</ul>",
					indicator: "orange",
				});
				return;
			}
			const target = nextIndex(index, dialog.get_values(true) || {});
			visited.push(target);
			show(target);
		});

		if (visited.length === 1) {
			dialog.get_secondary_btn().addClass("hide");
		} else {
			dialog.set_secondary_action_label(t("Back"));
			dialog.set_secondary_action(() => {
				visited.pop();
				show(visited[visited.length - 1]);
			});
		}

		onShow(index, dialog);
	}

	show(visited[0]);
}

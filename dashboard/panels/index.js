/**
 * The built-in panel set, registered.
 *
 * Importing this module is what puts the twelve built-ins in the registry.
 * `dashboard/render.js` imports it, so anything that renders a spec has them;
 * nothing else needs to.
 *
 * A consuming app's own panel is defined exactly the same way and is the same
 * kind of thing afterwards:
 *
 *     import { panels } from "frappe-assets";
 *     panels.define("gantt", {
 *       render: (node, pass) => `<div class="my-gantt" data-dd-mount="${pass.defer("gantt", node)}"></div>`,
 *       mount: (el, node) => { const g = new Gantt(el, node.tasks); return () => g.destroy(); },
 *     });
 *
 * `define` throws on a name that is already taken, naming it. Replacing a
 * built-in is `redefine`, which is deliberate and reads that way at the call
 * site — silent last-one-wins is how an app shadows `table` for every other page
 * in the same Desk session and discovers it somewhere the definition is not.
 */

import { panels } from "../../core/spec.js";
import * as kpis from "./kpis.js";
import * as fields from "./fields.js";
import * as bars from "./bars.js";
import * as rows from "./rows.js";
import * as table from "./table.js";
import * as chart from "./chart.js";
import { card, split, grid, section } from "./layout.js";
import { text, html } from "./text.js";

for (const panel of [kpis, fields, bars, rows, table, chart, card, split, grid, section, text, html]) {
	// `redefine` rather than `define`, and only here: a module can be evaluated
	// twice in a session — two bundles, a hot reload, a test importing the barrel
	// after a panel file — and the built-in set colliding with itself is not the
	// mistake `define` is there to catch.
	panels.redefine(panel.name, panel);
}

export { panels };

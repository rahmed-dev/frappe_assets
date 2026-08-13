/**
 * Node by default, and that is the assertion rather than an optimisation.
 *
 * `core/escape.js`, `ui/format.js` and the chart maths are supposed to work
 * with no browser and no Frappe behind them. The cheapest way to keep that true
 * is to run them somewhere neither exists, so a stray `document.` fails loudly
 * instead of quietly passing against a DOM that happened to be provided.
 *
 * The files that genuinely need a document opt in for themselves with an
 * `@vitest-environment happy-dom` docblock — which also means the requirement is
 * stated in the file that has it, rather than in a glob here that nobody reads.
 */

import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.js"],
	},
});

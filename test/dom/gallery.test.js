/**
 * @vitest-environment happy-dom
 *
 * Loads the **built** gallery bundle and asserts it drew something.
 *
 * This is not a substitute for opening the page — half the defects in this repo
 * are visual and exist in only one theme, and no assertion here would see them.
 * What it catches is the gallery breaking *silently at the top*: a moved import,
 * a changed signature, an exception on the first line of `main`. The v0.3.0
 * refactor did exactly that — `render()` stopped accepting the one-method shim
 * the gallery handed it, every panel vanished, and `yarn demo` still printed a
 * successful build because bundling and running are different things.
 *
 * Skipped rather than failed when the bundle is absent: it is gitignored, so a
 * fresh clone has none until `yarn demo` runs. CI builds it first.
 */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const bundle = join(root, "demo", "gallery.bundle.js");

describe.skipIf(!existsSync(bundle))("the built gallery", () => {
	it("renders every panel without throwing on the way in", () => {
		// The real page, not a hand-written stand-in. `gallery.js` reaches for the
		// theme toggle as well as the body, and a stand-in that happens to omit one
		// of them fails for a reason that has nothing to do with the toolkit.
		document.documentElement.innerHTML = readFileSync(
			join(root, "demo", "index.html"),
			"utf8",
		)
			.replace(/<script[^>]*><\/script>/g, "")
			// The stylesheet link too: happy-dom would try to fetch it over HTTP,
			// and a test that reaches the network is a test that fails on a laptop
			// on a train. The CSS is not what this asserts on.
			.replace(/<link[^>]*>/g, "");

		// The gallery defers chart mounting to a frame, exactly as the controller
		// does, and ECharts wants a real 2d context that no DOM shim provides. So
		// the frame never comes: this test is about the markup, and a canvas
		// failing in a fake browser proves nothing either way.
		globalThis.requestAnimationFrame = () => 0;

		const thrown = [];
		try {
			// eslint-disable-next-line no-eval
			(0, eval)(readFileSync(bundle, "utf8"));
		} catch (error) {
			thrown.push(error);
		}

		const body = document.querySelector(".dd-page");
		expect(thrown).toEqual([]);
		expect(body.innerHTML.length).toBeGreaterThan(5000);
		expect(body.querySelectorAll(".dd-card").length).toBeGreaterThan(10);
		expect(body.querySelectorAll(".dd-kpi").length).toBeGreaterThan(0);
		expect(body.querySelectorAll(".dd-table").length).toBeGreaterThan(0);
		expect(body.querySelectorAll("[data-dd-mount]").length).toBeGreaterThan(0);
	});
});

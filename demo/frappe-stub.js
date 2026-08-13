/**
 * Installs the `TestHost` so the gallery runs in a plain browser tab with no
 * bench behind it.
 *
 * This used to stub five Frappe globals, because the toolkit reached for
 * `frappe` and `__` directly from five files. Since v0.3.0 there is exactly one
 * seam — `core/host.js` — and the gallery uses the same `TestHost` the test
 * suite does. That matters more than the line count: a stub that only the
 * gallery uses drifts from the stub only the tests use, and the bug that finds
 * you is always "it works in one and not the other".
 *
 * Still imported for its side effect alone, and still before anything else, so
 * `demo/**` stays listed in `package.json` `sideEffects` — under a blanket
 * `false`, esbuild deletes this import and the page dies on its first `t()`.
 *
 * `route` is recorded rather than followed, because there is no Desk to
 * navigate to. The gallery prints what a drill *would* have opened, which is
 * still worth showing: a drill target nobody can see is a drill target nobody
 * checks.
 */

import { setHost, TestHost } from "../index.js";

class GalleryHost extends TestHost {
	route(...args) {
		super.route(...args);
		console.log("drill →", ...args); // eslint-disable-line no-console
	}
}

setHost(new GalleryHost());

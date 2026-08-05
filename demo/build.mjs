/**
 * Builds the gallery's two assets.
 *
 * This exists because a browser cannot open `dashboard/index.js` directly: the
 * toolkit imports `echarts/core` by package name and `dash.scss` is Sass. Both
 * need resolving before a `file://` page can use them, and that is all this does
 * — no dev server, no watch mode, no framework.
 *
 * The output is gitignored. A built bundle in the repo would be ~700 KB of
 * generated JavaScript turning up in every diff, and it would go stale the first
 * time someone edited the toolkit without re-running this.
 */

import { build } from "esbuild";
import * as sass from "sass";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

await build({
	entryPoints: [join(here, "gallery.js")],
	outfile: join(here, "gallery.bundle.js"),
	bundle: true,
	// IIFE, not ESM, and the matching <script> in index.html carries no
	// `type="module"`. Chrome applies CORS to module scripts, and `file://` is an
	// opaque origin — so an ESM build of this page loads as a blank screen with a
	// CORS error, and only when opened the way the README tells you to open it.
	format: "iife",
	target: "es2020",
	logLevel: "info",
});

// Compiled with the same `~`-stripping importer Frappe's esbuild config
// installs, so an import that works here works in an app bundle too. The
// gallery does not use one today; keeping the resolver honest is what stops
// this build from quietly diverging from the real one.
const css = sass.compile(join(here, "gallery.scss"), {
	loadPaths: [join(here, "..", "node_modules")],
	importers: [
		{
			findFileUrl(url) {
				return url.startsWith("~")
					? new URL(`../node_modules/${url.slice(1)}`, import.meta.url)
					: null;
			},
		},
	],
});

writeFileSync(join(here, "gallery.bundle.css"), css.css);
console.log(`  demo/gallery.bundle.css  ${(css.css.length / 1024).toFixed(1)} KB`);

/**
 * Asserts that the three places recording this package's version agree.
 *
 * `package.json` is what a consumer resolves, `core/version.js` is what the
 * controller stamps on the page so "which toolkit is live on this site" can be
 * answered by inspecting an element, and `CHANGELOG.md` is what a reader
 * consults before upgrading. All three are edited by hand and any two of them
 * can drift.
 *
 * The failure this prevents is not cosmetic. A page stamped `0.3.0` that is
 * actually running `0.4.0` sends whoever is debugging it to the wrong changelog
 * entry, and the whole reason that stamp exists is to be trusted without bench
 * access.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const pkg = JSON.parse(read("package.json")).version;

const stamped = read("core/version.js").match(/VERSION\s*=\s*"([^"]+)"/)?.[1];

// The first `## [x.y.z]` or `## x.y.z` heading in the changelog.
const logged = read("CHANGELOG.md").match(/^##\s*\[?v?(\d+\.\d+\.\d+)\]?/m)?.[1];

const failures = [];
if (stamped !== pkg) {
	failures.push(`core/version.js says ${stamped}, package.json says ${pkg}`);
}
if (logged !== pkg) {
	failures.push(`CHANGELOG.md's newest entry is ${logged}, package.json says ${pkg}`);
}

if (failures.length) {
	console.error(`version disagreement:\n  ${failures.join("\n  ")}`);
	process.exit(1);
}

console.log(`version ${pkg} agrees across package.json, core/version.js and CHANGELOG.md`);

/**
 * The contract test.
 *
 * `CONTRACT.md` says a consuming page depends on this toolkit through three
 * channels and that two of them have no build-time check: a renamed JS export
 * fails loudly, a renamed CSS class or custom property fails **silently**, and
 * the page is simply wrong until a human opens it.
 *
 * This closes that gap from the other side. It reads the tables in `CONTRACT.md`
 * — the document itself, not a copy of it — and fails if any promised name is
 * missing from the stylesheet or from the code that emits it. Renaming a class
 * is now as loud as renaming an export, and the failure names the file that
 * promised it.
 *
 * It is deliberately blunt about *how* it checks: substring presence, not
 * parsing. A CSS parser here would be a second implementation of Sass with its
 * own bugs, and what is being defended against is a rename, which a substring
 * catches perfectly.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { TONES } from "../../ui/tone.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const contract = read("CONTRACT.md");
const stylesheet = read("ui/styles/dash.scss");
/**
 * Everything that writes markup or names a class.
 *
 * `dashboard/panels/` is read as a **directory** rather than listed file by
 * file: since v0.4.0 a panel is its own module, and a hand-maintained list here
 * would mean a new panel's classes going unchecked until somebody remembered to
 * add it — which is the same silent-failure shape this whole file exists to
 * close.
 *
 * `ui/tone.js` belongs here even though it renders nothing: it is where the
 * toned class names are *built*, and a rename there is exactly that failure.
 *
 * `core/spec.js` writes markup too, since v0.5.0: the per-panel loading, empty
 * and error placeholders live in the kernel rather than in twelve panels.
 */
const emitters = [
	"core/spec.js",
	"dashboard/render.js",
	"dashboard/controller.js",
	"dashboard/drill.js",
	"ui/tone.js",
	...readdirSync(join(root, "dashboard", "panels"))
		.filter((file) => file.endsWith(".js"))
		.map((file) => `dashboard/panels/${file}`),
]
	.map(read)
	.join("\n");

/** The section between one `## ` heading and the next. */
function section(title) {
	const start = contract.indexOf(`## ${title}`);
	expect(start, `CONTRACT.md has no section "${title}"`).toBeGreaterThan(-1);
	const next = contract.indexOf("\n## ", start + 1);
	return contract.slice(start, next === -1 ? undefined : next);
}

/** Every backticked name matching `pattern` inside a section's table rows. */
function promised(title, pattern) {
	const names = section(title)
		.split("\n")
		.filter((line) => line.startsWith("|"))
		.flatMap((line) => [...line.matchAll(pattern)].map((match) => match[0]));
	return [...new Set(names)];
}

/** `.dd-cell-{tone}` is five promises, not one. */
function expand(name) {
	if (!name.includes("{tone}")) {
		return [name];
	}
	return Object.keys(TONES)
		.map((tone) => name.replace("{tone}", tone))
		// `quiet` carries no classes at all on purpose — the absence of a verdict
		// must not paint. So it promises no selector and is not checked for one.
		.filter((expanded) => !expanded.endsWith("-quiet"));
}

describe("§3 — the class names a page may key on", () => {
	const classes = promised("3. CSS class names a page may key on", /\.dd-[a-z0-9-]+(?:\{tone\})?/g)
		.flatMap(expand);

	it("promises a non-trivial number of them", () => {
		// A parse that silently matched nothing would make every assertion below
		// pass vacuously, which is the one way a contract test can lie.
		expect(classes.length).toBeGreaterThan(10);
	});

	it.each(classes)("%s is styled by dash.scss", (name) => {
		expect(stylesheet).toContain(name);
	});

	it.each(classes)("%s is emitted by the code", (name) => {
		// Without the leading dot: the renderer writes `class="dd-card"`.
		expect(emitters).toContain(name.slice(1));
	});
});

describe("§4 — the custom properties a page may read", () => {
	const tokens = promised("4. CSS custom properties a page may read", /--dd-[a-z0-9-]+/g);

	it("promises a non-trivial number of them", () => {
		expect(tokens.length).toBeGreaterThan(30);
	});

	it.each(tokens)("%s is declared in the light block", (name) => {
		expect(stylesheet).toContain(`${name}:`);
	});

	it.each(tokens)("%s is not left as an unresolved var() reference", (name) => {
		// The trap `CLAUDE.md` documents: `--brand-color` resolves to `var(--primary)`,
		// which is undefined, so it paints nothing in both themes. A token of ours
		// declared the same way would fail exactly as quietly.
		const declaration = stylesheet.match(new RegExp(`${name}:\\s*([^;]+);`));
		expect(declaration, `${name} has no declaration to read`).toBeTruthy();
		expect(declaration[1].trim()).not.toMatch(/^var\(/);
	});
});

describe("§1 — the exports", () => {
	it("every export the contract names is actually exported", async () => {
		const barrel = await import("../../index.js");
		// The FIRST CELL of a table row, not every backticked word in the section:
		// the prose columns mention parameter names and method sets, and matching
		// those meant filtering the list down to names that already existed — which
		// made the assertion vacuous for exactly the case it is here to catch, a
		// name promised and never exported.
		const names = section("1. JavaScript — the root `index.js` exports")
			.split("\n")
			.map((line) => line.match(/^\|\s*`([A-Za-z_][A-Za-z0-9_]*)`\s*\|/))
			.filter(Boolean)
			.map((match) => match[1])
			// The other tables in this section describe the host interface and the
			// entry points rather than barrel exports.
			.filter((name) => !["t", "route", "route_options"].includes(name));

		expect(names.length).toBeGreaterThan(20);
		for (const name of names) {
			expect(barrel[name], `${name} is promised but missing`).toBeDefined();
		}
	});

	it("nothing in the dark block redeclares a token the light block never declared", () => {
		// The dark block wins by specificity and is purely additive, which is only
		// true while every token it tunes exists in §1 of the stylesheet. One that
		// does not is a token with no light-mode value at all.
		const dark = stylesheet.slice(stylesheet.indexOf('[data-theme="dark"]'));
		const tuned = [...dark.matchAll(/^\s*(--dd-[a-z0-9-]+):/gm)].map((match) => match[1]);
		const light = stylesheet.slice(0, stylesheet.indexOf('[data-theme="dark"]'));
		for (const name of new Set(tuned)) {
			expect(light, `${name} is tuned for dark but never declared for light`).toContain(
				`${name}:`,
			);
		}
	});
});

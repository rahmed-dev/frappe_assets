/**
 * A named registry — the seam that turns a fixed menu into a framework.
 *
 * Before this, the panel types were a `const PANELS = {...}` object in the
 * renderer. An app that wanted a thirteenth panel had exactly two options: fork
 * the package, or build the markup by hand as `{type: "html"}` and hand-escape
 * every value in it. Both have happened. The second one is how three tables on
 * one consuming page ended up printing values scraped off a supplier's portal
 * through hand-rolled escaping.
 *
 * So: panels, tones, formats, chart engines and drill kinds are all registries.
 * The built-in set is registered the same way a consumer's addition is, which is
 * the property that matters — there is no privileged inner list, and anything
 * the toolkit can do to itself an app can do to it.
 *
 * WHY DEFINE THROWS ON A DUPLICATE
 * Last-one-wins is the obvious implementation and it is wrong here. This
 * stylesheet and this bundle are loaded once per Desk session and shared by
 * every page in it, so an app quietly overwriting `table` changes every other
 * app's dashboards, and the symptom shows up nowhere near the definition.
 * Replacing a built-in on purpose is a different intent from defining a new one,
 * and it gets a different method name so it reads as deliberate at the call site.
 */

import { DuplicateDefinitionError, UnknownDefinitionError } from "./errors.js";

export class Registry {
	/**
	 * @param {string} kind  what this registry holds, singular — "panel", "tone".
	 *   It appears in every error message, so it is written for a reader who is
	 *   looking at a console and not at this file.
	 * @param {(name: string, value: any) => any} [normalise]  a chance to check
	 *   and canonicalise an entry as it is defined. Validating on the way IN is
	 *   the point: a malformed panel discovered at definition time names the file
	 *   that defined it, while the same panel discovered at render time names
	 *   only the spec that used it.
	 */
	constructor(kind, normalise) {
		this.kind = kind;
		this.normalise = normalise;
		this.entries = new Map();
	}

	define(name, value) {
		if (this.entries.has(name)) {
			throw new DuplicateDefinitionError(this.kind, name);
		}
		return this.redefine(name, value);
	}

	/**
	 * Define, replacing whatever held the name.
	 *
	 * The sanctioned way to override a built-in. It is a separate method purely
	 * so that the intent is visible in the diff — `redefine("table", …)` is a
	 * decision, `define("table", …)` silently winning would be an accident.
	 */
	redefine(name, value) {
		this.entries.set(name, this.normalise ? this.normalise(name, value) : value);
		return this;
	}

	/** The entry, or throw naming everything that is defined. */
	get(name) {
		const entry = this.entries.get(name);
		if (entry === undefined) {
			throw new UnknownDefinitionError(this.kind, name, this.names());
		}
		return entry;
	}

	/**
	 * The entry, or `undefined`.
	 *
	 * For the callers where a missing name is ordinary rather than a bug — a tone
	 * arriving from a backend that has a state nobody has written a rule for yet
	 * falls back to `quiet`, and must not throw. A panel type is the opposite: it
	 * is hand-written, so a name that is not defined is a typo.
	 */
	find(name) {
		return this.entries.get(name);
	}

	has(name) {
		return this.entries.has(name);
	}

	names() {
		return [...this.entries.keys()].sort();
	}

	/** Every entry, for tooling — a docs generator, a `.d.ts` build, a gallery. */
	all() {
		return [...this.entries.entries()].map(([name, value]) => ({ name, value }));
	}
}

import { describe, it, expect } from "vitest";
import { Registry } from "../../core/registry.js";
import { DuplicateDefinitionError, UnknownDefinitionError } from "../../core/errors.js";

describe("Registry", () => {
	it("refuses to let a second definition silently take a name", () => {
		// Last-one-wins is the obvious implementation and it is wrong here: this
		// bundle is shared by every page in a Desk session, so an app quietly
		// overwriting `table` changes every other app's dashboards, and the symptom
		// appears nowhere near the definition.
		const panels = new Registry("panel");
		panels.define("table", 1);
		expect(() => panels.define("table", 2)).toThrow(DuplicateDefinitionError);
		expect(panels.get("table")).toBe(1);
	});

	it("allows a deliberate replacement under a different name", () => {
		const panels = new Registry("panel");
		panels.define("table", 1);
		panels.redefine("table", 2);
		expect(panels.get("table")).toBe(2);
	});

	it("names everything defined when asked for something that is not", () => {
		// The cause is almost always a typo, so the answer belongs in the message.
		const panels = new Registry("panel");
		panels.define("table", 1);
		panels.define("kpis", 1);
		expect(() => panels.get("tabel")).toThrow(/kpis, table/);
		expect(() => panels.get("tabel")).toThrow(UnknownDefinitionError);
	});

	it("distinguishes get from find, because the two callers differ", () => {
		// A panel type is hand-written, so a missing one is a bug and throws. A tone
		// usually arrives from a backend, where an ungraded state is ordinary — that
		// caller uses find() and falls back.
		const tones = new Registry("tone");
		expect(tones.find("nope")).toBeUndefined();
		expect(() => tones.get("nope")).toThrow();
	});

	it("normalises on the way in, so a bad entry names the file that defined it", () => {
		const tones = new Registry("tone", (name, spec) => ({
			pill: spec.pill != null ? spec.pill : `dd-pill-${name}`,
		}));
		tones.define("stale", {});
		expect(tones.get("stale").pill).toBe("dd-pill-stale");
	});
});

import { describe, it, expect } from "vitest";
import { esc, slug, attr } from "../../core/escape.js";

describe("esc", () => {
	it("escapes the eight characters frappe.utils.escape_html does", () => {
		// Byte-identical to Frappe's own mapping on purpose: it is what lets a
		// consuming page's rendered HTML be diffed against the version it was
		// built on. If this test is ever "corrected" to the usual five, that diff
		// stops being meaningful.
		expect(esc(`&<>"'/\`=`)).toBe("&amp;&lt;&gt;&quot;&#39;&#x2F;&#x60;&#x3D;");
	});

	it("closes the attribute-breakout hole", () => {
		expect(esc('" onerror="alert(1)')).not.toContain('"');
	});

	it("reads null and undefined as nothing, not as their names", () => {
		expect(esc(null)).toBe("");
		expect(esc(undefined)).toBe("");
	});

	it("keeps zero, which is a reading and not an absence", () => {
		expect(esc(0)).toBe("0");
	});
});

describe("slug", () => {
	it("makes a key with a space usable as a selector", () => {
		// The bug this exists for: `#dd-explain-net revenue` parses as a descendant
		// combinator, matches nothing, and the ⓘ button silently opens no panel.
		expect(slug("net revenue")).toBe("net-revenue");
	});

	it("strips characters that would end the selector early", () => {
		expect(slug('a"]b')).toBe("a-b");
	});

	it("never starts with a digit, which a CSS identifier may not", () => {
		expect(slug("30d")).toBe("n30d");
	});

	it("never returns empty, which would make the id a bare prefix", () => {
		expect(slug("!!!")).toBe("x");
		expect(slug("")).toBe("x");
	});
});

describe("attr", () => {
	it("omits itself entirely when there is no value", () => {
		expect(attr("title", null)).toBe("");
		expect(attr("title", "")).toBe("");
	});

	it("escapes the value it does write", () => {
		expect(attr("title", 'a"b')).toBe('title="a&quot;b"');
	});
});

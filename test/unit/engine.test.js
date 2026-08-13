/**
 * How `engine()` picks an adapter, and what it hands back.
 *
 * The interesting assertion here is the boring one — that what comes out is the
 * adapter itself. In v0.5.0 it was the registry's `{name, value}` listing entry
 * instead, so `engine().chart` was `undefined` and every chart on every page
 * failed at its first mount. Nothing caught it: the render suite asserts markup
 * and a chart's markup is an empty div, the gallery suite stubs out the frame
 * the mount phase waits for, and the page itself shows a card that looks merely
 * empty. Two code paths reached the same registry and disagreed about what a
 * lookup returns, which is why both are asserted below rather than one.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { engines, engine, use_engine, has_engine, reset_engine } from "../../charts/adapter.js";

const Fake = {
	name: "fake",
	chart: () => null,
	sparkline: () => null,
	dispose: () => null,
	retheme: () => null,
};

beforeEach(() => {
	reset_engine();
	engines.redefine("fake", Fake);
});

describe("engine()", () => {
	it("returns the adapter, not the registry's listing entry", () => {
		expect(engine()).toBe(Fake);
	});

	it("hands back something callable — the shape a panel's mount assumes", () => {
		for (const method of ["chart", "sparkline", "dispose", "retheme"]) {
			expect(typeof engine()[method]).toBe("function");
		}
	});

	it("agrees with use_engine, which reads the same registry by name", () => {
		expect(use_engine("fake")).toBe(engine());
	});

	it("reports itself present", () => {
		expect(has_engine()).toBe(true);
	});
});

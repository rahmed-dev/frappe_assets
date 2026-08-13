/**
 * `bounds` is pure arithmetic and this file runs under the default `node`
 * environment, with no document at all.
 *
 * It needed happy-dom until v0.4.0, not because the function touches the DOM but
 * because it lived in the same module as the ECharts adapter. Splitting
 * `charts/helpers.js` out from `charts/echarts.js` is what made a bare-Node
 * import possible, and this file failing to import is now how we would find out
 * that an engine had leaked back into the helpers.
 */

import { describe, it, expect } from "vitest";
import { bounds } from "../../charts/helpers.js";

describe("bounds", () => {
	it("leaves the smallest reading somewhere to be drawn", () => {
		// ECharts' own `scale: true` fits the axis to the data exactly, which is
		// right for a trend and wrong for bars: the smallest value lands on the
		// floor with no height at all and reads as zero.
		const { min, max } = bounds([10, 20, 30]);
		expect(min).toBeLessThan(10);
		expect(max).toBeGreaterThan(30);
	});

	it("keeps a baseline at zero when the caller pads only upward", () => {
		// The one every bar chart wants. Padding under the baseline puts an axis
		// label below zero on a quantity that cannot go there.
		const { min } = bounds([10, 20, 30], { pad: [0, 0.1] });
		expect(min).toBe(10);
	});

	it("pulls a marker into view, because a rule the reader cannot see is not a rule", () => {
		const { max } = bounds([10, 20], { include: [95] });
		expect(max).toBeGreaterThanOrEqual(95);
	});

	it("rounds outward to the step rather than printing a padded bound raw", () => {
		// A padded bound is an arbitrary number already; printing it as 9.5238 only
		// makes it look like a measurement.
		const { min, max } = bounds([1, 9], { step: 0.5 });
		expect(min % 0.5).toBe(0);
		expect(max % 0.5).toBe(0);
	});

	it("gives a flat series an axis instead of a zero-height one", () => {
		const result = bounds([5, 5, 5], { step: 0.5 });
		expect(result.min).toBeLessThan(result.max);
	});

	it("hands ECharts its own default when there is nothing to measure", () => {
		expect(bounds([])).toEqual({ scale: true });
		expect(bounds(null)).toEqual({ scale: true });
		expect(bounds(["x", null, NaN])).toEqual({ scale: true });
	});
});
